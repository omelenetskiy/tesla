import { TeslaClient, type TeslaRequestLogInput } from './client'
import { CATALOG_BY_ID, environmentFor, type CatalogEntry } from './catalog'
import { authBaseForHost } from './config'
import { TeslaApiError, describeTeslaError, toPublicError } from './errors'
import { resolveOwnerApiId } from './identity'
import { verifyAccessToken } from './auth'
import { syncVehiclesFromList, type VehicleRow } from './service'
import type { RawVehicleListItem } from './normalize'
import { recordRequest } from './request-log'
import { redactText, sanitizeHeaders, sanitizeUrl } from './sanitize'
import { refreshCredential, readCredential } from './tokens'

/**
 * The execution engine behind /debug/api (§27, §28).
 *
 * It deliberately reuses the *production* TeslaClient rather than a parallel
 * hand-rolled fetcher: the console must exercise the same retry, refresh,
 * deduplication and redaction code paths the product uses, otherwise it proves
 * nothing about a failure the dashboard already hit (§41).
 */

export type DebugRequestInput = {
  entryId: string
  environmentId?: string | null
  vehicleRow: VehicleRow
  pathParams?: Record<string, string>
  query?: Record<string, string>
  body?: string | null
  /** §42: a wake requires the same explicit confirmation the product demands. */
  confirmUnsafe?: boolean
}

export type DebugRequestResult = {
  ok: boolean
  status: number | null
  statusText: string | null
  durationMs: number | null
  timestamp: string
  endpoint: string
  method: string
  url: string
  requestHeaders: Record<string, string>
  requestBody: string | null
  responseHeaders: Record<string, string>
  /** Sanitized, parseable JSON text. Never raw credential material. */
  responseBody: string | null
  byteLength: number | null
  error: ReturnType<typeof toPublicError> | null
  curl: string
  /** Extra context the UI shows under "Notes". */
  diagnostics: string[]
}

/** Resolves `:id` placeholders and refuses an unset vehicle id instead of guessing. */
function applyPathParams(path: string, params: Record<string, string>, entry: CatalogEntry) {
  let resolved = path
  for (const param of entry.params.filter((item) => item.in === 'path')) {
    const token = `:${param.name}`
    if (!resolved.includes(token)) continue
    const value = params[param.name]?.trim()
    if (!value) {
      if (param.required) throw new TeslaApiError('not_found', `Required path parameter {${param.name}} is not filled in`, { endpoint: path, method: entry.method })
      continue
    }
    resolved = resolved.replace(token, encodeURIComponent(value))
  }
  return resolved
}

/**
 * cURL reproduction with the bearer replaced, so a user can copy a runnable command
 * without the console ever putting a token on the clipboard (§30).
 */
export function buildCurl(input: { method: string; url: string; headers: Record<string, string>; body?: string | null }) {
  const lines = [`curl -X ${input.method} '${input.url}'`]
  for (const [key, value] of Object.entries(input.headers)) {
    lines.push(`  -H '${key}: ${value}'`)
  }
  if (input.body) lines.push(`  --data '${redactText(input.body).replace(/'/g, `'\\''`)}'`)
  return lines.join('\n')
}

function ownerApiIdOrThrow(row: VehicleRow) {
  const candidate = resolveOwnerApiId(row)
  if (!candidate) {
    throw new TeslaApiError(
      'not_found',
      'This vehicle has no short Owner API id. Refresh the vehicle list (GET /api/1/vehicles) — the id appears there.',
      { endpoint: '/api/1/vehicles/:id', method: 'GET' },
    )
  }
  return candidate
}

export async function executeDebugRequest(input: DebugRequestInput): Promise<DebugRequestResult> {
  const entry = CATALOG_BY_ID.get(input.entryId)
  if (!entry) throw new TeslaApiError('not_found', `Unknown catalog request: ${input.entryId}`)
  if (!entry.implemented && entry.executor === 'not_implemented') {
    throw new TeslaApiError('not_found', 'This endpoint is not implemented in the app and cannot be run from here', { endpoint: entry.path, method: entry.method })
  }
  if (entry.safety !== 'read' && !input.confirmUnsafe) {
    throw new TeslaApiError('conflict', 'The request changes state (wake or credentials) — explicit confirmation is required', { endpoint: entry.path, method: entry.method })
  }

  const environment = environmentFor(input.environmentId)
  const captured: TeslaRequestLogInput[] = []
  // Every attempt is written by `onLog`; keeping the promises lets the response wait
  // for its own audit rows. Without it the console refetched its history before the
  // insert had landed, so the run that just finished was missing from the list until
  // the operator pressed Refresh.
  const writes: Promise<void>[] = []
  const startedAt = Date.now()
  const timestamp = new Date().toISOString()
  const diagnostics: string[] = []

  // The console must never serve a memoised answer: every Send is a real request.
  const client = new TeslaClient({
    getAccessToken: () => accessTokenFor(input.vehicleRow),
    refreshAccessToken: () => refreshCredential(input.vehicleRow.id, input.vehicleRow.owner_id),
    cacheTtlMs: 0,
    apiBaseUrlOverride: environment.apiBaseUrl,
    onLog: (logEntry) => {
      captured.push(logEntry)
      writes.push(recordRequest({ ...logEntry, vehicleId: logEntry.vehicleId ?? input.vehicleRow.id }, input.vehicleRow.owner_id))
    },
  })

  const path = applyPathParams(entry.path, input.pathParams ?? {}, entry)
  const isStreaming = entry.method === 'WSS'

  let payload: unknown = null
  let failure: unknown = null
  try {
    if (isStreaming) throw new TeslaApiError('not_found', 'WebSocket requests cannot be run from the console', { endpoint: path, method: entry.method })
    if (entry.executor === 'auth_probe') {
      payload = await runAuthProbe(entry.id, input.vehicleRow, environment.authHost)
      diagnostics.push('The answer came from the SSO host, not from the Owner API.')
    } else if (entry.executor === 'owner_api_raw') {
      payload = await client.request(path, { method: 'GET', query: input.query, vehicleId: input.vehicleRow.id, requestType: 'probe', noCache: true })
    } else {
      payload = await runTeslaClientCall(client, entry, input, path)
    }
  } catch (error) {
    failure = error
  }

  // A successful vehicle list is the only response that carries the short id, so the
  // console persists it: the next request is prefilled instead of making the operator
  // copy a number out of a JSON tree.
  if (!failure && entry.id === 'vehicles-list' && Array.isArray(payload)) {
    try {
      const synced = await syncVehiclesFromList(input.vehicleRow.owner_id, payload as RawVehicleListItem[])
      const stored = synced.vehicles.filter((row) => resolveOwnerApiId(row)).length
      diagnostics.push(`Synced ${synced.count} vehicle(s) from the account; ${stored} now have a short id stored and prefilled.`)
    } catch {
      diagnostics.push('The vehicle list answered, but its identifiers could not be stored — check migration 004 is applied.')
    }
  }

  // The console refetches its history the moment this response lands, so the audit
  // rows have to be durable before it is returned.
  await Promise.all(writes)

  const last = captured.at(-1)
  const errorInfo = failure ? toPublicError(failure, path) : null
  const method = entry.method === 'WSS' ? 'GET' : entry.method
  const url = last?.url ?? sanitizeUrl(`${environment.apiBaseUrl}${path}`)
  const requestHeaders = last?.requestHeaders ?? sanitizeHeaders({ Accept: 'application/json', 'User-Agent': 'DriveScope/1.0', Authorization: 'Bearer [REDACTED]' })

  return {
    ok: !failure && Boolean(last?.ok ?? true),
    status: failure ? (errorInfo?.status ?? last?.status ?? null) : last?.status ?? 200,
    statusText: null,
    durationMs: last?.durationMs ?? Date.now() - startedAt,
    timestamp,
    endpoint: last?.endpoint ?? path,
    method: last?.method ?? method,
    url,
    requestHeaders,
    requestBody: last?.requestBody ?? null,
    responseHeaders: last?.responseHeaders ?? {},
    responseBody: last?.responseBody ?? (payload === null ? null : redactSafeJson(payload)),
    byteLength: last?.responseByteLength ?? null,
    error: errorInfo,
    curl: buildCurl({ method: last?.method ?? method, url, headers: requestHeaders, body: last?.requestBody ?? null }),
    diagnostics,
  }
}

async function accessTokenFor(row: VehicleRow): Promise<string> {
  const credential = await readCredential(row.id, row.owner_id)
  if (!credential) throw new TeslaApiError('invalid_grant', 'No Tesla account is connected')
  return credential.accessToken
}

function redactSafeJson(value: unknown): string {
  // Probes that don't go through the HTTP log still must not echo secrets.
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return redactText(text)
}

async function runTeslaClientCall(client: TeslaClient, entry: CatalogEntry, input: DebugRequestInput, path: string) {
  const options = { query: input.query, vehicleId: input.vehicleRow.id, noCache: true }
  // Resolved lazily. `GET /api/1/vehicles` needs no id at all, and resolving it
  // eagerly made the first request of the login sequence fail with "this vehicle has
  // no short Owner API id" — the very request that is supposed to produce one.
  const storedId = () => ownerApiIdOrThrow(input.vehicleRow)
  switch (entry.id) {
    case 'vehicles-list':
      return client.getVehicles(options)
    case 'vehicles-get':
      return client.getVehicle(pathId(path) ?? storedId(), options)
    case 'vehicle-data':
      return client.getVehicleData(pathId(path) ?? storedId(), options)
    case 'wake-up':
      return client.wakeVehicle(pathId(path) ?? storedId())
    case 'legacy-data':
    case 'latest-vehicle-data':
    case 'data-request-drive-state':
    case 'data-request-charge-state':
    case 'data-request-climate-state':
    case 'nearby-charging-sites':
      return client.request(path, { ...options, requestType: 'probe' })
    default:
      throw new TeslaApiError('not_found', `Request ${entry.id} is not wired to an executor`, { endpoint: entry.path, method: entry.method })
  }
}

function pathId(path: string) {
  const match = /^\/api\/1\/vehicles\/([^/]+)/.exec(path)
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * §41's authentication block. The refresh case is the honest one: it performs the
 * real rotation and persists the result, so "✓ Refresh token valid" means Tesla
 * accepted it just now, not that a column is non-null.
 */
async function runAuthProbe(entryId: string, row: VehicleRow, authHost: string) {
  if (entryId === 'auth-userinfo') {
    const credential = await readCredential(row.id, row.owner_id)
    if (!credential) throw new TeslaApiError('invalid_grant', 'No Tesla account is connected')
    const result = await verifyAccessToken(credential.accessToken, authBaseForHost(authHost))
    return {
      ok: result.ok,
      http_status: result.status,
      auth_host: authHost,
      // Deliberately omits email/sub: the console shows liveness, not identity.
      subject_present: Boolean(result.subject),
      expires_at: credential.expiresAt,
      token_claims: { azp: credential.azp, scopes: credential.scopes },
    }
  }
  if (entryId === 'auth-refresh') {
    const before = await readCredential(row.id, row.owner_id)
    if (!before?.refreshToken) {
      throw new TeslaApiError('invalid_grant', 'Refresh token is not stored — re-authorize under Settings → Tesla account', { endpoint: '/oauth2/v3/token', method: 'POST' })
    }
    const access = await refreshCredential(row.id, row.owner_id)
    const after = await readCredential(row.id, row.owner_id)
    return {
      ok: true,
      // Lengths and booleans only: proves rotation happened without exposing material.
      access_token_length: access.length,
      refresh_token_rotated: Boolean(after?.refreshToken && after.refreshToken !== before.refreshToken),
      new_expires_at: after?.expiresAt ?? null,
      auth_host: after?.authHost ?? null,
    }
  }
  throw new TeslaApiError('not_found', 'Unknown authentication check')
}

export function describeFailure(error: unknown) {
  return describeTeslaError(error)
}
