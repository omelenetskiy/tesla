'use client'

import * as React from 'react'

/**
 * Browser location, used only as the map's fallback view when the vehicle has no
 * reported position. Requested lazily and once: it is off until something actually
 * needs it, so a connected car never triggers a permission prompt.
 *
 * Denied or unavailable is a normal outcome, not an error — the caller keeps a
 * neutral map view and says so.
 */
export type GeoState = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable'

export function useGeolocation(enabled: boolean) {
  const [position, setPosition] = React.useState<[number, number] | null>(null)
  const [state, setState] = React.useState<GeoState>('idle')

  React.useEffect(() => {
    if (!enabled || position || state !== 'idle') return
    void (async () => {
      // Yielded so no state is set synchronously in the effect body; the capability
      // check is a microtask, not a delay.
      const supported = await Promise.resolve(typeof navigator !== 'undefined' && Boolean(navigator.geolocation))
      if (!supported) {
        setState('unavailable')
        return
      }
      setState('locating')
      navigator.geolocation.getCurrentPosition(
        (coords) => {
          setPosition([coords.coords.longitude, coords.coords.latitude])
          setState('ready')
        },
        () => setState('denied'),
        { enableHighAccuracy: false, timeout: 8_000, maximumAge: 300_000 },
      )
    })()
  }, [enabled, position, state])

  return { position, state }
}
