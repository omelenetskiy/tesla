import { getSupabaseAdmin } from '@/lib/supabase'
import { TeslaApiError, describeTeslaError, toPublicError } from '../tesla/errors'
import { isVehicleAwake, mergeVehicleData, normalizeVehicleStatus, type RawVehicleData } from '../tesla/normalize'
import { freshnessFor } from '../tesla/normalize'
import { FleetClient, fleetVehicleTag, type FleetRequestLogEntry } from './client'
import { fleetConfig, type FleetConfig } from './config'
import { createFleetAccessTokenProvider, refreshFleetCredential } from './tokens'
import { recordRequest } from '../tesla/request-log'
import type { VehicleRow } from '../tesla/service'
import { newestSnapshot, persistSnapshot, toSnapshot } from '../tesla/service'
import type { VehicleStatus, VehicleStatusSnapshot } from '../tesla/models'

/**
 * The Fleet read/write path.
 *
 * Two things differ from the previous service path, and both are deliberate:
 * there is no cache-first ladder (no polling means "the last read is stale" by
 * definition, so pretending otherwise would be a lie in the UI), and a vehicle row is
 * created by *this* sync rather than by a connect form that pasted identifiers.
 */

export type FleetStatusResult = {
  snapshot: VehicleStatusSnapshot
  wakeHint: string | null
  authState: string | null
}

/** `{vehicle_tag}` resolution lives next to the client that uses it. */
export { fleetVehicleTag } from './client'

export function buildFleetClient(ownerId: string, vehicleRowId?: string, config: FleetConfig = fleetConfig()): FleetClient {
  return new FleetClient({
    config,
    getAccessToken: createFleetAccessTokenProvider(ownerId),
    refreshAccessToken: () => refreshFleetCredential(ownerId),
    onLog: (entry: FleetRequestLogEntry) => {
      void recordRequest({ ...entry, vehicleId: entry.vehicleId ?? vehicleRowId ?? null } as Parameters<typeof recordRequest>[0], ownerId)
    },
  })
}

/**
 * Upsert every vehicle the account exposes.
 *
 * Matching is by VIN first, then by the short id a pre-Fleet row may hold. Without the
 * second key, an account that was once connected over the Fleet API would gain a duplicate
 * vehicle row on the first Fleet sync - and the selector, the history and the settings row
 * would then disagree about which car is "the" car.
 */
export async function syncFleetVehicles(ownerId: string, client: FleetClient): Promise<{ count: number; vins: string[] }> {
  const list = await client.getVehicles()
  const supabase = getSupabaseAdmin()
  const { data: existing, error: readError } = await supabase.from('vehicles').select('id, vin, vehicle_tag_id, vehicle_id, provider_vehicle_id').eq('owner_id', ownerId)
  if (readError) throw new TeslaApiError('unknown', `Could not read existing vehicles: ${readError.message}`)
  const rows = (existing ?? []) as Array<{ id: string; vin: string | null; vehicle_tag_id: string | null; vehicle_id: string | null; provider_vehicle_id: string | null }>

  const vins: string[] = []
  for (const entry of list) {
    const vin = entry.vin ?? null
    const shortId = entry.id_s ?? (entry.id !== undefined ? String(entry.id) : null)
    if (!vin && !shortId) continue
    const match =
      (vin ? rows.find((row) => row.vin && row.vin === vin) : undefined) ??
      (shortId ? rows.find((row) => row.vehicle_tag_id === shortId || row.provider_vehicle_id === shortId) : undefined) ??
      // An older row for this account may hold the *long* streaming id in
      // provider_vehicle_id - that was plan defect E2. Without this key the sync would add a
      // second row for the same car, and resolveVehicle would keep handing the dashboard the
      // old one, which has no usable identifier at all.
      (entry.vehicle_id !== undefined ? rows.find((row) => row.vehicle_id && String(row.vehicle_id) === String(entry.vehicle_id)) : undefined)
    const payload = {
      owner_id: ownerId,
      // `provider_vehicle_id` is the historical natural key; the VIN is the stable one for Fleet.
      provider_vehicle_id: vin ?? shortId ?? '',
      vin,
      vehicle_tag_id: shortId,
      vehicle_id: entry.vehicle_id !== undefined ? String(entry.vehicle_id) : null,
      display_name: entry.display_name ?? 'Tesla',
      is_active: true,
    }
    if (match) {
      const { error } = await supabase.from('vehicles').update(payload).eq('id', match.id)
      if (error) throw new TeslaApiError('unknown', `Could not update the vehicle row: ${error.message}`)
    } else {
      const { error } = await supabase.from('vehicles').insert(payload)
      if (error) throw new TeslaApiError('unknown', `Could not store the vehicle: ${error.message} - is migration 004 applied?`)
    }
    if (vin) vins.push(vin)
  }

  return { count: list.length, vins }
}

function snapshotFrom(status: VehicleStatus | null, reason: string | null, error: unknown | null, collectedAt = new Date().toISOString()): VehicleStatusSnapshot {
  const ageSeconds = Math.max(0, Math.round((Date.now() - Date.parse(collectedAt)) / 1000))
  return {
    collectedAt,
    ageSeconds,
    freshness: freshnessFor(collectedAt).freshness,
    source: status ? 'tesla_api' : 'none',
    collectionReason: reason,
    status,
    error: error ? toPublicError(error, '/api/1/vehicles') : null,
  }
}

/**
 * The row the dashboard should read, among all active rows for the owner.
 *
 * `resolveVehicle` returns the oldest row, which on an account that was once connected over
 * the Fleet API is the one holding a long streaming id and no VIN - no usable
 * `{vehicle_tag}` at all. Picking "a row we can actually address" fixes the 404 without
 * deleting anyone's history.
 */
export function pickFleetRow(rows: VehicleRow[], requestedId?: string | null): VehicleRow | null {
  const usable = rows.filter((row) => fleetVehicleTag(row) !== null)
  if (requestedId) {
    const exact = usable.find((row) => row.id === requestedId)
    if (exact) return exact
  }
  return usable[0] ?? rows[0] ?? null
}

/** Last stored snapshot, so a sleeping car still shows something real. */
async function cachedSnapshot(row: VehicleRow, reason: string, error: unknown | null): Promise<VehicleStatusSnapshot> {
  const stored = await newestSnapshot(row.id)
  if (!stored) return snapshotFrom(null, reason, error)
  const snapshot = toSnapshot(stored, 'cache', reason)
  return error ? { ...snapshot, error: toPublicError(error, '/api/1/vehicles') } : snapshot
}

/**
 * One live read. Nothing here wakes the car.
 *
 * `GET /api/1/vehicles/{tag}` is answered by Tesla's cloud from cached metadata, so asking
 * it whether the car is awake costs the vehicle nothing. `vehicle_data` is a live call to
 * the car and *does* wake it, so it is issued only when the state says the radio is up.
 * Whatever we get is stored, and until the next wake the dashboard shows that stored row -
 * which is the whole "показывай до следующего пробуждения" requirement, satisfied without
 * a single scheduled request.
 */
export async function readFleetStatus(row: VehicleRow, client: FleetClient): Promise<FleetStatusResult> {
  const tag = fleetVehicleTag(row)
  if (!tag) {
    return {
      snapshot: await cachedSnapshot(row, 'no_vehicle_tag', new TeslaApiError('not_found', 'No usable vehicle identifier is stored for this row yet - the account vehicle list has to be fetched.', { endpoint: '/api/1/vehicles/{vehicle_tag}', method: 'GET' })),
      wakeHint: null,
      authState: null,
    }
  }

  try {
    const entry = await client.getVehicle(tag, { vehicleId: row.id })
    if (!isVehicleAwake(entry.state)) {
      return { snapshot: await cachedSnapshot(row, 'vehicle_sleeping', null), wakeHint: null, authState: 'AUTHORIZED' }
    }

    let data: RawVehicleData | null = null
    try {
      data = await client.getVehicleData(tag, { vehicleId: row.id })
    } catch (error) {
      // The summary said awake and the car did not answer the rollup (408). Show the
      // summary rather than throwing the read away, and do not retry - a retry is a wake.
      if (!FleetClient.isVehicleUnavailable(error)) throw error
    }

    const collectedAt = new Date().toISOString()
    const status = normalizeVehicleStatus(mergeVehicleData(entry, data))
    if (data) {
      try {
        await persistSnapshot(row, status, collectedAt)
      } catch {
        // A failed write must not hide data we just received from the car.
      }
    }
    return {
      snapshot: snapshotFrom(status, data ? 'first_collect' : 'telemetry_unavailable', null, collectedAt),
      wakeHint: null,
      authState: 'AUTHORIZED',
    }
  } catch (error) {
    return {
      snapshot: await cachedSnapshot(row, 'collection_failed', error),
      wakeHint: null,
      authState: error instanceof TeslaApiError && error.kind === 'invalid_grant' ? 'AUTH_EXPIRED' : null,
    }
  }
}

/** The message the dashboard shows when a read could not happen. */
export function fleetReadMessage(reason: string | null): string | undefined {
  switch (reason) {
    case 'vehicle_sleeping':
      return 'The vehicle is asleep, so it was not woken. Showing the last data Tesla reported.'
    case 'no_vehicle_tag':
      return 'No usable vehicle identifier is stored yet - the account vehicle list has to be fetched.'
    case 'telemetry_unavailable':
      return 'The vehicle is awake but did not answer the data request, so it was not retried.'
    case 'collection_failed':
      return 'The update failed. Showing the last stored values.'
    default:
      return undefined
  }
}
