'use client'

import React from 'react'
import { Card } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

interface DataPoint {
  timestamp: string
  value: number
  label?: string
}

const formatEdgeLabel = (point: DataPoint) => point.label || new Date(point.timestamp).toLocaleDateString()

export function LineChart({
  data,
  title,
  unit = '%',
  height = 'h-64',
}: {
  data: DataPoint[]
  title: string
  unit?: string
  height?: string
}) {
  if (!data || data.length === 0) {
    return (
      <Card className={cn('flex items-center justify-center p-6', height)}>
        <div className="text-sm text-ink-tertiary">No data available</div>
      </Card>
    )
  }

  const values = data.map((point) => point.value)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const range = maxValue - minValue || 1
  const latestValue = values[values.length - 1]
  const normalized = values.map((value) => ((value - minValue) / range) * 100)

  return (
    <Card className={cn('p-6', height)}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-ink">{title}</h3>
          <p className="mt-1 text-sm text-ink-tertiary">
            {minValue.toFixed(0)} to {maxValue.toFixed(0)} {unit}
          </p>
        </div>
        <div className="rounded-full border border-accent-line bg-accent-soft px-3 py-1 text-sm font-medium text-accent">
          {latestValue.toFixed(1)} {unit}
        </div>
      </div>

      <div className="flex h-[calc(100%-4.5rem)] min-h-[12rem] items-end gap-2">
        {normalized.map((value, index) => {
          const barHeight = Math.max(value, 8)
          const currentValue = values[index]

          return (
            <div key={`${data[index].timestamp}-${index}`} className="group relative flex h-full flex-1 items-end">
              <div
                className="w-full rounded-[18px] border border-accent-line/50 bg-accent/12 transition-[transform,opacity,background-color] duration-200 group-hover:-translate-y-1 group-hover:bg-accent/18"
                style={{ height: `${barHeight}%` }}
                title={`${currentValue.toFixed(1)}${unit}`}
              >
                <div className="h-full w-full rounded-[18px] bg-linear-to-t from-accent via-accent to-accent/45 opacity-90" />
              </div>
              <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-full border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100">
                {currentValue.toFixed(1)} {unit}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-ink-tertiary">
        <span>{formatEdgeLabel(data[0])}</span>
        <span>{formatEdgeLabel(data[data.length - 1])}</span>
      </div>
    </Card>
  )
}

export function ProgressBar({
  value,
  max = 100,
  label,
  color = 'bg-accent',
  showValue = true,
}: {
  value: number
  max?: number
  label?: string
  color?: string
  showValue?: boolean
}) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0

  return (
    <div className="space-y-2">
      {(label || showValue) && (
        <div className="flex items-center justify-between gap-3">
          {label ? <label className="text-[13px] font-medium text-ink-secondary">{label}</label> : <span />}
          {showValue ? <span className="text-[13px] font-medium text-ink-tertiary">{value.toFixed(0)} / {max.toFixed(0)}</span> : null}
        </div>
      )}
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface-muted">
        <div className={cn('h-full rounded-full transition-[width] duration-300', color)} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  )
}

export function MetricsSummary({
  metrics,
}: {
  metrics: Array<{
    label: string
    value: string | number
    unit?: string
    trend?: 'up' | 'down' | 'stable'
  }>
}) {
  const trendLabel: Record<'up' | 'down' | 'stable', { copy: string; tone: string }> = {
    up: { copy: 'Rising', tone: 'text-ok' },
    down: { copy: 'Lower', tone: 'text-warn' },
    stable: { copy: 'Stable', tone: 'text-ink-tertiary' },
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {metrics.map((metric) => (
        <Card key={metric.label} className="p-5">
          <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">{metric.label}</div>
          <div className="mt-3 flex items-end gap-2">
            <div className="font-mono text-3xl font-semibold tracking-[-0.03em] text-ink">{metric.value}</div>
            {metric.unit ? <span className="pb-1 text-sm text-ink-secondary">{metric.unit}</span> : null}
          </div>
          {metric.trend ? <div className={cn('mt-3 text-sm font-medium', trendLabel[metric.trend].tone)}>{trendLabel[metric.trend].copy}</div> : null}
        </Card>
      ))}
    </div>
  )
}

export function TimelineChart({
  events,
  title,
}: {
  events: Array<{
    time: string
    title: string
    description?: string
    status: 'completed' | 'in_progress' | 'pending'
  }>
  title: string
}) {
  const statusStyles: Record<'completed' | 'in_progress' | 'pending', string> = {
    completed: 'bg-ok',
    in_progress: 'bg-accent',
    pending: 'bg-ink-tertiary',
  }

  return (
    <Card className="p-6">
      <h3 className="mb-6 text-lg font-semibold tracking-[-0.02em] text-ink">{title}</h3>

      <div className="space-y-5">
        {events.map((event, index) => (
          <div key={`${event.time}-${event.title}`} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={cn('size-3 rounded-full', statusStyles[event.status])} />
              {index < events.length - 1 ? <div className="mt-2 h-full min-h-10 w-px bg-line" /> : null}
            </div>
            <div className="flex-1 pb-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="font-semibold text-ink">{event.title}</h4>
                  {event.description ? <p className="mt-1 text-sm text-ink-secondary">{event.description}</p> : null}
                </div>
                <span className="shrink-0 text-sm text-ink-tertiary">{new Date(event.time).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
