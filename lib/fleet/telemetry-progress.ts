export type TelemetryProgressInput = {
  vehicleId: string
  txid: string
  collectedAt: string
  mappedFields: string[]
}

export type TelemetryCheckpointState = {
  last_processed_txid: string
  processed_at: string
  observed_fields: string[]
}

export type TelemetryProgressPlan = {
  checkpoint: {
    vehicle_id_param: string
    checkpoint_type: 'fleet_event'
    checkpoint_key: string
    checkpoint_state: TelemetryCheckpointState
  }
  freshness: Array<{
    vehicle_id_param: string
    field_name: string
    observed_at_param: string
  }>
}

/**
 * Builds deterministic RPC payloads for the non-critical Phase 2 progress data.
 * The helper is intentionally pure so replay and idempotency can be tested without Supabase.
 */
export function buildTelemetryProgressPlan(input: TelemetryProgressInput): TelemetryProgressPlan {
  const mappedFields = input.mappedFields.filter((field, index, fields) => (
    field.trim().length > 0 && fields.indexOf(field) === index
  ))

  return {
    checkpoint: {
      vehicle_id_param: input.vehicleId,
      checkpoint_type: 'fleet_event',
      checkpoint_key: input.txid,
      checkpoint_state: {
        last_processed_txid: input.txid,
        processed_at: input.collectedAt,
        observed_fields: mappedFields,
      },
    },
    freshness: mappedFields.map((field) => ({
      vehicle_id_param: input.vehicleId,
      field_name: field,
      observed_at_param: input.collectedAt,
    })),
  }
}

type RpcClient = {
  rpc: (
    ...args: any[]
  ) => PromiseLike<{ error: { message?: string } | null }>
}

/**
 * Persists checkpoint and field freshness through migration 010 RPCs.
 * Callers should treat this as best-effort because raw event ingestion is authoritative.
 */
export async function persistTelemetryProgress(
  client: RpcClient,
  input: TelemetryProgressInput,
): Promise<void> {
  const plan = buildTelemetryProgressPlan(input)
  const checkpointResult = await client.rpc('upsert_ingest_checkpoint', plan.checkpoint)
  if (checkpointResult.error) {
    throw new Error(`Failed to persist telemetry checkpoint: ${checkpointResult.error.message ?? 'unknown error'}`)
  }

  for (const freshness of plan.freshness) {
    const freshnessResult = await client.rpc('update_field_freshness', freshness)
    if (freshnessResult.error) {
      throw new Error(`Failed to persist field freshness: ${freshnessResult.error.message ?? 'unknown error'}`)
    }
  }
}



