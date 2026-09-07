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

console.log(`\n  ${passed} checks passed`)
if (failures.length) {
  console.log(`  ${failures.length} FAILED:\n`)
  for (const failure of failures) console.log(`   ✗ ${failure}`)
  console.log('')
  process.exit(1)
}
console.log('  all Tesla-layer checks passed\n')
