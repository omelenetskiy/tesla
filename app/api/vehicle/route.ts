import { NextResponse } from 'next/server'
import { getTeslaVehicle } from '@/lib/tesla-api'
import { decryptSecret } from '@/lib/crypto'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Authentication required' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const { data: vehicleRecord, error: vehicleError } = await supabase.from('vehicles').select('id, provider_vehicle_id').eq('owner_id', user.id).eq('is_active', true).order('created_at').limit(1).maybeSingle()
  if (vehicleError) return NextResponse.json({ message: vehicleError.message }, { status: 500 })
  if (!vehicleRecord) return NextResponse.json({ message: 'Connect a Tesla vehicle before loading telemetry' }, { status: 404 })

  const url = new URL(request.url)
  const fresh = url.searchParams.get('fresh') === 'true'
  const allowWake = url.searchParams.get('allowWake') === 'true'

  if (!fresh) {
    const { data: cached } = await supabase.from('vehicle_states').select('state, collected_at').eq('vehicle_id', vehicleRecord.id).order('collected_at', { ascending: false }).limit(1).maybeSingle()
    if (!cached) return NextResponse.json({ message: 'No cached vehicle data yet' }, { status: 404 })
    return NextResponse.json({
      source: 'cache',
      collection: 'skipped',
      reason: 'passive_default',
      message: 'Cached data returned. No Tesla request was made.',
      vehicle: cached.state,
      collectedAt: cached.collected_at,
    })
  }

  if (!allowWake) {
    return NextResponse.json({
      source: 'cache',
      collection: 'skipped',
      reason: 'wake_confirmation_required',
      message: 'Fresh collection requires explicit wake confirmation.',
    }, { status: 409 })
  }

  try {
    const { data: credential, error: credentialError } = await supabase.from('vehicle_credentials').select('access_token_ciphertext').eq('vehicle_id', vehicleRecord.id).eq('owner_id', user.id).single()
    if (credentialError || !credential) throw new Error('Tesla Owner API is not connected')
    const vehicle = await getTeslaVehicle(decryptSecret(credential.access_token_ciphertext), vehicleRecord.provider_vehicle_id)
    await supabase.from('vehicle_states').insert({ vehicle_id: vehicleRecord.id, provider_vehicle_id: vehicleRecord.provider_vehicle_id, state: vehicle })
    await supabase.from('collection_events').insert({ vehicle_id: vehicleRecord.id, owner_id: user.id, outcome: 'success', reason: 'explicit_current_status' })
    return NextResponse.json({ source: 'tesla_api', collection: 'success', vehicle })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tesla API request failed'
    await supabase.from('collection_events').insert({ vehicle_id: vehicleRecord.id, owner_id: user.id, outcome: 'failed', reason: message })
    const { data: cached } = await supabase.from('vehicle_states').select('state, collected_at').eq('vehicle_id', vehicleRecord.id).order('collected_at', { ascending: false }).limit(1).maybeSingle()
    return NextResponse.json({ source: 'cache', collection: 'failed', reason: message, vehicle: cached?.state, collectedAt: cached?.collected_at }, { status: 502 })
  }
}
