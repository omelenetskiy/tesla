'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Ring gauge, matching the reference screens: a thick arc with rounded caps, visible
 * gaps between segments, and the number in the centre rather than beside it.
 *
 * Hand-drawn in SVG instead of pulling in a chart type for this: Recharts' Pie forces
 * a legend, tooltip and animation model onto a component that is really a single
 * number, and the gap/cap geometry is exact here.
 */

export type GaugeSegment = {
  value: number
  /** Any CSS colour; pass a token like `var(--blue)` so theming keeps working. */
  color: string
  label?: string
}

function polar(cx: number, cy: number, radius: number, angleDegrees: number) {
  const radians = ((angleDegrees - 90) * Math.PI) / 180
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) }
}

/** Arc path with a padding angle, so segments read as separate strokes. */
function arcPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polar(cx, cy, radius, endAngle)
  const end = polar(cx, cy, radius, startAngle)
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

export function Gauge({
  value,
  max = 100,
  size = 168,
  thickness = 13,
  color = 'var(--blue)',
  trackColor = 'var(--surface-muted)',
  center,
  caption,
  className,
  label,
}: {
  value: number | null
  max?: number
  size?: number
  thickness?: number
  color?: string
  trackColor?: string
  /** Centre figure; defaults to the percentage. Pass a formatted string to override. */
  center?: string
  caption?: string
  className?: string
  label?: string
}) {
  const radius = (size - thickness) / 2
  const cx = size / 2
  const cy = size / 2
  const ratio = value === null || !Number.isFinite(value) || max <= 0 ? 0 : Math.min(1, Math.max(0, value / max))
  // A full ring would have no visible cap, so the sweep is capped just short of 360°.
  const sweep = ratio <= 0 ? 0 : Math.min(359.5, ratio * 360)

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? `${center ?? Math.round(ratio * 100)}${caption ? ` ${caption}` : ''}`}>
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke={trackColor} strokeWidth={thickness} />
          {sweep > 0.5 && (
            <path
              d={arcPath(cx, cy, radius, 0, sweep)}
              fill="none"
              stroke={color}
              strokeWidth={thickness}
              strokeLinecap="round"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[30px] font-semibold leading-none tracking-[-0.02em] text-ink">
            {center ?? (value === null ? '—' : `${Math.round(ratio * 100)}%`)}
          </span>
          {caption && <span className="mt-1.5 text-[12.5px] leading-4 text-ink-tertiary">{caption}</span>}
        </div>
      </div>
    </div>
  )
}

/**
 * Multi-segment ring for composition ("how is the energy split", "how many sessions
 * by charger type"), with the same gap and cap geometry.
 */
export function SegmentGauge({
  segments,
  size = 168,
  thickness = 13,
  gapDegrees = 6,
  center,
  caption,
  className,
}: {
  segments: GaugeSegment[]
  size?: number
  thickness?: number
  gapDegrees?: number
  center?: string
  caption?: string
  className?: string
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0)
  const radius = (size - thickness) / 2
  const cx = size / 2
  const cy = size / 2
  const usable = Math.max(0, 360 - (segments.length > 1 ? gapDegrees * segments.length : 0))

  // Built in a single fold so no outer variable is reassigned during render.
  const arcs = segments
    .filter((segment) => segment.value > 0)
    .reduce<Array<{ segment: GaugeSegment; start: number; sweep: number }>>(
      (accumulator, segment) => {
        const sweep = (Math.max(0, segment.value) / (total || 1)) * usable
        const start = accumulator.length === 0 ? 0 : (accumulator.at(-1)?.start ?? 0) + (accumulator.at(-1)?.sweep ?? 0) + gapDegrees
        return [...accumulator, { segment, start, sweep }]
      },
      [],
    )

  const paths = arcs.map(({ segment, start, sweep }, index) => {
    // A single 100 % segment needs a full ring, not a zero-length arc.
    if (sweep >= 359) {
      return <circle key={index} cx={cx} cy={cy} r={radius} fill="none" stroke={segment.color} strokeWidth={thickness} />
    }
    return <path key={index} d={arcPath(cx, cy, radius, start, start + Math.max(sweep, 0.6))} fill="none" stroke={segment.color} strokeWidth={thickness} strokeLinecap="round" />
  })

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          {paths}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[30px] font-semibold leading-none tracking-[-0.02em] text-ink">{center}</span>
          {caption && <span className="mt-1.5 max-w-[70%] text-[12.5px] leading-4 text-ink-tertiary">{caption}</span>}
        </div>
      </div>
      {segments.some((segment) => segment.label) && (
        <ul className="mt-4 w-full space-y-1">
          {segments.map((segment) => (
            <li key={segment.label ?? segment.color} className="flex items-center gap-2 text-[13px]">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: segment.color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-ink-secondary">{segment.label}</span>
              <span className="shrink-0 font-mono text-ink underline decoration-line-offset-4">{Math.round(segment.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
