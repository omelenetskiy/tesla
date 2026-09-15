'use client'

import * as React from 'react'
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, TimerReset, Wifi } from 'lucide-react'
import { PanelSkeleton } from '@/components/dashboard/vehicle-panels'
import { useFeed } from '@/components/shell/app-shell'
import { Badge, Card } from '@/components/ui/primitives'
import { countBySeverity, deriveAlerts, type AlertSeverity, type VehicleAlert } from '@/lib/tesla/alerts'
import { cn } from '@/lib/utils'

type Tone = 'default' | 'warning' | 'error'

const SEVERITY_STYLE: Record<AlertSeverity, { icon: typeof ShieldAlert; ring: string; text: string; label: string }> = {
  critical: { icon: ShieldAlert, ring: 'border-danger-line bg-danger-soft', text: 'text-danger', label: 'Critical' },
  warning: { icon: AlertTriangle, ring: 'border-warn-line bg-warn-soft', text: 'text-warn', label: 'Warning' },
  info: { icon: Info, ring: 'border-line bg-surface-muted', text: 'text-ink-secondary', label: 'Notice' },
}

const TONE_STYLES: Record<Tone, string> = {
  default: 'border-line bg-surface-muted text-ink',
  warning: 'border-warn-line bg-warn-soft text-warn',
  error: 'border-danger-line bg-danger-soft text-danger',
}

export default function AlertsPage() {
  const feed = useFeed()
  const alerts = React.useMemo(() => deriveAlerts(feed.snapshot), [feed.snapshot])
  const counts = countBySeverity(alerts)
  const totalAlerts = alerts.length
  const headlineVariant = counts.critical > 0 ? 'error' : counts.warning > 0 ? 'warning' : counts.info > 0 ? 'info' : 'success'
  const sourceLabel = feed.source === 'tesla_api' ? 'Tesla, just now' : feed.source === 'cache' ? 'Stored snapshot' : 'No source'

  if (feed.loading && !feed.snapshot) {
    return (
      <Card className="h-full overflow-hidden p-4">
        <PanelSkeleton rows={5} />
      </Card>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="p-6 sm:p-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">Vehicle diagnostics</Badge>
                <Badge variant={headlineVariant}>{totalAlerts > 0 ? `${totalAlerts} active` : 'No active conditions'}</Badge>
              </div>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-ink sm:text-5xl">Alerts</h1>
              <p className="mt-3 max-w-[58ch] text-base leading-7 text-ink-secondary">
                A tighter service summary for the car itself: urgent conditions first, recent state alongside them, and enough context to decide whether to act now or keep driving.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-105">
              <SummaryTile label="Critical" value={String(counts.critical)} tone="error" />
              <SummaryTile label="Warnings" value={String(counts.warning)} tone="warning" />
              <SummaryTile label="Snapshot age" value={feed.snapshot ? `${feed.snapshot.ageSeconds}s` : '—'} tone="default" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">Feed status</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink">{feed.snapshot?.status?.presence ?? 'offline'}</h2>
            </div>
            <div className="grid size-11 place-items-center rounded-2xl border border-line bg-surface-muted text-accent">
              <Wifi className="size-5" />
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div className="rounded-2xl border border-line bg-surface-muted p-4">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
                <TimerReset className="size-3.5" />
                Freshness
              </div>
              <div className="mt-2 text-lg font-semibold text-ink">{feed.snapshot?.freshness ?? 'Unavailable'}</div>
              <p className="mt-1 text-sm leading-6 text-ink-secondary">Source: {sourceLabel}</p>
            </div>

            <div className="rounded-2xl border border-line p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">Coverage</div>
              <p className="mt-2 text-sm leading-6 text-ink-secondary">
                Service mode, tyre pressure, 12 V battery, doors and trunk left open while parked, charging refusals, cabin heat draw, software updates, Sentry, valet mode, and reporting recency.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="flex min-h-0 flex-col p-0" aria-label="Vehicle alerts">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-5 py-4">
            <div className="mr-auto">
              <h2 className="text-sm font-semibold text-ink">Vehicle status</h2>
              <p className="mt-1 text-sm text-ink-secondary">Worst conditions first, each tied to the field that reported it.</p>
            </div>
            {counts.critical > 0 && <Badge variant="error">{counts.critical} critical</Badge>}
            {counts.warning > 0 && <Badge variant="warning">{counts.warning} warnings</Badge>}
            {counts.info > 0 && <Badge variant="default">{counts.info} notices</Badge>}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {alerts.length === 0 ? (
              <div className="flex items-start gap-4 px-5 py-8">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-ok-line bg-ok-soft">
                  <CheckCircle2 className="size-5 text-ok" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-base font-medium text-ink">Nothing reported</p>
                  <p className="mt-2 max-w-140 text-sm leading-6 text-ink-secondary">
                    No conditions are flagged in the current snapshot. This is still not a full vehicle diagnosis — Tesla exposes reported states here, not workshop fault codes.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {alerts.map((alert) => (
                  <AlertRow key={alert.id} alert={alert} />
                ))}
              </ul>
            )}
          </div>
        </Card>

        <aside className="flex min-h-0 flex-col gap-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Snapshot</h2>
            <dl className="mt-4 space-y-3 text-[12.5px]">
              <Line term="Source" value={sourceLabel} />
              <Line term="Age" value={feed.snapshot ? `${feed.snapshot.ageSeconds}s` : '—'} />
              <Line term="Freshness" value={feed.snapshot?.freshness ?? '—'} />
              <Line term="State" value={feed.snapshot?.status?.presence ?? '—'} />
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Severity guide</h2>
            <div className="mt-4 space-y-3">
              <GuideRow icon={ShieldAlert} label="Critical" tone="error" description="Act now or inspect before the next trip." />
              <GuideRow icon={AlertTriangle} label="Warning" tone="warning" description="Usable, but worth watching soon." />
              <GuideRow icon={Info} label="Notice" tone="default" description="Context that explains the current vehicle state." />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className={cn('rounded-2xl border p-4', TONE_STYLES[tone])}>
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-current/70">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-current">{value}</div>
    </div>
  )
}

function Line({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-tertiary">{term}</dt>
      <dd className="min-w-0 truncate font-mono text-ink">{value}</dd>
    </div>
  )
}

function GuideRow({
  icon: Icon,
  label,
  tone,
  description,
}: {
  icon: typeof ShieldAlert
  label: string
  tone: Tone
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl border', TONE_STYLES[tone])}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div>
        <div className="text-sm font-medium text-ink">{label}</div>
        <p className="mt-1 text-sm leading-6 text-ink-secondary">{description}</p>
      </div>
    </div>
  )
}

function AlertRow({ alert }: { alert: VehicleAlert }) {
  const style = SEVERITY_STYLE[alert.severity]
  const Icon = style.icon

  return (
    <li className="flex items-start gap-4 px-5 py-4">
      <span className={cn('mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl border', style.ring)}>
        <Icon className={cn('size-4', style.text)} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-medium text-ink">{alert.title}</p>
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em]', style.text, style.ring)}>{style.label}</span>
        </div>
        {alert.detail ? <p className="mt-1.5 font-mono text-[12px] text-ink-secondary">{alert.detail}</p> : null}
        <p className="mt-1.5 font-mono text-[11px] text-ink-tertiary">{alert.source}</p>
      </div>
    </li>
  )
}

