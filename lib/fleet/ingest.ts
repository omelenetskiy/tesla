import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

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
}

interface IngestCheckpoint {
  vehicle_id: string
  last_processed_txid: string
  open_session_id: string | null
  session_start_time: string | null
}

// Main ingestion loop - runs 24/7 on VM
export async function runIngestionLoop() {
  console.log('🚀 Telemetry ingestion loop started')

  while (true) {
    try {
      // Get all vehicles to ingest for
      const { data: vehicles, error: vehiclesError } = await supabase
        .from('vehicles')
        .select('id, vehicle_id')

      if (vehiclesError) throw vehiclesError
      if (!vehicles || vehicles.length === 0) {
        console.log('⏳ No vehicles found, waiting...')
        await sleep(60000) // 1 minute
        continue
      }

      // Process each vehicle
      for (const vehicle of vehicles) {
        await processVehicleIngest(vehicle.id, vehicle.vehicle_id)
      }

      // Sleep briefly before next loop iteration
      await sleep(5000)
    } catch (error) {
      console.error('❌ Ingestion loop error:', error)
      await sleep(30000) // Error recovery: wait 30s before retry
    }
  }
}

async function processVehicleIngest(vehicleUuid: string, vehicleId: number) {
  try {
    // Get last checkpoint
    const { data: checkpoint } = await supabase
      .from('telemetry_ingest_checkpoints')
      .select('*')
      .eq('vehicle_id', vehicleUuid)
      .single()

    const lastTxid = checkpoint?.last_processed_txid || '0'
    const lastSessionId = checkpoint?.open_session_id

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

      // Detect session transitions (trip start/end, charging start/end)
      const sessionTransition = detectSessionTransition(event, currentSessionId)
      if (sessionTransition.newSession) {
        currentSessionId = sessionTransition.sessionId
      }

      // Record the sample
      await recordTelemetrySample({
        session_id: currentSessionId || crypto.randomUUID(),
        vehicle_id: vehicleUuid,
        signal_name: event.signal_name,
        value: event.value,
        unit: event.unit,
        timestamp_utc: event.timestamp_utc,
        observation_time: event.observation_time,
      })

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
      last_processed_txid: lastTxid, // Update to latest processed
      open_session_id: currentSessionId || null,
      session_start_time: currentSessionId ? new Date().toISOString() : null,
    })
  } catch (error) {
    console.error(`❌ Vehicle ${vehicleId} ingestion error:`, error)
  }
}

async function recordTelemetrySample(params: {
  session_id: string
  vehicle_id: string
  signal_name: string
  value: number | string | boolean | null
  unit: string
  timestamp_utc: string
  observation_time: string
}) {
  const { error } = await supabase
    .from('telemetry_session_samples')
    .insert({
      id: crypto.randomUUID(),
      session_id: params.session_id,
      vehicle_id: params.vehicle_id,
      signal_name: params.signal_name,
      value: params.value,
      unit: params.unit,
      timestamp_utc: params.timestamp_utc,
      observation_time: params.observation_time,
      receipt_time: new Date().toISOString(),
      created_at: new Date().toISOString(),
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
        signal_name: signalName,
        last_observed_at: timestamp.toISOString(),
        freshness_seconds: 0,
      },
      { onConflict: 'vehicle_id,signal_name' }
    )

  if (error) throw error
}

async function upsertIngestCheckpoint(checkpoint: IngestCheckpoint) {
  const { error } = await supabase
    .from('telemetry_ingest_checkpoints')
    .upsert(checkpoint, { onConflict: 'vehicle_id' })

  if (error) throw error
}

function detectSessionTransition(event: TelemetryEvent, currentSession: string | null) {
  const isCharging = event.signal_name === 'is_charging' && event.value === true
  const isSleeping = event.signal_name === 'is_sleeping' && event.value === true

  if (isCharging && !currentSession?.startsWith('charging-')) {
    return { newSession: true, sessionId: `charging-${Date.now()}` }
  }

  if (!isCharging && currentSession?.startsWith('charging-')) {
    return { newSession: true, sessionId: `trip-${Date.now()}` }
  }

  return { newSession: false, sessionId: currentSession }
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

