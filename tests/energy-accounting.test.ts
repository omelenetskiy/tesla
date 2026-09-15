import { computeEnergyForSession, identifyLargeGaps } from '@/lib/energy/accounting'

describe('verified energy accounting', () => {
  it('integrates power and reports coverage without using SOC', () => {
    const result = computeEnergyForSession([
      { timestamp: '2026-09-15T10:00:00.000Z', powerKw: 10, activity: 'charging' },
      { timestamp: '2026-09-15T10:30:00.000Z', powerKw: 10, activity: 'charging' },
      { timestamp: '2026-09-15T11:00:00.000Z', powerKw: -4, activity: 'driving' },
    ], 30 * 60 * 1000)

    expect(result).toMatchObject({
      chargedKwh: 5,
      regeneratedKwh: 2,
      consumedDrivingKwh: null,
      consumedParkedKwh: null,
      verified: true,
      gapFlags: [],
      coverage: { gainsMs: 3_600_000, coveragePercent: 100 },
    })
  })

  it('estimates power from voltage and current', () => {
    const result = computeEnergyForSession([
      { timestamp: 0, voltageV: 400, currentA: 25 },
      { timestamp: 60_000, voltageV: 400, currentA: 25 },
    ])

    expect(result?.chargedKwh).toBe(0.167)
  })

  it('rejects a session containing a large gap', () => {
    const samples = [
      { timestamp: 0, powerKw: 5 },
      { timestamp: 10 * 60_000, powerKw: 5 },
    ]

    expect(identifyLargeGaps(samples)).toHaveLength(1)
    expect(computeEnergyForSession(samples)).toBeNull()
  })

  it('rejects invalid voltage/current signs and magnitudes', () => {
    expect(computeEnergyForSession([
      { timestamp: 0, voltageV: -1, currentA: 1 },
      { timestamp: 1_000, voltageV: 400, currentA: 1 },
    ])).toBeNull()

    expect(computeEnergyForSession([
      { timestamp: 0, voltageV: 400, currentA: 1_001 },
      { timestamp: 1_000, voltageV: 400, currentA: 1 },
    ])).toBeNull()
  })
})


