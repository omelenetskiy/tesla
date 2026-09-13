'use client'

import * as React from 'react'
import Link from 'next/link'
import { PanelSkeleton } from '@/components/dashboard/vehicle-panels'
import { BatteryCard, ChargingCard, ClimateCard, DashboardHeader, EnergyCard, HealthCard, LocationCard, RealtimeCard, TyreCard, VehicleCard, BatteryHealthCard } from '@/components/dashboard/status-cards'
import { DashboardGrid } from '@/components/dashboard/dashboard-grid'
import { useFeed } from '@/components/shell/app-shell'
import type { Trip } from '@/lib/tesla/models'
import { DEFAULT_LAYOUT, toStorage } from '@/lib/dashboard/layout'
import type { DashboardCardId } from '@/lib/dashboard/layout'
import { ageSecondsSince, useNow } from '@/lib/hooks/use-now'
import { useDashboardLayout } from '@/lib/hooks/use-dashboard-layout'
import { usePlace } from '@/lib/hooks/use-place'

/**
 * The current-state screen: one glance, no controls.
 *
 * Two columns on a desktop or the car's own landscape display, one on a phone, in the
 * order the eye should move: what the car is doing → how much battery is left → where it
 * is → the things that would need attention.
 *
 * That order is only the default. Every widget can be dragged to a new place by its
 * header grip and the layout is remembered, because the sequence that reads well from
 * the driver's seat is not the sequence that reads well on a phone in a pocket.
 *
 * It reads from the feed the shell already holds and adds exactly one extra request, for
 * the trip history behind the Energy card. Nothing here polls on a timer of its own and
 * nothing here can send a command: the refresh control lives in the app header, because a
 * re-read is not a vehicle action but a button that *looks* like one belongs somewhere
 * other than the middle of a display you glance at while driving.
 */
export default function DashboardPage() {
  const feed = useFeed()
  const now = useNow(1_000)
  const [layout, saveLayout, resetLayout] = useDashboardLayout()
  const status = feed.snapshot?.status ?? null
  const age = feed.snapshot ? ageSecondsSince(feed.snapshot.collectedAt, now) : Number.NaN

  const [trips, setTrips] = React.useState<Trip[]>([])
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await fetch('/api/history?range=30d', { cache: 'no-store' })
      if (!response.ok) return
      const payload = (await response.json()) as { history?: { trips?: Trip[] } }
      if (!cancelled) setTrips(payload.history?.trips ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const { place } = usePlace(status?.drive.latitude ?? null, status?.drive.longitude ?? null)

  if (feed.loading && !status) {
    return (
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="space-y-3">
          <PanelSkeleton rows={4} className="h-[300px]" />
          <PanelSkeleton rows={3} className="h-[150px]" />
        </div>
        <div className="space-y-3">
          <PanelSkeleton rows={2} className="h-[170px]" />
          <PanelSkeleton rows={4} className="h-[360px]" />
        </div>
      </div>
    )
  }

  // The two states where there is no car to describe. Both say which of the two
  // problems it is, because "no data" and "no vehicle connected" read identically
  // otherwise and are fixed in different places.
  if (!status) {
    return (
      <div className="mx-auto w-full max-w-[560px] space-y-3 pt-6">
        {feed.error && (
          <section className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3">
            <p className="text-[13.5px] font-medium text-danger">{feed.error.message}</p>
          </section>
        )}
        <section className="rounded-xl border border-line bg-surface p-5">
          {feed.needsConnection ? (
            <>
              <h2 className="text-[15px] font-semibold text-ink">No vehicle in this app yet</h2>
              <p className="mt-1 text-[13px] leading-5 text-ink-secondary">
                Authorizing the account and listing its vehicles are separate steps. Settings shows which of the two is still missing.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-[15px] font-semibold text-ink">No snapshot stored yet</h2>
              <p className="mt-1 text-[13px] leading-5 text-ink-secondary">
                {feed.message ?? 'Nothing has been read from the vehicle yet. The first read happens when the car is awake, and the app never wakes it to fill this screen.'}
              </p>
            </>
          )}
          <Link href="/settings" className="mt-4 inline-flex h-10 items-center rounded-lg border border-accent bg-accent px-4 text-[13.5px] font-medium text-ink-inverse hover:brightness-95">
            Open settings
          </Link>
        </section>
      </div>
    )
  }

  // Built once per render and placed by id, so the grid owns the order and this file owns
  // what each widget needs. Creating ten elements that all mount anyway costs nothing.
  const cards: Record<DashboardCardId, React.ReactNode> = {
    vehicle: <VehicleCard status={status} place={place} />,
    battery: <BatteryCard status={status} />,
    climate: <ClimateCard status={status} />,
    'battery-health': <BatteryHealthCard status={status} />,
    energy: <EnergyCard trips={trips} />,
    realtime: <RealtimeCard status={status} />,
    location: <LocationCard status={status} place={place} ageSeconds={age} />,
    charging: <ChargingCard status={status} />,
    health: <HealthCard status={status} />,
    tyre: <TyreCard status={status} />,
  }

  // Worth a control only once there is something to undo.
  const arranged = JSON.stringify(toStorage(layout)) !== JSON.stringify(toStorage(DEFAULT_LAYOUT))

  return (
    <div className="mx-auto w-full max-w-[1220px] space-y-3">
      <DashboardHeader status={status} ageSeconds={age} onResetLayout={arranged ? resetLayout : undefined} />

      {/* A failed read is information about the data, not a control, so it stays — but
          as one line, not a banner that pushes the car off the screen. */}
      {feed.error && (
        <p className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-[12.5px] leading-4 text-warn">
          {feed.error.message} — the figures below are the last ones received.
        </p>
      )}

      <DashboardGrid layout={layout} onCommit={saveLayout}>
        {(id) => cards[id]}
      </DashboardGrid>
    </div>
  )
}
