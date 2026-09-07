'use client'

import * as React from 'react'

/**
 * Theme preference: system | light | dark.
 *
 * The resolved value is applied as `data-theme` on <html>, which is what the token
 * block in globals.css keys off and what the pre-paint script in app/layout.tsx
 * already set.
 *
 * Both inputs (localStorage and prefers-color-scheme) exist only on the client, so
 * they are read through `useSyncExternalStore` with a server snapshot. That is the
 * pattern for a value React cannot know during SSR: it avoids the hydration mismatch
 * and avoids the setState-in-effect cascade that would otherwise re-render twice on
 * mount.
 */
export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'theme'

function readStored(): ThemePreference {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {
    /* private mode */
  }
  return 'system'
}

function subscribePreference(onChange: () => void) {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}

function subscribeSystem(onChange: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function readSystemDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function useTheme() {
  const preference = useSyncExternalStoreLite(subscribePreference, readStored, 'system')
  const systemDark = useSyncExternalStoreLite(subscribeSystem, readSystemDark, false)
  const resolved: 'light' | 'dark' = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  React.useEffect(() => {
    if (document.documentElement.getAttribute('data-theme') !== resolved) {
      document.documentElement.setAttribute('data-theme', resolved)
    }
  }, [resolved])

  const choose = React.useCallback((next: ThemePreference) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* private mode */
    }
    // `storage` does not fire in the tab that wrote, so notify explicitly.
    window.dispatchEvent(new Event('drive-scope:theme'))
  }, [])

  return { preference, resolved, choose }
}

/** useSyncExternalStore with the subscribe functions above also listening for the local write event. */
function useSyncExternalStoreLite<T>(subscribe: (onChange: () => void) => () => void, getSnapshot: () => T, serverFallback: T): T {
  return React.useSyncExternalStore(
    React.useCallback(
      (onChange: () => void) => {
        const unsubscribe = subscribe(onChange)
        window.addEventListener('drive-scope:theme', onChange)
        return () => {
          unsubscribe()
          window.removeEventListener('drive-scope:theme', onChange)
        }
      },
      [subscribe],
    ),
    getSnapshot,
    () => serverFallback,
  )
}
