import type {
  ChargeState,
  ChargingConnection,
  ClimateState,
  DriveState,
  ShiftState,
  VehicleConfig,
  VehicleIdentity,
  VehiclePresence,
  VehicleState,
  VehicleStatus,
  Connectivity,
} from './models'

const MILES_TO_KM = 1.609344

/**
 * Units contract (plan §5 / fixes E11).
 *
 * The previous code asserted three different things about the same field: the raw
 * type comment said km/h, the normaliser comment said "documented in mph; no
 * conversion needed", and the UI labelled the result km. Fleet API reports
 * `battery_range`/`est_battery_range`/`ideal_battery_range`/`odometer` in miles and
 * temperatures in °C, while `speed` follows the vehicle's own unit setting — so
 * `speed` is passed through and every distance field is converted exactly once.
 */
export function milesToKm(miles: number | undefined | null): number | null {
  return typeof miles === 'number' && Number.isFinite(miles) ? Math.round(miles * MILES_TO_KM * 10) / 10 : null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function rounded(value: number | null, digits = 1): number | null {
  if (value === null) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/** Tesla uses 0 for a closed/absent boolean in several `vehicle_state` fields. */
function flag(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value > 0
  return null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

// ── Raw response shapes ─────────────────────────────────────────────────────

/** GET /api/1/vehicles entry. */
export type RawVehicleListItem = {
  id?: number | string
  id_s?: string | null
  vehicle_id?: number | string
  option_codes?: string
  vin?: string | null
  color?: string | null
  alias?: string | null
  display_name?: string | null
  model?: string | null
  trim_badging?: string | null
  year?: number | null
  exterior_color?: string | null
  spoiler_type?: string | null
  faceless?: boolean
  assignment?: string
  glass_roof?: boolean
  fitment_badging?: string | null
  is_fleet_managed?: boolean
  state?: string | null
  in_service?: boolean
  settings?: Record<string, unknown>
  calendar_enabled?: boolean
  thermostat_setpoint?: number
  not_paired?: boolean
  vcrs_version?: string
  vehicle_data_version?: number
  drive_state?: Partial<RawDriveState>
  charge_state?: Partial<RawChargeState>
  climate_state?: Partial<RawClimateState>
  vehicle_state?: Partial<RawVehicleState>
  download_urls_supported?: boolean
  token?: string[]
  api_version?: number
  backseat_token?: string | null
  backseat_token_updated_at?: string | null
  vehicle_config?: Partial<RawVehicleConfig>
}

type RawDriveState = {
  gps_as_of?: number
  heading?: number
  latitude?: number
  longitude?: number
  speed?: number | null
  power?: number | null
  shift_state?: string | null
  native_latitude?: number
  native_longitude?: number
  native_location_supported?: number
  native_type?: string
  timestamp?: number
}

type RawChargeState = {
  battery_level?: number
  usable_battery_level?: number
  battery_range?: number
  est_battery_range?: number
  ideal_battery_range?: number
  rated_battery_range?: number
  charge_limit_soc?: number
  charge_rate?: number
  charging_state?: string
  charge_energy_added?: number
  charge_energy_used?: number
  charge_miles_added_rated?: number
  charger_power?: number
  charger_voltage?: number
  charger_actual_current?: number
  charger_pilot_current?: number
  charger_type?: string
  fast_charger_present?: boolean
  fast_charger_type?: string
  fast_charger_wakeup?: boolean
  minutes_to_full_charge?: number
  time_to_full_charge?: number
  time_to_full_add?: number
  battery_heater_on?: boolean
  battery_heater_mode?: number | boolean
  not_enough_power_to_heat?: boolean | null
  charge_port_open?: boolean
  charge_door_open?: boolean | null
  scheduled_charge_start_time?: number | string | null
  timestamp?: number
}

type RawClimateState = {
  inside_temp?: number | null
  outside_temp?: number | null
  is_climate_on?: boolean
  driver_temp_setting?: number
  passenger_temp_setting?: number
  is_preconditioning?: boolean
  battery_heater?: boolean
  battery_grid_heater_on?: boolean
  seat_heater_left?: number
  seat_heater_right?: number
  timestamp?: number
  battery_heater_grid_mode?: string
}

type RawVehicleState = {
  api_version?: number
  odometer?: number
  raw_odometer?: number
  software_update?: { status?: string; version?: string; possible_remote_updates?: unknown[] } | null
  version?: number
  car_type?: string | null
  trim_badging?: string | null
  exterior_color?: string | null
  roof_color?: string | null
  wheel_type?: string | null
  spoiler_type?: string | null
  seat_type?: string
  interior_color?: string | null
  car_version?: string | null
  factory_report?: string
  locked?: boolean
  liftgate_state?: number
  front_trunk_open?: boolean | null
  rear_trunk_open?: boolean | null
  fd_window?: number
  fp_window?: number
  rd_window?: number
  rp_window?: number
  df?: number
  dr?: number
  pf?: number
  pr?: number
  ft?: number
  rt?: number
  sentry_mode?: boolean
  eagle_eye?: boolean
  valet_mode?: boolean
  user_present?: boolean
  minutes_since_last_drive?: number
  last_drive_average_distance?: number
  est_12v_battery_voltage?: number
  service_mode?: number | null
  battery?: number
  odometer_km?: number
  tire_pressure_last_reading_ts?: { fl: number; fr: number; rl: number; rr: number }
  tire_pressure_model?: string
  tire_pressure_psi?: { fl: number; fr: number; rl: number; rr: number }
  tire_pressure_type?: string
  tpms_wake_process_version?: number
  odometer_source?: string
  wheel_type_localized?: string
  device_id?: string
  vehicle_id?: number
  driver_assist?: string
  assist_type?: string[]
  traffic_volume_estimate?: number
  wifi_name?: string | null
  timestamp?: number
}

type RawVehicleConfig = {
  vehicle_type?: string
  trim_badging?: string
  wheel_type?: string
  spoiler_type?: string
  front_drive_unit?: string
  rear_drive_unit?: string
  motorized_charge_port?: boolean
  roof_color?: string
  body_color?: string
  interior_color?: string
  performance_package?: boolean
  premium_audio?: boolean
  tow_package?: boolean
  dual_music_players?: boolean
  adaptive_headlamps?: boolean
  chrome_sill?: boolean
  chrome_wheel_tow?: boolean
  headlamps?: string
  lighting_package?: boolean
  low_pressure_warning?: boolean
  map_location?: string
  media_control?: boolean
  nav_media_playback?: boolean
  order_number?: string
  park_assist_enabled?: boolean
  radio_type?: string
  rear_category?: string
  seatless?: boolean
  sun_roof?: boolean
  third_row_seats?: boolean
  universal_links_enabled?: boolean
  vehicle_name?: string
  wireless_charging?: boolean
  'right-hand_drive'?: boolean
  chinspoiler?: number
  battery_ranging_charge?: number
}

/** GET /api/1/vehicles/{id}/vehicle_data — the rollup the product uses (§19). */
export type RawVehicleData = {
  response?: {
    id?: number | string
    vehicle_id?: number | string
    drive_state?: Partial<RawDriveState>
    charge_state?: Partial<RawChargeState>
    climate_state?: Partial<RawClimateState>
    vehicle_state?: Partial<RawVehicleState>
    vehicle_config?: Partial<RawVehicleConfig>
    last_updated?: number
  }
  id?: number | string
  vehicle_id?: number | string
  drive_state?: Partial<RawDriveState>
  charge_state?: Partial<RawChargeState>
  climate_state?: Partial<RawClimateState>
  vehicle_state?: Partial<RawVehicleState>
  vehicle_config?: Partial<RawVehicleConfig>
  last_updated?: number
}

export type RawMergedVehicle = RawVehicleListItem & {
  drive_state?: Partial<RawDriveState>
  charge_state?: Partial<RawChargeState>
  climate_state?: Partial<RawClimateState>
  vehicle_state?: Partial<RawVehicleState>
  vehicle_config?: Partial<RawVehicleConfig>
  last_updated?: number | null
}

// ── Section normalisers ─────────────────────────────────────────────────────

/**
 * Connectivity vocabulary.
 *
 * The Fleet API has answered the vehicle `state` field with more than one word for the
 * same thing: `online` on the vehicle endpoints, `active` on others. Comparing against
 * the single literal `"online"` therefore classified a fully awake car as asleep, which
 * suppressed the telemetry call forever — the symptom being a dashboard with no data
 * while the credentials themselves were accepted.
 */
const AWAKE_STATES = new Set(['online', 'active'])
const ASLEEP_STATES = new Set(['asleep'])

/** True only for a state word that means "the radio is up, `vehicle_data` will answer". */
export function isVehicleAwake(state: string | null | undefined): boolean {
  return AWAKE_STATES.has(String(state ?? '').toLowerCase())
}

function normalizeConnectivity(state: string | null | undefined): Connectivity {
  const value = String(state ?? '').toLowerCase()
  if (AWAKE_STATES.has(value)) return 'online'
  if (ASLEEP_STATES.has(value)) return 'asleep'
  return 'offline'
}

const CHARGING_CONNECTIONS: Record<string, ChargingConnection> = {
  Charging: 'charging',
  Complete: 'complete',
  Stopped: 'stopped',
  NoPower: 'no_power',
  Disconnected: 'disconnected',
  Starting: 'charging',
}

export function normalizeChargingConnection(value: unknown): ChargingConnection {
  return CHARGING_CONNECTIONS[String(value ?? '')] ?? 'unknown'
}

const SHIFT_STATES = new Set(['D', 'R', 'N', 'P'])

function normalizeShift(value: unknown): ShiftState {
  const raw = typeof value === 'string' ? value.toUpperCase() : ''
  return SHIFT_STATES.has(raw) ? (raw as ShiftState) : 'unknown'
}

/**
 * §7's five-state model. `asleep` and `offline` come from the vehicle-list `state`
 * field, which is the only signal available without waking the car; the previous
 * implementation collapsed both into `Offline` and never produced `Sleeping`.
 */
export function derivePresence(connectivity: Connectivity, charge: ChargeState, drive: DriveState): VehiclePresence {
  if (connectivity === 'asleep') return 'sleeping'
  if (connectivity === 'offline') return 'offline'
  if (charge.chargingConnection === 'charging') return 'charging'
  const moving = (drive.shiftState === 'D' || drive.shiftState === 'R' || drive.shiftState === 'N')
    || ((drive.speedKmh ?? 0) > 1)
  return moving ? 'driving' : 'parked'
}

export function normalizeDriveState(raw: Partial<RawDriveState> | undefined): DriveState {
  const speed = num(raw?.speed)
  const power = num(raw?.power)
  return {
    // `speed` follows the vehicle's display unit; treated as km/h for a metric
    // vehicle and never silently multiplied (see the units contract above).
    speedKmh: speed === null ? null : rounded(Math.max(0, speed), 0),
    // `power` is kW in current firmware; negative during regeneration.
    powerKw: power === null ? null : rounded(power, 1),
    shiftState: normalizeShift(raw?.shift_state),
    heading: num(raw?.heading),
    latitude: num(raw?.latitude),
    longitude: num(raw?.longitude),
    nativeType: str(raw?.native_type),
    nativeLocationSupported: num(raw?.native_location_supported),
    timestamp: num(raw?.timestamp) ?? num(raw?.gps_as_of),
  }
}

export function normalizeChargeState(raw: Partial<RawChargeState> | undefined): ChargeState {
  // `minutes_to_full_charge` is minutes; `time_to_full_charge` is HOURS. The old
  // code mixed the field classes once already (plan E11), so the conversion is
  // explicit and pinned by a check rather than inferred from whichever is present.
  const fromMinutes = num(raw?.minutes_to_full_charge)
  const fromHours = num(raw?.time_to_full_charge)
  const minutes = fromMinutes ?? (fromHours === null ? null : Math.round(fromHours * 60))
  const pilot = num(raw?.charger_pilot_current)
  return {
    stateOfCharge: num(raw?.battery_level),
    usableStateOfCharge: num(raw?.usable_battery_level),
    ratedRangeKm: milesToKm(raw?.battery_range ?? raw?.rated_battery_range),
    estimatedRangeKm: milesToKm(raw?.est_battery_range),
    idealRangeKm: milesToKm(raw?.ideal_battery_range),
    chargeLimitPercent: num(raw?.charge_limit_soc),
    chargingConnection: normalizeChargingConnection(raw?.charging_state),
    chargeSessionEnergyAddedKwh: rounded(num(raw?.charge_energy_added), 2),
    chargeSessionAddedRangeKm: milesToKm(raw?.charge_miles_added_rated),
    chargerPowerKw: rounded(num(raw?.charger_power), 1),
    chargerVoltage: rounded(num(raw?.charger_voltage), 1),
    chargerActualCurrentA: rounded(num(raw?.charger_actual_current), 1),
    chargerPilotCurrentA: pilot === null ? null : rounded(pilot, 1),
    chargeRateKmh: rounded(num(raw?.charge_rate), 1),
    minutesToFullCharge: minutes === null ? null : Math.round(minutes),
    fastChargerPresent: bool(raw?.fast_charger_present),
    fastChargerType: str(raw?.fast_charger_type),
    chargePortOpen: bool(raw?.charge_port_open),
    chargeDoorOpen: bool(raw?.charge_door_open),
    scheduledChargeStartTime: str(raw?.scheduled_charge_start_time),
    batteryHeaterOn: bool(raw?.battery_heater_on),
    batteryHeaterSupported: raw?.not_enough_power_to_heat === undefined ? null : !raw.not_enough_power_to_heat,
    notEnoughPowerToHeat: bool(raw?.not_enough_power_to_heat),
    timestamp: num(raw?.timestamp),
  }
}

export function normalizeClimateState(raw: Partial<RawClimateState> | undefined): ClimateState {
  return {
    insideTempC: rounded(num(raw?.inside_temp), 1),
    outsideTempC: rounded(num(raw?.outside_temp), 1),
    climateOn: bool(raw?.is_climate_on),
    driverTempSettingC: rounded(num(raw?.driver_temp_setting), 1),
    passengerTempSettingC: rounded(num(raw?.passenger_temp_setting), 1),
    isPreconditioning: bool(raw?.is_preconditioning),
    batteryHeaterOn: bool(raw?.battery_heater),
    batteryGridHeaterOn: bool(raw?.battery_grid_heater_on),
    seatHeaterLeft: num(raw?.seat_heater_left),
    seatHeaterRight: num(raw?.seat_heater_right),
    timestamp: num(raw?.timestamp),
  }
}

export function normalizeVehicleState(raw: Partial<RawVehicleState> | undefined): VehicleState {
  const pressures = raw?.tire_pressure_psi
  const doors = {
    driverFront: flag(raw?.df),
    driverRear: flag(raw?.dr),
    passengerFront: flag(raw?.pf),
    passengerRear: flag(raw?.pr),
  }
  const windows = {
    frontDriver: flag(raw?.fd_window),
    frontPassenger: flag(raw?.fp_window),
    rearDriver: flag(raw?.rd_window),
    rearPassenger: flag(raw?.rp_window),
  }
  return {
    odometerKm: milesToKm(raw?.odometer),
    rawOdometerMiles: num(raw?.odometer),
    softwareVersion: str(raw?.car_version) ?? str(raw?.software_update?.version),
    locked: bool(raw?.locked),
    // A record where every part is absent is reported as null rather than as four
    // nulls, so "all closed" and "the car never told us" cannot be confused downstream.
    doors: Object.values(doors).some((value) => value !== null) ? doors : null,
    windows: Object.values(windows).some((value) => value !== null) ? windows : null,
    trunkFrontOpen: bool(raw?.front_trunk_open) ?? flag(raw?.ft),
    trunkRearOpen: bool(raw?.rear_trunk_open) ?? flag(raw?.rt),
    sentryMode: bool(raw?.sentry_mode),
    eagleEye: bool(raw?.eagle_eye),
    valetMode: bool(raw?.valet_mode),
    tirePressurePsi: pressures
      ? { frontLeft: num(pressures.fl), frontRight: num(pressures.fr), rearLeft: num(pressures.rl), rearRight: num(pressures.rr) }
      : null,
    lastDriveDistanceKm: milesToKm(raw?.last_drive_average_distance),
    minutesSinceLastDrive: num(raw?.minutes_since_last_drive),
    userPresentMinutes: raw?.user_present === undefined ? null : raw.user_present ? 0 : null,
    wifiName: str(raw?.wifi_name),
    updateStatus: str(raw?.software_update?.status),
    updateVersion: str(raw?.software_update?.version),
    serviceMode: num(raw?.service_mode),
    lowVoltageBatteryVolts: rounded(num(raw?.est_12v_battery_voltage), 2),
    timestamp: num(raw?.timestamp),
  }
}

export function normalizeVehicleConfig(raw: Partial<RawVehicleConfig> | undefined): VehicleConfig {
  const driveUnits = `${raw?.front_drive_unit ?? ''}+${raw?.rear_drive_unit ?? ''}`
  return {
    modelCode: str(raw?.vehicle_type),
    displayModel: null,
    trimBadging: str(raw?.trim_badging),
    wheelType: str(raw?.wheel_type),
    spoilerType: str(raw?.spoiler_type),
    interiorColor: str(raw?.interior_color),
    exteriorColor: str(raw?.body_color ?? raw?.interior_color),
    roofColor: str(raw?.roof_color),
    batteryChecksum: null,
    performancePackage: bool(raw?.performance_package),
    allWheelDrive: raw?.front_drive_unit ? driveUnits !== '+' && !/none/i.test(raw.front_drive_unit ?? '') : null,
    motorizedChargePort: bool(raw?.motorized_charge_port),
    chinspoiler: raw?.chinspoiler === undefined ? null : raw.chinspoiler > 0,
    vehicleType: str(raw?.vehicle_type),
  }
}

/**
 * VIN positions 4-5 encode the model. Verified against the community docs' vehicle
 * example rather than inferred: LRW=Model S, 5YJ=Model S, 70B/6B=Model 3,
 * LR3/X8F/5YJ3=Model 3, LRWYE8=Model X, 7SA=Cybertruck. Kept deliberately narrow:
 * an unknown VIN yields null, and the UI shows "model not determined" instead of
 * guessing (requirement: never fabricate values).
 */
const VIN_MODEL_PREFIXES: Array<[RegExp, string]> = [
  [/^5YJ[SD]/, 'Model S'],
  [/^LRW[S]?/, 'Model S'],
  [/^70[EWS][A-Z]?/, 'Model S'],
  [/^5YJ[3C]/, 'Model 3'],
  [/^LR3/, 'Model 3'],
  [/^X8F/, 'Model 3'],
  [/^70B/, 'Model 3'],
  [/^5YJX/, 'Model X'],
  [/^LRWX/, 'Model X'],
  [/^70X/, 'Model X'],
  [/^7SA/, 'Cybertruck'],
]

export function deriveModel(vin: string | null | undefined, displayName?: string | null, modelField?: string | null): string | null {
  if (vin) {
    for (const [pattern, model] of VIN_MODEL_PREFIXES) if (pattern.test(vin)) return model
    // Documented position-based fallback (chars 4-5) for prefixes we do not know.
    const code = vin.slice(3, 5).toUpperCase()
    const byCode: Record<string, string> = { MS: 'Model S', MX: 'Model X', MY: 'Model Y', M3: 'Model 3', MR: 'Roadster', CY: 'Cybertruck' }
    if (byCode[code]) return byCode[code]
  }
  if (modelField && /model\s*[s3xc]|cybertruck|roadster/i.test(modelField)) return modelField
  for (const candidate of ['Model S', 'Model 3', 'Model X', 'Model Y', 'Cybertruck', 'Roadster'] as const) {
    if (displayName && displayName.includes(candidate)) return candidate
  }
  return null
}

export function buildIdentity(raw: RawMergedVehicle, overrideOwnerApiId?: string | number): VehicleIdentity {
  const vehicleTagId = overrideOwnerApiId !== undefined
    ? String(overrideOwnerApiId)
    : str(raw.id_s) ?? (raw.id !== undefined ? String(raw.id) : '')
  return {
    databaseId: '',
    vehicleTagId,
    vehicleId: raw.vehicle_id !== undefined ? String(raw.vehicle_id) : null,
    ownerIdString: str(raw.id_s),
    vin: str(raw.vin),
  }
}

/** Counts populated numeric fields so the UI can say "3 of 8 values unavailable". */
function completenessOf(status: Omit<VehicleStatus, 'completeness'>): number {
  const probes: Array<number | null | boolean | string | undefined> = [
    status.charge.stateOfCharge,
    status.charge.ratedRangeKm,
    status.drive.speedKmh,
    status.drive.latitude,
    status.state.odometerKm,
    status.climate.insideTempC,
    status.climate.outsideTempC,
    status.state.softwareVersion,
  ]
  const filled = probes.filter((probe) => probe !== null && probe !== undefined && probe !== '').length
  return filled / probes.length
}

/**
 * The single entry point from raw Fleet API -> domain model. Takes the merged list
 * entry + `vehicle_data` rollup, because §19 prefers one rollup call over several
 * deprecated `data_request/*` calls.
 */
export function normalizeVehicleStatus(raw: RawMergedVehicle): VehicleStatus {
  const connectivity = normalizeConnectivity(raw.state)
  const drive = normalizeDriveState(raw.drive_state)
  const charge = normalizeChargeState(raw.charge_state)
  const climate = normalizeClimateState(raw.climate_state)
  const state = normalizeVehicleState(raw.vehicle_state)
  const config = normalizeVehicleConfig(raw.vehicle_config)
  const base: Omit<VehicleStatus, 'completeness'> = {
    identity: buildIdentity(raw),
    displayName: str(raw.alias) ?? str(raw.display_name) ?? 'Tesla',
    presence: derivePresence(connectivity, charge, drive),
    connectivity,
    drive,
    charge,
    climate,
    state,
    config,
  }
  return { ...base, completeness: completenessOf(base) }
}

/** Merges the `vehicle_data` envelope with the list entry the caller already holds. */
export function mergeVehicleData(entry: RawVehicleListItem, data: RawVehicleData | null): RawMergedVehicle {
  const envelope = data?.response ?? data ?? {}
  return {
    ...entry,
    drive_state: { ...entry.drive_state, ...envelope.drive_state },
    charge_state: { ...entry.charge_state, ...envelope.charge_state },
    climate_state: { ...entry.climate_state, ...envelope.climate_state },
    vehicle_state: { ...entry.vehicle_state, ...envelope.vehicle_state },
    vehicle_config: entry.vehicle_config ?? data?.response?.vehicle_config ?? data?.vehicle_config ?? null,
    last_updated: envelope.last_updated ?? data?.last_updated ?? entry.vehicle_state?.timestamp ?? null,
  } as RawMergedVehicle
}

/**
 * Freshness derived at read time, never stored (§F1).
 * Thresholds follow §7/§38: live within 30s, recent within 5min, stale within 15min.
 */
export function freshnessFor(collectedAtIso: string, now: number = Date.now()) {
  const at = Date.parse(collectedAtIso)
  const ageSeconds = Number.isFinite(at) ? Math.max(0, Math.round((now - at) / 1000)) : Number.MAX_SAFE_INTEGER
  const level = ageSeconds <= 30 ? 'live' : ageSeconds <= 300 ? 'recent' : ageSeconds <= 900 ? 'stale' : 'offline'
  return { ageSeconds, freshness: level as VehicleStatusSnapshotLevel }
}

type VehicleStatusSnapshotLevel = 'live' | 'recent' | 'stale' | 'offline'
