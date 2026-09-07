'use client'

import * as React from 'react'
import type { VehicleStatusSnapshot, VehicleSummary } from '@/lib/tesla/models'

/**
 * The browser's view of the vehicle feed (§22, §21, §48).
 *
 * The client never polls on a fixed loop: the interval is derived from the vehicle's
 * own reported state, and the server applies the authoritative gate on top of it. A
 * sleeping car therefore produces no repeating requests from either side, which is
 * the battery-drain failure §21 names explicitly.
 *
 * Reads go only to the application API — no component in this codebase can reach a
 * Tesla endpoint, and no token ever crosses the boundary (§11).
 */

export type VehicleFeed = {
  snapshot: VehicleStatusSnapshot | null
  vehicles: VehicleSummary[]
  selectedVehicleId: string | null
  selectVehicle: (id: string) => void
  /** True on the very first load, before anything is on screen. */
  loading: boolean
  refreshing: boolean
  /** Server-declared reason the data is cached/skipped, e.g. `vehicle_sleeping`. */
  collectionReason: string | null
  source: VehicleStatusSnapshot['source'] | null
  needsConnection: boolean
  /** Sanitised §20 failure shape, never a raw provider body. */
  error: VehicleStatusSnapshot['error']
  message: string | null
  /** Whether the visible numbers came from Tesla just now or from the database. */
  isLive: boolean
  lastUpdatedAt: string | null
  /** Explicit user action; may wake the vehicle only when `mayWake` is confirmed. */
  refresh: (options?: { mayWake?: boolean }) => Promise<void>
}

/** Client-side cadence. Mirrors DEFAULT_POLLING_POLICY; the server remains the gate. */
const INTERVALS: Record<string, number> = {
  driving: 10_000,
  charging: 30_000,
  parked: 5 * 60_000,
  sleeping: 0,
  offline: 0,
}

export function useVehicleData(): VehicleFeed {
  const [snapshot, setSnapshot] = React.useState<VehicleStatusSnapshot | null>(null)
  const [vehicles, setVehicles] = React.useState<VehicleSummary[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [needsConnection, setNeedsConnection] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  const [error, setError] = React.useState<VehicleStatusSnapshot['error']>(null)
  // Read by the interval callback, which must not be torn down and recreated every
  // time the selection changes.
  const selectedVehicleIdRef = React.useRef<string | null>(null)

  // Every state change here happens after an await, so no render is invalidated by a
  // synchronous setState in an effect body.
  const load = React.useCallback(async (input: { force?: boolean; mayWake?: boolean; vehicleId?: string | null } = {}) => {
    try {
      const params = new URLSearchParams()
      if (input.force) params.set('fresh', 'true')
      if (input.mayWake) params.set('allowWake', 'true')
      if (input.vehicleId) params.set('vehicle', input.vehicleId)
      const query = params.toString()
      const response = await fetch(`/api/vehicle${query ? `?${query}` : ''}`, { cache: 'no-store' })
      const payload = (await response.json()) as {
        snapshot?: VehicleStatusSnapshot
        vehicles?: VehicleSummary[]
        selectedVehicleId?: string | null
        needsConnection?: boolean
        message?: string | null
      }
      if (payload.snapshot) setSnapshot(payload.snapshot)
      if (payload.vehicles) setVehicles(payload.vehicles)
      if (payload.selectedVehicleId) {
        setSelectedVehicleId((current) => current ?? payload.selectedVehicleId ?? null)
        selectedVehicleIdRef.current = selectedVehicleIdRef.current ?? payload.selectedVehicleId ?? null
      }
      setNeedsConnection(Boolean(payload.needsConnection))
      setMessage(payload.message ?? null)
      setError(payload.snapshot?.error ?? null)
      setLoading(false)
      setRefreshing(false)
    } catch (fetchError) {
      // A failed reload must not erase the state already on screen (§39).
      setError({ kind: 'network', status: null, endpoint: '/api/vehicle', message: fetchError instanceof Error ? fetchError.message : 'Lost connection to the app', attempts: 1, retryAfterMs: null })
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  /** Explicit user action; may wake the vehicle only when `mayWake` is confirmed. */
  const refresh = React.useCallback(
    (options?: { mayWake?: boolean }) => {
      setRefreshing(true)
      return load({ force: true, mayWake: options?.mayWake, vehicleId: selectedVehicleIdRef.current })
    },
    [load],
  )

  // Initial read. `load` settles state only after its await, so nothing cascades.
  React.useEffect(() => {
    void (async () => {
      await load()
    })()
  }, [load])

  // State-derived follow-up reads. `0` means "do not poll this state at all", which is
  // what keeps a sleeping car from being poked by an open tab (§21).
  const presence = snapshot?.status?.presence ?? null
  const interval = presence ? (INTERVALS[presence] ?? 0) : 60_000
  React.useEffect(() => {
    if (!interval) return
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void load({ vehicleId: selectedVehicleIdRef.current })
    }, interval)
    return () => window.clearInterval(timer)
  }, [interval, load])

  const selectVehicle = React.useCallback((id: string) => {
    selectedVehicleIdRef.current = id
    setSelectedVehicleId(id)
    void load({ vehicleId: id })
  }, [load])

  return {
    snapshot,
    vehicles,
    selectedVehicleId,
    selectVehicle,
    loading,
    refreshing,
    collectionReason: snapshot?.collectionReason ?? null,
    source: snapshot?.source ?? null,
    needsConnection,
    error,
    message,
    isLive: snapshot?.source === 'tesla_api' && (snapshot.freshness === 'live' || snapshot.freshness === 'recent'),
    lastUpdatedAt: snapshot?.status ? snapshot.collectedAt : null,
    refresh,
  }
}
