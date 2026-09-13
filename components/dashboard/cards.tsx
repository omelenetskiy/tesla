'use client'

import * as React from 'react'
import { useGridCard } from '@/components/dashboard/dashboard-grid'
import { cn } from '@/lib/utils'

/**
 * Presentation primitives for the status dashboard.
 *
 * Everything here is read-only by construction: there is no switch, slider, menu or
 * command in this file, because the screen it serves answers "what is the car doing" and
 * never "make the car do something". The header band is the exception — outside a grid it
 * is a label, inside one it is the strip react-grid-layout moves the card by, which asks
 * the *page* to change shape. The vehicle is not involved either way.
 *
 * Charts are hand-drawn SVG rather than Recharts on purpose. The dashboard is the one
 * screen that has to open fast on the vehicle's own cellular connection, and a 28 px
 * sparkline does not justify pulling a charting library into its bundle.
 */

export type Tone = 'ink' | 'muted' | 'ok' | 'warn' | 'danger'

const TONE_TEXT: Record<Tone, string> = {
  ink: 'text-ink',
  muted: 'text-ink-tertiary',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
}

const TONE_FILL: Record<Tone, string> = {
  ink: 'bg-ink-secondary',
  muted: 'bg-ink-tertiary',
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
}

export function Card({
  icon: Icon,
  title,
  aside,
  children,
  className,
  contentClassName,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
}) {
  // Inside a grid, the header band is the strip react-grid-layout drags the card by, and
  // nothing else in the card takes that gesture — which is what leaves the map free to be
  // panned. Outside one, the header is a label.
  const grid = useGridCard()

  return (
    <section className={cn('dash-card flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-xs', className)} aria-label={title}>
      {/*
        The card fills the box the grid gave it and clips anything that would reach further,
        so content can never be drawn over the card's own border. Its height is measured from
        this stack — header plus body — and the grid then makes the box exactly that tall, so
        the clip is a guarantee rather than something the layout leans on.

        The stack is `shrink-0` on purpose: if it could shrink, its measured height would be
        the box's, the box would be set from it, and every card would ratchet to zero.
      */}
      <div className="dash-stack shrink-0 grow-0">
        <header className={cn('mb-3 flex shrink-0 items-center gap-2', grid && 'dash-head')}>
          {Icon && <Icon className="size-[15px] shrink-0 text-ink-tertiary" aria-hidden />}
          <h2 className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-tertiary">{title}</h2>
          {aside && <div className="ml-auto flex shrink-0 items-center gap-2 text-[11.5px] text-ink-tertiary">{aside}</div>}
        </header>
        {/* The one place a card can be shorter than its content: a data change that arrives
            between two measurements. It scrolls rather than spilling. */}
        <div className={cn('dash-body min-h-0', contentClassName)}>{children}</div>
      </div>
    </section>
  )
}

/** The largest type on a card: a number the driver reads from across the cabin. */
export function Figure({ value, unit, label, tone = 'ink', size = 'xl' }: { value: React.ReactNode; unit?: string; label?: string; tone?: Tone; size?: 'xl' | 'lg' }) {
  return (
    <div className="min-w-0">
      <p className={cn('flex items-baseline gap-1 font-semibold leading-none tracking-[-0.03em]', size === 'xl' ? 'text-[40px]' : 'text-[28px]', TONE_TEXT[tone])}>
        <span className="tabular-nums">{value}</span>
        {unit && <span className={cn('font-medium tracking-normal text-ink-tertiary', size === 'xl' ? 'text-[15px]' : 'text-[13px]')}>{unit}</span>}
      </p>
      {label && <p className="mt-1.5 text-[12px] leading-4 text-ink-tertiary">{label}</p>}
    </div>
  )
}

/** Label left, value right. The unit of scanning on the health cards. */
export function InfoRow({ label, value, tone = 'ink', dot }: { label: string; value: React.ReactNode; tone?: Tone; dot?: Tone }) {
  return (
    <div className="flex items-center gap-2 py-[7px]">
      {dot && <span className={cn('size-[7px] shrink-0 rounded-full', TONE_FILL[dot])} aria-hidden />}
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-secondary">{label}</span>
      <span className={cn('shrink-0 text-[13px] font-medium tabular-nums', TONE_TEXT[tone])}>{value}</span>
    </div>
  )
}

/**
 * Horizontal meter. `mark` is a read-only reference line — the charge limit the car was
 * told to stop at, not a control, and drawn only when the vehicle actually reported one.
 */
export function Meter({ percent, tone = 'ok', mark }: { percent: number | null; tone?: Tone; mark?: number | null }) {
  const clamped = percent === null ? 0 : Math.max(0, Math.min(100, percent))
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={percent === null ? 'level unknown' : `${Math.round(clamped)} percent`}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', TONE_FILL[tone])} style={{ width: `${clamped}%` }} />
      {mark !== undefined && mark !== null && (
        <span className="absolute top-0 h-full w-[2px] rounded-full bg-ink-tertiary/70" style={{ left: `calc(${Math.max(0, Math.min(100, mark))}% - 1px)` }} aria-hidden />
      )}
      {percent === null && <span className="absolute inset-0 grid place-items-center text-[9px] font-medium uppercase tracking-wider text-ink-tertiary">no data</span>}
    </div>
  )
}

/**
 * Semicircular speed gauge.
 *
 * Track plus one arc, no needle and no tick marks: the number in the middle is the
 * reading, and the arc only has to show roughly how far up the scale that is.
 * `pathLength` normalises the arc to 100 units so the dasharray is the percentage.
 */
export function SpeedGauge({ value, max = 160, size = 132 }: { value: number | null; max?: number; size?: number }) {
  const ratio = value === null ? 0 : Math.max(0, Math.min(1, value / max))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size * 0.62 }}>
      <svg viewBox="0 0 200 124" className="absolute inset-0 h-full w-full" aria-hidden>
        <path d="M 16 108 A 84 84 0 0 1 184 108" fill="none" stroke="var(--surface-muted)" strokeWidth="11" strokeLinecap="round" />
        <path
          d="M 16 108 A 84 84 0 0 1 184 108"
          fill="none"
          stroke="var(--blue)"
          strokeWidth="11"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${ratio * 100} 100`}
          style={{ transition: 'stroke-dasharray 500ms ease' }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-1 flex flex-col items-center">
        <span className="font-mono text-[30px] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">{value === null ? '—' : Math.round(value)}</span>
        <span className="mt-1 text-[11px] text-ink-tertiary">km/h</span>
      </div>
    </div>
  )
}

/**
 * Compact trend line. Returns nothing rather than a flat line when there are fewer than
 * two points — a "trend" drawn through one measurement is a lie about the shape of the
 * data, and an absent chart reads as "not enough history yet".
 */
export function Sparkline({ values, height = 40, tone = 'var(--blue)' }: { values: Array<number | null>; height?: number; tone?: string }) {
  const points = values.map((value, index) => ({ index, value })).filter((point): point is { index: number; value: number } => point.value !== null && Number.isFinite(point.value))
  if (points.length < 2) return null

  const min = Math.min(...points.map((point) => point.value))
  const max = Math.max(...points.map((point) => point.value))
  const span = max - min
  const width = 100
  const coords = points.map((point) => {
    const x = (point.index / (values.length - 1)) * width
    // A flat series has span 0; centre it instead of dividing by zero.
    const y = span === 0 ? height / 2 : height - ((point.value - min) / span) * (height - 6) - 3
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  const last = coords[coords.length - 1].split(',')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-[40px] w-full" aria-hidden>
      <polyline points={`0,${height} ${coords.join(' ')} ${width},${height}`} fill={tone} fillOpacity="0.08" stroke="none" />
      <polyline points={coords.join(' ')} fill="none" stroke={tone} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="2" fill={tone} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Small right-hand status word, used where a whole row would be too loud. */
export function StateWord({ tone = 'muted', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={cn('text-[12.5px] font-medium', TONE_TEXT[tone])}>{children}</span>
}

export { TONE_FILL }
