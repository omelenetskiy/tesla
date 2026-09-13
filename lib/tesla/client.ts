import { teslaConfig } from './config'
import {
  TeslaApiError,
  classifyStatus,
  parseRetryAfter,
  retryDelayMs,
} from './errors'
import type { ApiRequestLog, VehicleStatus } from './models'
import { normalizeVehicleStatus, mergeVehicleData, isVehicleAwake, type RawMergedVehicle, type RawVehicleData, type RawVehicleListItem } from './normalize'
import { redactJsonText, sanitizeBody, sanitizeHeaders, sanitizeUrl } from './sanitize'

export type TeslaRequestType = ApiRequestLog['requestType']

/** Shape handed to the log sink; the sink owns id/timestamp persistence. */
export type TeslaRequestLogInput = Omit<ApiRequestLog, 'id' | 'at'> & { at?: string }

export type TeslaClientDeps = {
  /** Returns a currently-valid access token, minting one if needed. */
  getAccessToken: () => Promise<string>
  /**
   * Called at most once per request, and only for a 401. Must return a fresh
   * access token. A 403 never reaches here — that is the plan-E8 fix.
   */
  refreshAccessToken?: () => Promise<string>
  onLog?: (entry: TeslaRequestLogInput) => void
  fetchImpl?: typeof fetch
  now?: () => number
  random?: () => number
  /** Injectable so the polling layer's TTL cache can be tested without timers. */
  cacheTtlMs?: number
  /**
   * Points the same client at another Fleet API host. Used only by diagnostics flows
   * environment switch, to reproduce regional-endpoint problems (§41) — for example
   * `owner-api.vn.cloud.tesla.cn` for a China account.
   */
  apiBaseUrlOverride?: string
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  /**
   * Extra query params. The product sends none: the documented `vehicle_data`
   * endpoint takes no query parameters, and inventing an `itemize`-style filter
   * would be an undocumented request shape. This exists for /debug/api, whose job
   * is experimentation against the real API.
   */
  query?: Record<string, string>
  vehicleId?: string | null
  requestType?: TeslaRequestType
  /** Bypasses the in-flight/TTL cache; used by /debug/api so a Send is always real. */
  noCache?: boolean
  timeoutMs?: number
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sleepWithCap(ms: number) {
  return sleep(Math.min(30_000, Math.max(0, ms)))
}

/**
 * The only module allowed to speak to the Tesla Fleet API (plan §5, AGENTS.md §3.1).
 *
 * Responsibilities, in order of the failure modes that motivated them:
 *   - one rollup `vehicle_data` call instead of several deprecated section calls (§19)
 *   - a single, documented `{id}` rule so the long `vehicle_id` can never be
 *     substituted into a path again (§44 / plan E2)
 *   - typed errors with 401-refresh-once, 429 Retry-After, bounded 5xx backoff (§20)
 *   - in-flight + short-TTL deduplication so a page switch is free (§48)
 *   - a sanitised log row for every attempt, including retries (§23)
 */
export class TeslaClient {
  private readonly deps: Required<Pick<TeslaClientDeps, 'getAccessToken' | 'fetchImpl' | 'now' | 'random' | 'cacheTtlMs'>> & TeslaClientDeps
  private readonly inflight = new Map<string, Promise<unknown>>()
  private readonly cache = new Map<string, { value: unknown; expiresAt: number }>()

  constructor(deps: TeslaClientDeps) {
    this.deps = {
      ...deps,
      fetchImpl: deps.fetchImpl ?? globalThis.fetch.bind(globalThis),
      now: deps.now ?? Date.now,
      random: deps.random ?? Math.random,
      cacheTtlMs: deps.cacheTtlMs ?? 5_000,
    }
  }

  /** Clears memoised reads; the collector calls this after it writes a snapshot. */
  clearCache() {
    this.cache.clear()
  }

  private cacheKey(method: string, path: string) {
    return `${method} ${path}`
  }

  private readCache<T>(key: string): T | undefined {
    const hit = this.cache.get(key)
    if (!hit) return undefined
    if (hit.expiresAt < this.deps.now()) {
      this.cache.delete(key)
      return undefined
    }
    return hit.value as T
  }

  private writeCache(key: string, value: unknown) {
    if (this.deps.cacheTtlMs <= 0) return
    this.cache.set(key, { value, expiresAt: this.deps.now() + this.deps.cacheTtlMs })
  }

  /**
   * Deduplicates identical concurrent reads and serves a cached value inside the
   * TTL window. §48: opening Trips after Dashboard must not re-fetch vehicle meta.
   */
  private async dedup<T>(key: string, factory: () => Promise<T>, noCache?: boolean): Promise<T> {
    if (!noCache) {
      const cached = this.readCache<T>(key)
      if (cached !== undefined) return cached
      const pending = this.inflight.get(key)
      if (pending) return pending as Promise<T>
    }
    const promise = factory().finally(() => this.inflight.delete(key))
    this.inflight.set(key, promise)
    const value = await promise
    if (!noCache) this.writeCache(key, value)
    return value
  }

  private buildUrl(path: string, query: Record<string, string>) {
    const base = this.deps.apiBaseUrlOverride ?? teslaConfig.apiBaseUrl
    const url = new URL(path, `${base}/`)
    for (const [key, value] of Object.entries(query)) if (value) url.searchParams.set(key, value)
    return url
  }

  private emit(entry: TeslaRequestLogInput) {
    if (!this.deps.onLog) return
    try {
      void Promise.resolve(this.deps.onLog(entry)).catch(() => undefined)
    } catch {
      // Observability must never break a telemetry read.
    }
  }

  /**
   * Executes one Fleet API call with the §20 policy.
   * Returns the unwrapped `response` payload (the envelope is always `{response}`
   * on success and `{error,error_description}` on failure).
   */
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET'
    const query: Record<string, string> = { ...(options.query ?? {}) }
    const url = this.buildUrl(path, query)
    const endpoint = `${url.pathname}${url.search}`
    const key = this.cacheKey(method, endpoint)
    const noCache = options.noCache ?? method !== 'GET'

    if (method === 'GET') {
      return this.dedup<T>(
        key,
        () => this.executeWithPolicy<T>(method, url, endpoint, options),
        noCache,
      )
    }
    // Non-GET is never memoised, but identical concurrent POSTs still collapse.
    return this.dedup<T>(key, () => this.executeWithPolicy<T>(method, url, endpoint, options), true)
  }

  private async executeWithPolicy<T>(
    method: string,
    url: URL,
    endpoint: string,
    options: RequestOptions,
  ): Promise<T> {
    const maxAttempts = Math.max(1, teslaConfig.maxAttempts)
    let refreshed = false
    let lastError: TeslaApiError | Error | null = null

    for (let attempt = 1; attempt <= maxAttempts + 1; attempt += 1) {
      const startedAt = this.deps.now()
      let accessToken: string
      try {
        accessToken = await this.deps.getAccessToken()
      } catch (error) {
        throw new TeslaApiError('invalid_grant', 'Failed to obtain a Tesla access token', {
          endpoint,
          method,
          attempts: attempt,
        })
      }

      const controller = new AbortController()
      const timeoutMs = options.timeoutMs ?? teslaConfig.requestTimeoutMs
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const safeUrl = sanitizeUrl(url.toString())
      const body = options.body === undefined ? undefined : typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
      const headers: Record<string, string> = {
        Accept: 'application/json',
        // Only when there is a body. TeslaMate's legacy client sends nothing but
        // `user-agent` and `Authorization`, and the June-2026 403 wave was diagnosed
        // in its tracker as Tesla rejecting clients whose request shape it does not
        // like — a `Content-Type` on a bodyless GET is exactly such an oddity.
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        // The community docs make a User-Agent mandatory on every request;
        // naming the app is the documented courtesy, not an auth factor.
        'User-Agent': 'DriveScope/1.0 (owner-api monitoring client)',
        Authorization: `Bearer ${accessToken}`,
      }

      try {
        const response = await this.deps.fetchImpl(url.toString(), {
          method,
          headers,
          body,
          cache: 'no-store',
          signal: controller.signal,
        })
        clearTimeout(timer)

        const rawText = await response.text()
        const durationMs = this.deps.now() - startedAt
        const status = response.status
        const ok = response.ok

        this.emit({
          vehicleId: options.vehicleId ?? null,
          requestType: options.requestType ?? 'vehicle_data',
          method,
          endpoint,
          url: safeUrl,
          status,
          durationMs,
          ok,
          errorKind: ok ? null : classifyStatus(status, response.headers.get('retry-after')),
          errorMessage: ok ? null : redactJsonText(rawText)?.slice(0, 500) ?? null,
          attempts: attempt,
          requestHeaders: sanitizeHeaders(headers),
          requestBody: sanitizeBody(options.body),
          responseHeaders: sanitizeHeaders(response.headers),
          responseBody: redactJsonText(rawText),
          responseByteLength: rawText.length,
          sanitized: true,
        })

        if (ok) {
          return this.unwrapEnvelope<T>(rawText, status, endpoint, method, attempt)
        }

        const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'))
        const kind = classifyStatus(status, response.headers.get('retry-after'))

        if (kind === 'unauthorized' && !refreshed && this.deps.refreshAccessToken) {
          refreshed = true
          try {
            await this.deps.refreshAccessToken()
            continue // same attempt budget: retry once with the new token
          } catch (refreshError) {
            throw new TeslaApiError('invalid_grant', 'Access token expired and the refresh failed', {
              status,
              endpoint,
              method,
              attempts: attempt,
              responseBody: refreshError instanceof Error ? refreshError.message : undefined,
            })
          }
        }

        if (kind === 'rate_limited' && retryAfterMs !== undefined && attempt === 1) {
          await sleepWithCap(retryAfterMs)
          continue
        }

        if ((kind === 'server' || kind === 'network' || kind === 'timeout') && attempt < maxAttempts) {
          await sleepWithCap(retryDelayMs(attempt, this.deps.random))
          lastError = new TeslaApiError(kind, 'Tesla returned a service error', { status, endpoint, method, attempts: attempt })
          continue
        }

        throw this.failureFromStatus(kind, status, rawText, endpoint, method, attempt, retryAfterMs)
      } catch (error) {
        clearTimeout(timer)
        if (error instanceof TeslaApiError) throw error
        const aborted = error instanceof Error && (error.name === 'AbortError' || /abort/i.test(error.message))
        const kind = aborted ? 'timeout' : 'network'
        const durationMs = this.deps.now() - startedAt
        this.emit({
          vehicleId: options.vehicleId ?? null,
          requestType: options.requestType ?? 'vehicle_data',
          method,
          endpoint,
          url: safeUrl,
          status: null,
          durationMs,
          ok: false,
          errorKind: kind,
          errorMessage: aborted ? `timeout after ${timeoutMs}ms` : error instanceof Error ? error.message : 'network error',
          attempts: attempt,
          requestHeaders: sanitizeHeaders(headers),
          requestBody: sanitizeBody(options.body),
          responseHeaders: {},
          responseBody: null,
          responseByteLength: null,
          sanitized: true,
        })
        if (!aborted && attempt < maxAttempts) {
          lastError = new TeslaApiError(kind, 'Network error while calling Tesla', { endpoint, method, attempts: attempt })
          await sleepWithCap(retryDelayMs(attempt, this.deps.random))
          continue
        }
        throw new TeslaApiError(kind, aborted ? `Tesla request timed out (${timeoutMs} ms)` : 'Cannot reach Tesla over the network', {
          endpoint,
          method,
          attempts: attempt,
        })
      }
    }

    throw lastError ?? new TeslaApiError('unknown', 'Tesla request exhausted all retry attempts', { endpoint, method, attempts: maxAttempts })
  }

  private failureFromStatus(
    kind: ReturnType<typeof classifyStatus>,
    status: number,
    rawText: string,
    endpoint: string,
    method: string,
    attempt: number,
    retryAfterMs?: number,
  ) {
    const detail = redactJsonText(rawText)?.slice(0, 400) ?? ''
    // The legacy API sunset signature: a 403 whose body points at the Fleet API
    // docs. Named explicitly so /debug/api can report it as a platform gate
    // instead of prompting the user to re-create working credentials.
    if (kind === 'forbidden' && /fleet-api|fleetapi|developer\.tesla\.com/i.test(detail)) {
      return new TeslaApiError(
        'forbidden',
        'Tesla has closed legacy API access for this token (403). The response references the Fleet API - this is a platform limitation, not a request error.',
        { status, endpoint, method, attempts: attempt, responseBody: detail },
      )
    }
    if (kind === 'forbidden') {
      return new TeslaApiError('forbidden', 'Tesla denied access (403)', { status, endpoint, method, attempts: attempt, responseBody: detail })
    }
    if (kind === 'unauthorized') {
      return new TeslaApiError('unauthorized', 'Access token not accepted (401)', { status, endpoint, method, attempts: attempt, responseBody: detail })
    }
    if (kind === 'not_found') {
      return new TeslaApiError('not_found', `Resource not found (404): ${endpoint}. Check that the path uses the short id, not vehicle_id`, { status, endpoint, method, attempts: attempt, responseBody: detail })
    }
    if (kind === 'vehicle_unavailable') {
      // Tesla answers 408 rather than waking a sleeping car. Retrying it would be a
      // wake attempt dressed as a read, so it is terminal and named (§21).
      return new TeslaApiError('vehicle_unavailable', 'The vehicle did not answer the telemetry request (408) — it is asleep or unavailable', { status, endpoint, method, attempts: attempt, responseBody: detail })
    }
    if (kind === 'rate_limited') {
      return new TeslaApiError('rate_limited', 'Tesla rate limit reached (429)', { status, retryAfterMs, endpoint, method, attempts: attempt, responseBody: detail })
    }
    if (kind === 'conflict') {
      return new TeslaApiError('conflict', 'The vehicle is busy or the command was rejected (409)', { status, endpoint, method, attempts: attempt, responseBody: detail })
    }
    return new TeslaApiError(kind, `Tesla returned ${status}`, { status, endpoint, method, attempts: attempt, responseBody: detail })
  }

  private unwrapEnvelope<T>(rawText: string, status: number, endpoint: string, method: string, attempt: number): T {
    let payload: unknown
    try {
      payload = rawText ? JSON.parse(rawText) : null
    } catch {
      throw new TeslaApiError('malformed', `Tesla returned a non-JSON response (${status})`, { status, endpoint, method, attempts: attempt })
    }
    if (payload && typeof payload === 'object') {
      const record = payload as Record<string, unknown>
      if ('response' in record) {
        if (record.response === null || record.response === undefined) {
          // `{"response":null}` is how the Fleet API answers a vehicle that is
          // reachable but has no data for this section — not a transport failure.
          throw new TeslaApiError('not_found', 'Tesla returned an empty response for this section', { status, endpoint, method, attempts: attempt })
        }
        return record.response as T
      }
      if ('error' in record || 'error_description' in record) {
        const message = String(record.error_description || record.error || 'owner_api_error')
        const kind = classifyStatus(status)
        throw new TeslaApiError(kind === 'unknown' ? 'unknown' : kind, message, { status, endpoint, method, attempts: attempt, responseBody: redactJsonText(rawText) ?? undefined })
      }
    }
    return payload as T
  }

  // ── §19 surface ───────────────────────────────────────────────────────────

  /**
   * GET /api/1/vehicles — vehicle discovery. This is the only call that returns
   * the short `id`, so every other method takes an explicit `ownerApiId`.
   */
  async getVehicles(options: RequestOptions = {}): Promise<RawVehicleListItem[]> {
    const payload = await this.request<{ response?: RawVehicleListItem[] } | RawVehicleListItem[]>('/api/1/vehicles', {
      requestType: 'vehicle_list',
      ...options,
    })
    const list = Array.isArray(payload) ? payload : payload.response ?? []
    return Array.isArray(list) ? list : []
  }

  /** GET /api/1/vehicles/{id} — presence/connectivity without telemetry weight. */
  async getVehicle(ownerApiId: string, options: RequestOptions = {}): Promise<RawVehicleListItem> {
    const payload = await this.request<RawVehicleListItem>(`/api/1/vehicles/${encodeURIComponent(ownerApiId)}`, {
      requestType: 'vehicle_status',
      vehicleId: ownerApiId,
      ...options,
    })
    return payload
  }

  /**
   * GET /api/1/vehicles/{id}/vehicle_data — the documented rollup (§19), returning
   * drive_state, climate_state, charge_state, gui_settings, vehicle_state and
   * vehicle_config in one call. Takes no query parameters per the docs.
   */
  async getVehicleData(ownerApiId: string, options: RequestOptions = {}): Promise<RawVehicleData> {
    return this.request<RawVehicleData>(`/api/1/vehicles/${encodeURIComponent(ownerApiId)}/vehicle_data`, {
      requestType: 'vehicle_data',
      vehicleId: ownerApiId,
      ...options,
    })
  }

  /**
   * Section accessors (§19). The community docs state verbatim: "All `data_request`
   * endpoints have been deprecated in favor of the `vehicle_data` endpoint", so
   * these read from the rollup — which the TTL cache means is fetched once, however
   * many sections a page asks for. No component ever calls `data_request/*`.
   */
  private async section<K extends 'drive_state' | 'charge_state' | 'climate_state' | 'vehicle_state'>(ownerApiId: string, key: K) {
    const data = await this.getVehicleData(ownerApiId, { requestType: key, vehicleId: ownerApiId })
    return data.response?.[key] ?? data[key] ?? null
  }

  getDriveState(ownerApiId: string) {
    return this.section(ownerApiId, 'drive_state')
  }

  getChargeState(ownerApiId: string) {
    return this.section(ownerApiId, 'charge_state')
  }

  getClimateState(ownerApiId: string) {
    return this.section(ownerApiId, 'climate_state')
  }

  getVehicleState(ownerApiId: string) {
    return this.section(ownerApiId, 'vehicle_state')
  }

  async getVehicleConfig(ownerApiId: string) {
    const data = await this.getVehicleData(ownerApiId, { vehicleId: ownerApiId })
    return data.response?.vehicle_config ?? data.vehicle_config ?? null
  }

  /**
   * The product's normal read. Deliberately sequential, never `Promise.all`:
   * `vehicle_data` costs the vehicle radio time and can pull an asleep car awake,
   * so the connectivity probe must decide whether the telemetry call happens at
   * all (AGENTS.md §3.2 step 3-4, requirement §21). `vehicle_data` also does not
   * carry the `online`/`asleep` field, which is why one status call is unavoidable.
   *
   * Returns the merged domain model plus the raw merged payload the debug console
   * needs — nothing else in the app touches the raw shape.
   */
  async getVehicleStatus(ownerApiId: string, options: RequestOptions = {}): Promise<{ status: VehicleStatus; raw: RawMergedVehicle; telemetryCollected: boolean }> {
    const entry = await this.getVehicle(ownerApiId, { requestType: 'vehicle_status', vehicleId: ownerApiId, ...options })
    const asleep = !isVehicleAwake(entry.state)
    const data = asleep ? null : await this.getVehicleData(ownerApiId, { vehicleId: ownerApiId, ...options })
    const merged = mergeVehicleData(entry, data)
    return { status: normalizeVehicleStatus(merged), raw: merged, telemetryCollected: !asleep }
  }

  /**
   * POST /api/1/vehicles/{id}/wake_up. Kept as an explicit method because the old
   * implementation announced POST and sent GET (plan E1). Not called by ordinary
   * navigation — only behind the UI's confirmed "Refresh" action.
   */
  async wakeVehicle(ownerApiId: string, options: RequestOptions = {}) {
    return this.request<RawVehicleListItem>(`/api/1/vehicles/${encodeURIComponent(ownerApiId)}/wake_up`, {
      method: 'POST',
      requestType: 'wake_up',
      vehicleId: ownerApiId,
      noCache: true,
      ...options,
    })
  }
}
