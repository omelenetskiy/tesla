import { getSupabaseAdmin } from '@/lib/supabase'
import { TeslaClient, type TeslaRequestLogInput } from './client'
import { teslaConfig } from './config'
import { TeslaApiError, describeTeslaError, toPublicError } from './errors'
import { resolveOwnerApiId } from './identity'
import type { VehicleStatus, VehicleStatusSnapshot, VehicleSummary } from './models'
import { normalizeVehicleStatus, deriveModel, type RawMergedVehicle, type RawVehicleListItem } from './normalize'
import { policyFor, resolvePollingProfile, shouldCollect } from './provider'
import { recordRequest } from './request-log'
import { createAccessTokenProvider, refreshCredential, type TeslaAuthState } from './tokens'

/**
 * The Tesla service (§11's middle tier). Route handlers call these use cases; only
 * this module and `client.ts` know the Owner API exists. Nothing here returns token
 * material, and nothing here builds a user-facing string.
 */

export type VehicleRow = {
  id: string
  owner_id: string
  provider_vehicle_id: string
  display_name: string
  model: string | null
  collection_mode: string | null
  polling_profile: string | null
  /** Added by migration 004; the short `{id}` vs long `vehicle_id` split (plan E2). */
  owner_api_id?: string | null
  vehicle_id?: string | null
  distance_unit?: string | null
  vin?: string | null
  is_active?: boolean
  created_at?: string
}

const VEHICLE_COLUMNS = 'id, owner_id, provider_vehicle_id, display_name, model, collection_mode, is_active, created_at'
const VEHICLE_COLUMNS_EXTENDED = `${VEHICLE_COLUMNS}, polling_profile, owner_api_id, vehicle_id, distance_unit, vin`

/**
 * `{id}` resolution lives in `lib/tesla/identity.ts` so the rule itself is testable
 * without a database. `null` means the short id is genuinely unknown for this row, and
 * the caller has to obtain it from the vehicle list rather than guess.
 */
function ownerApiIdOf(row: VehicleRow): string | null {
  return resolveOwnerApiId(row)
}

export async function listVehicleRows(ownerId: string): Promise<VehicleRow[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('vehicles')
    .select(VEHICLE_COLUMNS_EXTENDED)
    .eq('owner_id', ownerId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
  if (error) {
    // The extended column list only exists after migration 004. Falling back keeps
    // the app usable for a deployment that has not applied it yet.
    const fallback = await supabase
      .from('vehicles')
      .select(VEHICLE_COLUMNS)
      .eq('owner_id', ownerId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
    if (fallback.error) throw new TeslaApiError('unknown', `Failed to read the vehicle list: ${fallback.error.message}`)
    return (fallback.data ?? []) as VehicleRow[]
  }
  return (data ?? []) as VehicleRow[]
}

/** Collector scope: every active vehicle across all owners, no user filter. */
export async function listAllVehicleRows(): Promise<VehicleRow[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('vehicles')
    .select(VEHICLE_COLUMNS_EXTENDED)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
  if (error) {
    const fallback = await supabase
      .from('vehicles')
      .select(VEHICLE_COLUMNS)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
    if (fallback.error) throw new TeslaApiError('unknown', `Failed to read the vehicle list: ${fallback.error.message}`)
    return (fallback.data ?? []) as VehicleRow[]
  }
  return (data ?? []) as VehicleRow[]
}

export async function resolveVehicle(ownerId: string, requestedId?: string | null): Promise<VehicleRow | null> {
  const rows = await listVehicleRows(ownerId)
  if (!rows.length) return null
  if (requestedId) return rows.find((row) => row.id === requestedId) ?? null
  return rows[0]
}

export function buildTeslaClient(row: VehicleRow): TeslaClient {
  return new TeslaClient({
    getAccessToken: createAccessTokenProvider(row.id, row.owner_id),
    refreshAccessToken: () => refreshCredential(row.id, row.owner_id),
    onLog: (entry: TeslaRequestLogInput) => {
      void recordRequest({ ...entry, vehicleId: entry.vehicleId ?? row.id }, row.owner_id)
    },
  })
}

/** §48: vehicle metadata reused across pages without a provider round-trip. */
export async function listVehicleSummaries(ownerId: string): Promise<VehicleSummary[]> {
  const rows = await listVehicleRows(ownerId)
  const supabase = getSupabaseAdmin()
  return Promise.all(
    rows.map(async (row) => {
      const { data } = await supabase
        .from('vehicle_states')
        .select('collected_at, state')
        .eq('vehicle_id', row.id)
        .order('collected_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const status = (data?.state as VehicleStatus | undefined) ?? null
      return {
        identity: {
          databaseId: row.id,
          ownerApiId: ownerApiIdOf(row) ?? '',
          vehicleId: row.vehicle_id ?? null,
          ownerIdString: null,
          vin: row.vin ?? null,
        },
        displayName: row.display_name,
        modelLabel: row.model ?? deriveModel(row.vin, row.display_name),
        presence: status?.presence ?? 'offline',
        connectivity: status?.connectivity ?? 'offline',
        lastSeenAt: data?.collected_at ?? null,
      } satisfies VehicleSummary
    }),
  )
}

export type SnapshotRow = { state: VehicleStatus; collected_at: string }

export async function newestSnapshot(vehicleId: string): Promise<SnapshotRow | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('vehicle_states')
    .select('state, collected_at')
    .eq('vehicle_id', vehicleId)
    .order('collected_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return null
  return (data as SnapshotRow | null) ?? null
}

/**
 * Freshness computed here, at read time — never trusted from the stored blob (§F1).
 * A row written by the old code carries `lastUpdated: "just now"` and a baked
 * `freshness`; both are ignored on purpose.
 */
export function toSnapshot(row: SnapshotRow, source: VehicleStatusSnapshot['source'], reason: string | null): VehicleStatusSnapshot {
  const ageSeconds = Math.max(0, Math.round((Date.now() - Date.parse(row.collected_at)) / 1000))
  const freshness = ageSeconds <= 30 ? 'live' : ageSeconds <= 300 ? 'recent' : ageSeconds <= 900 ? 'stale' : 'offline'
  return {
    collectedAt: row.collected_at,
    ageSeconds,
    freshness,
    source,
    collectionReason: reason,
    status: row.state,
    error: null,
  }
}

function emptySnapshot(reason: string, error?: unknown): VehicleStatusSnapshot {
  return {
    collectedAt: new Date().toISOString(),
    ageSeconds: 0,
    freshness: 'offline',
    source: 'none',
    collectionReason: reason,
    status: null,
    error: error === undefined ? null : toPublicError(error, 'vehicle_data'),
  }
}

export type StatusReadResult = VehicleStatusSnapshot & { authState: TeslaAuthState | null; wakeHint: boolean }

/**
 * The one read path the product uses. Order is fixed: newest snapshot → policy
 * decision → (maybe) one status call → (maybe) one rollup. A parked car reloads the
 * dashboard for free; a sleeping car costs zero Tesla requests (§21, §48).
 */
export async function readVehicleStatus(input: {
  row: VehicleRow
  force?: boolean
  mayWake?: boolean
  /** Set by the caller after it has already decided to skip collection, for §45. */
  authState?: TeslaAuthState | null
}): Promise<StatusReadResult> {
  const { row } = input
  const cached = await newestSnapshot(row.id)
  const profile = resolvePollingProfile({ pollingProfile: row.polling_profile, collectionMode: row.collection_mode })
  const policy = policyFor(profile)
  const presence = cached?.state?.presence ?? null
  const ageMs = cached ? Date.now() - Date.parse(cached.collected_at) : null
  const decision = shouldCollect({
    policy,
    presence,
    snapshotAgeMs: ageMs,
    force: Boolean(input.force),
    mayWake: Boolean(input.mayWake),
  })

  if (!decision.collect) {
    if (cached) {
      const snapshot = toSnapshot(cached, 'cache', decision.reason)
      return { ...snapshot, authState: input.authState ?? null, wakeHint: decision.reason === 'wake_confirmation_required' }
    }
    return { ...emptySnapshot(decision.reason), authState: input.authState ?? null, wakeHint: decision.reason === 'wake_confirmation_required' }
  }

  const client = buildTeslaClient(row)
  try {
    const shortId = ownerApiIdOf(row) ?? (await recoverOwnerApiId(client, row))
    if (!shortId) {
      throw new TeslaApiError('not_found', 'Tesla has not given this app a short Owner API id for the vehicle, so no state endpoint can be addressed. Reconnect the vehicle to refresh its identifiers.', { endpoint: '/api/1/vehicles/:id', method: 'GET' })
    }
    const { status, telemetryCollected } = await client.getVehicleStatus(shortId, { vehicleId: row.id })
    const collectedAt = new Date().toISOString()
    await persistSnapshot(row, status, collectedAt)
    const snapshot = toSnapshot({ state: status, collected_at: collectedAt }, 'tesla_api', telemetryCollected ? 'vehicle_online' : 'status_only')
    return { ...snapshot, authState: 'AUTHORIZED', wakeHint: false }
  } catch (error) {
    await logCollectionFailure(row, error)
    // Keep showing what we knew: §39 "Do not destroy the previously known state".
    if (cached) {
      const snapshot = toSnapshot(cached, 'cache', 'collection_failed')
      return { ...snapshot, error: toPublicError(error, 'vehicle_data'), authState: authStateFromError(error), wakeHint: false }
    }
    return { ...emptySnapshot('collection_failed', error), authState: authStateFromError(error), wakeHint: false }
  }
}

function authStateFromError(error: unknown): TeslaAuthState {
  if (!(error instanceof TeslaApiError)) return 'API_UNAVAILABLE'
  if (error.kind === 'invalid_grant' || error.kind === 'unauthorized') return 'AUTH_EXPIRED'
  if (error.kind === 'forbidden') return 'AUTH_FAILED'
  if (error.kind === 'challenge') return 'AUTH_FAILED'
  return 'API_UNAVAILABLE'
}

export async function persistSnapshot(row: VehicleRow, status: VehicleStatus, collectedAt: string) {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('vehicle_states').insert({
    vehicle_id: row.id,
    provider_vehicle_id: row.provider_vehicle_id,
    state: status,
    // Derived columns for cheap history queries; the jsonb stays the source of truth.
    battery_level: status.charge.stateOfCharge,
    range_km: status.charge.ratedRangeKm,
    presence: status.presence,
    odometer_km: status.state.odometerKm,
    latitude: status.drive.latitude,
    longitude: status.drive.longitude,
    collected_at: collectedAt,
  })
  if (error) {
    // Old rows reject unknown columns; retry with the shape migration 001 allows.
    const fallback = await supabase.from('vehicle_states').insert({
      vehicle_id: row.id,
      provider_vehicle_id: row.provider_vehicle_id,
      state: status,
    })
    if (fallback.error) throw new TeslaApiError('unknown', `Failed to save the snapshot: ${fallback.error.message}`)
  }
  await supabase.from('collection_events').insert({
    vehicle_id: row.id,
    owner_id: row.owner_id,
    outcome: 'success',
    reason: 'telemetry_collected',
  })
}

async function logCollectionFailure(row: VehicleRow, error: unknown) {
  const supabase = getSupabaseAdmin()
  const message = describeTeslaError(error)
  // The raw provider body may echo a token in an error page; the kind + status are
  // enough to diagnose, so only the Russian label is persisted.
  await supabase.from('collection_events').insert({
    vehicle_id: row.id,
    owner_id: row.owner_id,
    outcome: 'failed',
    reason: `${message}${error instanceof TeslaApiError && error.status ? ` (${error.status})` : ''}`,
  })
}

/**
 * A row created before the `owner_api_id` column existed has no short id, and every
 * state path needs one. `GET /api/1/vehicles` requires no id itself, so it can supply
 * it: the value is written back and returned, which turns a permanently dead row into a
 * self-healing one instead of a doomed call against the long id.
 *
 * Errors are deliberately not caught here — a failing list call is the real diagnosis
 * (expired token, gated API) and the caller surfaces it.
 */
async function recoverOwnerApiId(client: TeslaClient, row: VehicleRow): Promise<string | null> {
  const list = await client.getVehicles({ vehicleId: row.id, requestType: 'vehicle_list', noCache: true })
  const match =
    list.find((entry) =>
      (entry.vehicle_id !== undefined && row.vehicle_id && String(entry.vehicle_id) === String(row.vehicle_id)) ||
      (entry.vin !== undefined && row.vin && entry.vin === row.vin),
    ) ?? (list.length === 1 ? list[0] : null)
  if (!match) return null
  const shortId = match.id_s !== undefined && match.id_s !== null ? String(match.id_s) : match.id !== undefined && match.id !== null ? String(match.id) : null
  if (!shortId) return null
  const { error } = await getSupabaseAdmin().from('vehicles').update({ owner_api_id: shortId }).eq('id', row.id)
  if (error) console.error('[tesla] recovered the owner api id but could not store it', error.message)
  return shortId
}

/**
 * Persists every vehicle the account exposes (§16 "Vehicle count", §6 selector) —
 * the previous code stored `vehicles[0]` and made multi-vehicle impossible.
 *
 * This is also where the plan-E2 repair happens: `id_s`/`id` are written to
 * `owner_api_id` and the long `vehicle_id` to `vehicle_id`, so the short id used in
 * path segments stops being confused with the streaming identity.
 */
export async function syncVehiclesFromList(ownerId: string, list: RawVehicleListItem[]): Promise<{ count: number; vehicles: VehicleRow[] }> {
  const supabase = getSupabaseAdmin()
  for (const entry of list) {
    const shortId = entry.id_s !== undefined && entry.id_s !== null ? String(entry.id_s) : entry.id !== undefined ? String(entry.id) : null
    const longId = entry.vehicle_id !== undefined ? String(entry.vehicle_id) : null
    if (!shortId && !longId) continue
    const providerVehicleId = shortId ?? longId!
    const { error } = await supabase.from('vehicles').upsert(
      {
        owner_id: ownerId,
        provider_vehicle_id: providerVehicleId,
        owner_api_id: shortId,
        vehicle_id: longId,
        vin: entry.vin ?? null,
        display_name: entry.display_name ?? entry.alias ?? 'Tesla',
        model: deriveModel(entry.vin, entry.display_name, entry.model),
      },
      { onConflict: 'owner_id,provider_vehicle_id' },
    )
    // Older schema has no owner_api_id column: retry with what exists so the
    // connection still succeeds before migration 004 is applied.
    if (error && /owner_api_id|column|Could not find/i.test(error.message)) {
      await supabase.from('vehicles').upsert(
        { owner_id: ownerId, provider_vehicle_id: providerVehicleId, display_name: entry.display_name ?? entry.alias ?? 'Tesla', model: deriveModel(entry.vin, entry.display_name, entry.model) },
        { onConflict: 'owner_id,provider_vehicle_id' },
      )
    }
  }
  return { count: list.length, vehicles: await listVehicleRows(ownerId) }
}

/**
 * Reachability probe for /debug/api §41 — does the Owner API answer at all?
 * Bypasses the cache on purpose: a diagnostic that returns a memoised answer is
 * worse than no diagnostic.
 */
export async function probeOwnerApi(row: VehicleRow) {
  const startedAt = Date.now()
  try {
    const client = buildTeslaClient(row)
    const vehicles = await client.getVehicles({ vehicleId: row.id, requestType: 'probe', noCache: true })
    return { reachable: true, status: 200, durationMs: Date.now() - startedAt, vehicleCount: vehicles.length, error: null }
  } catch (error) {
    return {
      reachable: false,
      status: error instanceof TeslaApiError ? error.status ?? null : null,
      durationMs: Date.now() - startedAt,
      vehicleCount: 0,
      error: toPublicError(error, '/api/1/vehicles'),
    }
  }
}

export const serviceConfig = {
  apiBaseUrl: teslaConfig.apiBaseUrl,
  authOrigin: teslaConfig.authOrigin,
  scopes: teslaConfig.scopes,
  clientId: teslaConfig.clientId,
}
