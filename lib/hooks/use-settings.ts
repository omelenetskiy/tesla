import * as React from 'react'

type DataRetention = '30d' | '90d' | '1y' | 'unlimited'

type ServerSettings = {
  distance_unit?: 'km' | 'mi' | null
  temperature_unit?: 'C' | 'F' | null
  time_zone?: string | null
  locale?: string | null
  location_history_enabled?: boolean | null
}

export type AppSettings = {
  pollingInterval: number
  enableNotifications: boolean
  enableAnalytics: boolean
  dataRetention: DataRetention
  apiKey: string
  theme: 'light' | 'dark' | 'system'
  distanceUnit: 'km' | 'mi'
  temperatureUnit: 'C' | 'F'
  timeZone: string
  locale: string
  locationHistoryEnabled: boolean
}

const STORAGE_KEY = 'appSettings'

const DEFAULT_SETTINGS: AppSettings = {
  pollingInterval: 30,
  enableNotifications: true,
  enableAnalytics: true,
  dataRetention: '90d',
  apiKey: '',
  theme: 'system',
  distanceUnit: 'km',
  temperatureUnit: 'C',
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
  locationHistoryEnabled: true,
}

function readLocalSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function writeLocalSettings(value: AppSettings) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

function mergeServer(local: AppSettings, server: ServerSettings | null | undefined): AppSettings {
  if (!server) return local
  return {
    ...local,
    distanceUnit: server.distance_unit ?? local.distanceUnit,
    temperatureUnit: server.temperature_unit ?? local.temperatureUnit,
    timeZone: server.time_zone ?? local.timeZone,
    locale: server.locale ?? local.locale,
    locationHistoryEnabled: server.location_history_enabled ?? local.locationHistoryEnabled,
  }
}

function serverPatchFromSettings(settings: AppSettings): {
  distanceUnit: 'km' | 'mi'
  temperatureUnit: 'C' | 'F'
  timeZone: string
  locale: string
  locationHistoryEnabled: boolean
} {
  return {
    distanceUnit: settings.distanceUnit,
    temperatureUnit: settings.temperatureUnit,
    timeZone: settings.timeZone,
    locale: settings.locale,
    locationHistoryEnabled: settings.locationHistoryEnabled,
  }
}

export function useSettings() {
  const [settings, setSettings] = React.useState<AppSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false

    const load = async () => {
      const local = readLocalSettings()
      if (!cancelled) setSettings(local)

      try {
        const response = await fetch('/api/settings', { cache: 'no-store' })
        if (!response.ok) {
          if (!cancelled) {
            setLoading(false)
          }
          return
        }

        const payload = (await response.json()) as { settings?: ServerSettings | null }
        if (cancelled) return

        const merged = mergeServer(local, payload.settings)
        setSettings(merged)
        writeLocalSettings(merged)
      } catch {
        // Keep local settings if server is unavailable.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const updateSettings = React.useCallback(
    async (patch: Partial<AppSettings>, options?: { syncServer?: boolean }) => {
      const next = { ...settings, ...patch }
      setSettings(next)
      writeLocalSettings(next)
      setError(null)

      if (options?.syncServer === false) return true

      setSaving(true)
      try {
        const response = await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(serverPatchFromSettings(next)),
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null
          setError(payload?.message ?? 'Failed to save settings')
          return false
        }

        return true
      } catch {
        setError('Failed to save settings')
        return false
      } finally {
        setSaving(false)
      }
    },
    [settings]
  )

  return {
    settings,
    loading,
    saving,
    error,
    updateSettings,
  }
}

