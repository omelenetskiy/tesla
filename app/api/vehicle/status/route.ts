import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { readVehicleStatus, resolveVehicle } from '@/lib/tesla/service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })

    const requestedVehicleId = request.nextUrl.searchParams.get('vehicleId')
    const row = await resolveVehicle(user.id, requestedVehicleId)
    if (!row) return NextResponse.json({ message: 'Vehicle not connected' }, { status: 404 })

    const snapshot = await readVehicleStatus({ row })
    const status = snapshot.status
    return NextResponse.json({
      vehicleId: row.id,
      batteryLevel: status?.charge.stateOfCharge ?? null,
      latitude: status?.drive.latitude ?? null,
      longitude: status?.drive.longitude ?? null,
      isSleeping: status ? status.presence === 'sleeping' : null,
      lastUpdatedAt: snapshot.collectedAt,
      isLive: snapshot.source === 'tesla_api' && snapshot.freshness === 'live',
      freshness: snapshot.freshness,
      source: snapshot.source,
      error: snapshot.error,
    }, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to fetch vehicle status' },
      { status: 503 },
    )
  }
}

