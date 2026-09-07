/**
 * Executable checks for the Tesla layer's pure logic.
 *
 * Run with `npm run verify` (Node 22.18+/24 executes TypeScript directly). There is
 * no test framework in this project and adding one is out of scope for a redesign;
 * what matters is that the rules which caused the original defects are pinned by
 * something that actually runs — redaction (§23/§30), the units contract (§43/E11),
 * the five-state model (§7), the polling gate (§21), and the retry/refresh policy (§20).
 */

import { classifyStatus, parseRetryAfter, isRefreshEligible, retryDelayMs, TeslaApiError } from '../lib/tesla/errors.ts'
import { redactJsonText, redactText, sanitizeHeaders, sanitizeUrl } from '../lib/tesla/sanitize.ts'
import { deriveModel, derivePresence, freshnessFor, isVehicleAwake, milesToKm, normalizeChargeState, normalizeVehicleStatus, normalizeVehicleState } from '../lib/tesla/normalize.ts'
import { authBaseForHost, authBaseForIssuer, teslaConfig } from '../lib/tesla/config.ts'
import { resolveOwnerApiId } from '../lib/tesla/identity.ts'
import { createFleetConfig, normaliseFleetRegion, consentRevokeUrl, FLEET_SCOPES, FLEET_CALLBACK_PATH } from '../lib/fleet/config.ts'
import { assertUsableVehicleTag, fleetVehicleTag } from '../lib/fleet/client.ts'
import { accessTokenExpiryIso, buildAuthorizationUrl as buildFleetAuthorizationUrl, createAuthorizationRequest, decodeFleetToken, exchangeAuthorizationCode, parseCallbackUrl, refreshFleetTokens, scopesFromTokenSet } from '../lib/fleet/auth.ts'
import { buildAuthorizationUrl } from '../lib/tesla/auth.ts'
import { DEFAULT_POLLING_POLICY, PASSIVE_POLLING_POLICY, policyFor, resolvePollingProfile, shouldCollect } from '../lib/tesla/provider.ts'
import { TeslaClient } from '../lib/tesla/client.ts'
import {
  PRESENCE_COLOR,
  completenessNote,
  formatAge,
  formatDayHeading,
  formatDistanceShort,
  formatDuration,
  formatEfficiency,
  formatKm,
  formatPercent,
  formatTempCelsius,
  freshnessTone,
  groupByDay,
  presenceTone,
} from '../lib/format.ts'

let passed = 0
const failures: string[] = []

function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    passed += 1
    return
  }
  failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
}

function eq(label: string, actual: unknown, expected: unknown) {
  check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
}

// ── §23/§30 redaction ───────────────────────────────────────────────────────
const headers = sanitizeHeaders({
  Accept: 'application/json',
  Authorization: 'Bearer supersecrettokenvalue.abc',
  'Set-Cookie': 'session=leakme',
  'User-Agent': 'DriveScope/1.0',
})
eq('Authorization header is redacted', headers.Authorization, '[REDACTED]')
eq('Set-Cookie header is redacted', headers['Set-Cookie'], '[REDACTED]')
eq('non-secret header survives', headers['User-Agent'], 'DriveScope/1.0')

const ownerListBody = JSON.stringify({
  response: {
    count: 1,
    response: [{ id: 123, id_s: '123', vehicle_id: 3744651726645272, tokens: ['push-token-abc'], backseat_token: 'backseat-abc', display_name: 'Model Y' }],
  },
})
const scrubbed = redactJsonText(ownerListBody) ?? ''
check('vehicle list tokens are scrubbed', !scrubbed.includes('push-token-abc'), scrubbed)
check('backseat_token is scrubbed', !scrubbed.includes('backseat-abc'), scrubbed)
check('non-secret vehicle fields survive scrubbing', scrubbed.includes('Model Y') && scrubbed.includes('3744651726645272'), scrubbed)

const refreshBody = redactJsonText(JSON.stringify({ access_token: 'aaaa.bbbb.cccc', refresh_token: 'rrrr-SECRET', expires_in: 28800 })) ?? ''
check('refresh_token value is scrubbed', !refreshBody.includes('rrrr-SECRET'), refreshBody)
check('expires_in survives', refreshBody.includes('28800'), refreshBody)

eq('bearer in free text is scrubbed', redactText('failed with Authorization: Bearer abcdef123456'), 'failed with Authorization: Bearer [REDACTED]')
check('code_verifier in a URL is scrubbed', !sanitizeUrl('https://auth.tesla.com/x?code_verifier=VERIFIER123&state=abc').includes('VERIFIER123'), sanitizeUrl('https://auth.tesla.com/x?code_verifier=VERIFIER123&state=abc'))

// ── §43/E11 units contract ──────────────────────────────────────────────────
eq('miles convert to km', milesToKm(100), 160.9)
eq('null stays null, not zero', milesToKm(null), null)
const charge = normalizeChargeState({ battery_level: 82, battery_range: 250.4, charging_state: 'Charging', charger_power: 32, time_to_full_charge: 0.5, charge_energy_added: 24.618 })
eq('battery_range miles → km', charge.ratedRangeKm, 403.0)
eq('time_to_full_charge hours → minutes', charge.minutesToFullCharge, 30)
eq('charger_power is kW', charge.chargerPowerKw, 32)
eq('energy keeps 2 decimals', charge.chargeSessionEnergyAddedKwh, 24.62)
eq('charging state mapped', charge.chargingConnection, 'charging')
eq('absent field is null, never 0', normalizeChargeState({}).stateOfCharge, null)

const state = normalizeVehicleState({ odometer: 12_345.6, car_version: '2026.20.3', locked: true, df: 0, ft: false })
eq('odometer miles → km', state.odometerKm, 19_868.3)
eq('software version passthrough', state.softwareVersion, '2026.20.3')
eq('door flag 0 means closed', state.embeddedLeft, false)

// ── §7 five-state model ─────────────────────────────────────────────────────
const parked = { stateOfCharge: 80, chargingConnection: 'disconnected' as const }
eq('asleep is its own state', derivePresence('asleep', charge, { speedKmh: 0, shiftState: 'P' } as never), 'sleeping')
eq('offline differs from asleep', derivePresence('offline', charge, { speedKmh: 0, shiftState: 'P' } as never), 'offline')
eq('charging wins over shift', derivePresence('online', { ...charge, ...parked, chargingConnection: 'charging' } as never, { speedKmh: 0, shiftState: 'P' } as never), 'charging')
eq('shift D means driving', derivePresence('online', { ...charge, ...parked, chargingConnection: 'disconnected' } as never, { speedKmh: 64, shiftState: 'D' } as never), 'driving')
eq('stationary online means parked', derivePresence('online', { ...charge, ...parked } as never, { speedKmh: 0, shiftState: 'P' } as never), 'parked')

const status = normalizeVehicleStatus({
  state: 'online',
  display_name: 'Model Y',
  charge_state: { battery_level: 82, battery_range: 200, charging_state: 'Disconnected' },
  drive_state: { speed: 0, shift_state: 'P', latitude: 50.1, longitude: 8.6, heading: 90 },
  vehicle_state: { odometer: 1000, locked: true },
})
eq('presence from rollup', status.presence, 'parked')
eq('identity keeps the short id', status.identity.ownerApiId, '')
check('completeness is a ratio', status.completeness > 0.4 && status.completeness <= 1, String(status.completeness))
eq('model from display name', deriveModel(null, 'Model Y Performance'), 'Model Y')
eq('unknown model is null, never invented', deriveModel('12345678901234567', 'Garage'), null)

// ── §38 freshness is derived, never stored ──────────────────────────────────
const now = Date.UTC(2026, 8, 8, 12, 0, 0)
eq('8s old is live', freshnessFor(new Date(now - 8_000).toISOString(), now).freshness, 'live')
eq('3 minutes old is recent', freshnessFor(new Date(now - 180_000).toISOString(), now).freshness, 'recent')
eq('10 minutes old is stale', freshnessFor(new Date(now - 600_000).toISOString(), now).freshness, 'stale')
eq('43 minutes old is offline', freshnessFor(new Date(now - 2_580_000).toISOString(), now).freshness, 'offline')

// ── §20 error taxonomy: the E8 regression ───────────────────────────────────
eq('401 classifies as unauthorized', classifyStatus(401), 'unauthorized')
eq('403 classifies as forbidden', classifyStatus(403), 'forbidden')
eq('408 is a vehicle-availability answer, not a server fault', classifyStatus(408), 'vehicle_unavailable')
eq('429 classifies as rate_limited', classifyStatus(429), 'rate_limited')
eq('409 classifies as conflict', classifyStatus(409), 'conflict')
const forbidden = new TeslaApiError('forbidden', 'nope', { status: 403 })
const unauthorized = new TeslaApiError('unauthorized', 'expired', { status: 401 })
eq('a 403 must NOT trigger a refresh', isRefreshEligible(forbidden), false)
eq('a 401 must trigger a refresh', isRefreshEligible(unauthorized), true)
eq('Retry-After seconds parse', parseRetryAfter('120'), 120_000)
check('Retry-After date parses', typeof parseRetryAfter(new Date(Date.now() + 60_000).toUTCString()) === 'number')
check('backoff is bounded', retryDelayMs(9, () => 1) <= 10_000)

// ── §21 state-aware polling gate ────────────────────────────────────────────
// The gate controls the cheap status probe; telemetry is refused separately by the
// client when the probe says the car is asleep. A never-collected vehicle must still
// get one probe, or a fresh install could never produce its first snapshot.
eq('unknown state still gets a first probe', shouldCollect({ policy: DEFAULT_POLLING_POLICY, presence: null, snapshotAgeMs: null, force: false, mayWake: false }).collect, true)
eq('fresh cache short-circuits a read', shouldCollect({ policy: DEFAULT_POLLING_POLICY, presence: 'parked', snapshotAgeMs: 1_000, force: false, mayWake: false }).collect, false)
eq('stale parked snapshot triggers a read', shouldCollect({ policy: DEFAULT_POLLING_POLICY, presence: 'parked', snapshotAgeMs: 10 ** 12, force: false, mayWake: false }).collect, true)
eq('passive profile never reaches Tesla', shouldCollect({ policy: PASSIVE_POLLING_POLICY, presence: 'driving', snapshotAgeMs: null, force: false, mayWake: false }).collect, false)
eq('a forced read on a sleeping car needs wake confirmation', shouldCollect({ policy: DEFAULT_POLLING_POLICY, presence: 'sleeping', snapshotAgeMs: 10 ** 12, force: true, mayWake: false }).collect, false)
eq('first_collect is reported as the bootstrap reason', shouldCollect({ policy: DEFAULT_POLLING_POLICY, presence: null, snapshotAgeMs: null, force: false, mayWake: false }).reason, 'first_collect')
check('driving polls faster than parked', DEFAULT_POLLING_POLICY.driving.liveMs < DEFAULT_POLLING_POLICY.parked.liveMs)
check('sleeping probes slower than parked', DEFAULT_POLLING_POLICY.sleeping.liveMs > DEFAULT_POLLING_POLICY.parked.liveMs)
eq('explicit user request overrides the interval', shouldCollect({ policy: DEFAULT_POLLING_POLICY, presence: 'charging', snapshotAgeMs: 0, force: true, mayWake: false }).collect, true)

// ── §21 collection mode precedence (regression for the 004 column-default bug) ─
// A vehicle deliberately set to `passive` must never start issuing live probes just
// because a nullable-with-default column was added underneath it.
eq('legacy passive governs when no profile was chosen', resolvePollingProfile({ pollingProfile: null, collectionMode: 'passive' }), 'passive')
eq('conservative maps to the default cadence', resolvePollingProfile({ pollingProfile: null, collectionMode: 'conservative' }), 'default')
eq('on_demand relaxes the cadence', resolvePollingProfile({ pollingProfile: null, collectionMode: 'on_demand' }), 'relaxed')
eq('an explicit profile overrides the legacy column', resolvePollingProfile({ pollingProfile: 'passive', collectionMode: 'conservative' }), 'passive')
eq(
  'passive mode makes no request even when forced by the schedule',
  shouldCollect({ policy: policyFor('passive'), presence: 'driving', snapshotAgeMs: null, force: false, mayWake: false }).collect,
  false,
)

// ── TeslaClient behaviour against a fake transport ──────────────────────────
type Call = { url: string; method: string; headers: Record<string, string> }

function fakeFetch(handler: (call: Call) => { status: number; body?: unknown; text?: string; headers?: Record<string, string> }) {
  const calls: Call[] = []
  const impl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const record: Call = {
      url,
      method: String(init?.method ?? 'GET'),
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
    }
    calls.push(record)
    const response = handler(record)
    const body = response.text ?? JSON.stringify(response.body ?? {})
    return new Response(body, { status: response.status, headers: { 'content-type': 'application/json', ...(response.headers ?? {}) } })
  }
  return { impl: impl as unknown as typeof fetch, calls }
}

function clientFor(impl: typeof fetch, extra: { refreshAccessToken?: () => Promise<string> } = {}) {
  let token = 'tok-initial'
  const client = new TeslaClient({
    getAccessToken: async () => token,
    refreshAccessToken: extra.refreshAccessToken,
    cacheTtlMs: 0,
    fetchImpl: impl,
  })
  return { client, setToken: (next: string) => (token = next) }
}

const vehiclesAnswer = { response: { count: 1, response: [{ id: 123, id_s: '123', vehicle_id: 3744651726645272, display_name: 'Model Y', state: 'online' }] } }

// Envelope unwrap + dedup: two concurrent identical reads must be one fetch.
{
  const { impl, calls } = fakeFetch(() => ({ status: 200, body: vehiclesAnswer }))
  const { client } = clientFor(impl)
  const [a, b] = await Promise.all([client.getVehicles(), client.getVehicles()])
  eq('concurrent duplicate reads collapse to one request', calls.length, 1)
  eq('response envelope is unwrapped', (a as Array<Record<string, unknown>>)[0]?.id_s, '123')
  check('User-Agent is sent on every request', calls.every((call) => /DriveScope/i.test(call.headers['User-Agent'] ?? '')))
  check('bearer header present', Boolean(calls[0]?.headers.Authorization?.startsWith('Bearer ')))
}

// 401 must refresh exactly once then succeed; 403 must not refresh at all.
{
  let refreshes = 0
  const { impl, calls } = fakeFetch((call) => {
    if (call.headers.Authorization === 'Bearer stale') return { status: 401, body: { error: ' unauthorized' } }
    void call
    return { status: 200, body: vehiclesAnswer }
  })
  const client = new TeslaClient({
    getAccessToken: async () => 'stale',
    refreshAccessToken: async () => {
      refreshes += 1
      return 'fresh'
    },
    cacheTtlMs: 0,
    apiBaseUrlOverride: 'https://owner-api.teslamotors.com',
    fetchImpl: impl,
  })
  // Force the refresh path to actually change what the next attempt sends.
  let issued = 0
  const mutating = fakeFetch(() => {
    issued += 1
    return issued === 1 ? { status: 401, body: { error: 'expired' } } : { status: 200, body: vehiclesAnswer }
  })
  const second = new TeslaClient({
    getAccessToken: async () => (issued === 0 ? 'stale' : 'fresh'),
    refreshAccessToken: async () => {
      refreshes += 1
      return 'fresh'
    },
    cacheTtlMs: 0,
    fetchImpl: mutating.impl,
  })
  await second.getVehicles()
  eq('401 triggers exactly one refresh', refreshes, 1)
  eq('401 retries once and succeeds', mutating.calls.length, 2)
  void client
  void calls
}

{
  let refreshes = 0
  const { impl, calls } = fakeFetch(() => ({ status: 403, body: { response: null, error: 'forbidden, see https://developer.tesla.com/docs/fleet-api' } }))
  const { client } = clientFor(impl, {
    refreshAccessToken: async () => {
      refreshes += 1
      return 'whatever'
    },
  })
  let caught: unknown = null
  try {
    await client.getVehicles()
  } catch (error) {
    caught = error
  }
  eq('403 does not attempt a refresh', refreshes, 0)
  eq('403 is not retried', calls.length, 1)
  check('403 surfaces as a forbidden error', caught instanceof TeslaApiError && caught.kind === 'forbidden', String(caught))
  check('the Fleet-API gate is named in the message', caught instanceof TeslaApiError && /Owner API|Fleet/i.test(caught.message), caught instanceof TeslaApiError ? caught.message : '')
}

// 5xx retries are bounded; a vehicle_data rollup is preferred over data_request.
{
  const { impl, calls } = fakeFetch(() => ({ status: 503, body: { error: 'unavailable' } }))
  const { client } = clientFor(impl)
  try {
    await client.getVehicleData('123')
  } catch {
    /* expected */
  }
  check('5xx is retried but bounded', calls.length >= 2 && calls.length <= 4, `${calls.length} attempts`)
}

{
  const { impl, calls } = fakeFetch(() => ({ status: 200, body: { response: { drive_state: { speed: 72 }, charge_state: { battery_level: 82 } } } }))
  const { client } = clientFor(impl)
  const drive = await client.getDriveState('123')
  const chargeState = await client.getChargeState('123')
  eq('drive_state comes from the rollup', (drive as { speed?: number })?.speed, 72)
  eq('charge_state comes from the same rollup', (chargeState as { battery_level?: number })?.battery_level, 82)
  check('no data_request/* path is used', calls.every((call) => !call.url.includes('data_request')), calls.map((call) => call.url).join(' '))
  check('rollup is requested at vehicle_data', calls.some((call) => call.url.includes('/vehicle_data')), calls.map((call) => call.url).join(' '))
}

// wake_up must be POST (plan E1) and must not be fired by a status read.
{
  const { impl, calls } = fakeFetch((call) => (call.method === 'POST' ? { status: 200, body: { response: { id: 123, state: 'online' } } } : { status: 200, body: vehiclesAnswer }))
  const { client } = clientFor(impl)
  await client.wakeVehicle('123')
  eq('wake_up is sent as POST', calls.some((call) => call.method === 'POST' && call.url.includes('wake_up')), true)
}

// An asleep vehicle must not receive a telemetry call at all.
{
  const { impl, calls } = fakeFetch((call) => {
    if (call.url.includes('vehicle_data')) return { status: 408, body: { error: 'vehicle unavailable: vehicle is asleep' } }
    return { status: 200, body: { response: { id: 123, id_s: '123', vehicle_id: 3744651726645272, display_name: 'Model Y', state: 'asleep' } } }
  })
  const { client } = clientFor(impl)
  const result = await client.getVehicleStatus('123')
  eq('asleep vehicle yields sleeping presence', result.status.presence, 'sleeping')
  eq('no telemetry request was made for a sleeping vehicle', calls.some((call) => call.url.includes('vehicle_data')), false)
  eq('telemetryCollected reports false', result.telemetryCollected, false)
}

// `{response: null}` is an empty answer, not a success.
{
  const { impl } = fakeFetch(() => ({ status: 200, body: { response: null } }))
  const { client } = clientFor(impl)
  let caught: unknown = null
  try {
    await client.getVehicleData('123')
  } catch (error) {
    caught = error
  }
  check('null response envelope is reported as not_found', caught instanceof TeslaApiError && caught.kind === 'not_found', String(caught))
}

// A WAF HTML page must not be parsed as JSON or crash.
{
  const { impl } = fakeFetch(() => ({ status: 403, text: '<html><body>Challenge</body></html>' }))
  const { client } = clientFor(impl)
  let caught: unknown = null
  try {
    await client.getVehicles()
  } catch (error) {
    caught = error
  }
  check('HTML error body is handled, not thrown as a parse error', caught instanceof TeslaApiError && caught.kind === 'forbidden', String(caught))
}

// ── §15/§17 OAuth URL composition ───────────────────────────────────────────
// Regression for the defect that broke authorization and token refresh at the same
// time: `authOrigin` (scheme+host) and the OAuth base (scheme+host+/oauth2/v3) were
// both called "authOrigin", so every caller appended the version path once more and
// Tesla answered 404 for /oauth2/v3/oauth2/v3/token. A pasted token worked until it
// expired, then nothing did.
{
  for (const url of [teslaConfig.authorizeUrl, teslaConfig.tokenUrl, teslaConfig.userinfoUrl]) {
    check(`no doubled auth path in ${url}`, !url.includes(`${teslaConfig.authPath}${teslaConfig.authPath}`), url)
  }
  eq('authBaseUrl is the origin plus exactly one path', authBaseForHost(teslaConfig.authHost), teslaConfig.authBaseUrl)
  // Tesla echoes `issuer=<base including /oauth2/v3>` on the callback: feeding it back
  // must be idempotent, not additive.
  eq('issuer already carrying the path resolves to one path', authBaseForIssuer(`https://${teslaConfig.authHost}${teslaConfig.authPath}`), teslaConfig.authBaseUrl)
  eq('null issuer falls back to the configured base', authBaseForIssuer(null), teslaConfig.authBaseUrl)
  eq('token endpoint is the base plus one segment', `${authBaseForIssuer(null)}/token`, teslaConfig.tokenUrl)
  eq('userinfo is the base plus one segment', `${authBaseForIssuer(null)}/userinfo`, teslaConfig.userinfoUrl)
  eq('china host resolves to the china base', authBaseForHost('auth.tesla.cn'), `https://auth.tesla.cn${teslaConfig.authPath}`)

  let refusedHost = false
  try {
    authBaseForHost('evil.example.com')
  } catch {
    refusedHost = true
  }
  check('an untrusted auth host is refused rather than sent the bearer', refusedHost)
  let refusedIssuer = false
  try {
    authBaseForIssuer('not a url')
  } catch {
    refusedIssuer = true
  }
  check('a malformed issuer is refused', refusedIssuer)

  const authorize = new URL(buildAuthorizationUrl({ state: 'st', codeChallenge: 'ch' }))
  eq('authorize goes to the configured authorize URL', `${authorize.origin}${authorize.pathname}`, teslaConfig.authorizeUrl)
  const redirect = authorize.searchParams.get('redirect_uri') ?? ''
  eq('redirect_uri is the void callback on the bare origin', redirect, `${teslaConfig.authOrigin}/void/callback`)
  check('redirect_uri carries no OAuth path (it must match the exchange exactly)', !redirect.includes(teslaConfig.authPath), redirect)
  eq('PKCE challenge method is S256', authorize.searchParams.get('code_challenge_method'), 'S256')
  eq('client_id is the native ownerapi client', authorize.searchParams.get('client_id'), teslaConfig.clientId)
  check('no command scope is requested', !(authorize.searchParams.get('scope') ?? '').includes('vehicle_cmds'), authorize.searchParams.get('scope') ?? '')
}

// ── Owner API request shape ─────────────────────────────────────────────────
// TeslaMate sends only `user-agent` and `Authorization` on reads; a Content-Type on a
// bodyless GET is a fingerprintable oddity, so it must appear only with a body.
{
  const { impl, calls } = fakeFetch(() => ({ status: 200, body: { response: [] } }))
  const { client } = clientFor(impl)
  await client.getVehicles()
  // The one POST the app makes carries no body (the docs give wake_up none), so it
  // must not claim one either.
  await client.wakeVehicle('123')
  await client.request('/api/1/vehicles/123/auto_conditioning_start', { method: 'POST', body: {}, noCache: true })
  const get = calls.find((call) => call.method === 'GET')
  const bodylessPost = calls.find((call) => call.method === 'POST' && !call.url.includes('auto_conditioning'))
  const posted = calls.find((call) => call.url.includes('auto_conditioning'))
  check('GET carries no Content-Type', get !== undefined && !('Content-Type' in get.headers), JSON.stringify(get?.headers ?? {}))
  check('a POST with no body declares no Content-Type', bodylessPost !== undefined && !('Content-Type' in bodylessPost.headers), JSON.stringify(bodylessPost?.headers ?? {}))
  check('a POST with a body declares Content-Type', posted !== undefined && posted.headers['Content-Type'] === 'application/json', JSON.stringify(posted?.headers ?? {}))
  check('Authorization is a bearer header', get?.headers.Authorization === 'Bearer tok-initial', String(get?.headers.Authorization))
  check('the User-Agent is not a browser string', Boolean(get?.headers['User-Agent']) && !/Mozilla|Chrome|Safari/.test(get?.headers['User-Agent'] ?? ''), String(get?.headers['User-Agent']))
}

// ── E2: which identifier may appear in an Owner API path ────────────────────
// The long 16-digit `vehicle_id` is a streaming identity. The previous resolver fell
// through to it whenever the short id was missing, so every state request went to
// `/api/1/vehicles/3744651726645272` and failed — indistinguishable from a dead token.
eq('stored short id wins', resolveOwnerApiId({ owner_api_id: '1234567890', provider_vehicle_id: '999', vehicle_id: '3744651726645272' }), '1234567890')
eq('a short legacy provider id is accepted', resolveOwnerApiId({ provider_vehicle_id: '1234567890' }), '1234567890')
eq('a long legacy provider id is refused', resolveOwnerApiId({ provider_vehicle_id: '3744651726645272', vehicle_id: '3744651726645272' }), null)
eq('the streaming vehicle_id is never offered as :id', resolveOwnerApiId({ vehicle_id: '3744651726645272' }), null)
eq('a row with no identifiers has no id', resolveOwnerApiId({}), null)
eq('a whitespace-only stored id does not count as present', resolveOwnerApiId({ owner_api_id: '  ' }), null)

// ── §7 awake vocabulary: `online` and `active` both mean the radio is up ─────
eq('online and active are both awake', (['online', 'active', 'ONLINE'] as const).map(isVehicleAwake), [true, true, true])
eq('asleep, offline and unknown are not awake', (['asleep', 'offline', 'unknown', null] as const).map(isVehicleAwake), [false, false, false, false])
{
  const { impl, calls } = fakeFetch((call) => {
    if (call.url.includes('vehicle_data')) {
      return { status: 200, body: { response: { drive_state: { latitude: 50.45, longitude: 30.52, heading: 90 }, charge_state: { battery_level: 71, usable_battery_level: 68, charging_state: 'Disconnected' } } } }
    }
    return { status: 200, body: { response: { id: 123, id_s: '123', vehicle_id: 3744651726645272, display_name: 'Model Y', state: 'active' } } }
  })
  const { client } = clientFor(impl)
  const result = await client.getVehicleStatus('123')
  eq('"active" normalises to online connectivity', result.status.connectivity, 'online')
  eq('telemetry is fetched for an "active" vehicle', calls.some((call) => call.url.includes('vehicle_data')), true)
  eq('telemetryCollected reports true', result.telemetryCollected, true)
  check('"active" is never reported as offline', result.status.presence !== 'offline', result.status.presence)
}

// ── Presentation layer (lib/format.ts) ──────────────────────────────────────
// Labels are produced at render time, so these are the strings users actually see.
eq('percent', formatPercent(82), '82%')
eq('null percent is a dash, not 0%', formatPercent(null), '—')
eq('km with one decimal', formatKm(28.44), '28.4 km')
eq('short km rounds above 10', formatDistanceShort(144.6), '145 km')
eq('celsius keeps a decimal when small (hyphen-minus, per Intl en-US)', formatTempCelsius(-2.34), '-2.3°C')
eq('celsius rounds when large', formatTempCelsius(21.6), '22°C')
eq('duration under an hour uses the minute form', formatDuration(45), '45m')
eq('minute form has no plural at 1', formatDuration(1), '1m')
eq('minute form has no plural at 21', formatDuration(21), '21m')
eq('minute form has no plural at 22', formatDuration(22), '22m')
eq('combined hours and minutes', formatDuration(80), '1h 20m')
eq('sub-minute duration is spelled out', formatDuration(0), '<1m')
eq('missing duration is a dash', formatDuration(null), '—')
eq('presence tone for driving', presenceTone('driving'), 'accent')
check('sleeping is kept apart from offline', PRESENCE_COLOR.sleeping !== PRESENCE_COLOR.offline, `sleeping=${PRESENCE_COLOR.sleeping}, offline=${PRESENCE_COLOR.offline}`)
eq('charging is styled as ok', presenceTone('charging'), 'ok')
eq('unknown presence falls back to the outline tone', presenceTone('nonsense'), 'outline')
eq('freshness tone for stale data', freshnessTone('stale'), 'warn')
eq('connection line combines state and age', `${freshnessTone('offline')} · ${formatAge(2580)}`, 'danger · 43m ago')
check('sleeping is never coloured as live', PRESENCE_COLOR.sleeping !== PRESENCE_COLOR.driving, `sleeping=${PRESENCE_COLOR.sleeping}, driving=${PRESENCE_COLOR.driving}`)
eq('trip event shows efficiency', formatEfficiency(172.6), '173 Wh/km')
eq('event detail composes distance and duration', `${formatDistanceShort(28.4)} · ${formatDuration(35)}`, '28.4 km · 35m')
eq('a reading without a timestamp is dropped from the grouping', groupByDay([{ at: null as string | null }], (item) => item.at).length, 0)
eq('completeness note counts missing fields', completenessNote(5, 8), '3 of 8 values unavailable')
eq('completeness note is silent when full', completenessNote(8, 8), null)
check('day heading is today-aware', ['Today', 'Yesterday'].includes(formatDayHeading(new Date().toISOString(), Date.now())), formatDayHeading(new Date().toISOString()))
eq('day heading yesterday', formatDayHeading(new Date(Date.now() - 86_400_000).toISOString()), 'Yesterday')

// ── Fleet §4a: the pinned authentication contract ───────────────────────────
// Each check below restates one verbatim quote from docs/TESLA_FLEET_MIGRATION_PLAN.md §4a,
// so a future edit that "simplifies" a host, a scope or a body key fails loudly instead of
// producing a Tesla-side error that looks like an authorization problem.
{
  const cfg = createFleetConfig({ region: 'eu', clientId: 'cid', clientSecret: 'sec', redirectUri: 'https://app.example.test/api/fleet/callback' })
  eq('token endpoint is the fleet-auth domain, not auth.tesla.com', cfg.tokenUrl, 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token')
  eq('authorize endpoint is auth.tesla.com', cfg.authorizeUrl, 'https://auth.tesla.com/oauth2/v3/authorize')
  eq('audience is the regional Fleet API base URL', cfg.audience, 'https://fleet-api.prd.eu.vn.cloud.tesla.com')
  eq('na region audience', createFleetConfig({ region: 'na', clientId: 'c', clientSecret: 's', redirectUri: 'https://x/cb' }).audience, 'https://fleet-api.prd.na.vn.cloud.tesla.com')
  eq('cn region audience', createFleetConfig({ region: 'cn', clientId: 'c', clientSecret: 's', redirectUri: 'https://x/cb' }).audience, 'https://fleet-api.prd.cn.vn.cloud.tesla.cn')
  eq('scope set is the pinned list', [...FLEET_SCOPES], ['openid', 'offline_access', 'user_data', 'vehicle_device_data', 'vehicle_location', 'vehicle_cmds', 'vehicle_charging_cmds'])
  check('scope list says vehicle_cmds, never vehicle_commands', !FLEET_SCOPES.includes('vehicle_commands' as never))
  // The docs' own third-party example omits vehicle_location, but vehicle_data and
  // fleet_telemetry_config both require it — without it location comes back empty and the
  // telemetry config is refused, each looking like an unrelated failure.
  check('vehicle_location is requested', FLEET_SCOPES.includes('vehicle_location'))
  check('offline_access is requested (the refresh token needs it)', FLEET_SCOPES.includes('offline_access'))
  eq('consent revoke URL is Tesla\'s page with both params encoded', consentRevokeUrl('cid/1', 'https://app.test/settings'), 'https://auth.tesla.com/user/revoke/consent?revoke_client_id=cid%2F1&back_url=https%3A%2F%2Fapp.test%2Fsettings')
  let refusedRegion = false
  try {
    normaliseFleetRegion('moon')
  } catch {
    refusedRegion = true
  }
  check('an unknown region is refused rather than defaulted', refusedRegion)
  let configMessage = ''
  try {
    createFleetConfig({ region: 'eu' })
  } catch (error) {
    configMessage = error instanceof Error ? error.message : ''
  }
  check('missing env values are named together', configMessage.includes('TESLA_FLEET_CLIENT_ID') && configMessage.includes('TESLA_FLEET_CLIENT_SECRET') && configMessage.includes('TESLA_FLEET_REDIRECT_URI'), configMessage)
  eq('redirect_uri falls back to the app url callback', createFleetConfig({ region: 'eu', clientId: 'c', clientSecret: 's', appUrl: 'https://app.test/' }).redirectUri, 'https://app.test/api/fleet/callback')

  const { state, nonce } = createAuthorizationRequest()
  check('state is url-safe randomness', state.length >= 32 && /^[A-Za-z0-9_-]+$/.test(state), state)
  check('nonce differs from state', nonce !== state)
  const authorize = new URL(buildFleetAuthorizationUrl({ state, nonce }, cfg))
  eq('authorize URL is on the pinned host and path', `${authorize.origin}${authorize.pathname}`, cfg.authorizeUrl)
  eq('response_type is code', authorize.searchParams.get('response_type'), 'code')
  eq('scope is the pinned set, space separated', authorize.searchParams.get('scope'), FLEET_SCOPES.join(' '))
  check('no PKCE parameters — Fleet carries a nonce instead', !authorize.searchParams.has('code_challenge') && !authorize.searchParams.has('code_challenge_method'))
  eq('nonce is sent', authorize.searchParams.get('nonce'), nonce)
  eq('state is sent', authorize.searchParams.get('state'), state)
  eq('all requested scopes are required to proceed', authorize.searchParams.get('require_requested_scopes'), 'true')
  eq('missing scopes prompt the user', authorize.searchParams.get('prompt_missing_scopes'), 'true')
  eq('redirect_uri is the configured one', authorize.searchParams.get('redirect_uri'), cfg.redirectUri)
}

{
  const cfg = createFleetConfig({ region: 'eu', clientId: 'cid', clientSecret: 'sec', redirectUri: 'https://app.example.test/api/fleet/callback' })
  const makeJwt = (claims: Record<string, unknown>) => {
    const enc = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
    return `${enc({ alg: 'ES256', typ: 'JWT' })}.${enc(claims)}.sig`
  }
  const originalFetch = globalThis.fetch
  let seen: { url: string; contentType: string | null; form: URLSearchParams } | null = null
  const stub = (body: unknown, status = 200) => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      seen = { url: String(input), contentType: headers['Content-Type'] ?? null, form: new URLSearchParams(String(init?.body ?? '')) }
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
  }
  try {
    stub({ access_token: makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600, scp: ['vehicle_cmds', 'openid'] }), expires_in: 3600, refresh_token: 'rotating-1', scope: 'openid offline_access vehicle_cmds' })
    const tokens = await exchangeAuthorizationCode({ code: 'the-code' }, cfg)
    eq('code exchange posts to the pinned token URL', seen?.url ?? '', cfg.tokenUrl)
    eq('code exchange is form-urlencoded', seen?.contentType ?? '', 'application/x-www-form-urlencoded')
    eq('grant_type', seen?.form.get('grant_type') ?? '', 'authorization_code')
    eq('client_id is sent', seen?.form.get('client_id') ?? '', 'cid')
    eq('client_secret is sent', seen?.form.get('client_secret') ?? '', 'sec')
    eq('code is sent', seen?.form.get('code') ?? '', 'the-code')
    eq('audience is the regional base URL', seen?.form.get('audience') ?? '', 'https://fleet-api.prd.eu.vn.cloud.tesla.com')
    eq('redirect_uri is echoed', seen?.form.get('redirect_uri') ?? '', cfg.redirectUri)
    check('no client_assertion on the third-party flow', !seen?.form.has('client_assertion') && !seen?.form.has('client_assertion_type'))
    check('no PKCE verifier is sent', !seen?.form.has('code_verifier'))
    eq('scopes merge the response field with the token claims', (scopesFromTokenSet(tokens) ?? []).sort(), ['offline_access', 'openid', 'vehicle_cmds'])
    eq('expiry comes from the JWT exp claim', accessTokenExpiryIso(tokens.access_token)?.slice(0, 11), new Date(Date.now() + 3600_000).toISOString().slice(0, 11))
    eq('claims decode', decodeFleetToken(tokens.access_token)?.scp, ['vehicle_cmds', 'openid'])

    seen = null
    await refreshFleetTokens('rotating-1', cfg)
    eq('refresh grant_type', seen?.form.get('grant_type') ?? '', 'refresh_token')
    eq('refresh sends client_id and the rotating token', [seen?.form.get('client_id'), seen?.form.get('refresh_token')], ['cid', 'rotating-1'])
    check('refresh sends no client secret (§4a lists three keys only)', !seen?.form.has('client_secret'))

    stub({ error: 'invalid_grant', error_description: 'code_verifier_was_used' }, 400)
    let rejected: unknown = null
    try {
      await exchangeAuthorizationCode({ code: 'replay' }, cfg)
    } catch (error) {
      rejected = error
    }
    check('a 400 from the token endpoint is invalid_grant', rejected instanceof TeslaApiError && rejected.kind === 'invalid_grant', String(rejected))

    stub('<html><body>Bad Gateway</body></html>', 502)
    let nonJson: unknown = null
    try {
      await refreshFleetTokens('rotating-1', cfg)
    } catch (error) {
      nonJson = error
    }
    check('a non-JSON token answer is malformed, not a crash', nonJson instanceof TeslaApiError && nonJson.kind === 'malformed', String(nonJson))

    stub('Please complete the captcha to continue', 403)
    let challenged: unknown = null
    try {
      await refreshFleetTokens('rotating-1', cfg)
    } catch (error) {
      challenged = error
    }
    check('a WAF answer is reported as a challenge, not as a bad token', challenged instanceof TeslaApiError && challenged.kind === 'challenge', String(challenged))

    const parsed = parseCallbackUrl('https://app.example.test/api/fleet/callback?code=abc123&state=xyz', 'xyz')
    eq('callback code is read', parsed.code, 'abc123')
    let stateMismatch: unknown = null
    try {
      parseCallbackUrl('https://app.example.test/cb?code=abc&state=other', 'xyz')
    } catch (error) {
      stateMismatch = error
    }
    check('a mismatched state is refused', stateMismatch instanceof TeslaApiError && stateMismatch.kind === 'invalid_grant', String(stateMismatch))
    let userDenied: unknown = null
    try {
      parseCallbackUrl('https://app.example.test/cb?error=access_denied&error_description=User+refused')
    } catch (error) {
      userDenied = error
    }
    check('a refusal is reported with Tesla wording', userDenied instanceof TeslaApiError && /access_denied/.test(userDenied.message), String(userDenied))
  } finally {
    globalThis.fetch = originalFetch
  }
}

// ── Fleet vehicle_tag rule + the callback guard ─────────────────────────────
// {vehicle_tag} accepts the VIN or the short id (the working reference app resolves it as
// `v.id_s || String(v.id)`), and rejects the long streaming id.
eq('VIN is accepted', assertUsableVehicleTag('5YJ3E1IA7KF000001'), '5YJ3E1IA7KF000001')
eq('short id is accepted', assertUsableVehicleTag('100021'), '100021')
eq('the long streaming vehicle_id is refused', (() => {
  try {
    assertUsableVehicleTag('3744651726645272')
    return 'accepted'
  } catch (error) {
    return error instanceof TeslaApiError ? error.kind : 'wrong error'
  }
})(), 'not_found')
eq('no usable tag is reported as null, not sent as a bare path', fleetVehicleTag({ vin: null, owner_api_id: '3744651726645272' }), null)
eq('VIN wins over the short id', fleetVehicleTag({ vin: '5YJ3E1IA7KF000001', owner_api_id: '100021' }), '5YJ3E1IA7KF000001')
eq('the short id is used when no VIN is stored', fleetVehicleTag({ vin: null, owner_api_id: '100021' }), '100021')
eq('an empty row has no tag', fleetVehicleTag({}), null)

// A stale redirect URI is the bug that made login look like it worked: Tesla authorized the
// user and redirected to a route that no longer exists, consuming the one-time code on a 404.
{
  const stale = createFleetConfig({ region: 'eu', clientId: 'c', clientSecret: 's', redirectUri: 'http://localhost:3000/api/tesla/auth/callback' })
  check('a callback path that is not our route is flagged', stale.redirectPathWarning !== null && stale.redirectPathWarning.includes(FLEET_CALLBACK_PATH), String(stale.redirectPathWarning))
  check('the flag names the value to use instead', (stale.redirectPathWarning ?? '').includes('http://localhost:3000/api/fleet/callback'), String(stale.redirectPathWarning))
  const good = createFleetConfig({ region: 'eu', clientId: 'c', clientSecret: 's', redirectUri: `http://localhost:3000${FLEET_CALLBACK_PATH}` })
  eq('the correct route is not flagged', good.redirectPathWarning, null)
  eq('scopes fall back to the pinned set', good.scopes, [...FLEET_SCOPES])
  eq('TESLA_FLEET_SCOPES overrides verbatim', createFleetConfig({ region: 'eu', clientId: 'c', clientSecret: 's', redirectUri: 'http://l/x'.replace('/x', FLEET_CALLBACK_PATH), scopeOverride: 'openid vehicle_device_data' }).scopes, ['openid', 'vehicle_device_data'])
}

console.log(`\n  ${passed} checks passed`)
if (failures.length) {
  console.log(`  ${failures.length} FAILED:\n`)
  for (const failure of failures) console.log(`   ✗ ${failure}`)
  console.log('')
  process.exit(1)
}
console.log('  all Tesla-layer checks passed\n')
