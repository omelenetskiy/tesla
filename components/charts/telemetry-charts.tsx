'use client'

import * as React from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { BatterySnapshot, ChargingSession, Trip } from '@/lib/tesla/models'
import { formatDateTimeShort, formatDuration, formatKmh, formatKm, formatKwh, formatPercent, formatTime } from '@/lib/format'

/**
 * Reusable telemetry charts (§35).
 *
 * One shared visual system: no vertical gridlines, one faint horizontal pair, no
 * frame, sparse ticks, and the tooltip is the only chrome. §4's "clean data
 * visualization" and §35's "avoid too many gridlines" are the same instruction.
 *
 * Every chart distinguishes *no data* from *zero*: a null point is a gap, not a line
 * to the axis, because drawing 0 % battery where the provider said nothing would be
 * the fabrication §"never fabricate values" forbids.
 */

const AXIS = {
  stroke: 'var(--border)',
  tick: { fill: 'var(--ink-tertiary)', fontSize: 11 },
  tickLine: false as const,
  axisLine: false as const,
}

const GRID = { stroke: 'var(--border)', strokeDasharray: '2 4', vertical: false as const, horizontal: true as const }

type SeriesPoint = { at: string; value: number | null; label?: string }

function ChartFrame({ height = 220, emptyLabel, isEmpty, children }: { height?: number; emptyLabel: string; isEmpty: boolean; children: React.ReactNode }) {
  if (isEmpty) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-line bg-canvas text-[13px] text-ink-tertiary" style={{ height }}>
        {emptyLabel}
      </div>
    )
  }
  return (
    <div style={{ height }} className="w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  )
}

function TelemetryTooltip({ active, payload, label, unit }: { active?: boolean; payload?: Array<{ value?: number | string }>; label?: string; unit: string }) {
  if (!active || !payload?.length) return null
  const value = payload[0]?.value
  return (
    <div className="rounded-md border border-line bg-surface px-2.5 py-1.5 shadow-md">
      <p className="text-[11px] text-ink-tertiary">{label ? formatDateTimeShort(label) : ''}</p>
      <p className="font-mono text-[13px] text-ink">{typeof value === 'number' ? value : '—'} {unit}</p>
    </div>
  )
}

function withGaps<T extends SeriesPoint>(points: T[]) {
  // Recharts skips a segment when connectNulls is false, which is the honest render.
  return points.map((point) => ({ ...point, at: point.at }))
}

function timeTicks(points: SeriesPoint[], count = 5) {
  if (points.length < 2) return []
  const step = Math.max(1, Math.floor((points.length - 1) / (count - 1)))
  const ticks: string[] = []
  for (let index = 0; index < points.length; index += step) ticks.push(points[index].at)
  return ticks
}

// ── Battery ─────────────────────────────────────────────────────────────────
/** Charts take a plain `{at, value}` series so a caller never has to fake a snapshot. */
export type TimeSeries = Array<{ at: string; value: number | null }>

export function BatteryChart({ points, height = 240, lowThreshold = 20 }: { points: TimeSeries; height?: number; lowThreshold?: number }) {
  return (
    <ChartFrame height={height} isEmpty={points.length < 2} emptyLabel="Not enough charge snapshots to chart">
      <LineChart data={withGaps(points)} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="at" type="category" {...AXIS} ticks={timeTicks(points)} tickFormatter={(value: string) => formatTime(value)} interval="preserveStartEnd" minTickGap={24} />
        <YAxis domain={[0, 100]} tickCount={5} {...AXIS} tickFormatter={(value: number) => `${value}%`} />
        <Tooltip content={<TelemetryTooltip unit="%" />} />
        <ReferenceLine y={lowThreshold} stroke="var(--orange)" strokeDasharray="4 4" opacity={0.5} />
        <Line type="monotone" dataKey="value" stroke="var(--blue)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
      </LineChart>
    </ChartFrame>
  )
}

/** Secondary axis view for §9's range trend, same system as BatteryChart. */
export function RangeChart({ points, height = 200 }: { points: TimeSeries; height?: number }) {
  return (
    <ChartFrame height={height} isEmpty={points.length < 2} emptyLabel="No range data yet">
      <AreaChart data={withGaps(points)} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="rangeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--blue)" stopOpacity={0.16} />
            <stop offset="100%" stopColor="var(--blue)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="at" type="category" {...AXIS} ticks={timeTicks(points)} tickFormatter={(value: string) => formatTime(value)} minTickGap={24} />
        <YAxis {...AXIS} tickFormatter={(value: number) => `${value}`} />
        <Tooltip content={<TelemetryTooltip unit="km" />} />
        <Area type="monotone" dataKey="value" stroke="var(--blue)" strokeWidth={1.75} fill="url(#rangeFill)" isAnimationActive={false} connectNulls={false} />
      </AreaChart>
    </ChartFrame>
  )
}

// ── Speed / Power along a trip (§8's segmented control) ─────────────────────
export type TripSeriesPoint = { at: string; battery: number | null; speedKmh: number | null; powerKw: number | null }

export function SpeedChart({ points, height = 200 }: { points: TripSeriesPoint[]; height?: number }) {
  const series = points.map((point) => ({ at: point.at, value: point.speedKmh }))
  return (
    <ChartFrame height={height} isEmpty={series.length < 2} emptyLabel="No speed readings in this period">
      <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="at" type="category" {...AXIS} ticks={timeTicks(series)} tickFormatter={(value: string) => formatTime(value)} minTickGap={24} />
        <YAxis {...AXIS} tickFormatter={(value: number) => `${value}`} />
        <Tooltip content={<TelemetryTooltip unit="km/h" />} />
        <Line type="monotone" dataKey="value" stroke="var(--ink-secondary)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
      </LineChart>
    </ChartFrame>
  )
}

/**
 * Power chart keeps regeneration visible: negative values are not clipped, because
 * coasting back to the grid is real information about the drive.
 */
export function PowerChart({ points, height = 200 }: { points: TripSeriesPoint[]; height?: number }) {
  const series = points.map((point) => ({ at: point.at, value: point.powerKw }))
  return (
    <ChartFrame height={height} isEmpty={series.length < 2} emptyLabel="No power readings in this period">
      <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="at" type="category" {...AXIS} ticks={timeTicks(series)} tickFormatter={(value: string) => formatTime(value)} minTickGap={24} />
        <YAxis {...AXIS} />
        <Tooltip content={<TelemetryTooltip unit="kW" />} />
        <ReferenceLine y={0} stroke="var(--border-strong)" />
        <Area type="monotone" dataKey="value" stroke="var(--blue)" strokeWidth={1.75} fill="var(--blue)" fillOpacity={0.1} isAnimationActive={false} connectNulls={false} />
      </AreaChart>
    </ChartFrame>
  )
}

// ── Energy per day (§9's daily energy usage) ───────────────────────────────
export type DailyEnergyPoint = { day: string; kwh: number | null; distanceKm: number | null }

export function EnergyChart({ points, height = 220 }: { points: DailyEnergyPoint[]; height?: number }) {
  const series = points.map((point) => ({ at: point.day, value: point.kwh }))
  return (
    <ChartFrame height={height} isEmpty={points.length === 0} emptyLabel="No daily energy data yet">
      <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="at" type="category" {...AXIS} tickFormatter={(value: string) => formatTime(value)} minTickGap={16} />
        <YAxis {...AXIS} />
        <Tooltip content={<TelemetryTooltip unit="kWh" />} cursor={{ fill: 'var(--surface-muted)', opacity: 0.6 }} />
        <Bar dataKey="value" fill="var(--blue)" radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
      </BarChart>
    </ChartFrame>
  )
}

/** Charging power over one session (§10's current-session view). */
export function ChargePowerChart({ sessions, height = 180 }: { sessions: ChargingSession[]; height?: number }) {
  const series = sessions.map((session) => ({ at: session.startedAt, value: session.averagePowerKw }))
  return (
    <ChartFrame height={height} isEmpty={series.length < 2} emptyLabel="No charging power history">
      <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="at" type="category" {...AXIS} tickFormatter={(value: string) => formatTime(value)} minTickGap={20} />
        <YAxis {...AXIS} />
        <Tooltip content={<TelemetryTooltip unit="kW" />} cursor={{ fill: 'var(--surface-muted)', opacity: 0.6 }} />
        <Bar dataKey="value" fill="var(--green)" radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
      </BarChart>
    </ChartFrame>
  )
}

/** Compact stat used by every page's metric group instead of a card per number (§7). */
export function TripSummaryStrip({ trip }: { trip: Trip }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[13px]">
      <span className="text-ink">{trip.distanceKm !== null ? formatKm(trip.distanceKm) : '—'}</span>
      <span className="text-ink-secondary">{trip.durationMinutes !== null ? formatDuration(trip.durationMinutes) : '—'}</span>
      <span className="text-ink-secondary">{trip.averageSpeedKmh !== null ? formatKmh(trip.averageSpeedKmh) : '—'}</span>
      <span className="text-ink-secondary">{trip.energyUsedKwh !== null ? formatKwh(trip.energyUsedKwh) : '—'}</span>
      <span className="text-ink-secondary">
        {formatPercent(trip.batteryStartPercent)}
        {trip.batteryEndPercent !== null ? ` → ${formatPercent(trip.batteryEndPercent)}` : ''}
      </span>
    </div>
  )
}

export { formatKm, formatKwh, formatKmh }
