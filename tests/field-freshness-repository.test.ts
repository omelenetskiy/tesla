import type { SupabaseClient } from '@supabase/supabase-js'
import { readFieldFreshness } from '@/lib/telemetry/field-freshness-repository'

function client(data: unknown[], error: { message?: string } | null = null) {
  const result = Promise.resolve({ data, error })
  const builder: any = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    then: result.then.bind(result),
  }
  return { from: jest.fn(() => builder) } as unknown as SupabaseClient
}

describe('readFieldFreshness', () => {
  it('filters by vehicle and calculates staleness without negative values', async () => {
    const result = await readFieldFreshness(
      { vehicleId: 'vehicle-1', limit: 2 },
      client([
        {
          vehicle_id: 'vehicle-1', field_name: 'battery_level', last_observed_at: '2026-09-15T11:59:00.000Z',
          last_update_at: '2026-09-15T11:59:30.000Z', reception_count: '3', unavailable_since: null,
        },
        {
          vehicle_id: 'other', field_name: 'speed_kmh', last_observed_at: '2026-09-15T11:00:00.000Z',
          last_update_at: null, reception_count: 1, unavailable_since: null,
        },
      ]),
      Date.parse('2026-09-15T12:00:00.000Z'),
    )

    expect(result).toEqual([expect.objectContaining({ fieldName: 'battery_level', receptionCount: 3, stalenessMinutes: 1 })])
  })

  it('normalizes limits and reports database failures', async () => {
    const mocked = client([], { message: 'permission denied' })
    await expect(readFieldFreshness({ vehicleId: 'vehicle-1', limit: 999 }, mocked)).rejects.toThrow('permission denied')
    expect(mocked.from).toHaveBeenCalledWith('telemetry_field_freshness')
  })

  it('rejects an empty vehicle id', async () => {
    await expect(readFieldFreshness({ vehicleId: ' ' }, client([]))).rejects.toThrow('vehicleId must not be empty')
  })
})



