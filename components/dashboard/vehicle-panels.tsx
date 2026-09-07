'use client'

import * as React from 'react'
import { BatteryCharging, Car, Circle, Clock, Gauge as GaugeIcon, MapPin, Navigation, Route as RouteIcon, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActivityEvent, VehicleStatus, VehicleStatusSnapshot } from '@/lib/tesla/models'
import { formatAge, formatKm, formatKmh, formatKw, formatPercent, formatTempCelsius } from '@/lib/format'
import { ageSecondsSince, useNow } from '@/lib/hooks/use-now'

/**
 * Dashboard surfaces. The map carries floating overlay cards rather than feeding a
 * grid of panels; the context card is icon-left rows with no dividers; secondary
 * values sit inline behind separators instead of becoming cards.
 */

export function MetricRow({ icon: Icon, children, muted }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; muted?: boolean }) {
  return (
    <li className={cn('flex items-start gap-2.5 text-[13.5px] leading-5', muted ? 'text-ink-tertiary' : 'text-ink')}>
      <Icon className="mt-[1px] size-4 shrink-0 text-ink-tertiary" aria-hidden />
      <span className="min-w-0">{children}</span>
    </li>
  )
}

/** Floating map card (§7). Compact on purpose: it is a map annotation, not a panel. */
export function VehicleContextCard({ status, snapshot, onClose }: { status: VehicleStatus; snapshot: VehicleStatusSnapshot; onClose?: () => void }) {
  const now = useNow(1_000)
  const age = ageSecondsSince(snapshot.collectedAt, now)
  const hasPosition = status.drive.latitude !== null && status.drive.longitude !== null
  const speed = status.drive.speedKmh ?? 0

  return (
    <div className="pointer-events-auto w-[min(320px,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-3.5 shadow-lg">
      <div className="flex items-start gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-muted">
          <Car className="size-5 text-ink-secondary" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold leading-5 text-ink">{status.displayName}</p>
          <p className="truncate text-[11.5px] leading-4 text-ink-tertiary">
            {status.identity.vin ?? (status.identity.ownerApiId ? `id ${status.identity.ownerApiId}` : 'no identifier')}
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" className="-m-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-tertiary hover:bg-surface-muted hover:text-ink">
            <span aria-hidden className="text-[18px] leading-none">×</span>
          </button>
        )}
      </div>

      <ul className="mt-3 space-y-2">
        {speed > 0 && (
          <MetricRow icon={GaugeIcon}>
            <span className="font-mono">{formatKmh(speed)}</span>
          </MetricRow>
        )}
        <MetricRow icon={BatteryCharging}>
          <span className="font-mono">{formatPercent(status.charge.stateOfCharge)}</span>
          <span className="text-ink-tertiary"> · </span>
          <span className="font-mono">{status.charge.ratedRangeKm !== null ? formatKm(status.charge.ratedRangeKm) : 'range n/a'}</span>
        </MetricRow>
        {status.drive.powerKw !== null && (
          <MetricRow icon={Zap}>
            <span className="font-mono">{formatKw(status.drive.powerKw)}</span>
          </MetricRow>
        )}
        {hasPosition && (
          <MetricRow icon={MapPin}>
            <span className="font-mono text-[12.5px]">
              {status.drive.latitude!.toFixed(4)}, {status.drive.longitude!.toFixed(4)}
            </span>
          </MetricRow>
        )}
        {status.presence === 'charging' && status.charge.chargerPowerKw !== null && (
          <MetricRow icon={Zap}>
            Charging at <span className="font-mono">{formatKw(status.charge.chargerPowerKw)}</span>
          </MetricRow>
        )}
        <MetricRow icon={Clock} muted>
          Updated {Number.isFinite(age) ? formatAge(age) : "—"}
        </MetricRow>
      </ul>
    </div>
  )
}

/** Floating legend: explains marker colour and shape without a tooltip. */
export function MapLegend({ presences }: { presences: string[] }) {
  const rows = [
    { key: 'driving', label: 'Driving', color: 'var(--blue)' },
    { key: 'charging', label: 'Charging', color: 'var(--green)' },
    { key: 'parked', label: 'Parked', color: 'var(--ink-tertiary)' },
    { key: 'sleeping', label: 'Sleeping', color: 'var(--ink-tertiary)' },
    { key: 'offline', label: 'Offline', color: 'var(--border-strong)' },
  ].filter((row) => presences.includes(row.key))

  if (!rows.length) return null
  return (
    <div className="pointer-events-auto rounded-lg border border-line bg-surface p-2.5 shadow-md">
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2 text-[12px] text-ink-secondary">
            <svg viewBox="0 0 24 24" className="size-3" style={{ fill: row.color }} aria-hidden>
              <path d="M12 1.6 19.4 21.8 12 17.2 4.6 21.8Z" />
            </svg>
            {row.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** §7 live summary: four figures large enough to read at a glance, rest inline. */
export function LiveSummary({ status, snapshot }: { status: VehicleStatus; snapshot: VehicleStatusSnapshot }) {
  const now = useNow(1_000)
  const age = ageSecondsSince(snapshot.collectedAt, now)
  const primary = [
    { label: 'Battery', value: formatPercent(status.charge.stateOfCharge) },
    { label: 'Range', value: status.charge.ratedRangeKm !== null ? formatKm(status.charge.ratedRangeKm) : '—' },
    { label: 'Speed', value: status.drive.speedKmh !== null ? formatKmh(status.drive.speedKmh) : '—' },
    { label: 'Power', value: status.drive.powerKw !== null ? formatKw(status.drive.powerKw) : '—' },
  ]

  const secondary = [
    { label: 'Odometer', value: status.state.odometerKm !== null ? formatKm(status.state.odometerKm) : null },
    { label: 'Cabin', value: formatTempCelsius(status.climate.insideTempC) },
    { label: 'Outside', value: formatTempCelsius(status.climate.outsideTempC) },
    { label: 'Software', value: status.state.softwareVersion },
    { label: 'Doors', value: status.state.locked === null ? null : status.state.locked ? 'Locked' : 'Unlocked' },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value) && item.value !== '—')

  return (
    <section className="rounded-xl border border-line bg-surface p-3.5" aria-label="Current vehicle state">
      <div className="flex items-end gap-x-6 gap-y-3 overflow-x-auto sm:gap-x-8">
        {primary.map((item) => (
          <div key={item.label} className="min-w-[76px] shrink-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-tertiary">{item.label}</p>
            <p className="mt-0.5 whitespace-nowrap font-mono text-[24px] font-semibold leading-8 tracking-[-0.02em] text-ink sm:text-[28px]">{item.value}</p>
          </div>
        ))}
        <span className="ml-auto shrink-0 pb-1.5 font-mono text-[11.5px] text-ink-tertiary">
          {snapshot.source === 'tesla_api' ? 'live' : 'cached'} · {Number.isFinite(age) ? formatAge(age) : '—'}
        </span>
      </div>

      {secondary.length > 0 && (
        <dl className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-2.5 text-[12.5px]">
          {secondary.map((item, index) => (
            <React.Fragment key={item.label}>
              {index > 0 && <span aria-hidden className="text-ink-tertiary">·</span>}
              <div className="flex items-baseline gap-1.5">
                <dt className="text-ink-tertiary">{item.label}</dt>
                <dd className="font-mono text-ink">{item.value}</dd>
              </div>
            </React.Fragment>
          ))}
        </dl>
      )}
    </section>
  )
}

// English event labels, at the point of use.
const EVENT_TEXT: Record<ActivityEvent['type'], { title: string; icon: React.ComponentType<{ className?: string }> }> = {
  trip_started: { title: 'Trip started', icon: Navigation },
  trip_completed: { title: 'Trip completed', icon: RouteIcon },
  charging_started: { title: 'Charging started', icon: Zap },
  charging_completed: { title: 'Charging completed', icon: BatteryCharging },
  charging_stopped: { title: 'Charging stopped', icon: Circle },
  vehicle_parked: { title: 'Vehicle parked', icon: Car },
  vehicle_woke: { title: 'Vehicle woke up', icon: Circle },
  vehicle_fell_asleep: { title: 'Vehicle fell asleep', icon: Circle },
  climate_started: { title: 'Climate on', icon: Circle },
  software_update_started: { title: 'Update started', icon: Circle },
  software_update_completed: { title: 'Update completed', icon: Circle },
  credentials_rejected: { title: 'Tesla rejected credentials', icon: Circle },
  collection_failed: { title: 'Collection failed', icon: Circle },
}

/** §7 recent activity: icon, title, time, one secondary line. */
export function RecentActivity({ events, emptyLabel = 'No activity yet' }: { events: ActivityEvent[]; emptyLabel?: string }) {
  const now = useNow(5_000)
  if (!events.length) {
    return <p className="py-4 text-center text-[13px] text-ink-tertiary">{emptyLabel}</p>
  }
  return (
    <ol className="divide-y divide-line">
      {events.map((event) => {
        const meta = EVENT_TEXT[event.type] ?? { title: event.type, icon: Circle }
        const Icon = meta.icon
        const age = ageSecondsSince(event.at, now)
        return (
          <li key={event.id} className="flex items-center gap-2.5 py-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-line bg-surface-muted">
              <Icon className="size-3 text-ink-secondary" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{event.title || meta.title}</span>
            {event.detail && <span className="hidden shrink-0 font-mono text-[11.5px] text-ink-tertiary sm:block">{event.detail}</span>}
            <time className="shrink-0 font-mono text-[11.5px] text-ink-tertiary">{Number.isFinite(age) ? formatAge(age) : '—'}</time>
          </li>
        )
      })}
    </ol>
  )
}

export function PanelSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2.5', className)} aria-busy="true">
      {Array.from({ length: rows }, (_, index) => index).map((index) => (
        <div key={index} className="h-4 animate-pulse rounded-md bg-surface-muted" style={{ width: `${88 - index * 12}%` }} />
      ))}
    </div>
  )
}
