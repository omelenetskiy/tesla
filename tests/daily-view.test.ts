import { localDateKey, summarizeTrips } from '@/lib/utils/daily'

describe('daily view helpers', () => {
  it('groups a timestamp by the requested timezone', () => {
    expect(localDateKey('2026-09-15T00:30:00.000Z', 'America/Los_Angeles')).toBe('2026-09-14')
  })

  it('summarizes only available trip measurements', () => {
    const summary = summarizeTrips([
      { distanceKm: 2, energyUsedKwh: 0.4, efficiencyWhPerKm: 200, maxSpeedKmh: 40 },
      { distanceKm: null, energyUsedKwh: null, efficiencyWhPerKm: null, maxSpeedKmh: null },
    ] as never)

    expect(summary).toEqual({
      tripCount: 2,
      distanceKm: 2,
      energyUsedKwh: 0.4,
      efficiencyWhPerKm: 200,
      maxSpeedKmh: 40,
    })
  })
})

