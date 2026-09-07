import { NextResponse } from 'next/server'
import { decryptSecret } from '@/lib/crypto'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getTeslaVehicle, getTeslaVehicles } from '@/lib/tesla-api'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization')
  if (!process.env.COLLECTION_CRON_SECRET || authorization !== `Bearer ${process.env.COLLECTION_CRON_SECRET}`) {
    return NextResponse.json({ message: 'Invalid collection credential' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const { data: vehicleRecords, error } = await supabase.from('vehicles').select('id, owner_id, provider_vehicle_id').eq('is_active', true)
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })

  const results: Array<{ vehicleId: string; outcome: string; reason: string }> = []
  for (const vehicle of vehicleRecords ?? []) {
    try {
      const { data: credential } = await supabase.from('vehicle_credentials').select('access_token_ciphertext').eq('vehicle_id', vehicle.id).single()
      if (!credential) {
        results.push({ vehicleId: vehicle.id, outcome: 'skipped', reason: 'owner_api_not_connected' })
        continue
      }
      const accessToken = decryptSecret(credential.access_token_ciphertext)
      const providerVehicles = await getTeslaVehicles(accessToken)
      const providerVehicle = providerVehicles.find((item) => String(item.id) === vehicle.provider_vehicle_id || String(item.vehicle_id) === vehicle.provider_vehicle_id)
      if (!providerVehicle || providerVehicle.state !== 'online') {
        const reason = providerVehicle ? 'vehicle_sleeping_or_offline' : 'vehicle_not_found'
        await supabase.from('collection_events').insert({ vehicle_id: vehicle.id, owner_id: vehicle.owner_id, outcome: 'skipped', reason })
        results.push({ vehicleId: vehicle.id, outcome: 'skipped', reason })
        continue
      }
      const snapshot = await getTeslaVehicle(accessToken, vehicle.provider_vehicle_id)
      await supabase.from('vehicle_states').insert({ vehicle_id: vehicle.id, provider_vehicle_id: vehicle.provider_vehicle_id, state: snapshot })
      await supabase.from('collection_events').insert({ vehicle_id: vehicle.id, owner_id: vehicle.owner_id, outcome: 'success', reason: 'vehicle_online' })
      results.push({ vehicleId: vehicle.id, outcome: 'success', reason: 'vehicle_online' })
    } catch (collectionError) {
      const reason = collectionError instanceof Error ? collectionError.message : 'collection_failed'
      await supabase.from('collection_events').insert({ vehicle_id: vehicle.id, owner_id: vehicle.owner_id, outcome: 'failed', reason })
      results.push({ vehicleId: vehicle.id, outcome: 'failed', reason })
    }
  }

  return NextResponse.json({ collectedAt: new Date().toISOString(), results })
}
