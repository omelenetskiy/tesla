import type { ChargingSession, Trip, VehicleLocation } from './models'

const TRIP_CONFIDENCE = new Set<Trip['confidence']>(['gps_route', 'odometer_delta', 'snapshot_gap'])
const CHARGING_CONFIDENCE = new Set<ChargingSession['confidence']>(['gps_route', 'snapshot_gap'])

function isTripConfidence(value: unknown): value is Trip['confidence'] {
  return typeof value === 'string' && TRIP_CONFIDENCE.has(value as Trip['confidence'])
}

function isChargingConfidence(value: unknown): value is ChargingSession['confidence'] {
  return typeof value === 'string' && CHARGING_CONFIDENCE.has(value as ChargingSession['confidence'])
}

function objectValue(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object.`)
  return value as Record<string, unknown>
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be a non-empty string.`)
  return value
}

function nullableString(value: unknown, name: string): string | null {
  if (value === null) return null
  return requiredString(value, name)
}

function nullableNumber(value: unknown, name: string): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be a finite number or null.`)
  return value
}

function nullableLocation(value: unknown, name: string): VehicleLocation | null {
  if (value === null) return null
  const location = objectValue(value, name)
  const latitude = nullableNumber(location.latitude, `${name}.latitude`)
  const longitude = nullableNumber(location.longitude, `${name}.longitude`)
  if (latitude === null || longitude === null) throw new Error(`${name} must include latitude and longitude.`)
  if (location.source !== 'live' && location.source !== 'last_known') throw new Error(`${name}.source is invalid.`)
  return {
    latitude,
    longitude,
    heading: nullableNumber(location.heading, `${name}.heading`),
    source: location.source,
    accuracy: nullableNumber(location.accuracy, `${name}.accuracy`),
  }
}

function isoDate(value: unknown, name: string): string {
  const date = requiredString(value, name)
  if (!Number.isFinite(Date.parse(date))) throw new Error(`${name} must be an ISO date.`)
  return date
}

export function validateTrip(value: unknown): Trip {
  const row = objectValue(value, 'trip')
  const confidence = row.confidence
  if (!isTripConfidence(confidence)) throw new Error('trip.confidence is invalid.')
  if (typeof row.partial !== 'boolean') throw new Error('trip.partial must be a boolean.')
  if (!Array.isArray(row.route) || !row.route.every((point) => Array.isArray(point) && point.length === 2 && point.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate)))) {
    throw new Error('trip.route must contain numeric coordinate pairs.')
  }
  return {
    id: requiredString(row.id, 'trip.id'),
    vehicleId: requiredString(row.vehicleId, 'trip.vehicleId'),
    startedAt: isoDate(row.startedAt, 'trip.startedAt'),
    endedAt: row.endedAt === null ? null : isoDate(row.endedAt, 'trip.endedAt'),
    distanceKm: nullableNumber(row.distanceKm, 'trip.distanceKm'),
    durationMinutes: nullableNumber(row.durationMinutes, 'trip.durationMinutes'),
    averageSpeedKmh: nullableNumber(row.averageSpeedKmh, 'trip.averageSpeedKmh'),
    maxSpeedKmh: nullableNumber(row.maxSpeedKmh, 'trip.maxSpeedKmh'),
    energyUsedKwh: nullableNumber(row.energyUsedKwh, 'trip.energyUsedKwh'),
    efficiencyWhPerKm: nullableNumber(row.efficiencyWhPerKm, 'trip.efficiencyWhPerKm'),
    batteryStartPercent: nullableNumber(row.batteryStartPercent, 'trip.batteryStartPercent'),
    batteryEndPercent: nullableNumber(row.batteryEndPercent, 'trip.batteryEndPercent'),
    odometerStartKm: nullableNumber(row.odometerStartKm, 'trip.odometerStartKm'),
    odometerEndKm: nullableNumber(row.odometerEndKm, 'trip.odometerEndKm'),
    startLocation: nullableLocation(row.startLocation, 'trip.startLocation'),
    endLocation: nullableLocation(row.endLocation, 'trip.endLocation'),
    route: row.route as Array<[number, number]>,
    name: nullableString(row.name, 'trip.name'),
    phase: row.phase === 'outbound' || row.phase === 'return_home' || row.phase === 'unknown' ? row.phase : (() => { throw new Error('trip.phase is invalid.') })(),
    partial: row.partial,
    confidence,
  }
}

export function validateChargingSession(value: unknown): ChargingSession {
  const row = objectValue(value, 'charging session')
  const confidence = row.confidence
  if (!isChargingConfidence(confidence)) throw new Error('charging session.confidence is invalid.')
  if (typeof row.completed !== 'boolean') throw new Error('charging session.completed must be a boolean.')
  return {
    id: requiredString(row.id, 'charging session.id'),
    vehicleId: requiredString(row.vehicleId, 'charging session.vehicleId'),
    startedAt: isoDate(row.startedAt, 'charging session.startedAt'),
    endedAt: row.endedAt === null ? null : isoDate(row.endedAt, 'charging session.endedAt'),
    durationMinutes: nullableNumber(row.durationMinutes, 'charging session.durationMinutes'),
    energyAddedKwh: nullableNumber(row.energyAddedKwh, 'charging session.energyAddedKwh'),
    addedRangeKm: nullableNumber(row.addedRangeKm, 'charging session.addedRangeKm'),
    batteryStartPercent: nullableNumber(row.batteryStartPercent, 'charging session.batteryStartPercent'),
    batteryEndPercent: nullableNumber(row.batteryEndPercent, 'charging session.batteryEndPercent'),
    averagePowerKw: nullableNumber(row.averagePowerKw, 'charging session.averagePowerKw'),
    peakPowerKw: nullableNumber(row.peakPowerKw, 'charging session.peakPowerKw'),
    location: nullableLocation(row.location, 'charging session.location'),
    locationLabel: nullableString(row.locationLabel, 'charging session.locationLabel'),
    chargerType: nullableString(row.chargerType, 'charging session.chargerType'),
    fastCharger: row.fastCharger === null ? null : typeof row.fastCharger === 'boolean' ? row.fastCharger : (() => { throw new Error('charging session.fastCharger must be a boolean or null.') })(),
    completed: row.completed,
    confidence,
  }
}

export function validateTripsArray(value: unknown): Trip[] {
  if (!Array.isArray(value)) throw new Error('trips must be an array.')
  return value.map(validateTrip)
}


