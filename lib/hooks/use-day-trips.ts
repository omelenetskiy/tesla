import { useEffect, useMemo, useState } from 'react'
import type { Trip } from '@/lib/tesla/models'
import { localDateKey } from '@/lib/utils/daily'

type DayTripsResult = {
  trips: Trip[]
  loading: boolean
  error: Error | null
  origin: string | null
  snapshotCount: number
}

export function useDayTrips(date: string, timeZone?: string): DayTripsResult {
  const [allTrips, setAllTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [origin, setOrigin] = useState<string | null>(null)
  const [snapshotCount, setSnapshotCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/trips?range=7d', { cache: 'no-store' })
        if (!response.ok) throw new Error('Unable to load recent trips')
        const payload = (await response.json()) as {
          trips?: Array<{
            id: string
            startTime: string
            endTime: string
            distance: number | null
            durationMinutes: number | null
            energyUsedKwh: number | null
            efficiency: number | null
            maxSpeed: number | null
            avgSpeed: number | null
            startLocation: Trip['startLocation']
            endLocation: Trip['endLocation']
            confidence: Trip['confidence']
            partial: boolean
          }>
          origin?: string
          snapshotCount?: number
        }
        if (cancelled) return
        setAllTrips((payload.trips ?? []).map((trip) => ({
          id: trip.id,
          vehicleId: '',
          startedAt: trip.startTime,
          endedAt: trip.endTime,
          distanceKm: trip.distance,
          durationMinutes: trip.durationMinutes,
          averageSpeedKmh: trip.avgSpeed,
          maxSpeedKmh: trip.maxSpeed,
          energyUsedKwh: trip.energyUsedKwh,
          efficiencyWhPerKm: trip.efficiency,
          batteryStartPercent: null,
          batteryEndPercent: null,
          odometerStartKm: null,
          odometerEndKm: null,
          startLocation: trip.startLocation,
          endLocation: trip.endLocation,
          route: [],
          name: null,
          phase: 'unknown',
          partial: trip.partial,
          confidence: trip.confidence,
        })))
        setOrigin(payload.origin ?? null)
        setSnapshotCount(payload.snapshotCount ?? 0)
        setError(null)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause : new Error('Unable to load recent trips'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const trips = useMemo(
    () => allTrips.filter((trip) => localDateKey(trip.startedAt, timeZone) === date),
    [allTrips, date, timeZone],
  )

  return { trips, loading, error, origin, snapshotCount }
}

