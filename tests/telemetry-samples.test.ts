import { buildTelemetrySamplePlan, persistTelemetrySamples } from '@/lib/fleet/telemetry-samples'

const base = {
  row: { id: 'vehicle-1', owner_id: 'owner-1' },
  observedAt: '2026-09-15T10:00:00.000Z',
}

describe('telemetry session sample writer', () => {
  it('does not infer a session when explicit context is absent', () => {
    expect(buildTelemetrySamplePlan({
      ...base,
      record: { data: { Soc: 72, ChargerVoltage: 400 } },
    })).toEqual([])
  })

  it('maps measured fields into an explicit charging session', () => {
    const plan = buildTelemetrySamplePlan({
      ...base,
      record: {
        metadata: { session_id: 'charge-1', session_type: 'charging' },
        data: { Soc: 72, ChargerVoltage: 400, ChargeAmps: 25, DetailedChargeState: 'Charging' },
      },
    })

    expect(plan).toEqual([
      expect.objectContaining({ session_id: 'charge-1', session_type: 'charging', field_name: 'battery_level', numeric_value: 72 }),
      expect.objectContaining({ field_name: 'voltage', numeric_value: 400 }),
      expect.objectContaining({ field_name: 'current', numeric_value: 25 }),
      expect.objectContaining({ field_name: 'charge_state', numeric_value: null, text_value: 'Charging' }),
    ])
  })

  it('writes each planned sample through the idempotent RPC and reports count', async () => {
    const calls: unknown[][] = []
    const client = {
      rpc: jest.fn((...args: unknown[]) => {
        calls.push(args)
        return Promise.resolve({ error: null })
      }),
    }

    const count = await persistTelemetrySamples(client, {
      ...base,
      record: {
        metadata: { session_id: 'trip-1', session_type: 'trip' },
        data: { VehicleSpeed: 45, Power: -12 },
      },
    })

    expect(count).toBe(2)
    expect(client.rpc).toHaveBeenCalledTimes(2)
    expect(calls[0]).toEqual(['record_telemetry_sample', expect.objectContaining({ vehicle_id_param: 'vehicle-1', owner_id_param: 'owner-1' })])
  })

  it('stops and reports the first RPC failure', async () => {
    const client = {
      rpc: jest.fn(() => Promise.resolve({ error: { message: 'database unavailable' } })),
    }

    await expect(persistTelemetrySamples(client, {
      ...base,
      record: { metadata: { session_id: 'park-1', session_type: 'parked' }, data: { Power: -1 } },
    })).rejects.toThrow('database unavailable')
    expect(client.rpc).toHaveBeenCalledTimes(1)
  })
})
