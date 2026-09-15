/**
 * Application-level models (§13).
 *
 * Two invariants that the previous flat `Vehicle` type violated:
 *  1. No presentation strings and no localisation live here — labels are produced
 *     once, in lib/format.ts, so a stored snapshot survives a copy change (§F2).
 *  2. No freshness and no `collectedAt` is stored inside the state. It is derived
 *     from the row's `collected_at` at read time, so a snapshot can never claim to
 *     be live after it has aged (§F1 / requirement §38).
 *
 * Units are canonical metric: km, km/h, kW, kWh, °C, minutes.
 */

/** The five states the product distinguishes (§7 marker states). */
export type VehiclePresence = 'driving' | 'parked' | 'charging' | 'sleeping' | 'offline'

export type Connectivity = 'online' | 'asleep' | 'offline'

export type FreshnessLevel = 'live' | 'recent' | 'stale' | 'offline'

export type ChargingConnection = 'charging' | 'complete' | 'stopped' | 'no_power' | 'disconnected' | 'unknown'

export type ShiftState = 'D' | 'R' | 'N' | 'P' | 'unknown'

export type TripPhase = 'outbound' | 'return_home' | 'unknown'

/**
 * Fleet `/api/1/vehicles` distinguishes three identifiers and they are not
 * interchangeable. `vehicleTagId` is the short id used by every state endpoint
 * (`/api/1/vehicles/{id}/...`); `vehicleId` is the long id used for cross-endpoint
 * identity such as streaming. Storing only one of them is what produced plan E2.
 */
export type VehicleIdentity = {
  /** Internal uuid (application database primary key). */
  databaseId: string
  /** Short Fleet tag id — used as `{id}` in path segments. */
  vehicleTagId: string
  /** Long `vehicle_id` — used for streaming/cross-endpoint identity only. */
  vehicleId: string | null
  /** `id_s`, when Tesla echoes it; equals `vehicleTagId` in practice. */
  ownerIdString: string | null
  vin: string | null
}

export type VehicleConfig = {
  modelCode: string | null
  displayModel: string | null
  trimBadging: string | null
  wheelType: string | null
  spoilerType: string | null
  interiorColor: string | null
  exteriorColor: string | null
  roofColor: string | null
  batteryChecksum: string | null
  performancePackage: boolean | null
  allWheelDrive: boolean | null
  motorizedChargePort: boolean | null
  chinspoiler: boolean | null
  vehicleType: string | null
}

export type DriveState = {
  speedKmh: number | null
  powerKw: number | null
  packVoltageV: number | null
  packCurrentA: number | null
  shiftState: ShiftState
  heading: number | null
  latitude: number | null
  longitude: number | null
  nativeType: string | null
  /** Raw `native_location_supported`; tells us whether lat/lon is already WGS84. */
  nativeLocationSupported: number | null
  timestamp: number | null
}

export type ChargeState = {
  stateOfCharge: number | null
  usableStateOfCharge: number | null
  ratedRangeKm: number | null
  estimatedRangeKm: number | null
  idealRangeKm: number | null
  chargeLimitPercent: number | null
  chargingConnection: ChargingConnection
  chargeSessionEnergyAddedKwh: number | null
  chargeSessionAddedRangeKm: number | null
  chargerPowerKw: number | null
  chargerVoltage: number | null
  chargerActualCurrentA: number | null
  chargerPilotCurrentA: number | null
  chargeRateKmh: number | null
  minutesToFullCharge: number | null
  fastChargerPresent: boolean | null
  fastChargerType: string | null
  chargePortOpen: boolean | null
  chargeDoorOpen: boolean | null
  scheduledChargeStartTime: string | null
  batteryHeaterOn: boolean | null
  batteryHeaterSupported: boolean | null
  /** Tesla reports this when the pack cannot spare energy for cabin heating. */
  notEnoughPowerToHeat: boolean | null
  timestamp: number | null
}

export type ClimateState = {
  insideTempC: number | null
  outsideTempC: number | null
  climateOn: boolean | null
  driverTempSettingC: number | null
  passengerTempSettingC: number | null
  isPreconditioning: boolean | null
  batteryHeaterOn: boolean | null
  batteryGridHeaterOn: boolean | null
  seatHeaterLeft: number | null
  seatHeaterRight: number | null
  timestamp: number | null
}

/** `vehicle_state` in the API response — physical/vehicle status, not presence. */
export type DoorState = { driverFront: boolean | null; driverRear: boolean | null; passengerFront: boolean | null; passengerRear: boolean | null }

export type WindowState = { frontDriver: boolean | null; frontPassenger: boolean | null; rearDriver: boolean | null; rearPassenger: boolean | null }

/**
 * True when at least one reported part is open; null when nothing was reported at all.
 *
 * `undefined` is part of the signature on purpose: snapshots are stored as JSON, so a
 * row written before these fields existed has neither key. It must read as "unknown",
 * not crash the alert pass.
 */
export function anyPartOpen<T extends Record<string, boolean | null>>(part: T | null | undefined): boolean | null {
  if (!part) return null
  const known = Object.values(part).filter((value): value is boolean => value !== null)
  if (!known.length) return null
  return known.some((value) => value)
}

export type VehicleState = {
  odometerKm: number | null
  rawOdometerMiles: number | null
  softwareVersion: string | null
  locked: boolean | null
  /**
   * `vehicle_state.df/dr/pf/pr` — driver-side and passenger-side, front and rear.
   * `null` for the whole record when Tesla reported none of them, which is what a
   * sleeping vehicle does; a per-door `null` means that one door was absent.
   */
  doors: DoorState | null
  /** `fd_window/fp_window/rd_window/rp_window` — 1 means lowered, not "broken". */
  windows: WindowState | null
  trunkFrontOpen: boolean | null
  trunkRearOpen: boolean | null
  sentryMode: boolean | null
  eagleEye: boolean | null
  valetMode: boolean | null
  tirePressurePsi: { frontLeft: number | null; frontRight: number | null; rearLeft: number | null; rearRight: number | null } | null
  lastDriveDistanceKm: number | null
  minutesSinceLastDrive: number | null
  userPresentMinutes: number | null
  wifiName: string | null
  updateStatus: string | null
  updateVersion: string | null
  /** Tesla's `service_mode`: 0 none, 1 scheduled, 2 roadside, 3 repair. */
  serviceMode: number | null
  /** 12 V auxiliary battery, when reported. A sag here is a real-world fault. */
  lowVoltageBatteryVolts: number | null
  timestamp: number | null
}

export type VehicleLocation = {
  latitude: number
  longitude: number
  heading: number | null
  /** Whether this fix is the car's live position or its last known one. */
  source: 'live' | 'last_known'
  accuracy: number | null
}

export type VehicleStatus = {
  identity: VehicleIdentity
  displayName: string
  presence: VehiclePresence
  connectivity: Connectivity
  drive: DriveState
  charge: ChargeState
  climate: ClimateState
  state: VehicleState
  config: VehicleConfig
  /** 0..1 across all numeric fields actually returned; drives the §39 data-availability hints. */
  completeness: number
}

export type VehicleStatusSnapshot = {
  /** Server-derived — never stored inside `status` (§F1). */
  collectedAt: string
  ageSeconds: number
  freshness: FreshnessLevel
  /** Why the snapshot is what it is: `tesla_api` | `cache` | `none`. */
  source: 'tesla_api' | 'cache' | 'none'
  collectionReason: string | null
  status: VehicleStatus | null
  /** Sanitised §20 failure taxonomy, so the UI can render "cannot update" honestly. */
  error: {
    kind: string
    status: number | null
    endpoint: string
    message: string
    attempts: number
    retryAfterMs: number | null
  } | null
}

export type BatterySnapshot = {
  vehicleId: string
  at: string
  stateOfCharge: number
  usableStateOfCharge: number | null
  ratedRangeKm: number | null
  presence: VehiclePresence
  chargingConnection: ChargingConnection
  odometerKm: number | null
  location: VehicleLocation | null
  /** True when the row came from an incomplete response and was interpolated. */
  partial: boolean
}

export type Trip = {
  id: string
  vehicleId: string
  startedAt: string
  endedAt: string | null
  distanceKm: number | null
  durationMinutes: number | null
  averageSpeedKmh: number | null
  maxSpeedKmh: number | null
  energyUsedKwh: number | null
  /** Wh/km. Positive means consumed; net of regeneration. */
  efficiencyWhPerKm: number | null
  batteryStartPercent: number | null
  batteryEndPercent: number | null
  odometerStartKm: number | null
  odometerEndKm: number | null
  startLocation: VehicleLocation | null
  endLocation: VehicleLocation | null
  route: Array<[number, number]>
  name: string | null
  phase: TripPhase
  partial: boolean
  /** How the trip boundaries were determined; surfaced so we never over-claim. */
  confidence: 'gps_route' | 'odometer_delta' | 'snapshot_gap'
}

export type ChargingSession = {
  id: string
  vehicleId: string
  startedAt: string
  endedAt: string | null
  durationMinutes: number | null
  energyAddedKwh: number | null
  addedRangeKm: number | null
  batteryStartPercent: number | null
  batteryEndPercent: number | null
  averagePowerKw: number | null
  peakPowerKw: number | null
  location: VehicleLocation | null
  locationLabel: string | null
  chargerType: string | null
  fastCharger: boolean | null
  completed: boolean
  confidence: 'gps_route' | 'snapshot_gap'
}

/** §13 ActivityEvent — the single feed behind Dashboard → "Recent activity". */
export type ActivityEvent = {
  id: string
  vehicleId: string
  at: string
  type:
    | 'trip_started'
    | 'trip_completed'
    | 'charging_started'
    | 'charging_completed'
    | 'charging_stopped'
    | 'vehicle_parked'
    | 'vehicle_woke'
    | 'vehicle_fell_asleep'
    | 'climate_started'
    | 'software_update_started'
    | 'software_update_completed'
    | 'credentials_rejected'
    | 'collection_failed'
  title: string
  /** Secondary line: distance, energy, location. Optional by design. */
  detail: string | null
  /** Link target inside the app, when the event has a matching detail view. */
  link: { kind: 'trip' | 'charging_session'; id: string } | null
}

export type VehicleSummary = {
  identity: VehicleIdentity
  displayName: string
  modelLabel: string | null
  presence: VehiclePresence
  /** Present without a telemetry read, so the selector works while the car sleeps. */
  connectivity: Connectivity
  lastSeenAt: string | null
}

/** §23 RequestLog. Every field here is safe to render in /debug/api. */
export type ApiRequestLog = {
  id: string
  at: string
  vehicleId: string | null
  requestType: 'vehicle_list' | 'vehicle_status' | 'vehicle_data' | 'drive_state' | 'charge_state' | 'climate_state' | 'vehicle_state' | 'vehicle_config' | 'wake_up' | 'token_refresh' | 'authorization' | 'probe'
  method: string
  endpoint: string
  /** Full URL with the bearer removed and host kept. */
  url: string
  status: number | null
  durationMs: number | null
  ok: boolean
  errorKind: string | null
  errorMessage: string | null
  attempts: number
  requestHeaders: Record<string, string>
  requestBody: string | null
  responseHeaders: Record<string, string>
  responseBody: string | null
  responseByteLength: number | null
  /** Set when the body was truncated or replaced by a placeholder. */
  sanitized: true
}
