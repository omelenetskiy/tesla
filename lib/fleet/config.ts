/**
 * Fleet API environment layer.
 *
 * Every host, path and scope string here is quoted verbatim in
 * `docs/TESLA_FLEET_MIGRATION_PLAN.md` §4a. Nothing in this file is inferred, and anything
 * that is not pinned there (userinfo, telemetry config, commands) deliberately does not
 * appear here at all — an unpinned path in a config file is how the previous build ended
 * up requesting `/oauth2/v3/oauth2/v3/token` for two weeks.
 *
 * Two deliberate breaks from the previous layer:
 *  - the token host is `fleet-auth.prd.vn.cloud.tesla.com`, **not** `auth.tesla.com`. The
 *    docs make that mandatory: "calls to `/token` must use the
 *    fleet-auth.prd.vn.cloud.tesla.com domain as these calls can come from application
 *    servers and require different rate limits."
 *  - the `audience` is a per-region Fleet API base URL, so the region becomes part of the
 *    credential instead of a runtime guess.
 */

export type FleetRegion = 'na' | 'eu' | 'cn'

/** §4a C3, quoted from the regions page. */
const REGION_BASE_URLS: Record<FleetRegion, string> = {
  na: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
  eu: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
  cn: 'https://fleet-api.prd.cn.vn.cloud.tesla.cn',
}

export const FLEET_TOKEN_URL = 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token'
export const FLEET_AUTHORIZE_URL = 'https://auth.tesla.com/oauth2/v3/authorize'

/**
 * §4a C2 plus `vehicle_location`.
 *
 * The docs' own third-party example omits `vehicle_location`, but the endpoints we need
 * require it: `vehicle_data` lists `[vehicle_device_data, vehicle_location]`, and
 * `fleet_telemetry_config` create/get both list it. Without the scope, `drive_state` comes
 * back with no coordinates on firmware 2023.38+ and the telemetry config is refused — both
 * silently, both looking like a different problem.
 *
 * There is no dedicated telemetry-config scope: the docs' scope table has nothing between
 * `vehicle_charging_cmds` and the partner-only entries.
 */
export const FLEET_SCOPES = ['openid', 'offline_access', 'user_data', 'vehicle_device_data', 'vehicle_location', 'vehicle_cmds', 'vehicle_charging_cmds'] as const

/**
 * Tesla's own consent management page.
 *
 * Our DELETE only forgets the tokens we hold; this is the link that actually withdraws the
 * grant on Tesla's side, so Disconnect can point at the real thing instead of a vague
 * "revoke it in your account settings".
 */
export function consentRevokeUrl(clientId: string, backUrl: string): string {
  return `https://auth.tesla.com/user/revoke/consent?revoke_client_id=${encodeURIComponent(clientId)}&back_url=${encodeURIComponent(backUrl)}`
}

/**
 * Raised for a missing or malformed environment value. It is surfaced as its own diagnostic
 * state rather than as a 500, because every one of these mistakes otherwise looks like a
 * Tesla-side rejection.
 */
export class FleetConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FleetConfigError'
  }
}

export type FleetEnv = {
  region?: string | null
  clientId?: string | null
  clientSecret?: string | null
  redirectUri?: string | null
  appUrl?: string | null
  /** Space-separated. Empty means the pinned `FLEET_SCOPES`. */
  scopeOverride?: string | null
}

export type FleetConfig = {
  region: FleetRegion
  /** The Fleet API base URL for this region — also the value `audience` must carry. */
  apiBaseUrl: string
  audience: string
  tokenUrl: string
  authorizeUrl: string
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  /** Refresh this long before the token actually dies, so a command never races expiry. */
  expirySkewMs: number
  requestTimeoutMs: number
  /**
   * Set when `redirect_uri` does not point at this app's real callback route.
   *
   * Not a nitpick: the previous build left a `TESLA_FLEET_REDIRECT_URI` aimed at
   * `/api/tesla/auth/callback`, so Tesla authorized the user, redirected to a path that no
   * longer exists, and the one-time code was consumed by a 404 — a login that looks like it
   * worked right up until it silently didn't. The connect route refuses to start when this
   * is set rather than spending a code on a dead URL.
   */
  redirectPathWarning: string | null
}

/** The one path that can complete the exchange. Keep in sync with app/api/fleet/callback. */
export const FLEET_CALLBACK_PATH = '/api/fleet/callback'

export function normaliseFleetRegion(value: string | null | undefined): FleetRegion {
  const raw = (value ?? '').trim().toLowerCase()
  if (raw === 'na' || raw === 'eu' || raw === 'cn') return raw
  // No silent default. A wrong region mints a token whose audience points at another
  // continent's API, and that fails as a 403 which reads exactly like a scope problem.
  throw new FleetConfigError(`TESLA_FLEET_REGION must be one of na | eu | cn (got "${raw}"). See docs/TESLA_FLEET_MIGRATION_PLAN.md §4a, C3.`)
}

/** Pure so the verify harness can pin the shape without touching process.env. */
export function createFleetConfig(env: FleetEnv): FleetConfig {
  const region = normaliseFleetRegion(env.region)
  const clientId = (env.clientId ?? '').trim()
  const clientSecret = (env.clientSecret ?? '').trim()
  const appUrl = (env.appUrl ?? '').trim().replace(/\/+$/, '')
  const redirectUri = (env.redirectUri ?? '').trim() || (appUrl ? `${appUrl}/api/fleet/callback` : '')
  const apiBaseUrl = REGION_BASE_URLS[region]

  const missing: string[] = []
  if (!clientId) missing.push('TESLA_FLEET_CLIENT_ID')
  if (!clientSecret) missing.push('TESLA_FLEET_CLIENT_SECRET')
  if (!redirectUri) missing.push('TESLA_FLEET_REDIRECT_URI (or NEXT_PUBLIC_APP_URL)')
  if (missing.length) {
    throw new FleetConfigError(
      `Fleet API is not configured. Missing: ${missing.join(', ')}. The redirect URI must match the value registered at developer.tesla.com character for character — a mismatch fails the code exchange with invalid_grant, which is otherwise indistinguishable from a bad token.`,
    )
  }

  // The callback route is fixed in this codebase, so a stale URI from the previous build
  // is a silent dead end: Tesla authorizes the user, redirects to a path that does not
  // exist, and the one-time code is consumed by a 404. Detected here so the connect route
  // can refuse instead of spending the code.
  let redirectPathWarning: string | null = null
  try {
    const path = new URL(redirectUri).pathname
    if (path !== FLEET_CALLBACK_PATH) {
      redirectPathWarning = `TESLA_FLEET_REDIRECT_URI points at "${path}", but the only route that can complete the exchange is ${FLEET_CALLBACK_PATH}. Update it — and the value registered at developer.tesla.com — to ${redirectUri.replace(path, FLEET_CALLBACK_PATH)}`
    }
  } catch {
    redirectPathWarning = `TESLA_FLEET_REDIRECT_URI is not an absolute URL: "${redirectUri}"`
  }

  return {
    region,
    apiBaseUrl,
    audience: apiBaseUrl,
    tokenUrl: FLEET_TOKEN_URL,
    authorizeUrl: FLEET_AUTHORIZE_URL,
    clientId,
    clientSecret,
    redirectUri,
    // Overridable because the set an app can ask for is decided by what was ticked in the
    // developer portal, and `require_requested_scopes=true` makes that a hard failure rather
    // than a silently narrowed token.
    scopes: (env.scopeOverride ?? '').trim() ? (env.scopeOverride as string).trim().split(/\s+/) : [...FLEET_SCOPES],
    expirySkewMs: 60_000,
    requestTimeoutMs: 15_000,
    redirectPathWarning,
  }
}

let cached: FleetConfig | null = null

export function fleetConfig(): FleetConfig {
  if (!cached) {
    cached = createFleetConfig({
      region: process.env.TESLA_FLEET_REGION,
      clientId: process.env.TESLA_FLEET_CLIENT_ID,
      clientSecret: process.env.TESLA_FLEET_CLIENT_SECRET,
      redirectUri: process.env.TESLA_FLEET_REDIRECT_URI,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      scopeOverride: process.env.TESLA_FLEET_SCOPES,
    })
  }
  return cached
}

/** Called by tests and by the settings page after the operator edits env-backed values. */
export function resetFleetConfigCache() {
  cached = null
}
