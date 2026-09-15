import { buildTelemetryProgressPlan, persistTelemetryProgress } from '@/lib/fleet/telemetry-progress'

describe('telemetry progress persistence', () => {
  const input = {
    vehicleId: 'vehicle-1',
    txid: 'event-1',
    collectedAt: '2026-09-15T10:00:00.000Z',
    mappedFields: ['Soc', 'VehicleSpeed', 'Soc', ''],
  }

  it('builds an idempotent checkpoint and deduplicated freshness plan', () => {
    expect(buildTelemetryProgressPlan(input)).toEqual({
      checkpoint: {
        vehicle_id_param: 'vehicle-1',
        checkpoint_type: 'fleet_event',
        checkpoint_key: 'event-1',
        checkpoint_state: {
          last_processed_txid: 'event-1',
          processed_at: '2026-09-15T10:00:00.000Z',
          observed_fields: ['Soc', 'VehicleSpeed'],
        },
      },
      freshness: [
        { vehicle_id_param: 'vehicle-1', field_name: 'Soc', observed_at_param: '2026-09-15T10:00:00.000Z' },
        { vehicle_id_param: 'vehicle-1', field_name: 'VehicleSpeed', observed_at_param: '2026-09-15T10:00:00.000Z' },
      ],
    })
  })

  it('persists checkpoint before freshness rows', async () => {
    const calls: Array<[string, Record<string, unknown>]> = []
    const rpc = async (name: string, args: Record<string, unknown>) => {
      calls.push([name, args])
      return { error: null }
    }
    const client = {
      rpc,
    }

    await persistTelemetryProgress(client, input)

    expect(calls.map(([name]) => name)).toEqual([
      'upsert_ingest_checkpoint',
      'update_field_freshness',
      'update_field_freshness',
    ])
    expect(calls[0][1]).toMatchObject({ checkpoint_key: 'event-1' })
  })

  it('stops and reports an RPC failure', async () => {
    const client = {
      rpc: jest.fn(async (name: string) => ({
        error: name === 'upsert_ingest_checkpoint' ? { message: 'not installed' } : null,
      })),
    }

    await expect(persistTelemetryProgress(client, input)).rejects.toThrow('not installed')
    expect(client.rpc).toHaveBeenCalledTimes(1)
  })
})


