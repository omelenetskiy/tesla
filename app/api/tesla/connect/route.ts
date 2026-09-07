import { NextResponse } from 'next/server'
import { encryptSecret } from '@/lib/crypto'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getTeslaVehicles } from '@/lib/tesla-api'

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Authentication required' }, { status: 401 })

  let body: { accessToken?: string }
  try {
    body = await request.json() as { accessToken?: string }
  } catch {
    return NextResponse.json({ message: 'Invalid request body' }, { status: 400 })
  }
  const accessToken = body.accessToken?.trim()
  if (!accessToken) return NextResponse.json({ message: 'Owner API access token is required' }, { status: 400 })

  try {
    const ownerVehicles = await getTeslaVehicles(accessToken)
    const source = ownerVehicles[0]
    if (!source) return NextResponse.json({ message: 'No Tesla vehicles were returned for this token' }, { status: 422 })
    const supabase = getSupabaseAdmin()
    const { data: vehicle, error: vehicleError } = await supabase.from('vehicles').upsert({ owner_id: user.id, provider_vehicle_id: String(source.id), display_name: source.display_name || 'My Tesla', model: source.car_type || 'Tesla vehicle' }, { onConflict: 'owner_id,provider_vehicle_id' }).select('id').single()
    if (vehicleError || !vehicle) throw new Error(vehicleError?.message || 'Could not save vehicle')
    const { error: credentialError } = await supabase.from('vehicle_credentials').upsert({ vehicle_id: vehicle.id, owner_id: user.id, access_token_ciphertext: encryptSecret(accessToken), updated_at: new Date().toISOString() })
    if (credentialError) throw new Error(credentialError.message)
    return NextResponse.json({ connected: true, vehicle: { id: source.id, name: source.display_name || 'My Tesla' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Owner API connection failed'
    return NextResponse.json({ message }, { status: 502 })
  }
}
