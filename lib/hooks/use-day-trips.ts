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
        const payload = (await response.json()) as { trips?: Trip[]; origin?: string; snapshotCount?: number }
        if (cancelled) return
        setAllTrips(payload.trips ?? [])
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

