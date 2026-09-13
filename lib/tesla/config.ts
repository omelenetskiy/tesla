/**
 * Single configuration layer for every Tesla endpoint (plan §46).
 * No application module other than this one composes a Tesla URL.
 */

const GLOBAL_AUTH_HOST = 'auth.tesla.com'
const CHINA_AUTH_HOST = 'auth.tesla.cn'

function env(name: string) {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

function hostFromUrl(value: string | undefined) {
  if (!value) return undefined
  try {
    const url = new URL(/^https?:\/\//.test(value) ? value : `https://${value}`)
    return url.hostname
  } catch {
    return value.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  }
}

function normalizeHost(value: string | undefined, fallback: string) {
  const host = hostFromUrl(value)
  if (!host) return fallback
  // Reject anything that would let an env value escape into a path or query.
  return /^[a-z0-9.-]+$/i.test(host) ? host : fallback
}

function normalizePath(value: string | undefined, fallback: string) {
  if (!value) return fallback
  const path = value.startsWith('/') ? value : `/${value}`
  return path.replace(/\/+$/, '') || '/'
}

function integerEnv(name: string, fallback: number, min: number, max: number) {
  const raw = env(name)
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

// TESLA_API_BASE_URL is a compatibility variable; TESLA_API_HOST is the documented one.
const apiHost = normalizeHost(env('TESLA_API_HOST') ?? hostFromUrl(env('TESLA_API_BASE_URL')), 'owner-api.teslamotors.com')
const authHost = normalizeHost(env('TESLA_AUTH_HOST'), GLOBAL_AUTH_HOST)
const authPath = normalizePath(env('TESLA_AUTH_PATH'), '/oauth2/v3')

function isTrustedAuthHost(host: string) {
  return host === GLOBAL_AUTH_HOST || host === CHINA_AUTH_HOST
}

export const teslaConfig = {
  apiHost,
  apiBaseUrl: `https://${apiHost}`,
  authHost,
  authPath,
  authOrigin: `https://${authHost}`,
  /**
   * OAuth base = scheme + host + version path, e.g. `https://auth.tesla.com/oauth2/v3`.
   *
   * This is the only value that may be prefixed to `/authorize`, `/token` or
   * `/userinfo`. `authOrigin` deliberately has no path, so the two used to be
   * interchangeable in name while being different strings — and every caller that
   * appended `authPath` to something that already contained it produced
   * `/oauth2/v3/oauth2/v3/token`, which Tesla answers with a 404. That is why a
   * freshly pasted token worked and everything died once it expired.
   */
  authBaseUrl: `https://${authHost}${authPath}`,
  authorizeUrl: `https://${authHost}${authPath}/authorize`,
  tokenUrl: `https://${authHost}${authPath}/token`,
  userinfoUrl: `https://${authHost}${authPath}/userinfo`,
  /**
   * Native-app redirect target. Tesla only echoes the authorization code to this
   * address, so the code is captured from the browser URL bar and completed
   * server-side; see lib/tesla/auth.ts and the /debug/api auth diagnostics.
   */
  redirectUri: `https://${authHost}/void/callback`,
  /** §15: monitoring scopes only. No vehicle_cmds — the product sends no commands. */
  clientId: 'ownerapi',
  scopes: ['openid', 'email', 'offline_access'],
  /** China owner-api host, kept for the regional extension point (§18). */
  chinaApiHost: 'owner-api.vn.cloud.tesla.cn',
  wssHost: normalizeHost(env('TESLA_WSS_HOST'), 'wss://streaming.vn.teslamotors.com'),
  isTrustedAuthHost,
  requestTimeoutMs: integerEnv('TESLA_REQUEST_TIMEOUT_MS', 12_000, 1_000, 60_000),
  maxAttempts: integerEnv('TESLA_MAX_ATTEMPTS', 3, 1, 5),
  backoffBaseMs: integerEnv('TESLA_BACKOFF_BASE_MS', 400, 50, 5_000),
  /** Refresh this many ms before the access token actually expires. */
  expirySkewMs: integerEnv('TESLA_TOKEN_EXPIRY_SKEW_MS', 60_000, 0, 600_000),
} as const

export type TeslaConfig = typeof teslaConfig

/** Regions are derived from the authorization response issuer, never guessed (§18). */
export type TeslaRegion = 'global' | 'china'

export function regionForAuthHost(host: string): TeslaRegion {
  return host === CHINA_AUTH_HOST ? 'china' : 'global'
}

/**
 * OAuth base (`scheme://host/oauth2/v3`) for a host stored on a credential row.
 *
 * Accepts a bare hostname or a full URL, and refuses anything that is not a Tesla
 * auth host, so a database value can never redirect a bearer token elsewhere.
 */
export function authBaseForHost(host: string | null | undefined): string {
  if (!host) return teslaConfig.authBaseUrl
  const normalized = normalizeHost(host, '')
  if (!normalized || !isTrustedAuthHost(normalized)) {
    throw new Error(`Untrusted Tesla auth host: ${host}`)
  }
  return `https://${normalized}${authPath}`
}

/**
 * OAuth base for the `issuer` parameter Tesla echoes back on the callback URL.
 * Tesla returns e.g. `https://auth.tesla.com/oauth2/v3`; only the host is trusted,
 * and the configured `TESLA_AUTH_PATH` is always re-applied rather than taken from
 * the query string.
 */
export function authBaseForIssuer(issuer: string | null | undefined): string {
  if (!issuer) return teslaConfig.authBaseUrl
  let host: string
  try {
    host = new URL(issuer).hostname
  } catch {
    throw new Error('Tesla returned an invalid authorization issuer')
  }
  return authBaseForHost(host)
}
