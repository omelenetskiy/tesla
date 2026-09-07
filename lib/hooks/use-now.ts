'use client'

import * as React from 'react'

/**
 * A ticking "now" for relative timestamps.
 *
 * Calling `Date.now()` directly in render is impure — the same props would produce
 * different output on every pass, which breaks memoisation and makes server/client
 * renders disagree. Reading the clock through state keeps render pure and, as a
 * side effect, makes "8s ago" actually advance instead of freezing.
 *
 * The interval only runs while the tab is visible, so a backgrounded dashboard in
 * the car costs nothing.
 */
export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    let timer: number | undefined
    const tick = () => setNow(Date.now())
    const start = () => {
      if (timer !== undefined) return
      tick()
      timer = window.setInterval(tick, intervalMs)
    }
    const stop = () => {
      if (timer === undefined) return
      window.clearInterval(timer)
      timer = undefined
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') start()
      else stop()
    }
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs])

  return now
}

/** Age in whole seconds against the shared clock. */
export function ageSecondsSince(iso: string | null | undefined, now: number): number {
  if (!iso) return Number.NaN
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return Number.NaN
  return Math.max(0, Math.round((now - at) / 1000))
}
