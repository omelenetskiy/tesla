import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { readHistory } from '@/lib/tesla/history'
import { resolveVehicle } from '@/lib/tesla/service'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Trip } from '@/lib/tesla/models'
import { resolveTripLocations } from '@/lib/tesla/trip-locations'

export const dynamic = 'force-dynamic'

async function readTripById(vehicleId: string, tripId: string): Promise<Trip | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .eq('id', tripId)
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  return {
    id: String(data.id),
    vehicleId,
    startedAt: String(data.started_at ?? data.start_time ?? ''),
    endedAt: (data.ended_at as string | null) ?? (data.end_time as string | null) ?? null,
    distanceKm: data.distance_km != null ? Number(data.distance_km) : null,
    durationMinutes: data.duration_minutes != null ? Number(data.duration_minutes) : null,
    averageSpeedKmh: data.average_speed_kmh != null ? Number(data.average_speed_kmh) : null,
    maxSpeedKmh: data.max_speed_kmh != null ? Number(data.max_speed_kmh) : null,
    energyUsedKwh: data.energy_used_kwh != null ? Number(data.energy_used_kwh) : null,
    efficiencyWhPerKm: data.efficiency_wh_per_km != null ? Number(data.efficiency_wh_per_km) : null,
    batteryStartPercent: data.battery_start != null ? Number(data.battery_start) : null,
    batteryEndPercent: data.battery_end != null ? Number(data.battery_end) : null,
    odometerStartKm: data.odometer_start_km != null ? Number(data.odometer_start_km) : null,
    odometerEndKm: data.odometer_end_km != null ? Number(data.odometer_end_km) : null,
    startLocation:
      data.start_latitude != null && data.start_longitude != null
        ? { latitude: Number(data.start_latitude), longitude: Number(data.start_longitude), heading: null, source: 'live', accuracy: null }
        : null,
    endLocation:
      data.end_latitude != null && data.end_longitude != null
        ? { latitude: Number(data.end_latitude), longitude: Number(data.end_longitude), heading: null, source: 'live', accuracy: null }
        : null,
    route: Array.isArray(data.route)
      ? (data.route as Array<[number, number]>)
      : Array.isArray(data.coordinates)
        ? (data.coordinates as Array<[number, number]>)
        : [],
    name: (data.name as string | null) ?? null,
    phase: (data.phase as Trip['phase']) ?? 'unknown',
    partial: Boolean(data.partial),
    confidence: (data.confidence as Trip['confidence']) ?? 'snapshot_gap',
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })

  try {
    const url = new URL(request.url)
    const row = await resolveVehicle(user.id, url.searchParams.get('vehicle'))
    if (!row) return NextResponse.json({ message: 'Vehicle not connected' }, { status: 404 })

    const history = await readHistory(row.id, '90d')
    const trip = history.trips.find((item) => item.id === id) ?? (await readTripById(row.id, id))
    if (!trip) return NextResponse.json({ message: 'Trip not found' }, { status: 404 })

    const { startLocation, endLocation } = resolveTripLocations(trip)

    return NextResponse.json({
      id: trip.id,
      startTime: trip.startedAt,
      endTime: trip.endedAt ?? trip.startedAt,
      distance: trip.distanceKm ?? 0,
      startLocation,
      endLocation,
      efficiency: trip.efficiencyWhPerKm ?? 0,
      energyUsedKwh: trip.energyUsedKwh,
      startSoc: trip.batteryStartPercent ?? 0,
      endSoc: trip.batteryEndPercent ?? 0,
      maxSpeed: trip.maxSpeedKmh ?? 0,
      avgSpeed: trip.averageSpeedKmh ?? 0,
      elevation: 0,
      samples: [],
      samplesVerified: false,
      samplesOrigin: 'unavailable',
      confidence: trip.confidence,
      partial: trip.partial,
    })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load trip details' },
      { status: 503 }
    )
  }
}

