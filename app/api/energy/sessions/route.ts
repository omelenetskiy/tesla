import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { readSessionEnergy, type TelemetrySampleQuery } from '@/lib/energy/telemetry-repository'
import { resolveVehicle } from '@/lib/tesla/service'

export const dynamic = 'force-dynamic'

const RANGE_DAYS = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
} as const

type EnergyRange = keyof typeof RANGE_DAYS | 'all'

function normalizeRange(value: string | null): EnergyRange {
  if (value === '7d' || value === '90d' || value === 'all') return value
  return '30d'
}

function dateRange(range: EnergyRange): Pick<TelemetrySampleQuery, 'from' | 'to'> {
  const to = new Date()
  if (range === 'all') return {}
  return {
    from: new Date(to.getTime() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000).toISOString(),
    to: to.toISOString(),
  }
}

function sessionType(value: string | null): TelemetrySampleQuery['sessionType'] {
  if (value === 'trip' || value === 'charging' || value === 'parked') return value
  return undefined
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required', sessions: [] }, { status: 401 })

  try {
    const url = new URL(request.url)
    const vehicle = await resolveVehicle(user.id, url.searchParams.get('vehicle'))
    if (!vehicle) return NextResponse.json({ message: 'Vehicle not connected', sessions: [] }, { status: 404 })

    const range = normalizeRange(url.searchParams.get('range'))
    const query: TelemetrySampleQuery = {
      ownerId: user.id,
      vehicleId: vehicle.id,
      sessionId: url.searchParams.get('sessionId') || undefined,
      sessionType: sessionType(url.searchParams.get('sessionType')),
      maxGapMs: 30 * 60 * 1000,
      ...dateRange(range),
    }
    const sessions = await readSessionEnergy(query)

    return NextResponse.json(
      { sessions, range, snapshotCount: sessions.length, origin: sessions.length ? 'telemetry' : 'empty' },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to fetch energy sessions', sessions: [] },
      { status: 503 },
    )
  }
}

