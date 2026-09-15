import { validateChargingSession, validateTrip, validateTripsArray } from '@/lib/tesla/validators'

const trip = {
  id: 'trip-1', vehicleId: 'vehicle-1', startedAt: '2026-09-15T10:00:00.000Z', endedAt: null,
  distanceKm: 12, durationMinutes: 20, averageSpeedKmh: 36, maxSpeedKmh: 70, energyUsedKwh: null,
  efficiencyWhPerKm: null, batteryStartPercent: 80, batteryEndPercent: 76, odometerStartKm: null,
  odometerEndKm: null, startLocation: null, endLocation: null, route: [[55.7, 37.6]], name: null,
  phase: 'outbound', partial: false, confidence: 'gps_route',
}

const charging = {
  id: 'charge-1', vehicleId: 'vehicle-1', startedAt: '2026-09-15T11:00:00.000Z', endedAt: null,
  durationMinutes: null, energyAddedKwh: 4.5, addedRangeKm: null, batteryStartPercent: 40,
  batteryEndPercent: 50, averagePowerKw: 8, peakPowerKw: 11, location: null, locationLabel: null,
  chargerType: 'L2', fastCharger: false, completed: false, confidence: 'snapshot_gap',
}

describe('telemetry data validators', () => {
  it('accepts complete trip data without inventing nullable values', () => {
    expect(validateTrip(trip)).toEqual(trip)
    expect(validateTripsArray([trip])).toHaveLength(1)
  })

  it('accepts charging sessions and rejects invalid confidence', () => {
    expect(validateChargingSession(charging)).toEqual(charging)
    expect(() => validateChargingSession({ ...charging, confidence: 'estimated' })).toThrow('confidence is invalid')
  })

  it('rejects malformed dates, routes, and arrays', () => {
    expect(() => validateTrip({ ...trip, startedAt: 'not-a-date' })).toThrow('ISO date')
    expect(() => validateTrip({ ...trip, route: [[55.7]] })).toThrow('coordinate pairs')
    expect(() => validateTripsArray(null)).toThrow('must be an array')
  })
})

