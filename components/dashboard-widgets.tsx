'use client'
import React from 'react'
import {
  Activity,
  BatteryCharging,
  Gauge,
  PlugZap,
  Route,
  TimerReset,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ProgressBar } from '@/components/ui/charts'
import { cn } from '@/lib/utils'
import { formatKwhPer100Km } from '@/lib/format'

function WidgetFrame({
  title,
  eyebrow,
  badge,
  icon: Icon,
  children,
  className,
}: {
  title: string
  eyebrow: string
  badge?: { label: string; variant: 'default' | 'success' | 'error' | 'warning' | 'info' }
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn('p-6', className)}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">{eyebrow}</div>
          <h3 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-ink">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
          <div className="grid size-11 place-items-center rounded-2xl border border-line bg-surface-muted text-ink-secondary">
            <Icon className="size-5" />
          </div>
        </div>
      </div>
      {children}
    </Card>
  )
}

const formatDate = (value: string) => new Date(value).toLocaleDateString()
const formatDateTime = (value: string) => new Date(value).toLocaleString()

export function BatteryWidget({ level, range }: { level: number; range: number }) {
  const batteryVariant = level >= 60 ? 'success' : level >= 30 ? 'warning' : 'error'

  return (
    <WidgetFrame
      title="Battery"
      eyebrow="Energy"
      badge={{
        label: level >= 60 ? 'Healthy' : level >= 30 ? 'Watch' : 'Low',
        variant: batteryVariant,
      }}
      icon={BatteryCharging}
    >
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="font-mono text-5xl font-semibold tracking-tighter text-ink">{level}%</div>
            <p className="mt-2 text-sm text-ink-secondary">
              Projected range {range} km on the current state of charge.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface-muted px-4 py-3 text-right">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
              Pack window
            </div>
            <div className="mt-1 text-lg font-semibold text-ink">72 / 75 kWh</div>
          </div>
        </div>
        <ProgressBar
          value={level}
          max={100}
          color={level >= 30 ? 'bg-accent' : 'bg-danger'}
          showValue={false}
        />
      </div>
    </WidgetFrame>
  )
}

export function LastTripWidget({
  distance,
  efficiency,
  date,
}: {
  distance: number
  efficiency: number
  date: string
}) {
  return (
    <WidgetFrame
      title="Last trip"
      eyebrow="Route"
      badge={{ label: 'Complete', variant: 'info' }}
      icon={Route}
    >
      <div className="grid gap-4 sm:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="font-mono text-4xl font-semibold tracking-[-0.04em] text-ink">
            {distance.toFixed(1)} km
          </div>
          <p className="mt-2 text-sm text-ink-secondary">
            Average efficiency landed at {formatKwhPer100Km(efficiency)} for the most recent drive.
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface-muted p-4">
          <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
            <TimerReset className="size-3.5" />
            Logged
          </div>
          <div className="mt-3 text-base font-semibold text-ink">{formatDate(date)}</div>
          <div className="mt-1 text-sm text-ink-secondary">Trip summary ready for export and map detail.</div>
        </div>
      </div>
    </WidgetFrame>
  )
}

export function ChargingWidget({
  lastCharge,
  nextCharge,
}: {
  lastCharge: string
  nextCharge?: string
}) {
  return (
    <WidgetFrame
      title="Charging"
      eyebrow="Session"
      badge={{ label: nextCharge ? 'Scheduled' : 'Standby', variant: nextCharge ? 'success' : 'default' }}
      icon={PlugZap}
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-line bg-surface-muted p-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
            Last charge
          </div>
          <div className="mt-2 text-base font-semibold text-ink">{formatDateTime(lastCharge)}</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-line p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
              Readiness
            </div>
            <div className="mt-2 text-lg font-semibold text-ink">Off-peak window</div>
          </div>
          <div className="rounded-2xl border border-line p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
              Next charge
            </div>
            <div className="mt-2 text-sm font-semibold text-ink">
              {nextCharge ? formatDateTime(nextCharge) : 'Not scheduled yet'}
            </div>
          </div>
        </div>
      </div>
    </WidgetFrame>
  )
}

export function EfficiencyWidget({
  current,
  average,
}: {
  current: number
  average: number
}) {
  const moreEfficient = current <= average

  return (
    <WidgetFrame
      title="Efficiency"
      eyebrow="Drive quality"
      badge={{
        label: moreEfficient ? 'Improving' : 'Above avg',
        variant: moreEfficient ? 'success' : 'warning',
      }}
      icon={Gauge}
    >
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="font-mono text-4xl font-semibold tracking-[-0.04em] text-ink">
              {formatKwhPer100Km(current)}
            </div>
            <p className="mt-2 text-sm text-ink-secondary">
              Fleet baseline for your recent driving is {formatKwhPer100Km(average)}.
            </p>
          </div>
          <div
            className={cn(
              'rounded-2xl border px-4 py-3 text-sm font-medium',
              moreEfficient
                ? 'border-ok-line bg-ok-soft text-ok'
                : 'border-warn-line bg-warn-soft text-warn',
            )}
          >
            {moreEfficient ? 'Using less energy than average' : 'Using more energy than average'}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-line p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
              Current
            </div>
            <div className="mt-2 text-lg font-semibold text-ink">{formatKwhPer100Km(current)}</div>
          </div>
          <div className="rounded-2xl border border-line p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
              Average
            </div>
            <div className="mt-2 text-lg font-semibold text-ink">{formatKwhPer100Km(average)}</div>
          </div>
        </div>
      </div>
    </WidgetFrame>
  )
}

export function StatsWidget({
  label,
  value,
  unit,
  icon,
}: {
  label: string
  value: number | string
  unit?: string
  icon?: string
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">{label}</div>
          <div className="mt-3 flex items-end gap-2">
            <div className="font-mono text-3xl font-semibold tracking-[-0.04em] text-ink">{value}</div>
            {unit ? <span className="pb-1 text-sm text-ink-secondary">{unit}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line bg-surface-muted px-3 py-1.5 text-[12px] font-medium text-ink-secondary">
          <Activity className="size-3.5" />
          <span>{icon ?? 'Live'}</span>
        </div>
      </div>
    </Card>
  )
}
