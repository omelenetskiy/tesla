'use client'

import * as React from 'react'
import { VehicleMap, type MapMarker } from '@/components/map/vehicle-map'
import { PanelSkeleton } from '@/components/dashboard/vehicle-panels'
import { BatteryChart, PowerChart, SpeedChart, type TripSeriesPoint } from '@/components/charts/telemetry-charts'
import { Badge } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { useFeed } from '@/components/shell/app-shell'
import type { Trip } from '@/lib/tesla/models'
import { cn } from '@/lib/utils'
import { formatDateTimeShort, formatDuration, formatEfficiency, formatKm, formatKmh, formatKwh, formatPercent, groupByDay } from '@/lib/format'

/**
 * Trips = WHERE I WENT (§8). Master-detail: the list is grouped by day, and selecting
 * a trip draws and fits its route immediately.
 *
 * `confidence` is shown on every trip. One measured along a GPS route and one inferred
 * from a 15-minute odometer delta are not the same claim, and rendering them
 * identically would overstate the history.
 */
const SERIES = [
  { value: 'battery', label: 'Battery' },
  { value: 'speed', label: 'Speed' },
  { value: 'power', label: 'Power' },
] as const

type SeriesKey = (typeof SERIES)[number]['value']

export default function TripsPage() {
  const feed = useFeed()
  const [trips, setTrips] = React.useState<Trip[]>([])
  const [loaded, setLoaded] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [series, setSeries] = React.useState<TripSeriesPoint[]>([])
  const [metric, setMetric] = React.useState<SeriesKey>('battery')

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await fetch('/api/history?range=30d', { cache: 'no-store' })
      if (!response.ok) {
        if (!cancelled) setLoaded(true)
        return
      }
      const payload = (await response.json()) as { history?: { trips?: Trip[] } }
      if (cancelled) return
      const list = payload.history?.trips ?? []
      setTrips(list)
      setSelectedId((current) => current ?? list[0]?.id ?? null)
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Per-trip curves need the underlying snapshots; the trip record itself only
  // carries endpoints, so this is fetched for the selection alone.
  React.useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    void (async () => {
      const response = await fetch(`/api/history?range=90d&trip=${encodeURIComponent(selectedId)}`, { cache: 'no-store' })
      if (!response.ok) return
      const payload = (await response.json()) as { series?: TripSeriesPoint[] }
      if (!cancelled) setSeries(payload.series ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const loading = !loaded
  const selected = trips.find((trip) => trip.id === selectedId) ?? null
  const groups = React.useMemo(() => groupByDay(trips, (trip) => trip.startedAt), [trips])

  const markers = React.useMemo<MapMarker[]>(() => {
    if (!selected) return []
    const list: MapMarker[] = []
    if (selected.startLocation) list.push({ id: 'start', kind: 'start', longitude: selected.startLocation.longitude, latitude: selected.startLocation.latitude, label: 'Start' })
    if (selected.endLocation) list.push({ id: 'destination', kind: 'destination', longitude: selected.endLocation.longitude, latitude: selected.endLocation.latitude, label: 'End' })
    return list
  }, [selected])

  const chartPoints = series.length ? series : selected ? fallbackSeries(selected) : []

  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
      <section aria-label="Trip history" className="min-w-0 rounded-xl border border-line bg-surface">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <h2 className="mr-auto text-[14px] font-semibold text-ink">Trips</h2>
          <span className="font-mono text-[12px] text-ink-tertiary">{trips.length}</span>
        </div>
        <div className="max-h-[calc(100dvh-16rem)] overflow-y-auto">
          {loading && <div className="p-4"><PanelSkeleton rows={5} /></div>}
          {!loading && !trips.length && (
            <p className="px-4 py-8 text-center text-[13px] leading-5 text-ink-tertiary">
              No trips yet. They are derived from telemetry snapshots, so they appear once collection runs.
            </p>
          )}
          {groups.map((group) => (
            <div key={group.key}>
              <p className="sticky top-0 z-10 bg-surface-muted px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-tertiary">{group.heading}</p>
              <ul className="divide-y divide-line">
                {group.items.map((trip) => {
                  const active = trip.id === selectedId
                  return (
                    <li key={trip.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(trip.id)}
                        aria-current={active}
                        className={cn('flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors', active ? 'bg-accent-soft' : 'hover:bg-surface-muted')}
                      >
                        <span className={cn('truncate text-[13px] font-medium', active ? 'text-accent' : 'text-ink')}>
                          {trip.name ?? `${formatDateTimeShort(trip.startedAt)} → ${trip.endedAt ? formatDateTimeShort(trip.endedAt) : 'in progress'}`}
                        </span>
                        <span className="font-mono text-[12px] text-ink-secondary">
                          {formatKm(trip.distanceKm)} · {formatDuration(trip.durationMinutes)}
                        </span>
                        {trip.batteryStartPercent !== null && trip.batteryEndPercent !== null && (
                          <span className="font-mono text-[11.5px] text-ink-tertiary">
                            {formatPercent(trip.batteryStartPercent)} → {formatPercent(trip.batteryEndPercent)}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="min-w-0 space-y-3" aria-label="Trip details">
        {!selected && !loading && <div className="rounded-xl border border-dashed border-line bg-canvas p-8 text-center text-[13px] text-ink-tertiary">Select a trip</div>}

        {selected && (
          <>
            <VehicleMap
              markers={markers}
              route={selected.route.length >= 2 ? selected.route : []}
              fitRoute
              className="h-[34vh] min-h-[220px] w-full rounded-xl"
              placeholder={
                <div className="flex h-full items-center justify-center px-6 text-center">
                  <p className="max-w-[380px] text-[12.5px] leading-5 text-ink-tertiary">
                    No recorded route. This trip was measured by odometer delta, so there are no coordinates between the snapshots.
                  </p>
                </div>
              }
            />

            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="mr-auto min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">{selected.name ?? `Trip ${formatDateTimeShort(selected.startedAt)}`}</h2>
                {selected.partial && <Badge variant="warn">unfinished</Badge>}
                <Badge variant="outline">{confidenceLabel(selected.confidence)}</Badge>
              </div>
              <dl className="mt-3.5 grid grid-cols-2 gap-x-6 gap-y-3.5 sm:grid-cols-4">
                <Figure label="Distance" value={formatKm(selected.distanceKm)} />
                <Figure label="Duration" value={formatDuration(selected.durationMinutes)} />
                <Figure label="Average" value={formatKmh(selected.averageSpeedKmh)} />
                <Figure label="Max" value={formatKmh(selected.maxSpeedKmh)} />
                <Figure label="Energy" value={formatKwh(selected.energyUsedKwh)} />
                <Figure label="Efficiency" value={formatEfficiency(selected.efficiencyWhPerKm)} />
                <Figure label="Battery start" value={formatPercent(selected.batteryStartPercent)} />
                <Figure label="Battery end" value={formatPercent(selected.batteryEndPercent)} />
              </dl>
              {feed.snapshot?.status?.presence === 'driving' && !selected.endedAt && (
                <p className="mt-3 border-t border-line pt-2.5 text-[12px] text-ink-tertiary">Vehicle is currently moving — this trip has not closed yet.</p>
              )}
            </div>

            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h3 className="mr-auto text-[14px] font-semibold text-ink">Analytics</h3>
                <Segmented ariaLabel="Chart metric" size="sm" options={SERIES.map((item) => ({ value: item.value, label: item.label }))} value={metric} onChange={(value) => setMetric(value as SeriesKey)} />
              </div>
              {metric === 'battery' && <BatteryChart points={chartPoints.map((point) => ({ at: point.at, value: point.battery }))} height={190} />}
              {metric === 'speed' && <SpeedChart points={chartPoints} height={190} />}
              {metric === 'power' && <PowerChart points={chartPoints} height={190} />}
              {series.length === 0 && (
                <p className="mt-2 text-[11.5px] leading-4 text-ink-tertiary">
                  Only the trip endpoints are stored for this record, so the curve is a straight line between two measured points rather than a profile.
                </p>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-tertiary">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-[16px] leading-6 text-ink">{value}</dd>
    </div>
  )
}

function confidenceLabel(confidence: Trip['confidence']): string {
  if (confidence === 'gps_route') return 'GPS route'
  if (confidence === 'odometer_delta') return 'odometer'
  return 'snapshots'
}

/** Two measured endpoints, no invented interpolation. */
function fallbackSeries(trip: Trip): TripSeriesPoint[] {
  return [
    { at: trip.startedAt, battery: trip.batteryStartPercent, speedKmh: trip.averageSpeedKmh, powerKw: null },
    { at: trip.endedAt ?? trip.startedAt, battery: trip.batteryEndPercent, speedKmh: trip.maxSpeedKmh, powerKw: null },
  ]
}
