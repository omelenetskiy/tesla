import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

interface TelemetryEvent {
  txid: string
  vehicle_id: string
  signal_name: string
  value: number | string | boolean | null
  unit: string
  timestamp_utc: string
  observation_time: string
  session_id?: string
  session_type?: 'trip' | 'charging' | 'parked'
}

interface IngestCheckpoint {
  vehicle_id: string
  checkpoint_type: 'fleet_event'
  checkpoint_key: string
  checkpoint_state: {
    last_processed_txid: string
    open_session_id: string | null
    session_start_time: string | null
  }
}

// Main ingestion loop - runs 24/7 on VM
export async function runIngestionLoop() {
  console.log('🚀 Telemetry ingestion loop started')

  while (true) {
    try {
      // Get all vehicles to ingest for
      const { data: vehicles, error: vehiclesError } = await supabase
        .from('vehicles')
        .select('id, vehicle_id, owner_id')

      if (vehiclesError) throw vehiclesError
      if (!vehicles || vehicles.length === 0) {
        console.log('⏳ No vehicles found, waiting...')
        await sleep(60000) // 1 minute
        continue
      }

      // Process each vehicle
      for (const vehicle of vehicles) {
        await processVehicleIngest(vehicle.id, vehicle.vehicle_id, vehicle.owner_id)
      }

      // Sleep briefly before next loop iteration
      await sleep(5000)
    } catch (error) {
      console.error('❌ Ingestion loop error:', error)
      await sleep(30000) // Error recovery: wait 30s before retry
    }
  }
}

async function processVehicleIngest(vehicleUuid: string, vehicleId: number, ownerId: string) {
  try {
    // Get last checkpoint
    const { data: checkpoint } = await supabase
      .from('telemetry_ingest_checkpoints')
      .select('*')
      .eq('vehicle_id', vehicleUuid)
      .eq('checkpoint_type', 'fleet_event')
      .eq('checkpoint_key', 'default')
      .single()

    const checkpointState = checkpoint?.checkpoint_state as IngestCheckpoint['checkpoint_state'] | undefined
    const lastTxid = checkpointState?.last_processed_txid || '0'
    const lastSessionId = checkpointState?.open_session_id ?? null

    // Fetch new events from Fleet API (starting after last_processed_txid)
    const newEvents = await fetchFleetTelemetry(vehicleId, lastTxid)

    if (newEvents.length === 0) return // No new data

    // Process each event (idempotent - handles duplicates)
    const processedTxids = new Set<string>()
    let currentSessionId = lastSessionId

    for (const event of newEvents) {
      // Skip if already processed
      if (processedTxids.has(event.txid)) continue
      processedTxids.add(event.txid)

      // Never infer a session from an individual signal. Samples require
      // explicit context from the upstream telemetry payload.
      if (event.session_id?.trim() && event.session_type) {
        currentSessionId = event.session_id.trim()
        await recordTelemetrySample({
          session_id: currentSessionId,
          session_type: event.session_type,
          vehicle_id: vehicleUuid,
          owner_id: ownerId,
          signal_name: event.signal_name,
          value: event.value,
          unit: event.unit,
          timestamp_utc: event.timestamp_utc,
          observation_time: event.observation_time,
        })
      }

      // Update field freshness
      await updateFieldFreshness(
        vehicleUuid,
        event.signal_name,
        new Date(event.timestamp_utc)
      )
    }

    // Update checkpoint for next iteration
    await upsertIngestCheckpoint({
      vehicle_id: vehicleUuid,
      checkpoint_type: 'fleet_event',
      checkpoint_key: 'default',
      checkpoint_state: {
        last_processed_txid: newEvents.at(-1)?.txid ?? lastTxid,
        open_session_id: currentSessionId || null,
        session_start_time: currentSessionId ? new Date().toISOString() : null,
      },
    })
  } catch (error) {
    console.error(`❌ Vehicle ${vehicleId} ingestion error:`, error)
  }
}

async function recordTelemetrySample(params: {
  session_id: string
  session_type: 'trip' | 'charging' | 'parked'
  vehicle_id: string
  owner_id: string
  signal_name: string
  value: number | string | boolean | null
  unit: string
  timestamp_utc: string
  observation_time: string
}) {
  const { error } = await supabase
    .from('telemetry_session_samples')
    .insert({
      session_id: params.session_id,
      session_type: params.session_type,
      vehicle_id: params.vehicle_id,
      owner_id: params.owner_id,
      field_name: params.signal_name,
      numeric_value: typeof params.value === 'number' && Number.isFinite(params.value) ? params.value : null,
      text_value: typeof params.value === 'string' || typeof params.value === 'boolean' ? String(params.value) : null,
      observed_at: params.observation_time || params.timestamp_utc,
    })

  if (error && !error.message.includes('duplicate')) throw error
}

async function updateFieldFreshness(
  vehicleId: string,
  signalName: string,
  timestamp: Date
) {
  const { error } = await supabase
    .from('telemetry_field_freshness')
    .upsert(
      {
        vehicle_id: vehicleId,
        field_name: signalName,
        last_observed_at: timestamp.toISOString(),
      },
      { onConflict: 'vehicle_id,field_name' }
    )

  if (error) throw error
}

async function upsertIngestCheckpoint(checkpoint: IngestCheckpoint) {
  const { error } = await supabase
    .from('telemetry_ingest_checkpoints')
    .upsert(checkpoint, { onConflict: 'vehicle_id,checkpoint_type,checkpoint_key' })

  if (error) throw error
}


async function fetchFleetTelemetry(vehicleId: number, lastTxid: string): Promise<TelemetryEvent[]> {
  // This would call actual Tesla Fleet API
  // For now, return empty to avoid API calls in test
  return []
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export { recordTelemetrySample, updateFieldFreshness, upsertIngestCheckpoint }

