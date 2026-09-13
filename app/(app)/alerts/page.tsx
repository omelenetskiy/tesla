'use client'

import * as React from 'react'
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PanelSkeleton } from '@/components/dashboard/vehicle-panels'
import { useFeed } from '@/components/shell/app-shell'
import { countBySeverity, deriveAlerts, type AlertSeverity, type VehicleAlert } from '@/lib/tesla/alerts'
import { cn } from '@/lib/utils'

/**
 * Vehicle alerts — conditions the car itself is reporting, in the style of its own
 * service summary: one line per condition, worst first, each naming the field it came
 * from.
 *
 * API and integration problems are deliberately absent; they belong to the console.
 * A driver opening this screen is asking whether something is wrong with the car.
 */
const SEVERITY_STYLE: Record<AlertSeverity, { icon: typeof ShieldAlert; ring: string; text: string; label: string }> = {
  critical: { icon: ShieldAlert, ring: 'border-danger-line bg-danger-soft', text: 'text-danger', label: 'Critical' },
  warning: { icon: AlertTriangle, ring: 'border-warn-line bg-warn-soft', text: 'text-warn', label: 'Warning' },
  info: { icon: Info, ring: 'border-line bg-surface-muted', text: 'text-ink-secondary', label: 'Notice' },
}

export default function AlertsPage() {
  const feed = useFeed()
  const alerts = React.useMemo(() => deriveAlerts(feed.snapshot), [feed.snapshot])
  const counts = countBySeverity(alerts)

  if (feed.loading && !feed.snapshot) {
    return (
      <div className="h-full overflow-hidden rounded-xl border border-line bg-surface p-4">
        <PanelSkeleton rows={5} />
      </div>
    )
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface" aria-label="Vehicle alerts">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="mr-auto text-[14px] font-semibold text-ink">Vehicle status</h2>
          {counts.critical > 0 && <Badge variant="danger">{counts.critical} critical</Badge>}
          {counts.warning > 0 && <Badge variant="warn">{counts.warning} warnings</Badge>}
          {counts.info > 0 && <Badge variant="neutral">{counts.info} notices</Badge>}
        </div>

        {/* Scroll lives here, inside the card — the page itself never scrolls. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {alerts.length === 0 ? (
            <div className="flex items-start gap-3 px-4 py-8">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-ok-line bg-ok-soft">
                <CheckCircle2 className="size-5 text-ok" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-ink">Nothing reported</p>
                <p className="mt-1 max-w-[520px] text-[12.5px] leading-5 text-ink-secondary">
                  No conditions are flagged in the current snapshot. This is not a full vehicle diagnosis — the Fleet API exposes no fault codes, so only reported
                  conditions can appear here.
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
      </section>

      <aside className="flex min-h-0 flex-col gap-3">
        <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-3 text-[14px] font-semibold text-ink">What this checks</h2>
          <p className="px-4 py-3 text-[12.5px] leading-5 text-ink-secondary">
            Service mode, tyre pressures, the 12 V battery, doors and trunk open while parked, charging refusals, cabin-heat power, state of charge, software updates,
            Sentry and valet mode, and whether the car has reported recently.
          </p>
        </section>

        <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-3 text-[14px] font-semibold text-ink">Snapshot</h2>
          <dl className="space-y-2 px-4 py-3 text-[12.5px]">
            <Line term="Source" value={feed.source === 'tesla_api' ? 'Tesla, just now' : feed.source === 'cache' ? 'Stored snapshot' : 'None'} />
            <Line term="Age" value={feed.snapshot ? `${feed.snapshot.ageSeconds}s` : '—'} />
            <Line term="Freshness" value={feed.snapshot?.freshness ?? '—'} />
            <Line term="State" value={feed.snapshot?.status?.presence ?? '—'} />
          </dl>
        </section>
      </aside>
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

function AlertRow({ alert }: { alert: VehicleAlert }) {
  const style = SEVERITY_STYLE[alert.severity]
  const Icon = style.icon
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border', style.ring)}>
        <Icon className={cn('size-4', style.text)} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-ink">{alert.title}</p>
        {alert.detail && <p className="mt-0.5 font-mono text-[12px] text-ink-secondary">{alert.detail}</p>}
        <p className="mt-0.5 font-mono text-[11px] text-ink-tertiary">{alert.source}</p>
      </div>
      <span className={cn('mt-1 shrink-0 text-[11px] font-medium uppercase tracking-[0.04em]', style.text)}>{style.label}</span>
    </li>
  )
}
