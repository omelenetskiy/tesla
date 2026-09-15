import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { readHistory } from '@/lib/tesla/history'
import { resolveVehicle } from '@/lib/tesla/service'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })

  try {
    const url = new URL(request.url)
    const row = await resolveVehicle(user.id, url.searchParams.get('vehicle'))
    if (!row) return NextResponse.json({ message: 'Vehicle not connected' }, { status: 404 })

    const history = await readHistory(row.id, '90d')
    const session = history.charging.find((item) => item.id === id)
    if (!session) return NextResponse.json({ message: 'Charging session not found' }, { status: 404 })

    return NextResponse.json({
      id: session.id,
      startTime: session.startedAt,
      endTime: session.endedAt ?? session.startedAt,
      location: {
        lat: session.location?.latitude ?? 0,
        lng: session.location?.longitude ?? 0,
        name: session.locationLabel ?? 'Charging location',
      },
      chargerType: session.chargerType === 'DC' ? 'DC' : session.fastCharger ? 'DC' : 'L2',
      startSoc: session.batteryStartPercent ?? 0,
      endSoc: session.batteryEndPercent ?? 0,
      energyAdded: session.energyAddedKwh ?? 0,
      maxPower: session.peakPowerKw ?? session.averagePowerKw ?? 0,
      avgPower: session.averagePowerKw ?? 0,
      cost: null,
      samples: [],
      samplesVerified: false,
      samplesOrigin: 'unavailable',
      confidence: session.confidence,
      completed: session.completed,
    })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load charging details' },
      { status: 503 }
    )
  }
}


