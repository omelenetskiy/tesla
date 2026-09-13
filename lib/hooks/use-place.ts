'use client'

import * as React from 'react'
import type { PlaceLabel } from '@/lib/geo/place'

/**
 * The place name for a coordinate, fetched off the render path.
 *
 * The dashboard paints from its own snapshot the moment it has one; this resolves
 * afterwards and can fail or never return without changing anything on screen except
 * that the location stays as coordinates. That is the honest fallback, not a gap to
 * paper over.
 *
 * The result is stored *with the coordinate it belongs to* rather than reset when the
 * coordinate changes. A reset would be a synchronous setState in an effect body — one
 * render for the reset, another for the answer — and it would also let a stale city
 * name sit under a new position for as long as the request takes.
 */
export function usePlace(latitude: number | null, longitude: number | null) {
  const [entry, setEntry] = React.useState<{ lat: number; lon: number; place: PlaceLabel | null } | null>(null)

  React.useEffect(() => {
    if (latitude === null || longitude === null) return
    let cancelled = false
    void (async () => {
      try {
        const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude) })
        const response = await fetch(`/api/location?${params}`, { cache: 'no-store' })
        if (!response.ok) return
        const payload = (await response.json()) as { place?: PlaceLabel | null }
        if (!cancelled) setEntry({ lat: latitude, lon: longitude, place: payload.place ?? null })
      } catch {
        /* network or gazetteer down — the coordinates stay on screen */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [latitude, longitude])

  const fresh = entry !== null && entry.lat === latitude && entry.lon === longitude
  return {
    place: fresh && entry ? entry.place : null,
    loading: !fresh && latitude !== null && longitude !== null,
  }
}
