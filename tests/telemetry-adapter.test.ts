import { calculateEnergyBySession, groupTelemetryPowerSamples, type TelemetrySessionSampleRow } from '@/lib/energy/telemetry-adapter'

const row = (
  sessionId: string,
  sessionType: TelemetrySessionSampleRow['session_type'],
  fieldName: string,
  numericValue: number,
  observedAt: string,
): TelemetrySessionSampleRow => ({
  session_id: sessionId,
  session_type: sessionType,
  field_name: fieldName,
  numeric_value: numericValue,
  observed_at: observedAt,
})

describe('telemetry session energy adapter', () => {
  it('coalesces power fields at the same observation time', () => {
    const groups = groupTelemetryPowerSamples([
      row('trip-1', 'trip', 'ChargerVoltage', 400, '2026-09-15T10:00:00.000Z'),
      row('trip-1', 'trip', 'ChargeAmps', 25, '2026-09-15T10:00:00.000Z'),
      row('trip-1', 'trip', 'power_kw', 10, '2026-09-15T10:00:00.000Z'),
    ])

    expect(groups.get('trip-1')?.samples).toEqual([{
      timestamp: '2026-09-15T10:00:00.000Z',
      activity: 'driving',
      powerKw: 10,
      voltageV: 400,
      currentA: 25,
    }])
  })

  it('keeps sessions isolated and computes each session separately', () => {
    const first = '2026-09-15T10:00:00.000Z'
    const second = '2026-09-15T10:01:00.000Z'
    const rows = [
      row('charge-1', 'charging', 'power_kw', 10, first),
      row('charge-1', 'charging', 'power_kw', 10, second),
      row('trip-1', 'trip', 'power_kw', 4, first),
      row('trip-1', 'trip', 'power_kw', 4, second),
    ]

    expect(calculateEnergyBySession(rows, 2 * 60 * 1000)).toEqual([
      expect.objectContaining({ sessionId: 'charge-1', sessionType: 'charging' }),
      expect.objectContaining({ sessionId: 'trip-1', sessionType: 'trip' }),
    ])
    expect(calculateEnergyBySession(rows, 2 * 60 * 1000).every((result) => result.accounting?.verified)).toBe(true)
  })

  it('returns an unverified result when persisted samples contain a gap', () => {
    const results = calculateEnergyBySession([
      row('trip-1', 'trip', 'power_kw', 4, '2026-09-15T10:00:00.000Z'),
      row('trip-1', 'trip', 'power_kw', 4, '2026-09-15T10:10:00.000Z'),
    ])

    expect(results[0].accounting).toBeNull()
  })
})

