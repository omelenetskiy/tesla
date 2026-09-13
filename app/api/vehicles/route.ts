import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { listVehicleSummaries } from '@/lib/tesla/service'
import { readFleetCredential } from '@/lib/fleet/tokens'

export const dynamic = 'force-dynamic'

/**
 * GET /api/vehicles — the header selector's source (§6). Reads the local database
 * only, so switching vehicles never costs a Tesla request (§48).
 */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })

  const credential = await readFleetCredential(user.id).catch(() => null)
  if (!credential) {
    const response = NextResponse.json({ message: 'Tesla Fleet authorization is required.', vehicles: [], selectedVehicleId: null }, { status: 403 })
    response.cookies.delete('fleet_authorized')
    return response
  }

  const vehicles = await listVehicleSummaries(user.id)
  return NextResponse.json({ vehicles, selectedVehicleId: new URL(request.url).searchParams.get('vehicle') ?? vehicles[0]?.identity.databaseId ?? null })
}
