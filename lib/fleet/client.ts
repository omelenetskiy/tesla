import { TeslaApiError, classifyStatus, isRefreshEligible } from '../tesla/errors'
import { redactText, sanitizeBody, sanitizeHeaders, sanitizeUrl } from '../tesla/sanitize'
import type { RawVehicleData, RawVehicleListItem } from '../tesla/normalize'
import type { FleetConfig } from './config'

/**
 * The Fleet API HTTP client.
 *
 * Deliberately smaller than the legacy client it replaces. There is no cache and no
 * in-flight deduplication, because there is no polling: every call here is either an
 * explicit user action or a single read at page load, and a memo in front of that would
 * only serve stale state and hide the fact that the car was never asked.
 *
 * The payload envelope is the same `{response: …}` shape the legacy API used, so the domain
 * normalizers in `lib/tesla/normalize.ts` are reused rather than rewritten.
 */

export type FleetRequestLogEntry = {
  endpoint: string
  method: string
  url: string
  status: number | null
  ok: boolean
  durationMs: number
  requestType: string
  vehicleId?: string | null
  requestHeaders?: Record<string, string> | null
  requestBody?: unknown
  responseHeaders?: Record<string, string> | null
  responseBody?: unknown
  responseByteLength?: number | null
  errorMessage?: string | null
  errorKind?: string | null
  attempt: number
  startedAt: string
  /** `recordRequest` needs both; this client makes one attempt plus one refresh-retry. */
  attempts: number
  sanitized: true
}

export type FleetClientDeps = {
  getAccessToken: () => Promise<string>
  refreshAccessToken: () => Promise<string>
  config: FleetConfig
  fetchImpl?: typeof fetch
  onLog?: (entry: FleetRequestLogEntry) => void
}

type RequestOptions = {
  method?: 'GET' | 'POST'
  query?: Record<string, string | number | boolean>
  body?: unknown
  requestType?: string
  vehicleId?: string | null
  ownerId?: string | null
}

const USER_AGENT = 'DriveScope/1.0 (tesla fleet api client)'

/**
 * `{vehicle_tag}` accepts the VIN *or* the short numeric id; the long 16-digit
 * `vehicle_id` is not valid there. Tesla's docs only ever write `{vehicle_tag}` without
 * defining it, and the working reference implementation in ../App resolves it as
 * `v.id_s || String(v.id)` — so both are accepted here, and the long id is rejected
 * explicitly rather than producing a 404 that reads like an auth failure.
 */
export function assertUsableVehicleTag(tag: string | null | undefined): string {
  const value = (tag ?? '').trim()
  if (!value) throw new TeslaApiError('not_found', 'No vehicle identifier is known yet — the vehicle list has not been fetched.')
  if (/^\d{13,}$/.test(value)) {
    throw new TeslaApiError('not_found', `"${value}" is the long streaming vehicle_id, which is not a valid path identifier. Use the VIN or the short id.`)
  }
  return value
}

/**
 * Which stored identifier to put in `{vehicle_tag}`.
 *
 * The VIN first: it cannot be confused with anything else and it is what the docs show.
 * The short id is the fallback, which is what the working reference app actually uses
 * (`v.id_s || String(v.id)`). The long `vehicle_id` is never a candidate — it is filtered
 * by `assertUsableVehicleTag` rather than passed through to fail as a 404.
 */
export function fleetVehicleTag(row: { vin?: string | null; owner_api_id?: string | null }): string | null {
  if (row.vin) return row.vin
  const shortId = (row.owner_api_id ?? '').trim()
  if (!shortId) return null
  try {
    return assertUsableVehicleTag(shortId)
  } catch {
    return null
  }
}

export class FleetClient {
  private readonly deps: FleetClientDeps

  constructor(deps: FleetClientDeps) {
    this.deps = deps
  }

  private buildUrl(path: string, query?: RequestOptions['query']) {
    const url = new URL(`${this.deps.config.apiBaseUrl}${path}`)
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
      }
    }
    return url
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET'
    const url = this.buildUrl(path, options.query)
    const safePath = path.replace(/\/[^/]*$/, (segment) => (segment.includes('.') ? '/{vehicle_tag}' : segment))
    const startedAt = new Date().toISOString()
    const body = options.body === undefined ? undefined : typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
    const attempt = 1
    let accessToken = await this.deps.getAccessToken().catch((error) => {
      throw error instanceof TeslaApiError ? error : new TeslaApiError('invalid_grant', 'Could not read the Tesla access token')
    })

    const send = async (): Promise<{ status: number; text: string; headers: Record<string, string>; ms: number }> => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.deps.config.requestTimeoutMs)
      const start = Date.now()
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        'User-Agent': USER_AGENT,
        Authorization: `Bearer ${accessToken}`,
      }
      try {
        const response = await (this.deps.fetchImpl ?? fetch)(url.toString(), { method, headers, body, cache: 'no-store', signal: controller.signal })
        const text = await response.text()
        const out: Record<string, string> = {}
        response.headers.forEach((value, key) => {
          out[key] = value
        })
        return { status: response.status, text, headers: out, ms: Date.now() - start }
      } finally {
        clearTimeout(timer)
      }
    }

    let result: { status: number; text: string; headers: Record<string, string>; ms: number }
    try {
      result = await send()
      // One refresh, one retry. A second 401 after a refresh is an authorization problem,
      // and looping here is how a working credential gets burned against a rotating token.
      if (result.status === 401) {
        this.log(path, safePath, method, url, result, startedAt, options, attempt, 'unauthorized', 'Access token rejected')
        accessToken = await this.deps.refreshAccessToken()
        result = await send()
      }
    } catch (error) {
      const aborted = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
      const kind = aborted ? 'timeout' : 'network'
      this.log(path, safePath, method, url, null, startedAt, options, attempt, kind, error instanceof Error ? error.message : 'Request failed')
      throw new TeslaApiError(kind, aborted ? 'Tesla did not answer in time' : 'Network error calling the Fleet API', { endpoint: safePath, method })
    }

    if (result.status >= 400) {
      const kind = classifyStatus(result.status, result.headers['ratelimit-reset'] ?? result.headers['retry-after'] ?? null)
      this.log(path, safePath, method, url, result, startedAt, options, attempt, kind, `HTTP ${result.status}`)
      throw new TeslaApiError(kind, `Fleet API returned ${result.status}${result.text ? `: ${redactText(result.text).slice(0, 200)}` : ''}`, {
        status: result.status,
        endpoint: safePath,
        method,
        responseBody: redactText(result.text).slice(0, 400),
      })
    }

    this.log(path, safePath, method, url, result, startedAt, options, attempt, null, null)

    let payload: { response?: unknown } & Record<string, unknown>
    try {
      payload = JSON.parse(result.text) as { response?: unknown } & Record<string, unknown>
    } catch {
      throw new TeslaApiError('malformed', `Fleet API returned non-JSON (${result.status})`, { status: result.status, endpoint: safePath, method })
    }
    // Errors arrive as a 200 with {response:null,error:"…"} on some Fleet endpoints.
    if (payload.response === null && (payload.error || payload.reason)) {
      const message = String(payload.error ?? payload.reason)
      throw new TeslaApiError(message.includes('not online') || message.includes('asleep') ? 'vehicle_unavailable' : 'unknown', message, { status: result.status, endpoint: safePath, method })
    }
    return (payload.response ?? payload) as T
  }

  private log(
    path: string,
    safePath: string,
    method: string,
    url: URL,
    result: { status: number; text: string; headers: Record<string, string>; ms: number } | null,
    startedAt: string,
    options: RequestOptions,
    attempt: number,
    errorKind: string | null,
    errorMessage: string | null,
  ) {
    if (!this.deps.onLog) return
    const ok = !errorKind && result !== null
    this.deps.onLog({
      endpoint: safePath,
      method,
      url: sanitizeUrl(url.toString()),
      status: result?.status ?? null,
      ok,
      durationMs: result?.ms ?? Date.now() - Date.parse(startedAt),
      requestType: options.requestType ?? (method === 'POST' ? 'command' : 'vehicle_data'),
      vehicleId: options.vehicleId ?? null,
      requestHeaders: sanitizeHeaders({ Accept: 'application/json', ...(method === 'POST' && options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), 'User-Agent': USER_AGENT, Authorization: 'Bearer <token>' }),
      requestBody: sanitizeBody(options.body),
      responseHeaders: result ? sanitizeHeaders(result.headers) : null,
      responseBody: result ? sanitizeBody(result.text) : null,
      responseByteLength: result ? result.text.length : null,
      errorMessage,
      errorKind,
      attempt,
      attempts: attempt,
      sanitized: true,
      startedAt,
    })
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  getVehicles(options: RequestOptions = {}): Promise<RawVehicleListItem[]> {
    return this.request<RawVehicleListItem[]>('/api/1/vehicles', { requestType: 'vehicle_list', ...options })
  }

  getVehicle(tag: string, options: RequestOptions = {}): Promise<RawVehicleListItem & { state?: string }> {
    const safe = assertUsableVehicleTag(tag)
    return this.request(`/api/1/vehicles/${encodeURIComponent(safe)}`, { requestType: 'vehicle_status', ...options })
  }

  /**
   * `endpoints` is the one documented query parameter. Omitting it asks for everything,
   * which is the right default here: the caller is a single page load, not a poll loop.
   * `location_data` must be named explicitly for coordinates on firmware 2023.38+.
   */
  getVehicleData(tag: string, options: RequestOptions & { sections?: string[] } = {}): Promise<RawVehicleData> {
    const safe = assertUsableVehicleTag(tag)
    const sections = options.sections ?? ['charge_state', 'climate_state', 'drive_state', 'location_data', 'vehicle_state', 'vehicle_config']
    return this.request(`/api/1/vehicles/${encodeURIComponent(safe)}/vehicle_data`, {
      ...options,
      query: { ...(options.query ?? {}), endpoints: sections.join(';') },
      requestType: 'vehicle_data',
    })
  }

  // ── Actions (explicit user intent only) ──────────────────────────────────

  /** `wake_up` is not under `/command/` — the documented path is the vehicle resource. */
  wakeVehicle(tag: string, options: RequestOptions = {}): Promise<{ result: boolean; reason?: string }> {
    const safe = assertUsableVehicleTag(tag)
    // 'wake_up' verbatim: `api_request_logs.request_type` has a CHECK list, and an
    // unrecognised value is rejected by the database, not by Tesla — which loses the audit
    // row silently. Same discipline as the previous client.
    return this.request(`/api/1/vehicles/${encodeURIComponent(safe)}/wake_up`, { method: 'POST', body: {}, requestType: 'wake_up', ...options })
  }

  command<T = { result: boolean; reason?: string }>(tag: string, name: string, body: unknown = {}, options: RequestOptions = {}): Promise<T> {
    const safe = assertUsableVehicleTag(tag)
    if (!/^[a-z0-9_]+$/.test(name)) throw new TeslaApiError('malformed', `Refusing to build a command path from "${name}"`)
    return this.request(`/api/1/vehicles/${encodeURIComponent(safe)}/command/${encodeURIComponent(name)}`, { method: 'POST', body, requestType: 'command', ...options })
  }

  /** True when a failure means "the car did not answer", which the UI shows as asleep. */
  static isVehicleUnavailable(error: unknown) {
    return error instanceof TeslaApiError && (error.kind === 'vehicle_unavailable' || error.status === 408)
  }

  static refreshWouldHelp = isRefreshEligible
}
