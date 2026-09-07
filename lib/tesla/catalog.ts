import { teslaConfig } from './config'

/**
 * Endpoint catalog for /debug/api (§26, §31).
 *
 * Every description here traces to https://tesla-api.timdorr.com/ rather than to
 * recollection. Where the docs issue a blanket statement, it is quoted verbatim so
 * the console cannot be read as our own opinion about Tesla's API.
 */

export type CatalogParamLocation = 'path' | 'query' | 'body'

export type CatalogParam = {
  name: string
  in: CatalogParamLocation
  required: boolean
  type: 'string' | 'number' | 'boolean' | 'json'
  description: string
  example?: string
}

/** How the runner executes the entry: through TeslaClient, through the auth layer, or manual only. */
export type CatalogExecutor = 'tesla_client' | 'owner_api_raw' | 'auth_probe' | 'browser_only' | 'not_implemented'

/** `safety` gates the confirmation step: anything but `read` needs an explicit OK. */
export type CatalogSafety = 'read' | 'credential_write' | 'wake' | 'command'

export type CatalogEntry = {
  id: string
  group: CatalogGroupId
  /** Short label shown in the request list. */
  title: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'WSS'
  /** Path template with `:param` placeholders, as rendered in the UI. */
  path: string
  /** §31 Purpose, one or two sentences. */
  purpose: string
  params: CatalogParam[]
  /** §31 Expected response, in plain language plus the envelope shape. */
  expectedResponse: string
  notes: string[]
  docUrl: string
  deprecated: boolean
  /** Documented successor, when `deprecated` is true. */
  replacement?: string
  /** False ⇒ the console shows it as documented-but-unavailable (§26: only expose what is implemented). */
  implemented: boolean
  executor: CatalogExecutor
  safety: CatalogSafety
  /** Whether a real call needs the vehicle awake — drives the §41 sleep-state diagnostics. */
  requiresAwake: boolean
  /** Pre-filled JSON body for POST-style entries. */
  sampleBody?: string
}

export type CatalogGroupId =
  | 'authentication'
  | 'vehicles'
  | 'vehicle_state'
  | 'charging'
  | 'climate'
  | 'driving'
  | 'commands'
  | 'streaming'

export const CATALOG_GROUPS: Array<{ id: CatalogGroupId; title: string; summary: string }> = [
  { id: 'authentication', title: 'Authentication', summary: 'Whether the token is live, whether it survives a refresh, which host issued it' },
  { id: 'vehicles', title: 'Vehicles', summary: 'Vehicle discovery and the short id every other request needs' },
  { id: 'vehicle_state', title: 'Vehicle state', summary: 'The single vehicle_data rollup — the primary telemetry source' },
  { id: 'charging', title: 'Charging', summary: 'The charge_state section and session derivatives' },
  { id: 'climate', title: 'Climate', summary: 'The climate_state section' },
  { id: 'driving', title: 'Driving', summary: 'The drive_state section: speed, coordinates, heading' },
  { id: 'commands', title: 'Commands', summary: 'wake_up only. The remaining commands are unimplemented deliberately' },
  { id: 'streaming', title: 'Streaming', summary: 'WSS endpoint: needs vehicle_id, not id. Not implemented' },
]

const VEHICLE_ID_PARAM: CatalogParam = {
  name: 'id',
  in: 'path',
  required: true,
  type: 'string',
  description:
    'The short id from the GET /api/1/vehicles response. NOT the long vehicle_id: the docs distinguish them explicitly.',
  example: '1234567890',
}

export const OWNER_API_DEPRECATION_QUOTE =
  'All `data_request` endpoints have been deprecated in favor of the `vehicle_data` endpoint.'

export const IDENTIFIER_QUOTE =
  'The `id` field is an identifier for the car on the owner-api endpoint. The `vehicle_id` field is for identifying the car across different endpoints, such as the streaming or Autopark APIs.'

export const USER_AGENT_QUOTE =
  'Avoid setting a `User-Agent` header that looks like a browser (such as Chrome or Safari). The SSO service has protections in place that will require executing JavaScript if a browser-like user agent is detected.'

export const REGION_QUOTE =
  'Should this redirect happen you should continue using the region specific Tesla SSO host name in all subsequent steps.'

export const CATALOG: CatalogEntry[] = [
  // ── Authentication ────────────────────────────────────────────────────────
  {
    id: 'auth-authorize',
    group: 'authentication',
    title: 'Authorize (PKCE)',
    method: 'GET',
    path: `${teslaConfig.authPath}/authorize`,
    purpose: "Start of the Authorization Code + PKCE flow. Opens on Tesla's side; a password is never entered in this app.",
    params: [
      { name: 'client_id', in: 'query', required: true, type: 'string', description: 'Always "ownerapi"', example: 'ownerapi' },
      { name: 'code_challenge', in: 'query', required: true, type: 'string', description: 'SHA-256 of code_verifier, in base64url' },
      { name: 'code_challenge_method', in: 'query', required: true, type: 'string', description: 'Always "S256"', example: 'S256' },
      { name: 'redirect_uri', in: 'query', required: true, type: 'string', description: 'Tesla hands out the code only to the void-callback', example: `${teslaConfig.authOrigin}/void/callback` },
      { name: 'response_type', in: 'query', required: true, type: 'string', description: 'code' },
      { name: 'scope', in: 'query', required: true, type: 'string', description: 'Always "openid email offline_access"', example: 'openid email offline_access' },
      { name: 'state', in: 'query', required: true, type: 'string', description: 'Random value, checked on the way back' },
      { name: 'login_hint', in: 'query', required: false, type: 'string', description: 'Account e-mail. With it Tesla may answer 303 to the regional SSO host' },
    ],
    expectedResponse: '302 to the Tesla sign-in page; then 303 to the regional host when login_hint is from another region.',
    notes: [
      REGION_QUOTE,
      USER_AGENT_QUOTE,
      'code_verifier lives on the server only (httpOnly cookie, AES-GCM) — it is never handed to the client.',
    ],
    docUrl: 'https://tesla-api.timdorr.com/api-basics/authentication',
    deprecated: false,
    implemented: true,
    executor: 'browser_only',
    safety: 'read',
    requiresAwake: false,
  },
  {
    id: 'auth-exchange',
    group: 'authentication',
    title: 'Exchange code for tokens',
    method: 'POST',
    path: `${teslaConfig.authPath}/token`,
    purpose: 'Step 2 of the login flow: turns the one-time authorization code into the access/refresh pair, proving possession of the code_verifier held only by the server.',
    params: [
      { name: 'grant_type', in: 'body', required: true, type: 'string', description: 'authorization_code', example: 'authorization_code' },
      { name: 'client_id', in: 'body', required: true, type: 'string', description: 'ownerapi', example: 'ownerapi' },
      { name: 'code', in: 'body', required: true, type: 'string', description: 'One-time code from the callback URL. Expires after first use.' },
      { name: 'code_verifier', in: 'body', required: true, type: 'string', description: 'The 86-character verifier generated with the request. Never sent to the browser.' },
      { name: 'redirect_uri', in: 'body', required: true, type: 'string', description: 'Must match the authorize call exactly', example: `${teslaConfig.authOrigin}/void/callback` },
    ],
    expectedResponse: '200 with access_token, refresh_token, expires_in. Values are never rendered — only the fact that they arrived and the new expiry.',
    notes: [
      'Not runnable from the console on purpose: the code is single-use and belongs to a session started elsewhere, so replaying it would only produce an error and a log row.',
      'This is the call that must go out over HTTP/2 + TLS 1.3 — see the note on the refresh entry.',
    ],
    docUrl: 'https://tesla-api.timdorr.com/api-basics/authentication',
    deprecated: false,
    implemented: true,
    executor: 'not_implemented',
    safety: 'credential_write',
    requiresAwake: false,
    sampleBody: '{"grant_type":"authorization_code","client_id":"ownerapi","code":"[REDACTED]","code_verifier":"[REDACTED]","redirect_uri":"https://auth.tesla.com/void/callback"}',
  },
  {
    id: 'auth-userinfo',
    group: 'authentication',
    title: 'Check token liveness',
    method: 'GET',
    path: `${teslaConfig.authPath}/userinfo`,
    purpose: 'Read-only check that the access token is still accepted by SSO. Separates "the token is dead" from "the endpoint was closed by the platform".',
    params: [],
    expectedResponse: '200 with JSON (sub, email, mfa_status), or 401.',
    notes: [
      'The response carries no tokens; the e-mail is not stored in request logs.',
      'If this returns 200 while owner-api returns 403, the problem is at Tesla, not with the credentials.',
    ],
    docUrl: 'https://tesla-api.timdorr.com/api-basics/authentication',
    deprecated: false,
    implemented: true,
    executor: 'auth_probe',
    safety: 'read',
    requiresAwake: false,
  },
  {
    id: 'auth-refresh',
    group: 'authentication',
    title: 'Refresh access token',
    method: 'POST',
    path: `${teslaConfig.authPath}/token`,
    purpose: 'Refresh Token Grant. Forces a new token pair and stores the result, including refresh token rotation.',
    params: [
      { name: 'grant_type', in: 'body', required: true, type: 'string', description: 'refresh_token' },
      { name: 'client_id', in: 'body', required: true, type: 'string', description: 'ownerapi' },
      { name: 'refresh_token', in: 'body', required: true, type: 'string', description: 'Held in the DB; neither displayed in the request body nor logged' },
      { name: 'scope', in: 'body', required: true, type: 'string', description: 'openid email offline_access' },
    ],
    expectedResponse: '200 with access_token/refresh_token/expires_in. Values are never printed — only that they arrived and the new expiry.',
    notes: [
      '§17: when Tesla returns a new refresh token, it is exactly that one which gets stored.',
      'Refreshes for a single vehicle are serialised: two parallel refreshes against a rotating secret can burn a working token.',
    ],
    docUrl: 'https://tesla-api.timdorr.com/api-basics/authentication',
    deprecated: false,
    implemented: true,
    executor: 'auth_probe',
    safety: 'credential_write',
    requiresAwake: false,
    sampleBody: '{"grant_type":"refresh_token","client_id":"ownerapi","refresh_token":"[REDACTED]","scope":"openid email offline_access"}',
  },
  // ── Vehicles ──────────────────────────────────────────────────────────────
  {
    id: 'vehicles-list',
    group: 'vehicles',
    title: 'Vehicle list',
    method: 'GET',
    path: '/api/1/vehicles',
    purpose: "Discovers the account's vehicles and is the source of the short id and the state field (online/asleep/offline).",
    params: [{ name: 'page', in: 'query', required: false, type: 'number', description: 'Not required, defaults to 1', example: '1' }],
    expectedResponse: '200 {"response":{"count":N,"response":[{id,id_s,vehicle_id,vin,display_name,state,...}]}}',
    notes: [
      IDENTIFIER_QUOTE,
      'The response carries tokens and backseat_token fields — the sanitizer cuts them before the log write.',
      'The only endpoint that reports state without waking the vehicle.',
    ],
    docUrl: 'https://tesla-api.timdorr.com/api-basics/vehicles',
    deprecated: false,
    implemented: true,
    executor: 'tesla_client',
    safety: 'read',
    requiresAwake: false,
  },
  {
    id: 'vehicles-get',
    group: 'vehicles',
    title: 'Vehicle by id',
    method: 'GET',
    path: '/api/1/vehicles/:id',
    purpose: "One vehicle's availability without the telemetry load. Used as the wake-or-not decision ahead of vehicle_data.",
    params: [VEHICLE_ID_PARAM],
    expectedResponse: '200 {"response":{...}} — the same shape as a list item.',
    notes: ['§21: this call decides whether to do vehicle_data. Asleep — no telemetry request.'],
    docUrl: 'https://tesla-api.timdorr.com/api-basics/vehicles',
    deprecated: false,
    implemented: true,
    executor: 'tesla_client',
    safety: 'read',
    requiresAwake: false,
  },
  // ── Vehicle state ─────────────────────────────────────────────────────────
  {
    id: 'vehicle-data',
    group: 'vehicle_state',
    title: 'vehicle_data (rollup)',
    method: 'GET',
    path: '/api/1/vehicles/:id/vehicle_data',
    purpose: 'The single rollup of all telemetry: drive_state, climate_state, charge_state, gui_settings, vehicle_state, vehicle_config.',
    params: [VEHICLE_ID_PARAM],
    expectedResponse: '200 {"response":{id,vehicle_id,drive_state,charge_state,climate_state,gui_settings,vehicle_state,vehicle_config,last_updated}}',
    notes: [
      OWNER_API_DEPRECATION_QUOTE,
      '§19: one rollup call instead of several section requests. The product reads only this.',
      'The docs describe no query parameters — we send nothing besides :id.',
      'last_updated is the source of the honest freshness stamp; the age taken from the response is enough not to trust a stored "just now".',
    ],
    docUrl: 'https://tesla-api.timdorr.com/vehicle/state/data',
    deprecated: false,
    implemented: true,
    executor: 'tesla_client',
    safety: 'read',
    requiresAwake: true,
  },
  {
    id: 'legacy-data',
    group: 'vehicle_state',
    title: 'data (legacy rollup)',
    method: 'GET',
    path: '/api/1/vehicles/:id/data',
    purpose: 'An older version of the rollup with the same shape. Present in the docs, but the product does not use it.',
    params: [VEHICLE_ID_PARAM],
    expectedResponse: '200 with the same sections, without vehicle_config.',
    notes: ['The catalog shows it to compare response shapes. vehicle_data is what gets used.'],
    docUrl: 'https://tesla-api.timdorr.com/vehicle/state/data',
    deprecated: false,
    implemented: false,
    executor: 'owner_api_raw',
    safety: 'read',
    requiresAwake: true,
  },
  {
    id: 'latest-vehicle-data',
    group: 'vehicle_state',
    title: 'latest_vehicle_data',
    method: 'GET',
    path: '/api/1/vehicles/:id/latest_vehicle_data',
    purpose: 'A removed endpoint. Its only use is checking that the path really no longer exists.',
    params: [VEHICLE_ID_PARAM],
    expectedResponse: '404.',
    notes: ['Documented as returning 404. The product never calls it.'],
    docUrl: 'https://tesla-api.timdorr.com/vehicle/state/data',
    deprecated: true,
    replacement: 'vehicle_data',
    implemented: false,
    executor: 'owner_api_raw',
    safety: 'read',
    requiresAwake: false,
  },
  {
    id: 'data-request-drive-state',
    group: 'driving',
    title: 'data_request/drive_state',
    method: 'GET',
    path: '/api/1/vehicles/:id/data_request/drive_state',
    purpose: 'drive_state as its own endpoint. Shown as an illustration of the deprecated path.',
    params: [VEHICLE_ID_PARAM],
    expectedResponse: '200 {"response":{latitude,longitude,speed,power,heading,shift_state,native_*}} or 404.',
    notes: [OWNER_API_DEPRECATION_QUOTE, 'The product reads these fields from vehicle_data.drive_state.'],
    docUrl: 'https://tesla-api.timdorr.com/vehicle/state/drivestate',
    deprecated: true,
    replacement: 'vehicle_data',
    implemented: false,
    executor: 'owner_api_raw',
    safety: 'read',
    requiresAwake: true,
  },
  {
    id: 'data-request-charge-state',
    group: 'charging',
    title: 'data_request/charge_state',
    method: 'GET',
    path: '/api/1/vehicles/:id/data_request/charge_state',
    purpose: 'charge_state as its own endpoint. An illustration of the deprecated path; the data lives in vehicle_data.',
    params: [VEHICLE_ID_PARAM],
    expectedResponse: '200 {"response":{battery_level,battery_range,charging_state,charger_power,...}} or 404.',
    notes: [OWNER_API_DEPRECATION_QUOTE, 'Units: battery_range/est_battery_range — miles; charger_power — kW; time_to_full_charge — hours.'],
    docUrl: 'https://tesla-api.timdorr.com/vehicle/state/chargestate',
    deprecated: true,
    replacement: 'vehicle_data',
    implemented: false,
    executor: 'owner_api_raw',
    safety: 'read',
    requiresAwake: true,
  },
  {
    id: 'data-request-climate-state',
    group: 'climate',
    title: 'data_request/climate_state',
    method: 'GET',
    path: '/api/1/vehicles/:id/data_request/climate_state',
    purpose: 'climate_state as its own endpoint. An illustration of the deprecated path.',
    params: [VEHICLE_ID_PARAM],
    expectedResponse: '200 {"response":{inside_temp,outside_temp,is_climate_on,...}} or 404.',
    notes: [OWNER_API_DEPRECATION_QUOTE, 'Temperatures come in °C regardless of the distance unit.'],
    docUrl: 'https://tesla-api.timdorr.com/vehicle/state/climatestate',
    deprecated: true,
    replacement: 'vehicle_data',
    implemented: false,
    executor: 'owner_api_raw',
    safety: 'read',
    requiresAwake: true,
  },
  {
    id: 'nearby-charging-sites',
    group: 'charging',
    title: 'nearby_charging_sites',
    method: 'GET',
    path: '/api/1/vehicles/:id/data_request/nearby_charging_sites',
    purpose: 'Tesla sites near the vehicle. The only section that has no counterpart in vehicle_data.',
    params: [VEHICLE_ID_PARAM],
    expectedResponse: '200 {"response":{"destination_only_charging_sites":[...],"superchargers":[...]}} or 404.',
    notes: ['Formally covered by the blanket data_request deprecation, but the rollup offers no replacement for it — which is why it is marked unimplemented rather than removed.'],
    docUrl: 'https://tesla-api.timdorr.com/vehicle/state/nearbychargingsites',
    deprecated: false,
    implemented: false,
    executor: 'owner_api_raw',
    safety: 'read',
    requiresAwake: true,
  },
  // ── Commands ──────────────────────────────────────────────────────────────
  {
    id: 'wake-up',
    group: 'commands',
    title: 'wake_up',
    method: 'POST',
    path: '/api/1/vehicles/:id/wake_up',
    purpose: 'Wakes the vehicle. The only implemented command — the collection loop needs it.',
    params: [VEHICLE_ID_PARAM],
    expectedResponse: '200 {"response":{...,state:"online"}}; the vehicle can take several seconds to reach online.',
    notes: [
      'The method is POST. The previous implementation declared POST in a comment and sent GET (plan E1).',
      '§42/AGENTS.md: called only after an explicit confirmation in the UI, and written to activity_events.',
      'The catalog has no full command list on purpose: not implemented means not exposed (§26).',
    ],
    docUrl: 'https://tesla-api.timdorr.com/vehicle/commands/wake',
    deprecated: false,
    implemented: true,
    executor: 'tesla_client',
    safety: 'wake',
    requiresAwake: false,
  },
  // ── Streaming ─────────────────────────────────────────────────────────────
  {
    id: 'streaming-wss',
    group: 'streaming',
    title: 'Streaming (WSS)',
    method: 'WSS',
    path: `/streaming/:vehicle_id`,
    purpose: 'The telemetry stream. The target VehicleDataProvider implementation after the polling provider (§22).',
    params: [
      { name: 'vehicle_id', in: 'path', required: true, type: 'string', description: 'The long vehicle_id specifically — this is where it is used, not the short id', example: '3744651726645272' },
    ],
    expectedResponse: 'A WebSocket connection carrying trace messages.',
    notes: [
      IDENTIFIER_QUOTE,
      `The host comes from TESLA_WSS_HOST (currently ${teslaConfig.wssHost.replace(/^wss:\/\//, '')}).`,
      'Not implemented: §22 asks only for the ability to add a StreamingProvider, not for the stream itself.',
    ],
    docUrl: 'https://tesla-api.timdorr.com/vehicle/streaming',
    deprecated: false,
    implemented: false,
    executor: 'not_implemented',
    safety: 'read',
    requiresAwake: true,
  },
]

export const CATALOG_BY_ID = new Map(CATALOG.map((entry) => [entry.id, entry]))

export function catalogForGroup(group: CatalogGroupId) {
  return CATALOG.filter((entry) => entry.group === group)
}

/** Only entries the runner can actually execute — the console's default filter. */
export const EXECUTABLE_CATALOG = CATALOG.filter(
  (entry) => entry.executor === 'tesla_client' || entry.executor === 'auth_probe' || entry.executor === 'owner_api_raw',
)

export const ENVIRONMENTS = [
  { id: 'global', label: 'Global — owner-api.teslamotors.com', apiBaseUrl: 'https://owner-api.teslamotors.com', authHost: 'auth.tesla.com' },
  { id: 'china', label: 'China — owner-api.vn.cloud.tesla.cn', apiBaseUrl: `https://${teslaConfig.chinaApiHost}`, authHost: 'auth.tesla.cn' },
] as const

export type EnvironmentId = (typeof ENVIRONMENTS)[number]['id']

export function environmentFor(id: string | null | undefined) {
  return ENVIRONMENTS.find((env) => env.id === id) ?? ENVIRONMENTS[0]
}

/** Client-safe projection: labels and hosts only, no env-derived secrets. */
export const ENVIRONMENT_FOR_CLIENT = ENVIRONMENTS.map((env) => ({ id: env.id, label: env.label, apiBaseUrl: env.apiBaseUrl, authHost: env.authHost }))
