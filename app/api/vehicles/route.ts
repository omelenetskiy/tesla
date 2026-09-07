import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { listVehicleSummaries } from '@/lib/tesla/service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/vehicles — the header selector's source (§6). Reads the local database
 * only, so switching vehicles never costs a Tesla request (§48).
 */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Требуется вход в приложение' }, { status: 401 })
  const vehicles = await listVehicleSummaries(user.id)
  return NextResponse.json({ vehicles, selectedVehicleId: new URL(request.url).searchParams.get('vehicle') ?? vehicles[0]?.identity.databaseId ?? null })
}
