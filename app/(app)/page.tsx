'use client'

import * as React from 'react'
import { BatteryCard, DashboardHeader, LocationCard, OverviewCard, VehicleCard } from '@/components/dashboard/status-cards'
import { DashboardGrid } from '@/components/dashboard/dashboard-grid'
import { useFeed } from '@/components/shell/app-shell'
import { DEFAULT_LAYOUT, toStorage } from '@/lib/dashboard/layout'
import type { DashboardCardId } from '@/lib/dashboard/layout'
import { ageSecondsSince, useNow } from '@/lib/hooks/use-now'
import { useDashboardLayout } from '@/lib/hooks/use-dashboard-layout'
import { usePlace } from '@/lib/hooks/use-place'

/**
 * Dashboard focuses on a quick static read: vehicle identity, firmware/system basics,
 * battery state, and the last known map point.
 */
export default function DashboardPage() {
  const feed = useFeed()
  const now = useNow(1_000)
  const [layout, saveLayout, resetLayout] = useDashboardLayout()
  const status = feed.snapshot?.status ?? null
  const vehicle = React.useMemo(
    () => feed.vehicles.find((entry) => entry.identity.databaseId === feed.selectedVehicleId) ?? feed.vehicles[0] ?? null,
    [feed.selectedVehicleId, feed.vehicles],
  )
  const lastSeenAt = feed.lastUpdatedAt ?? vehicle?.lastSeenAt ?? null
  const age = ageSecondsSince(lastSeenAt, now)
  const { place } = usePlace(status?.drive.latitude ?? null, status?.drive.longitude ?? null)

  const cards: Record<DashboardCardId, React.ReactNode> = {
    vehicle: <VehicleCard vehicle={vehicle} status={status} />,
    overview: <OverviewCard vehicle={vehicle} status={status} ageSeconds={age} />,
    battery: <BatteryCard status={status} />,
    location: <LocationCard status={status} place={place} ageSeconds={age} />,
  }

  const arranged = JSON.stringify(toStorage(layout)) !== JSON.stringify(toStorage(DEFAULT_LAYOUT))

  return (
    <div className="mx-auto w-full max-w-[1220px] space-y-3">
      <DashboardHeader vehicle={vehicle} status={status} ageSeconds={age} onResetLayoutAction={arranged ? resetLayout : undefined} />

      {feed.error && (
        <p className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-[12.5px] leading-4 text-warn">
          {feed.error.message}
        </p>
      )}

      <DashboardGrid layout={layout} onCommit={saveLayout}>
        {(id) => cards[id]}
      </DashboardGrid>
    </div>
  )
}
