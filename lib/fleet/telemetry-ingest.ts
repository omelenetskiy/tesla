import { getSupabaseAdmin } from '@/lib/supabase'
import type { VehicleStatus, VehicleState, DriveState, ChargeState, ClimateState, VehicleConfig, ShiftState } from '@/lib/tesla/models'
import { derivePresence, normalizeChargingConnection } from '@/lib/tesla/normalize'
import { listAllVehicleRows, newestSnapshot, type VehicleRow } from '@/lib/tesla/service'
import { persistDerivedHistory, readHistory } from '@/lib/tesla/history'
import { persistTelemetryProgress } from '@/lib/fleet/telemetry-progress'
import { persistTelemetrySamples } from '@/lib/fleet/telemetry-samples'

const META_FIELDS = new Set(['CreatedAt', 'IsResend', 'Vin'])
const DIRECT_VALUE_KEYS = ['stringValue', 'doubleValue', 'floatValue', 'intValue', 'integerValue', 'uintValue', 'numberValue', 'boolValue', 'booleanValue'] as const
const HISTORY_FIELDS = new Set(['Soc', 'BatteryLevel', 'RatedRange', 'EstBatteryRange', 'IdealBatteryRange', 'VehicleSpeed', 'PackVoltage', 'PackCurrent', 'Gear', 'Location', 'GpsHeading', 'Odometer', 'ChargeLimitSoc', 'ChargerVoltage', 'ChargeAmps', 'ACChargingPower', 'DCChargingPower', 'FastChargerPresent', 'FastChargerType', 'NotEnoughPowerToHeat', 'DetailedChargeState'])

type JsonRecord = Record<string, unknown>

type TelemetryMetadata = {
  device_client_version?: string
  receivedat?: string
  timestamp?: string
  txid?: string
  txtype?: string
  version?: string
  vin?: string
  session_id?: string
  session_type?: 'trip' | 'charging' | 'parked'
}

export type TelemetryLogRecord = {
  activity?: boolean
  context?: string
  data?: JsonRecord
  level?: string
  metadata?: TelemetryMetadata
  msg?: string
  time?: string
  vin?: string
}

type VehicleCacheEntry = {
  row: VehicleRow
  status: VehicleStatus
  lastCollectedAt: string | null
}

export type TelemetryIngestResult =
  | { kind: 'ignored' }
  | { kind: 'unknown_vehicle'; vin: string }
  | { kind: 'duplicate'; vin: string; txid: string }
  | { kind: 'ingested'; vin: string; txid: string; collectedAt: string; fields: string[]; mappedFields: string[] }

function emptyDriveState(): DriveState {
  return {
    speedKmh: null,
    powerKw: null,
    packVoltageV: null,
    packCurrentA: null,
    shiftState: 'unknown',
    heading: null,
    latitude: null,
    longitude: null,
    nativeType: null,
    nativeLocationSupported: null,
    timestamp: null,
  }
}

function emptyChargeState(): ChargeState {
  return {
    stateOfCharge: null,
    usableStateOfCharge: null,
    ratedRangeKm: null,
    estimatedRangeKm: null,
    idealRangeKm: null,
    chargeLimitPercent: null,
    chargingConnection: 'unknown',
    chargeSessionEnergyAddedKwh: null,
    chargeSessionAddedRangeKm: null,
    chargerPowerKw: null,
    chargerVoltage: null,
    chargerActualCurrentA: null,
    chargerPilotCurrentA: null,
    chargeRateKmh: null,
    minutesToFullCharge: null,
    fastChargerPresent: null,
    fastChargerType: null,
    chargePortOpen: null,
    chargeDoorOpen: null,
    scheduledChargeStartTime: null,
    batteryHeaterOn: null,
    batteryHeaterSupported: null,
    notEnoughPowerToHeat: null,
    timestamp: null,
  }
}

function emptyClimateState(): ClimateState {
  return {
    insideTempC: null,
    outsideTempC: null,
    climateOn: null,
    driverTempSettingC: null,
    passengerTempSettingC: null,
    isPreconditioning: null,
    batteryHeaterOn: null,
    batteryGridHeaterOn: null,
    seatHeaterLeft: null,
    seatHeaterRight: null,
    timestamp: null,
  }
}

function emptyVehicleState(): VehicleState {
  return {
    odometerKm: null,
    rawOdometer: null,
    softwareVersion: null,
    locked: null,
    doors: null,
    windows: null,
    trunkFrontOpen: null,
    trunkRearOpen: null,
    sentryMode: null,
    eagleEye: null,
    valetMode: null,
    tirePressurePsi: null,
    lastDriveDistanceKm: null,
    minutesSinceLastDrive: null,
    userPresentMinutes: null,
    wifiName: null,
    updateStatus: null,
    updateVersion: null,
    serviceMode: null,
    lowVoltageBatteryVolts: null,
    timestamp: null,
  }
}

function emptyVehicleConfig(): VehicleConfig {
  return {
    modelCode: null,
    displayModel: null,
    trimBadging: null,
    wheelType: null,
    spoilerType: null,
    interiorColor: null,
    exteriorColor: null,
    roofColor: null,
    batteryChecksum: null,
    performancePackage: null,
    allWheelDrive: null,
    motorizedChargePort: null,
    chinspoiler: null,
    vehicleType: null,
  }
}

export function emptyVehicleStatus(row: Pick<VehicleRow, 'id' | 'display_name' | 'vehicle_tag_id' | 'vehicle_id' | 'vin'>): VehicleStatus {
  const drive = emptyDriveState()
  const charge = emptyChargeState()
  return {
    identity: {
      databaseId: row.id,
      vehicleTagId: row.vehicle_tag_id ?? '',
      vehicleId: row.vehicle_id ?? null,
      ownerIdString: null,
      vin: row.vin ?? null,
    },
    displayName: row.display_name,
    presence: 'offline',
    connectivity: 'offline',
    drive,
    charge,
    climate: emptyClimateState(),
    state: emptyVehicleState(),
    config: emptyVehicleConfig(),
    completeness: 0,
  }
}

function estimateCompleteness(status: VehicleStatus): number {
  const probes = [
    status.charge.stateOfCharge,
    status.charge.ratedRangeKm,
    status.charge.estimatedRangeKm,
    status.charge.idealRangeKm,
    status.charge.chargingConnection !== 'unknown' ? 1 : null,
    status.drive.speedKmh,
    status.drive.latitude,
    status.drive.longitude,
    status.drive.shiftState !== 'unknown' ? 1 : null,
    status.state.odometerKm,
    status.state.locked,
    status.climate.insideTempC,
    status.climate.outsideTempC,
  ]
  const present = probes.filter((value) => value !== null).length
  return Math.round((present / probes.length) * 100) / 100
}

function trimPrefix(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('{')) return trimmed
  const pipeIndex = trimmed.indexOf('|')
  if (pipeIndex === -1) return null
  const maybeJson = trimmed.slice(pipeIndex + 1).trim()
  return maybeJson.startsWith('{') ? maybeJson : null
}

export function parseTelemetryLogLine(line: string): TelemetryLogRecord | null {
  const json = trimPrefix(line)
  if (!json) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const record = parsed as TelemetryLogRecord
  if (record.msg !== 'record_payload') return null
  if (!record.data || typeof record.data !== 'object') return null
  return record
}

function asObject(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function unwrapTelemetryValue(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value.map(unwrapTelemetryValue)
  const object = asObject(value)
  if (!object) return value
  if (object.invalid === true) return null
  for (const key of DIRECT_VALUE_KEYS) {
    if (key in object) return unwrapTelemetryValue(object[key])
  }
  if ('listValue' in object && Array.isArray(object.listValue)) {
    return object.listValue.map(unwrapTelemetryValue)
  }
  if ('arrayValue' in object && Array.isArray(object.arrayValue)) {
    return object.arrayValue.map(unwrapTelemetryValue)
  }
  if ('structValue' in object) return unwrapTelemetryValue(object.structValue)
  if ('objectValue' in object) return unwrapTelemetryValue(object.objectValue)
  const unwrapped: JsonRecord = {}
  for (const [key, nested] of Object.entries(object)) {
    unwrapped[key] = unwrapTelemetryValue(nested)
  }
  return unwrapped
}

function toNumber(value: unknown): number | null {
  const raw = unwrapTelemetryValue(value)
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function updatePackPower(status: VehicleStatus) {
  const voltage = status.drive.packVoltageV
  const current = status.drive.packCurrentA
  if (typeof voltage === 'number' && Number.isFinite(voltage) && typeof current === 'number' && Number.isFinite(current)) {
    // Fleet pack current is negative while the vehicle consumes energy.
    status.drive.powerKw = Math.round((-voltage * current / 1000) * 10) / 10
  }
}

function toBoolean(value: unknown): boolean | null {
  const raw = unwrapTelemetryValue(value)
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw > 0
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (['true', 'yes', 'open', 'on', '1'].includes(normalized)) return true
    if (['false', 'no', 'closed', 'off', '0'].includes(normalized)) return false
  }
  return null
}

function toStringValue(value: unknown): string | null {
  const raw = unwrapTelemetryValue(value)
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
  if (typeof raw === 'boolean') return raw ? 'true' : 'false'
  const object = asObject(raw)
  if (object) {
    for (const nested of Object.values(object)) {
      const direct = toStringValue(nested)
      if (direct) return direct
    }
  }
  return null
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    if (/^\d+$/.test(value.trim())) return parseTimestamp(Number(value))
    const ms = Date.parse(value)
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const epochMs = value < 10_000_000_000 ? value * 1000 : value
    const date = new Date(epochMs)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  return null
}

function fieldNames(data: JsonRecord): string[] {
  return Object.keys(data).filter((key) => !META_FIELDS.has(key))
}

function parseShift(value: unknown): ShiftState {
  const raw = toStringValue(value)?.toUpperCase()
  return raw === 'D' || raw === 'R' || raw === 'N' || raw === 'P' ? raw : 'unknown'
}

function parseLocation(value: unknown): { latitude: number; longitude: number; heading: number | null } | null {
  const raw = unwrapTelemetryValue(value)
  if (typeof raw === 'string') {
    const match = raw.match(/\(?\s*(-?\d+(?:\.\d+)?)\s*([NS])\s*,\s*(-?\d+(?:\.\d+)?)\s*([EW])\s*\)?/i)
    if (match) {
      const lat = Number(match[1]) * (match[2].toUpperCase() === 'S' ? -1 : 1)
      const lon = Number(match[3]) * (match[4].toUpperCase() === 'W' ? -1 : 1)
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { latitude: lat, longitude: lon, heading: null }
    }
    try {
      return parseLocation(JSON.parse(raw))
    } catch {
      return null
    }
  }
  const object = asObject(raw)
  if (!object) return null
  const nested = asObject(object.locationValue ?? object.Location ?? object.location) ?? object
  const latitude = toNumber(nested.latitude ?? nested.lat ?? nested.Latitude ?? nested.Lat)
  const longitude = toNumber(nested.longitude ?? nested.lon ?? nested.lng ?? nested.Longitude ?? nested.Lon)
  const heading = toNumber(nested.heading ?? nested.GpsHeading ?? nested.gps_heading ?? object.heading ?? object.GpsHeading ?? object.gps_heading)
  return latitude !== null && longitude !== null ? { latitude, longitude, heading } : null
}

function applyDoorState(status: VehicleStatus, value: unknown): boolean {
  const raw = unwrapTelemetryValue(value)
  const object = asObject(raw)
  if (!object) return false
  const source = asObject(object.doorValue ?? object.DoorValue ?? object.doors) ?? object
  const next = status.state.doors ?? { driverFront: null, driverRear: null, passengerFront: null, passengerRear: null }
  let changed = false
  const map: Array<[keyof typeof next, unknown[]]> = [
    ['driverFront', [source.driverFront, source.df, source.front_left, source.DriverFront]],
    ['driverRear', [source.driverRear, source.dr, source.rear_left, source.DriverRear]],
    ['passengerFront', [source.passengerFront, source.pf, source.front_right, source.PassengerFront]],
    ['passengerRear', [source.passengerRear, source.pr, source.rear_right, source.PassengerRear]],
  ]
  for (const [key, candidates] of map) {
    const candidate = candidates.map(toBoolean).find((entry) => entry !== null) ?? null
    if (candidate !== null && next[key] !== candidate) {
      next[key] = candidate
      changed = true
    }
  }
  if (changed) status.state.doors = next
  return changed
}

function applyTpms(status: VehicleStatus, key: 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight', value: unknown): boolean {
  const pressure = toNumber(value)
  if (pressure === null) return false
  const next = status.state.tirePressurePsi ?? { frontLeft: null, frontRight: null, rearLeft: null, rearRight: null }
  if (next[key] === pressure) return false
  next[key] = Math.round(pressure * 10) / 10
  status.state.tirePressurePsi = next
  return true
}

export function applyTelemetryRecord(base: VehicleStatus, record: TelemetryLogRecord, row?: Pick<VehicleRow, 'id' | 'display_name' | 'vehicle_tag_id' | 'vehicle_id' | 'vin'>): { status: VehicleStatus; collectedAt: string; fields: string[]; mappedFields: string[] } {
  const status = structuredClone(base)
  if (row) {
    status.identity.databaseId = row.id
    status.identity.vehicleTagId = row.vehicle_tag_id ?? status.identity.vehicleTagId
    status.identity.vehicleId = row.vehicle_id ?? status.identity.vehicleId
    status.identity.vin = row.vin ?? status.identity.vin
    status.displayName = row.display_name
  }
  status.connectivity = 'online'

  const data = (record.data ?? {}) as JsonRecord
  const observedAt = parseTimestamp(data.CreatedAt) ?? parseTimestamp(record.metadata?.receivedat) ?? parseTimestamp(record.time) ?? new Date().toISOString()
  const observedMs = Date.parse(observedAt)
  const fields = fieldNames(data)
  const mappedFields: string[] = []

  for (const field of fields) {
    const rawValue = data[field]
    let mapped = false
    switch (field) {
      case 'Soc': {
        const value = toNumber(rawValue)
        if (value !== null) {
          status.charge.stateOfCharge = value
          mapped = true
        }
        break
      }
      case 'BatteryLevel': {
        const value = toNumber(rawValue)
        if (value !== null) {
          status.charge.stateOfCharge = value
          mapped = true
        }
        break
      }
      case 'RatedRange': {
        const value = toNumber(rawValue)
        if (value !== null) {
          status.charge.ratedRangeKm = value
          mapped = true
        }
        break
      }
      case 'EstBatteryRange': {
        const value = toNumber(rawValue)
        if (value !== null) {
          status.charge.estimatedRangeKm = value
          if (status.charge.ratedRangeKm === null) status.charge.ratedRangeKm = status.charge.estimatedRangeKm
          mapped = true
        }
        break
      }
      case 'IdealBatteryRange': {
        const value = toNumber(rawValue)
        if (value !== null) {
          status.charge.idealRangeKm = value
          mapped = true
        }
        break
      }
      case 'VehicleSpeed': {
        const value = toNumber(rawValue)
        if (value !== null) {
          status.drive.speedKmh = value
          mapped = true
        }
        break
      }
      case 'Gear': {
        status.drive.shiftState = parseShift(rawValue)
        mapped = true
        break
      }
      case 'ChargeLimitSoc': {
        const value = toNumber(rawValue)
        if (value !== null) {
          status.charge.chargeLimitPercent = value
          mapped = true
        }
        break
      }
      case 'Location': {
        const value = parseLocation(rawValue)
        if (value) {
          status.drive.latitude = value.latitude
          status.drive.longitude = value.longitude
          if (value.heading !== null) status.drive.heading = value.heading
          mapped = true
        }
        break
      }
      case 'GpsHeading': {
        const value = toNumber(rawValue)
        if (value !== null) {
          status.drive.heading = value
          mapped = true
        }
        break
      }
      case 'Odometer': {
        const value = toNumber(rawValue)
        if (value !== null) {
          status.state.rawOdometer = value
          status.state.odometerKm = value
          mapped = true
        }
        break
      }
      case 'PackVoltage': {
        const value = toNumber(rawValue)
        if (value !== null) {
          status.drive.packVoltageV = value
          updatePackPower(status)
          mapped = true
        }
        break
      }
      case 'PackCurrent': {
        const value = toNumber(rawValue)
        if (value !== null) {
          status.drive.packCurrentA = value
          updatePackPower(status)
          mapped = true
        }
        break
      }
      case 'DetailedChargeState': {
        const value = toStringValue(rawValue)?.replace(/^DetailedChargeState/i, '')
        if (value) {
          status.charge.chargingConnection = normalizeChargingConnection(value)
          mapped = true
        }
        break
      }
      case 'FastChargerPresent': {
        const value = toBoolean(rawValue)
        if (value !== null) {
          status.charge.fastChargerPresent = value
          mapped = true
        }
        break
      }
      case 'FastChargerType': {
        const value = toStringValue(rawValue)
        if (value) {
          status.charge.fastChargerType = value
          mapped = true
        }
        break
      }
      case 'NotEnoughPowerToHeat': {
        const value = toBoolean(rawValue)
        if (value !== null) {
          status.charge.notEnoughPowerToHeat = value
          mapped = true
        }
        break
      }
      case 'ChargerVoltage': {
        const value = toNumber(rawValue)
        if (value !== null) {
          status.charge.chargerVoltage = value
          mapped = true
        }
        break
      }
      case 'ChargeAmps': {
        const value = toNumber(rawValue)
        if (value !== null) {
          status.charge.chargerActualCurrentA = value
          mapped = true
        }
        break
      }
      case 'ACChargingPower':
      case 'DCChargingPower': {
        const value = toNumber(rawValue)
        if (value !== null) {
          status.charge.chargerPowerKw = value
          mapped = true
        }
        break
      }
      case 'InsideTemp': {
        const value = toNumber(rawValue)
        if (value !== null) {
          status.climate.insideTempC = Math.round(value * 10) / 10
          mapped = true
        }
        break
      }
      case 'OutsideTemp': {
        const value = toNumber(rawValue)
        if (value !== null) {
          status.climate.outsideTempC = Math.round(value * 10) / 10
          mapped = true
        }
        break
      }
      case 'DoorState': {
        mapped = applyDoorState(status, rawValue)
        break
      }
      case 'Locked': {
        const value = toBoolean(rawValue)
        if (value !== null) {
          status.state.locked = value
          mapped = true
        }
        break
      }
      case 'ChargePortDoorOpen': {
        const value = toBoolean(rawValue)
        if (value !== null) {
          status.charge.chargePortOpen = value
          status.charge.chargeDoorOpen = value
          mapped = true
        }
        break
      }
      case 'TpmsPressureFl': {
        mapped = applyTpms(status, 'frontLeft', rawValue)
        break
      }
      case 'TpmsPressureFr': {
        mapped = applyTpms(status, 'frontRight', rawValue)
        break
      }
      case 'TpmsPressureRl': {
        mapped = applyTpms(status, 'rearLeft', rawValue)
        break
      }
      case 'TpmsPressureRr': {
        mapped = applyTpms(status, 'rearRight', rawValue)
        break
      }
      default:
        break
    }
    if (mapped) mappedFields.push(field)
  }

  status.drive.timestamp = observedMs
  status.charge.timestamp = observedMs
  status.climate.timestamp = observedMs
  status.state.timestamp = observedMs
  status.presence = derivePresence(status.connectivity, status.charge, status.drive)
  status.completeness = Math.max(status.completeness ?? 0, estimateCompleteness(status))
  return { status, collectedAt: observedAt, fields, mappedFields }
}

function txidFor(record: TelemetryLogRecord, fields: string[], collectedAt: string, vin: string): string {
  return record.metadata?.txid ?? `${vin}:${collectedAt}:${fields.join(',') || 'unknown'}`
}

async function insertRawEvent(input: {
  row: VehicleRow
  vin: string
  record: TelemetryLogRecord
  txid: string
  fieldNames: string[]
  collectedAt: string
}): Promise<'inserted' | 'duplicate'> {
  const supabase = getSupabaseAdmin()
  const receivedAt = parseTimestamp(input.record.metadata?.receivedat) ?? parseTimestamp(input.record.time) ?? input.collectedAt
  const { error } = await supabase.from('fleet_telemetry_events').insert({
    vehicle_id: input.row.id,
    owner_id: input.row.owner_id,
    vin: input.vin,
    txid: input.txid,
    txtype: input.record.metadata?.txtype ?? null,
    version: input.record.metadata?.version ?? null,
    device_client_version: input.record.metadata?.device_client_version ?? null,
    activity: Boolean(input.record.activity),
    is_resend: Boolean((input.record.data ?? {}).IsResend),
    primary_field: input.fieldNames[0] ?? null,
    field_names: input.fieldNames,
    observed_at: input.collectedAt,
    received_at: receivedAt,
    metadata: input.record.metadata ?? {},
    payload: input.record.data ?? {},
  })
  if (!error) return 'inserted'
  if (/duplicate key|unique/i.test(error.message ?? '')) return 'duplicate'
  throw new Error(`Failed to insert fleet telemetry event: ${error.message}`)
}

async function persistTelemetrySnapshot(row: VehicleRow, status: VehicleStatus, collectedAt: string) {
  const supabase = getSupabaseAdmin()
  const batteryLevel = status.charge.stateOfCharge === null ? null : Math.max(0, Math.min(100, Math.round(status.charge.stateOfCharge)))
  const { error } = await supabase.from('vehicle_states').insert({
    vehicle_id: row.id,
    provider_vehicle_id: row.provider_vehicle_id,
    state: status,
    battery_level: batteryLevel,
    range_km: status.charge.ratedRangeKm,
    presence: status.presence,
    odometer_km: status.state.odometerKm,
    latitude: status.drive.latitude,
    longitude: status.drive.longitude,
    speed_kmh: status.drive.speedKmh,
    power_kw: status.drive.powerKw,
    collected_at: collectedAt,
  })
  if (error) throw new Error(`Failed to save telemetry snapshot: ${error.message}`)
  await supabase.from('vehicles').update({ last_seen_at: collectedAt, last_collected_at: collectedAt }).eq('id', row.id)
  await supabase.from('collection_events').insert({
    vehicle_id: row.id,
    owner_id: row.owner_id,
    outcome: 'success',
    reason: 'fleet_telemetry_ingested',
  })
}

async function refreshDerivedHistory(row: VehicleRow) {
  const bundle = await readHistory(row.id, '30d')
  await persistDerivedHistory({ vehicleId: row.id, ownerId: row.owner_id, bundle })
}

export class FleetTelemetryIngester {
  private readonly vehiclesByVin = new Map<string, VehicleRow>()
  private readonly cache = new Map<string, VehicleCacheEntry>()

  async refreshVehicles() {
    const rows = await listAllVehicleRows()
    this.vehiclesByVin.clear()
    for (const row of rows) {
      if (row.vin) this.vehiclesByVin.set(row.vin, row)
    }
  }

  private async ensureVehicle(vin: string): Promise<VehicleRow | null> {
    let row = this.vehiclesByVin.get(vin) ?? null
    if (row) return row
    await this.refreshVehicles()
    row = this.vehiclesByVin.get(vin) ?? null
    return row
  }

  private async ensureCache(row: VehicleRow): Promise<VehicleCacheEntry> {
    const cached = this.cache.get(row.id)
    if (cached) return cached
    const latest = await newestSnapshot(row.id)
    const entry: VehicleCacheEntry = {
      row,
      status: latest?.state ? structuredClone(latest.state) : emptyVehicleStatus(row),
      lastCollectedAt: latest?.collected_at ?? null,
    }
    this.cache.set(row.id, entry)
    return entry
  }

  async ingestLine(line: string): Promise<TelemetryIngestResult> {
    const record = parseTelemetryLogLine(line)
    if (!record) return { kind: 'ignored' }

    const vin = record.vin ?? record.metadata?.vin ?? toStringValue(record.data?.Vin)
    if (!vin) return { kind: 'ignored' }

    const row = await this.ensureVehicle(vin)
    if (!row) return { kind: 'unknown_vehicle', vin }

    const entry = await this.ensureCache(row)
    const applied = applyTelemetryRecord(entry.status, record, row)
    const txid = txidFor(record, applied.fields, applied.collectedAt, vin)
    const inserted = await insertRawEvent({ row, vin, record, txid, fieldNames: applied.fields, collectedAt: applied.collectedAt })
    if (inserted === 'duplicate') return { kind: 'duplicate', vin, txid }

    try {
      await persistTelemetrySamples(getSupabaseAdmin(), { row, record, observedAt: applied.collectedAt })
    } catch {
      // Raw events remain authoritative; sample persistence can be replayed from them.
    }

    try {
      await persistTelemetryProgress(getSupabaseAdmin(), {
        vehicleId: row.id,
        txid,
        collectedAt: applied.collectedAt,
        mappedFields: applied.mappedFields,
      })
    } catch {
      // Progress metadata is non-critical; raw event and snapshot ingestion must continue.
    }

    if (applied.mappedFields.length > 0 && (!entry.lastCollectedAt || Date.parse(applied.collectedAt) >= Date.parse(entry.lastCollectedAt))) {
      await persistTelemetrySnapshot(row, applied.status, applied.collectedAt)
      entry.status = applied.status
      entry.lastCollectedAt = applied.collectedAt
      if (applied.mappedFields.some((field) => HISTORY_FIELDS.has(field))) {
        try {
          await refreshDerivedHistory(row)
          } catch (error) {
            // A history roll-up failure must not stop raw event or snapshot ingestion,
            // but it must be observable so derived trips are not silently lost.
            console.error('[telemetry] derived history refresh failed', error instanceof Error ? error.message : error)
        }
      }
    }

    return {
      kind: 'ingested',
      vin,
      txid,
      collectedAt: applied.collectedAt,
      fields: applied.fields,
      mappedFields: applied.mappedFields,
    }
  }
}

