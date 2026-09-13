'use client'

import * as React from 'react'
import { DEFAULT_LAYOUT, LAYOUT_CHANGED_EVENT, LAYOUT_STORAGE_KEY, parseLayout, toStorage, type DashboardLayout } from '@/lib/dashboard/layout'

/**
 * The operator's widget order, read straight out of `localStorage`.
 *
 * `useSyncExternalStore` rather than state-plus-effect for the same reason `useTheme`
 * uses it: the value only exists on the client, and an effect that copied it into state
 * would either flash the default order on every load or trip React's
 * set-state-in-effect rule. The snapshot is cached against the raw string because the
 * hook compares snapshots by identity — re-parsing per call would hand React a new object
 * each time and re-render forever.
 */

let cache: { json: string; layout: DashboardLayout } | null = null

function readLayout(): DashboardLayout {
  let json: string | null = null
  try {
    json = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
  } catch {
    // Private mode: the designed order is a working layout, not a failure state.
    return DEFAULT_LAYOUT
  }
  const key = json ?? ''
  if (!cache || cache.json !== key) cache = { json: key, layout: parseLayout(json) }
  return cache.layout
}

export function useDashboardLayout(): [DashboardLayout, (next: DashboardLayout) => void, () => void] {
  const subscribe = React.useCallback((onStoreChange: () => void) => {
    window.addEventListener('storage', onStoreChange)
    window.addEventListener(LAYOUT_CHANGED_EVENT, onStoreChange)
    return () => {
      window.removeEventListener('storage', onStoreChange)
      window.removeEventListener(LAYOUT_CHANGED_EVENT, onStoreChange)
    }
  }, [])

  const layout = React.useSyncExternalStore(subscribe, readLayout, () => DEFAULT_LAYOUT)

  const save = React.useCallback((next: DashboardLayout) => {
    const json = JSON.stringify(toStorage(next))
    // react-grid-layout reports a layout for its own bookkeeping too, including when a
    // measured height lands the cards back where they were. Writing on every one of those
    // would make `storage` fire, which re-renders, which can report again.
    try {
      if (window.localStorage.getItem(LAYOUT_STORAGE_KEY) === json) return
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, json)
    } catch {
      /* private mode: the reorder still holds for this page, it just will not survive a reload */
    }
    // `storage` does not fire in the tab that wrote, so notify it directly.
    window.dispatchEvent(new Event(LAYOUT_CHANGED_EVENT))
  }, [])

  /**
   * Forget the arrangement rather than write the default over it. The difference matters
   * on the next release: a stored copy of today's defaults would keep this screen in the
   * layout it was reset to, while removing the key lets a redesigned order through.
   */
  const reset = React.useCallback(() => {
    cache = null
    try {
      window.localStorage.removeItem(LAYOUT_STORAGE_KEY)
    } catch {
      /* nothing to clear */
    }
    window.dispatchEvent(new Event(LAYOUT_CHANGED_EVENT))
  }, [])

  return [layout, save, reset]
}
