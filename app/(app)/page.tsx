'use client'

import * as React from 'react'
import Link from 'next/link'
import { Crosshair, Expand, ListTree, Shrink } from 'lucide-react'
import { MapView, type MapMarker, type MapViewHandle } from '@/components/map/map-view'
import { LiveSummary, MapLegend, PanelSkeleton, RecentActivity, VehicleContextCard } from '@/components/dashboard/vehicle-panels'
import { IconButton } from '@/components/ui/segmented'
import { useFeed } from '@/components/shell/app-shell'
import type { ActivityEvent } from '@/lib/tesla/models'
import { useGeolocation } from '@/lib/hooks/use-geolocation'
import { cn } from '@/lib/utils'

/**
 * Dashboard = NOW (§7), sized so the whole thing fits one screen in the car:
 * map on the left, state and activity on the right, no scrolling to reach the
 * battery figure. The map is deliberately small and expands to fill the screen on
 * demand rather than dominating by default.
 */
export default function DashboardPage() {
  const feed = useFeed()
  const [events, setEvents] = React.useState<ActivityEvent[]>([])
  const [cardOpen, setCardOpen] = React.useState(true)
  const [expanded, setExpanded] = React.useState(false)
  const mapHandle = React.useRef<MapViewHandle | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await fetch('/api/history?range=7d', { cache: 'no-store' })
      if (!response.ok) return
      const payload = (await response.json()) as {
        history?: { trips?: Array<Record<string, unknown>>; charging?: Array<Record<string, unknown>> }
      }
      if (cancelled) return
      const derived: ActivityEvent[] = []
      for (const trip of payload.history?.trips ?? []) {
        if (!trip.endedAt) continue
        derived.push({
          id: `trip-${trip.startedAt}`,
          vehicleId: String(trip.vehicleId ?? ''),
          at: String(trip.endedAt),
          type: 'trip_completed',
          title: 'Trip completed',
          detail: describeTrip(trip),
          link: { kind: 'trip', id: String(trip.id) },
        })
      }
      for (const session of payload.history?.charging ?? []) {
        if (!session.endedAt) continue
        const completed = Boolean(session.completed)
        derived.push({
          id: `charge-${session.startedAt}`,
          vehicleId: String(session.vehicleId ?? ''),
          at: String(session.endedAt),
          type: completed ? 'charging_completed' : 'charging_stopped',
          title: completed ? 'Charging completed' : 'Charging stopped',
          detail: describeCharge(session),
          link: { kind: 'charging_session', id: String(session.id) },
        })
      }
      derived.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      setEvents(derived.slice(0, 10))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Esc leaves fullscreen, since a car browser has no back gesture on an overlay.
  React.useEffect(() => {
    if (!expanded) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [expanded])

  const status = feed.snapshot?.status ?? null
  const vehiclePosition = React.useMemo<[number, number] | null>(() => {
    if (!status || status.drive.latitude === null || status.drive.longitude === null) return null
    return [status.drive.longitude, status.drive.latitude]
  }, [status])

  // Only asked when the car has no fix, so a connected vehicle never triggers a
  // permission prompt.
  const geo = useGeolocation(!vehiclePosition)

  const markers = React.useMemo<MapMarker[]>(() => {
    if (status && vehiclePosition) {
      return [
        {
          id: 'vehicle',
          kind: 'vehicle',
          longitude: vehiclePosition[0],
          latitude: vehiclePosition[1],
          label: status.displayName,
          heading: status.drive.heading,
          presence: status.presence,
          selected: cardOpen,
          onSelect: () => setCardOpen(true),
        },
      ]
    }
    if (geo.position) {
      return [{ id: 'user', kind: 'user', longitude: geo.position[0], latitude: geo.position[1], label: 'Your location' }]
    }
    return []
  }, [status, vehiclePosition, geo.position, cardOpen])

  const mapNote = vehiclePosition
    ? null
    : geo.state === 'denied'
      ? 'Vehicle position unavailable, and location access was declined.'
      : geo.state === 'locating'
        ? 'Looking for a position to show…'
        : geo.position
          ? 'No vehicle position yet — showing your location.'
          : 'No position available yet. The map recentres once the car reports one.'

  /*
    Overlays are passed INTO MapView so they share its containing block. They used to
    be positioned against a separate wrapper around the map, which is why the canvas
    looked too short and the buttons looked detached from it.
  */
  const renderMap = (heightClass: string) => (
    <MapView
      ref={mapHandle}
      markers={markers}
      center={vehiclePosition ?? geo.position}
      followVehicle={Boolean(vehiclePosition)}
      fitRoute={false}
      note={mapNote}
      className={heightClass}
    >
      {status && vehiclePosition && (
        <div className="pointer-events-none absolute left-2.5 top-2.5">
          <MapLegend presences={[status.presence]} />
        </div>
      )}

      <div className="absolute right-2.5 top-2.5 flex flex-col gap-1.5">
        {/* Disabled rather than silently inert: with no vehicle fix and no browser
            location there is nowhere to centre on. */}
        <IconButton icon={Crosshair} label="Recentre map" disabled={!vehiclePosition && !geo.position} onClick={() => mapHandle.current?.recenter()} />
        <IconButton icon={expanded ? Shrink : Expand} label={expanded ? 'Exit fullscreen map' : 'Expand map'} active={expanded} onClick={() => setExpanded((previous) => !previous)} />
      </div>

      {status && vehiclePosition && cardOpen && !expanded && (
        <div className="pointer-events-none absolute bottom-2.5 right-2.5 flex justify-end">
          <VehicleContextCard status={status} snapshot={feed.snapshot!} onClose={() => setCardOpen(false)} />
        </div>
      )}
    </MapView>
  )

  if (expanded) {
    return (
      <div className="fixed inset-0 z-50 bg-canvas">
        {renderMap('h-full w-full rounded-none border-0')}
      </div>
    )
  }

  return (
    /*
      Vehicle state on the left, map on the right, everything inside one screen.
      The grid takes the full content height on desktop, the activity list scrolls
      inside its own card, and the map fills the right column instead of sitting on top
      of the page. On narrow screens the map leads, because there it is the glanceable
      widget and the state summary is a scroll away.
    */
    <div className="grid grid-cols-1 items-stretch gap-3 lg:h-full lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="order-2 flex min-w-0 flex-col gap-3 lg:order-1 lg:min-h-0">
        <div className="flex min-w-0 flex-col gap-3">
          {feed.loading && !status && (
            <section className="rounded-xl border border-line bg-surface p-3.5">
              <PanelSkeleton rows={2} />
            </section>
          )}
          {status && feed.snapshot && <LiveSummary status={status} snapshot={feed.snapshot} />}

          {!feed.loading && !status && !feed.needsConnection && (
            <section className="rounded-xl border border-dashed border-line bg-canvas p-4">
              <p className="text-[14px] font-medium text-ink">No snapshot yet</p>
              <p className="mt-1 text-[12.5px] leading-5 text-ink-secondary">
                {feed.message ?? 'This vehicle has not been collected from yet. Collection is limited by its mode — change it in Settings.'}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Link href="/settings" className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink shadow-xs hover:bg-surface-muted">
                  Collection mode
                </Link>
                <button type="button" onClick={() => void feed.refresh()} className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink shadow-xs hover:bg-surface-muted">
                  Try again
                </button>
              </div>
            </section>
          )}

          {feed.error && (
            <div className="rounded-xl border border-danger-line bg-danger-soft px-3.5 py-2.5">
              <p className="text-[13px] font-medium text-danger">{feed.error.message}</p>
              <Link href="/debug/api" className="mt-1 inline-block text-[12.5px] text-danger underline underline-offset-2">
                Inspect in the API console
              </Link>
            </div>
          )}

          {!feed.loading && feed.needsConnection && (
            <section className="rounded-xl border border-line bg-surface p-4">
              <p className="text-[14px] font-medium text-ink">No vehicle in this app yet</p>
              {/* Worded as the two separate facts it is. Pointing "Connect Tesla" here made
                  an already-authorized account look unauthorized, because this flag means
                  "no local vehicle row", not "no token". */}
              <p className="mt-1 text-[12.5px] leading-5 text-ink-secondary">
                Authorizing the account and listing its vehicles are different steps. Settings shows which of the two is still missing.
              </p>
              <Link href="/settings" className="mt-2.5 inline-flex h-10 items-center rounded-lg border border-accent bg-accent px-4 text-[13.5px] font-medium text-ink-inverse shadow-xs hover:brightness-95">
                Open settings
              </Link>
            </section>
          )}
        </div>

        <section className="flex min-h-0 flex-col rounded-xl border border-line bg-surface p-3.5 lg:flex-1" aria-label="Recent activity">
          <div className="mb-1 flex items-center gap-2">
            <ListTree className="size-4 text-ink-tertiary" aria-hidden />
            <h2 className="text-[13.5px] font-semibold text-ink">Recent activity</h2>
            <Link href="/trips" className="ml-auto text-[12.5px] text-accent hover:underline">
              Trips
            </Link>
          </div>
          {/* The scroll stays inside the card, so the page itself never scrolls on a
              desktop screen and the header and dock never drift out of reach. */}
          <div className="max-h-[38vh] overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
            <RecentActivity events={events} emptyLabel="Trips, charging and wake events appear here as data accumulates." />
          </div>
        </section>
      </div>

      <div className="order-1 min-w-0 lg:order-2">
        {/* Square, and capped by the viewport rather than by the column: a map that
            stretches to the full column height pushes the state summary out of the
            screen, and a square box is what keeps the vehicle arrow dead centre with
            equal breathing room on all four sides. */}
        {renderMap('mx-auto aspect-square w-full max-w-[min(100%,54vh)]')}
      </div>
    </div>
  )
}

function describeTrip(trip: Record<string, unknown>): string | null {
  const distance = typeof trip.distanceKm === 'number' ? `${trip.distanceKm.toFixed(1)} km` : null
  const minutes = typeof trip.durationMinutes === 'number' ? (trip.durationMinutes < 60 ? `${trip.durationMinutes}m` : `${Math.floor(trip.durationMinutes / 60)}h ${trip.durationMinutes % 60}m`) : null
  return [distance, minutes].filter(Boolean).join(' · ') || null
}

function describeCharge(session: Record<string, unknown>): string | null {
  const energy = typeof session.energyAddedKwh === 'number' ? `${session.energyAddedKwh.toFixed(1)} kWh` : null
  const from = typeof session.batteryStartPercent === 'number' ? session.batteryStartPercent : null
  const to = typeof session.batteryEndPercent === 'number' ? session.batteryEndPercent : null
  const soc = from !== null && to !== null ? `${from}% → ${to}%` : null
  return [energy, soc].filter(Boolean).join(' · ') || null
}
