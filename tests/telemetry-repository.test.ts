import type { SupabaseClient } from '@supabase/supabase-js'
import { readSessionEnergy } from '@/lib/energy/telemetry-repository'

function mockClient(data: unknown[], error: { message: string } | null = null): SupabaseClient {
  const filters: Array<[string, string, string]> = []
  const result = Promise.resolve({ data, error })
  const builder = {
    select: () => builder,
    eq: (column: string, value: string) => {
      filters.push(['eq', column, value])
      return builder
    },
    gte: (column: string, value: string) => {
      filters.push(['gte', column, value])
      return builder
    },
    lt: (column: string, value: string) => {
      filters.push(['lt', column, value])
      return builder
    },
    order: () => builder,
    then: result.then.bind(result),
  }

  return {
    from: jest.fn(() => builder),
    __filters: filters,
  } as unknown as SupabaseClient
}

const query = {
  ownerId: 'owner-1',
  vehicleId: 'vehicle-1',
  from: '2026-09-15T10:00:00.000Z',
  to: '2026-09-15T11:00:00.000Z',
  maxGapMs: 30 * 60 * 1000,
}

describe('telemetry repository', () => {
  it('filters by owner and vehicle, normalizes numeric values, and calculates per-session coverage', async () => {
    const client = mockClient([
      { owner_id: 'owner-1', vehicle_id: 'vehicle-1', session_id: 'charge-1', session_type: 'charging', field_name: 'ChargerVoltage', numeric_value: '400', observed_at: '2026-09-15T10:00:00.000Z' },
      { owner_id: 'owner-1', vehicle_id: 'vehicle-1', session_id: 'charge-1', session_type: 'charging', field_name: 'ChargeAmps', numeric_value: 25, observed_at: '2026-09-15T10:00:00.000Z' },
      { owner_id: 'owner-1', vehicle_id: 'vehicle-1', session_id: 'charge-1', session_type: 'charging', field_name: 'ChargerVoltage', numeric_value: 400, observed_at: '2026-09-15T10:30:00.000Z' },
      { owner_id: 'owner-1', vehicle_id: 'vehicle-1', session_id: 'charge-1', session_type: 'charging', field_name: 'ChargeAmps', numeric_value: 25, observed_at: '2026-09-15T10:30:00.000Z' },
      { owner_id: 'other-owner', vehicle_id: 'vehicle-1', session_id: 'charge-1', session_type: 'charging', field_name: 'power_kw', numeric_value: 10, observed_at: '2026-09-15T10:30:00.000Z' },
      { owner_id: 'owner-1', vehicle_id: 'vehicle-1', session_id: 'charge-1', session_type: 'charging', field_name: 'power_kw', numeric_value: 'not-a-number', observed_at: 'not-a-date' },
    ])

    const results = await readSessionEnergy(query, client)

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      sessionId: 'charge-1',
      sessionType: 'charging',
      ownerId: 'owner-1',
      vehicleId: 'vehicle-1',
      sampleCount: 4,
      calculationMethod: 'measured_power_integration',
      coveragePercent: 100,
    })
    expect(results[0].accounting?.chargedKwh).toBe(5)
  })

  it('keeps sessions separate and leaves large-gap energy unverified', async () => {
    const client = mockClient([
      { owner_id: 'owner-1', vehicle_id: 'vehicle-1', session_id: 'trip-1', session_type: 'trip', field_name: 'power_kw', numeric_value: 10, observed_at: '2026-09-15T10:00:00.000Z' },
      { owner_id: 'owner-1', vehicle_id: 'vehicle-1', session_id: 'trip-1', session_type: 'trip', field_name: 'power_kw', numeric_value: 10, observed_at: '2026-09-15T10:31:00.000Z' },
      { owner_id: 'owner-1', vehicle_id: 'vehicle-1', session_id: 'park-1', session_type: 'parked', field_name: 'power_kw', numeric_value: -1, observed_at: '2026-09-15T10:00:00.000Z' },
      { owner_id: 'owner-1', vehicle_id: 'vehicle-1', session_id: 'park-1', session_type: 'parked', field_name: 'power_kw', numeric_value: -1, observed_at: '2026-09-15T10:01:00.000Z' },
    ])

    const results = await readSessionEnergy({ ...query, maxGapMs: 5 * 60 * 1000 }, client)

    expect(results.map((result) => result.sessionId)).toEqual(expect.arrayContaining(['park-1', 'trip-1']))
    expect(results.find((result) => result.sessionId === 'trip-1')?.accounting).toBeNull()
    expect(results.find((result) => result.sessionId === 'park-1')?.accounting?.consumedParkedKwh).toBeNull()
  })

  it('surfaces database errors and rejects empty ownership filters', async () => {
    await expect(readSessionEnergy({ ...query, ownerId: '' }, mockClient([]))).rejects.toThrow('ownerId must not be empty')
    await expect(readSessionEnergy(query, mockClient([], { message: 'permission denied' }))).rejects.toThrow('permission denied')
  })
})


