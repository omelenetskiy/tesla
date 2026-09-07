import { getSupabaseAdmin } from '@/lib/supabase'
import type { BatterySnapshot, ChargingSession, Trip, VehicleStatus } from './models'
import { milesToKm, normalizeChargingConnection } from './normalize'

/**
 * History reads and trip/charging derivation.
 *
 * Two tiers, and the difference is recorded rather than hidden:
 *  - `gps_route` / `odometer_delta`: rows the collector persisted, measured.
 *  - `snapshot_gap`: reconstructed from coarse snapshots when the history tables do
 *    not exist yet (migration 005 not applied) — a 15-minute cadence cannot resolve
 *    a 6-minute trip, so the UI must be able to tell the two apart (§8, §39).
 */

export type HistoryRange = '24h' | '7d' | '30d' | '90d' | 'all'

const RANGE_MS: Record<Exclude<HistoryRange, 'all'>, number> = {
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
  '90d': 90 * 86_400_000,
}

export function rangeToSince(range: HistoryRange): string | null {
  if (range === 'all') return null
  return new Date(Date.now() - RANGE_MS[range]).toISOString()
}

type SnapshotRow = { state: VehicleStatus | Record<string, unknown>; collected_at: string }

/** A trip starts when the car is moving and ends when it stops or goes quiet. */
const TRIP_GAP_MS = 30 * 60_000
/** Below this odometer change a snapshot run is noise, not a trip. */
const MIN_TRIP_KM = 0.5

function asStatus(row: SnapshotRow): VehicleStatus | null {
  const state = row.state as VehicleStatus
  return state && typeof state === 'object' && 'charge' in state ? state : null
}

function durationMinutes(start: string, end: string) {
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60_000))
}

function haversineKm(a: [number, number], b: [number, number]) {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)))
}

function routeOf(points: Array<{ lat: number; lon: number }>): Array<[number, number]> {
  return points.map((point) => [point.lon, point.lat] as [number, number])
}

/**
 * Trips from snapshots. Distance prefers the odometer delta; when odometer is
 * unavailable it falls back to the GPS path length and says so via `confidence`,
 * rather than presenting an estimate as a measurement.
 */
export function deriveTrips(snapshots: SnapshotRow[], vehicleId: string): Trip[] {
  const ordered = [...snapshots].sort((a, b) => Date.parse(a.collected_at) - Date.parse(b.collected_at))
  const trips: Trip[] = []
  let run: SnapshotRow[] = []

  const close = (endReason: 'stopped' | 'gap' | 'end') => {
    if (run.length < 2) {
      run = []
      return
    }
    const first = run[0]
    const last = run[run.length - 1]
    const firstStatus = asStatus(first)
    const lastStatus = asStatus(last)
    if (!firstStatus || !lastStatus) {
      run = []
      return
    }
    const points = run
      .map((row) => asStatus(row))
      .filter((status): status is VehicleStatus => Boolean(status))
      .map((status) => ({ lat: status.drive.latitude, lon: status.drive.longitude }))
      .filter((point): point is { lat: number; lon: number } => typeof point.lat === 'number' && typeof point.lon === 'number')

    const odometerStart = firstStatus.state.odometerKm
    const odometerEnd = lastStatus.state.odometerKm
    const odometerDistance = odometerStart !== null && odometerEnd !== null ? Math.max(0, odometerEnd - odometerStart) : null
    let distanceKm = odometerDistance
    let confidence: Trip['confidence'] = odometerDistance !== null ? 'odometer_delta' : 'snapshot_gap'
    if (distanceKm === null || distanceKm < MIN_TRIP_KM) {
      const pathKm = points.length > 1
        ? points.slice(1).reduce((sum, point, index) => sum + haversineKm([points[index].lon, points[index].lat], [point.lon, point.lat]), 0)
        : null
      if (pathKm !== null && (distanceKm === null || pathKm > distanceKm)) {
        distanceKm = Math.round(pathKm * 10) / 10
        confidence = 'gps_route'
      }
    }
    if (distanceKm !== null && distanceKm < MIN_TRIP_KM) {
      run = []
      return
    }
    const duration = durationMinutes(first.collected_at, last.collected_at)
    const socStart = firstStatus.charge.stateOfCharge
    const socEnd = lastStatus.charge.stateOfCharge
    const speedValues = run
      .map((row) => asStatus(row)?.drive.speedKmh)
      .filter((value): value is number => typeof value === 'number')

    trips.push({
      id: `${vehicleId}:${first.collected_at}`,
      vehicleId,
      startedAt: first.collected_at,
      // An unfinished run (car still moving) is explicitly partial, not "just ended".
      endedAt: endReason === 'gap' || endReason === 'stopped' ? last.collected_at : null,
      distanceKm,
      durationMinutes: duration,
      averageSpeedKmh: speedValues.length ? Math.round(speedValues.reduce((sum, value) => sum + value, 0) / speedValues.length) : null,
      maxSpeedKmh: speedValues.length ? Math.round(Math.max(...speedValues)) : null,
      energyUsedKwh: null,
      efficiencyWhPerKm: null,
      batteryStartPercent: socStart,
      batteryEndPercent: socEnd,
      odometerStartKm: odometerStart,
      odometerEndKm: odometerEnd,
      startLocation: points.length ? { latitude: points[0].lat, longitude: points[0].lon, heading: null, source: 'live', accuracy: null } : null,
      endLocation: points.length ? { latitude: points.at(-1)!.lat, longitude: points.at(-1)!.lon, heading: null, source: 'live', accuracy: null } : null,
      route: routeOf(points),
      name: null,
      phase: 'unknown',
      partial: endReason === 'end',
      confidence,
    })
    run = []
  }

  for (let index = 0; index < ordered.length; index += 1) {
    const row = ordered[index]
    const status = asStatus(row)
    const previous = run.at(-1)
    const previousStatus = previous ? asStatus(previous) : null
    const gap = previous ? Date.parse(row.collected_at) - Date.parse(previous.collected_at) : 0
    const driving = status?.presence === 'driving'
    const wasDriving = previousStatus?.presence === 'driving'

    if (gap > TRIP_GAP_MS && run.length) close('gap')
    if (driving || (wasDriving && !driving)) {
      if (!driving && wasDriving && run.length) {
        run.push(row)
        close('stopped')
      } else {
        run.push(row)
      }
    } else if (run.length) {
      close('stopped')
    }
  }
  close('end')
  return trips.reverse()
}

/** Charging sessions from `charging_state` transitions across snapshots. */
export function deriveChargingSessions(snapshots: SnapshotRow[], vehicleId: string): ChargingSession[] {
  const ordered = [...snapshots].sort((a, b) => Date.parse(a.collected_at) - Date.parse(b.collected_at))
  const sessions: ChargingSession[] = []
  let run: SnapshotRow[] = []

  const close = (completed: boolean) => {
    if (!run.length) return
    const first = run[0]
    const last = run[run.length - 1]
    const firstStatus = asStatus(first)
    const lastStatus = asStatus(last)
    if (firstStatus && lastStatus) {
      const powers = run
        .map((row) => asStatus(row)?.charge.chargerPowerKw)
        .filter((value): value is number => typeof value === 'number')
      const added = lastStatus.charge.chargeSessionEnergyAddedKwh
      const distanceAdded = lastStatus.charge.chargeSessionAddedRangeKm
      sessions.push({
        id: `${vehicleId}:c:${first.collected_at}`,
        vehicleId,
        startedAt: first.collected_at,
        endedAt: completed ? last.collected_at : null,
        durationMinutes: durationMinutes(first.collected_at, last.collected_at),
        energyAddedKwh: added,
        addedRangeKm: distanceAdded,
        batteryStartPercent: firstStatus.charge.stateOfCharge,
        batteryEndPercent: lastStatus.charge.stateOfCharge,
        averagePowerKw: powers.length ? Math.round((powers.reduce((sum, value) => sum + value, 0) / powers.length) * 10) / 10 : null,
        peakPowerKw: powers.length ? Math.round(Math.max(...powers) * 10) / 10 : null,
        location: (() => {
          const lat = lastStatus.drive.latitude
          const lon = lastStatus.drive.longitude
          return typeof lat === 'number' && typeof lon === 'number' ? { latitude: lat, longitude: lon, heading: null, source: 'last_known' as const, accuracy: null } : null
        })(),
        locationLabel: null,
        chargerType: lastStatus.charge.fastChargerType,
        fastCharger: lastStatus.charge.fastChargerPresent,
        completed,
        confidence: 'snapshot_gap',
      })
    }
    run = []
  }

  for (const row of ordered) {
    const status = asStatus(row)
    if (status?.charge.chargingConnection === 'charging') {
      run.push(row)
      continue
    }
    if (run.length) close(status?.charge.chargingConnection === 'complete')
  }
  if (run.length) close(false)
  return sessions.reverse()
}

export function deriveBatterySnapshots(snapshots: SnapshotRow[], vehicleId: string): BatterySnapshot[] {
  const points: BatterySnapshot[] = []
  for (const row of snapshots) {
    const status = asStatus(row)
    if (!status || status.charge.stateOfCharge === null) continue
    const lat = status.drive.latitude
    const lon = status.drive.longitude
    points.push({
      vehicleId,
      at: row.collected_at,
      stateOfCharge: status.charge.stateOfCharge,
      usableStateOfCharge: status.charge.usableStateOfCharge,
      ratedRangeKm: status.charge.ratedRangeKm,
      presence: status.presence,
      chargingConnection: status.charge.chargingConnection,
      odometerKm: status.state.odometerKm,
      location: typeof lat === 'number' && typeof lon === 'number' ? { latitude: lat, longitude: lon, heading: null, source: 'live', accuracy: null } : null,
      partial: false,
    })
  }
  return points
}

async function tableExists(name: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from(name).select('id').limit(1)
  // PostgREST reports 42P01/42703 for a missing table/view; anything else means it is there.
  if (!error) return true
  return !/relation|does not exist|42P01|Could not find/i.test(error.message ?? '')
}

export type HistoryBundle = {
  battery: BatterySnapshot[]
  trips: Trip[]
  charging: ChargingSession[]
  /** Provenance of what the UI is showing: measured history or reconstructed. */
  origin: 'history_tables' | 'reconstructed_from_snapshots' | 'empty'
  /** True when the history tables have not been created (migration 005 pending). */
  historyTablesMissing: boolean
  snapshotCount: number
}

/**
 * Reads history from the persisted tables when they exist, otherwise reconstructs
 * from `vehicle_states` and labels the result. Never returns fabricated points.
 */
export async function readHistory(vehicleId: string, range: HistoryRange = '30d'): Promise<HistoryBundle> {
  const supabase = getSupabaseAdmin()
  const since = rangeToSince(range)

  const { data: snapshotRows, error: snapshotError } = await supabase
    .from('vehicle_states')
    .select('state, collected_at')
    .eq('vehicle_id', vehicleId)
    .order('collected_at', { ascending: true })
    .limit(5000)
  if (snapshotError) {
    return { battery: [], trips: [], charging: [], origin: 'empty', historyTablesMissing: true, snapshotCount: 0 }
  }
  const snapshots = (snapshotRows ?? []) as SnapshotRow[]

  const tablesPresent = (await tableExists('trips')) && (await tableExists('charging_sessions')) && (await tableExists('battery_snapshots'))
  if (tablesPresent) {
    const [tripsResult, chargingResult, batteryResult] = await Promise.all([
      since
        ? supabase.from('trips').select('*').eq('vehicle_id', vehicleId).gte('started_at', since).order('started_at', { ascending: false }).limit(500)
        : supabase.from('trips').select('*').eq('vehicle_id', vehicleId).order('started_at', { ascending: false }).limit(500),
      supabase.from('charging_sessions').select('*').eq('vehicle_id', vehicleId).order('started_at', { ascending: false }).limit(500),
      since
        ? supabase.from('battery_snapshots').select('*').eq('vehicle_id', vehicleId).gte('collected_at', since).order('collected_at', { ascending: true }).limit(20_000)
        : supabase.from('battery_snapshots').select('*').eq('vehicle_id', vehicleId).order('collected_at', { ascending: true }).limit(20_000),
    ])
    const hasRows = (tripsResult.data?.length ?? 0) + (chargingResult.data?.length ?? 0) + (batteryResult.data?.length ?? 0) > 0
    if (hasRows) {
      return {
        battery: mapStoredBattery(batteryResult.data ?? []),
        trips: mapStoredTrips(tripsResult.data ?? [], vehicleId),
        charging: mapStoredCharging(chargingResult.data ?? [], vehicleId),
        origin: 'history_tables',
        historyTablesMissing: false,
        snapshotCount: snapshots.length,
      }
    }
  }

  return {
    battery: deriveBatterySnapshots(snapshots, vehicleId),
    trips: deriveTrips(snapshots, vehicleId),
    charging: deriveChargingSessions(snapshots, vehicleId),
    origin: snapshots.length ? 'reconstructed_from_snapshots' : 'empty',
    historyTablesMissing: !tablesPresent,
    snapshotCount: snapshots.length,
  }
}

function mapStoredTrips(rows: Array<Record<string, unknown>>, vehicleId: string): Trip[] {
  return rows.map((row) => ({
    id: String(row.id),
    vehicleId,
    startedAt: String(row.started_at),
    endedAt: (row.ended_at as string | null) ?? null,
    distanceKm: typeof row.distance_km === 'number' ? row.distance_km : milesToKm(row.distance as number | undefined),
    durationMinutes: (row.duration_minutes as number | null) ?? (row.duration_seconds != null ? Math.round(Number(row.duration_seconds) / 60) : null),
    averageSpeedKmh: (row.average_speed_kmh as number | null) ?? null,
    maxSpeedKmh: (row.max_speed_kmh as number | null) ?? null,
    energyUsedKwh: (row.energy_used_kwh as number | null) ?? (row.energy_used as number | null) ?? null,
    efficiencyWhPerKm: (row.efficiency_wh_per_km as number | null) ?? null,
    batteryStartPercent: (row.battery_start as number | null) ?? null,
    batteryEndPercent: (row.battery_end as number | null) ?? null,
    odometerStartKm: (row.odometer_start_km as number | null) ?? null,
    odometerEndKm: (row.odometer_end_km as number | null) ?? null,
    startLocation: row.start_latitude != null && row.start_longitude != null ? { latitude: Number(row.start_latitude), longitude: Number(row.start_longitude), heading: null, source: 'live' as const, accuracy: null } : null,
    endLocation: row.end_latitude != null && row.end_longitude != null ? { latitude: Number(row.end_latitude), longitude: Number(row.end_longitude), heading: null, source: 'live' as const, accuracy: null } : null,
    route: Array.isArray(row.route) ? (row.route as Array<[number, number]>) : [],
    name: (row.name as string | null) ?? null,
    phase: ((row.phase as Trip['phase']) ?? 'unknown'),
    partial: Boolean(row.partial),
    confidence: ((row.confidence as Trip['confidence']) ?? 'odometer_delta'),
  }))
}

function mapStoredCharging(rows: Array<Record<string, unknown>>, vehicleId: string): ChargingSession[] {
  return rows.map((row) => ({
    id: String(row.id),
    vehicleId,
    startedAt: String(row.started_at),
    endedAt: (row.ended_at as string | null) ?? null,
    durationMinutes: (row.duration_minutes as number | null) ?? null,
    energyAddedKwh: (row.energy_added as number | null) ?? null,
    addedRangeKm: (row.added_range_km as number | null) ?? null,
    batteryStartPercent: (row.battery_start as number | null) ?? null,
    batteryEndPercent: (row.battery_end as number | null) ?? null,
    averagePowerKw: row.average_power_kw != null ? Number(row.average_power_kw) : null,
    peakPowerKw: row.peak_power_kw != null ? Number(row.peak_power_kw) : row.peak_power != null ? Number(row.peak_power) : null,
    location: row.latitude != null && row.longitude != null ? { latitude: Number(row.latitude), longitude: Number(row.longitude), heading: null, source: 'last_known' as const, accuracy: null } : null,
    locationLabel: (row.location_label as string | null) ?? (row.location as string | null) ?? null,
    chargerType: (row.charger_type as string | null) ?? null,
    fastCharger: (row.fast_charger as boolean | null) ?? null,
    completed: Boolean(row.completed ?? row.ended_at),
    confidence: ((row.confidence as ChargingSession['confidence']) ?? 'snapshot_gap'),
  }))
}

function mapStoredBattery(rows: Array<Record<string, unknown>>): BatterySnapshot[] {
  return rows
    .filter((row) => typeof row.battery_level === 'number')
    .map((row) => ({
      vehicleId: String(row.vehicle_id),
      at: String(row.collected_at),
      stateOfCharge: Number(row.battery_level),
      usableStateOfCharge: row.usable_battery_level != null ? Number(row.usable_battery_level) : null,
      ratedRangeKm: row.rated_range_km != null ? Number(row.rated_range_km) : milesToKm(row.battery_range as number | undefined),
      presence: ((row.presence as BatterySnapshot['presence']) ?? 'parked'),
      chargingConnection: normalizeChargingConnection(row.charging_state as string | undefined),
      odometerKm: row.odometer_km != null ? Number(row.odometer_km) : null,
      location: row.latitude != null && row.longitude != null ? { latitude: Number(row.latitude), longitude: Number(row.longitude), heading: null, source: 'last_known' as const, accuracy: null } : null,
      partial: Boolean(row.partial),
    }))
}

/**
 * Persists derived history so §8/§9/§10 read measured rows instead of recomputing.
 *
 * Each write is guarded by table existence: with migration 005 unapplied the
 * collector still records snapshots and simply reports what it could not persist,
 * rather than failing the whole collection run.
 */
export async function persistDerivedHistory(input: { vehicleId: string; ownerId: string; bundle: HistoryBundle }): Promise<PersistReport> {
  const supabase = getSupabaseAdmin()
  const report: PersistReport = { battery: 0, trips: 0, charging: 0, events: 0, skipped: [] }

  if (input.bundle.battery.length) {
    const rows = input.bundle.battery.map((point) => ({
      vehicle_id: input.vehicleId,
      battery_level: point.stateOfCharge,
      usable_battery_level: point.usableStateOfCharge,
      rated_range_km: point.ratedRangeKm,
      charging_state: point.chargingConnection === 'charging' ? 'Charging' : point.chargingConnection === 'complete' ? 'Complete' : 'Disconnected',
      presence: point.presence,
      odometer_km: point.odometerKm,
      latitude: point.location?.latitude ?? null,
      longitude: point.location?.longitude ?? null,
      partial: point.partial,
      collected_at: point.at,
      dedupe_key: `s:${point.at}`,
    }))
    const written = await tryUpsert('battery_snapshots', rows, `s:${input.bundle.battery.at(-1)?.at ?? ''}`)
    if (written) report.battery = rows.length
    else report.skipped.push('battery_snapshots')
  }

  for (const trip of input.bundle.trips) {
    const written = await tryUpsert('trips', [{
      vehicle_id: input.vehicleId,
      started_at: trip.startedAt,
      ended_at: trip.endedAt,
      distance_km: trip.distanceKm,
      duration_minutes: trip.durationMinutes,
      average_speed_kmh: trip.averageSpeedKmh,
      max_speed_kmh: trip.maxSpeedKmh,
      energy_used_kwh: trip.energyUsedKwh,
      efficiency_wh_per_km: trip.efficiencyWhPerKm,
      odometer_start_km: trip.odometerStartKm,
      odometer_end_km: trip.odometerEndKm,
      battery_start: trip.batteryStartPercent,
      battery_end: trip.batteryEndPercent,
      start_latitude: trip.startLocation?.latitude ?? null,
      start_longitude: trip.startLocation?.longitude ?? null,
      end_latitude: trip.endLocation?.latitude ?? null,
      end_longitude: trip.endLocation?.longitude ?? null,
      route: trip.route,
      point_count: trip.route.length,
      partial: trip.partial,
      confidence: trip.confidence,
      dedupe_key: `t:${trip.startedAt}`,
    }], `t:${trip.startedAt}`)
    if (written) report.trips += 1
    else {
      report.skipped.push('trips')
      break
    }
  }

  for (const session of input.bundle.charging) {
    const written = await tryUpsert('charging_sessions', [{
      vehicle_id: input.vehicleId,
      started_at: session.startedAt,
      ended_at: session.endedAt,
      duration_minutes: session.durationMinutes,
      energy_added: session.energyAddedKwh,
      added_range_km: session.addedRangeKm,
      average_power_kw: session.averagePowerKw,
      peak_power_kw: session.peakPowerKw,
      battery_start: session.batteryStartPercent,
      battery_end: session.batteryEndPercent,
      latitude: session.location?.latitude ?? null,
      longitude: session.location?.longitude ?? null,
      location_label: session.locationLabel,
      charger_type: session.chargerType,
      fast_charger: session.fastCharger,
      completed: session.completed,
      confidence: session.confidence,
      dedupe_key: `c:${session.startedAt}`,
    }], `c:${session.startedAt}`)
    if (written) report.charging += 1
    else {
      report.skipped.push('charging_sessions')
      break
    }
  }

  const events = activityEventsFromHistory(input.vehicleId, input.ownerId, input.bundle)
  if (events.length) {
    const { error } = await supabase.from('activity_events').upsert(events, { onConflict: 'vehicle_id,dedupe_key', ignoreDuplicates: true })
    if (!error) report.events = events.length
    else report.skipped.push('activity_events')
  }
  return report
}

export type PersistReport = { battery: number; trips: number; charging: number; events: number; skipped: string[] }

/** Returns false only when the table/columns are absent (005 pending), true on success. */
async function tryUpsert(table: string, rows: Array<Record<string, unknown>>, dedupeKey: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'vehicle_id,dedupe_key', ignoreDuplicates: false })
  if (!error) return true
  // A duplicate on a re-run is expected and means the write path works.
  if (/duplicate key|unique/i.test(error.message ?? '')) return true
  if (/Could not find|does not exist|relation|column/i.test(error.message ?? '')) return false
  console.error(`[tesla] persist ${table} failed (${dedupeKey})`, error.message)
  return false
}

/**
 * Builds the §7 "Recent activity" feed from history boundaries. Rows are stored as a
 * machine-readable `type` plus a data payload; the display string is produced at render
 * time, so a copy change never rewrites history.
 */
function activityEventsFromHistory(vehicleId: string, ownerId: string, bundle: HistoryBundle) {
  const events: Array<Record<string, unknown>> = []
  for (const trip of bundle.trips.slice(0, 40)) {
    if (trip.endedAt) {
      events.push({
        vehicle_id: vehicleId,
        owner_id: ownerId,
        occurred_at: trip.endedAt,
        type: 'trip_completed',
        dedupe_key: `trip_completed:${trip.startedAt}`,
        data: { distance_km: trip.distanceKm, duration_minutes: trip.durationMinutes, battery_start: trip.batteryStartPercent, battery_end: trip.batteryEndPercent, confidence: trip.confidence, trip_id: trip.id },
      })
    }
  }
  for (const session of bundle.charging.slice(0, 40)) {
    if (session.endedAt) {
      events.push({
        vehicle_id: vehicleId,
        owner_id: ownerId,
        occurred_at: session.endedAt,
        type: session.completed ? 'charging_completed' : 'charging_stopped',
        dedupe_key: `charging:${session.startedAt}`,
        data: { energy_kwh: session.energyAddedKwh, battery_start: session.batteryStartPercent, battery_end: session.batteryEndPercent, peak_power_kw: session.peakPowerKw, duration_minutes: session.durationMinutes },
      })
    }
  }
  return events
}

export { milesToKm }
