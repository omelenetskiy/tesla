import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { readHistory, type HistoryRange } from '@/lib/tesla/history'
import { resolveVehicle } from '@/lib/tesla/service'
import { resolveTripLocations } from '@/lib/tesla/trip-locations'

export const dynamic = 'force-dynamic'

type ApiRange = '7d' | '30d' | '90d' | '1y'

function normalizeRange(input: string | null): HistoryRange {
  const value = (input ?? '30d') as ApiRange
  if (value === '7d' || value === '30d' || value === '90d') return value
  return 'all'
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required', trips: [] }, { status: 401 })

  try {
    const range = normalizeRange(request.nextUrl.searchParams.get('range'))
    const row = await resolveVehicle(user.id, request.nextUrl.searchParams.get('vehicle'))
    if (!row) return NextResponse.json({ trips: [], message: 'Vehicle not connected' }, { status: 404 })

    const history = await readHistory(row.id, range)
    const trips = history.trips.map((trip) => {
      const { startLocation, endLocation } = resolveTripLocations(trip)

      return {
        id: trip.id,
        startTime: trip.startedAt,
        endTime: trip.endedAt ?? trip.startedAt,
        distance: trip.distanceKm ?? 0,
        startLocation,
        endLocation,
        efficiency: trip.efficiencyWhPerKm ?? 0,
        startSoc: trip.batteryStartPercent ?? 0,
        endSoc: trip.batteryEndPercent ?? 0,
        maxSpeed: trip.maxSpeedKmh ?? 0,
        avgSpeed: trip.averageSpeedKmh ?? 0,
        confidence: trip.confidence,
        partial: trip.partial,
      }
    })

    return NextResponse.json(
      {
        trips,
        origin: history.origin,
        snapshotCount: history.snapshotCount,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'Failed to fetch trips',
        trips: [],
      },
      { status: 503 },
    )
  }
}
