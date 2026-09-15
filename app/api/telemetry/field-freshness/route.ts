import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { readFieldFreshness } from '@/lib/telemetry/field-freshness-repository'
import { resolveVehicle } from '@/lib/tesla/service'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required', fields: [] }, { status: 401 })

  try {
    const url = new URL(request.url)
    const vehicle = await resolveVehicle(user.id, url.searchParams.get('vehicle'))
    if (!vehicle) return NextResponse.json({ message: 'Vehicle not connected', fields: [] }, { status: 404 })

    const rawLimit = Number(url.searchParams.get('limit') ?? 100)
    const fields = await readFieldFreshness({ vehicleId: vehicle.id, limit: Number.isFinite(rawLimit) ? rawLimit : 100 })
    return NextResponse.json(
      { fields, vehicleId: vehicle.id, count: fields.length },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to fetch telemetry field freshness', fields: [] },
      { status: 503 },
    )
  }
}

