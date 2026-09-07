import { teslaConfig } from './config'

/**
 * Typed failure taxonomy for the Owner API (§20).
 * Callers branch on `kind`, never on a message substring — the previous
 * `message.includes('credentials were rejected')` control flow is what let a
 * genuine 403 authorization failure masquerade as an expiring token.
 */
export type TeslaErrorKind =
  | 'unauthorized'      // 401 — access token expired/invalid; refresh is allowed once
  | 'forbidden'         // 403 — authenticated but refused; refreshing cannot help
  | 'not_found'         // 404 — wrong id or removed endpoint
  | 'conflict'          // 409 — vehicle busy / command rejected
  | 'rate_limited'      // 429 — honour retryAfterMs
  | 'server'            // 5xx — bounded exponential backoff
  | 'network'           // DNS/connection reset
  | 'timeout'           // AbortController deadline
  | 'malformed'         // non-JSON or unexpected envelope
  | 'invalid_grant'     // token endpoint rejected the refresh token
  | 'vehicle_unavailable' // 408 — the vehicle did not answer (asleep or offline)
  | 'challenge'         // Tesla WAF/hcaptcha on the auth host
  | 'unknown'

export class TeslaApiError extends Error {
  readonly kind: TeslaErrorKind
  readonly status?: number
  readonly retryAfterMs?: number
  readonly attempts: number
  readonly endpoint: string
  readonly method: string
  readonly responseBody?: string
  readonly authOrigin?: string

  constructor(
    kind: TeslaErrorKind,
    message: string,
    init: {
      status?: number
      retryAfterMs?: number
      attempts?: number
      endpoint?: string
      method?: string
      responseBody?: string
      authOrigin?: string
    } = {},
  ) {
    super(message)
    this.name = 'TeslaApiError'
    this.kind = kind
    this.status = init.status
    this.retryAfterMs = init.retryAfterMs
    this.attempts = init.attempts ?? 1
    this.endpoint = init.endpoint ?? ''
    this.method = init.method ?? 'GET'
    // Already sanitised by the caller; keep it short so it cannot balloon a log row.
    this.responseBody = init.responseBody ? init.responseBody.slice(0, 2_000) : undefined
    this.authOrigin = init.authOrigin
  }
}

/** Only a 401 may trigger a token refresh. 403 must not — that is the E8 fix. */
export function isRefreshEligible(error: unknown) {
  return error instanceof TeslaApiError && error.kind === 'unauthorized'
}

export function isRetryable(error: unknown) {
  if (!(error instanceof TeslaApiError)) return false
  return error.kind === 'server' || error.kind === 'network' || error.kind === 'timeout'
}

/**
 * Deterministic retry delay: exponential with full jitter capped at 10s.
 * Exported for tests so the distribution does not need to be sampled.
 */
export function retryDelayMs(attempt: number, random: () => number = Math.random) {
  const ceiling = Math.min(10_000, teslaConfig.backoffBaseMs * 2 ** Math.max(0, attempt - 1))
  return Math.round(random() * ceiling)
}

export function classifyStatus(status: number, retryAfterHeader?: string | null): TeslaErrorKind {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 408) return 'vehicle_unavailable'
  if (status === 409) return 'conflict'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'server'
  return 'unknown'
}

/** `Retry-After` is documented as either seconds or an HTTP-date. */
export function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000))
  const date = Date.parse(value)
  if (!Number.isFinite(date)) return undefined
  return Math.max(0, date - Date.now())
}

const ERROR_LABEL: Record<TeslaErrorKind, string> = {
  unauthorized: 'The Tesla token has expired',
  forbidden: 'Tesla refused the request (403)',
  not_found: 'The requested resource was not found (404)',
  conflict: 'State conflict — the vehicle is busy (409)',
  rate_limited: 'Tesla request rate limit exceeded (429)',
  server: 'The Tesla server returned an error',
  network: 'Network unavailable while contacting Tesla',
  timeout: 'Timed out waiting for Tesla',
  malformed: 'Tesla returned a malformed response',
  invalid_grant: 'Refresh token rejected or expired',
  vehicle_unavailable: 'The vehicle did not answer (408) — likely asleep',
  challenge: 'Tesla asked for a browser check (WAF)',
  unknown: 'The request to Tesla failed',
}

export function describeTeslaError(error: unknown): string {
  if (error instanceof TeslaApiError) {
    const label = ERROR_LABEL[error.kind]
    // The bare label made every 404 read the same. "No usable vehicle identifier is stored
    // yet" and a real HTTP 404 from Tesla's gateway both rendered as "The requested resource
    // was not found (404)", so the operator could not tell whether to fix the app's data or
    // the request — and neither could anyone reading a paste of it.
    const where = error.endpoint ? ` · ${error.method} ${error.endpoint}` : ''
    const detail = error.message && error.message !== label ? `: ${error.message}` : error.responseBody ? `: ${error.responseBody.slice(0, 140)}` : ''
    return `${label}${where}${detail}`.slice(0, 300)
  }
  if (error instanceof Error && error.message) return error.message
  return ERROR_LABEL.unknown
}

/** Safe for client consumption: no token material, no raw provider payload. */
export function toPublicError(error: unknown, fallbackEndpoint = '') {
  if (error instanceof TeslaApiError) {
    return {
      kind: error.kind,
      status: error.status ?? null,
      endpoint: error.endpoint || fallbackEndpoint,
      method: error.method,
      attempts: error.attempts,
      retryAfterMs: error.retryAfterMs ?? null,
      message: describeTeslaError(error),
    }
  }
  return {
    kind: 'unknown' as TeslaErrorKind,
    status: null,
    endpoint: fallbackEndpoint,
    method: 'GET',
    attempts: 1,
    retryAfterMs: null,
    message: describeTeslaError(error),
  }
}
