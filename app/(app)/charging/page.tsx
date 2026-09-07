'use client'

import * as React from 'react'
import { Clock, MapPin, Zap } from 'lucide-react'
import { Gauge } from '@/components/ui/gauge'
import { Badge } from '@/components/ui/badge'
import { ChargePowerChart } from '@/components/charts/telemetry-charts'
import { MetricRow, PanelSkeleton } from '@/components/dashboard/vehicle-panels'
import { useFeed } from '@/components/shell/app-shell'
import type { ChargingSession } from '@/lib/tesla/models'
import { cn } from '@/lib/utils'
import { formatAmps, formatDateTimeShort, formatDuration, formatKm, formatKw, formatKwh, formatPercent, formatTime, groupByDay } from '@/lib/format'

/** Charging = ENERGY INPUT (§10). A live session dominates; history sits below it. */
export default function ChargingPage() {
  const feed = useFeed()
  const [sessions, setSessions] = React.useState<ChargingSession[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await fetch('/api/history?range=90d', { cache: 'no-store' })
      if (!response.ok) return
      const payload = (await response.json()) as { history?: { charging?: ChargingSession[] } }
      if (cancelled) return
      setSessions(payload.history?.charging ?? [])
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const status = feed.snapshot?.status ?? null
  const charge = status?.charge
  const charging = status?.presence === 'charging'

  const groups = React.useMemo(() => groupByDay(sessions, (session) => session.startedAt), [sessions])
  const totals = React.useMemo(() => {
    const energy = sessions.reduce((sum, session) => sum + (session.energyAddedKwh ?? 0), 0)
    const minutes = sessions.reduce((sum, session) => sum + (session.durationMinutes ?? 0), 0)
    return { energy, minutes, count: sessions.length }
  }, [sessions])

  return (
    <div className="space-y-3">
      <section className={cn('rounded-xl border p-4', charging ? 'border-ok-line bg-ok-soft/40' : 'border-line bg-surface')} aria-label={charging ? 'Current charging session' : 'Charging'}>
        {charging && charge && status ? (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
            <Gauge value={charge.stateOfCharge} size={150} thickness={12} caption="battery" color="var(--green)" />
            <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-7 gap-y-4 sm:grid-cols-3">
              <Figure label="Power" value={formatKw(charge.chargerPowerKw)} />
              <Figure label="Added" value={formatKwh(charge.chargeSessionEnergyAddedKwh)} />
              <Figure label="Range added" value={charge.chargeSessionAddedRangeKm !== null ? formatKm(charge.chargeSessionAddedRangeKm) : '—'} />
              <Figure label="Time to full" value={charge.minutesToFullCharge !== null ? formatDuration(charge.minutesToFullCharge) : '—'} />
              <Figure label="Voltage" value={charge.chargerVoltage !== null ? `${charge.chargerVoltage} V` : '—'} />
              <Figure label="Current" value={formatAmps(charge.chargerActualCurrentA)} />
            </dl>
            <div className="w-full sm:w-auto sm:min-w-[200px]">
              <Badge variant="ok">{charge.chargingConnection === 'charging' ? 'Charging' : charge.chargingConnection}</Badge>
              <ul className="mt-2.5 space-y-2 text-[13px]">
                {charge.fastChargerType && (
                  <MetricRow icon={Zap}>
                    {charge.fastChargerPresent ? 'DC fast charging' : 'AC charging'} · {charge.fastChargerType}
                  </MetricRow>
                )}
                {status.drive.latitude !== null && status.drive.longitude !== null && (
                  <MetricRow icon={MapPin}>
                    <span className="font-mono text-[12.5px]">
                      {status.drive.latitude.toFixed(4)}, {status.drive.longitude.toFixed(4)}
                    </span>
                  </MetricRow>
                )}
                <MetricRow icon={Clock} muted>
                  Updated {formatDateTimeShort(feed.snapshot?.collectedAt)}
                </MetricRow>
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-5">
            <Gauge value={charge?.stateOfCharge ?? null} size={112} thickness={10} caption="battery" color="var(--ink-tertiary)" />
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-ink">Not charging</p>
              <p className="mt-1 max-w-[520px] text-[12.5px] leading-5 text-ink-secondary">
                {status ? `Connector state: ${charge?.chargingConnection ?? 'unknown'}. Session history below.` : 'No current snapshot — history below is built from stored data.'}
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface" aria-label="Charging history">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
          <h2 className="mr-auto text-[14px] font-semibold text-ink">History</h2>
          <span className="font-mono text-[12.5px] text-ink-secondary">{totals.count} sessions</span>
          <span className="font-mono text-[12.5px] text-ink-tertiary">{formatKwh(totals.energy || null)}</span>
          <span className="font-mono text-[12.5px] text-ink-tertiary">{formatDuration(totals.minutes || null)}</span>
        </div>

        {loading && <div className="p-4"><PanelSkeleton rows={4} /></div>}

        {!loading && !sessions.length && (
          <p className="px-4 py-8 text-center text-[13px] leading-5 text-ink-tertiary">
            No charging sessions yet. Sessions are derived from telemetry snapshots, so they appear once collection runs.
          </p>
        )}

        {!loading && sessions.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
            <ul className="divide-y divide-line">
              {groups.map((group) => (
                <li key={group.key}>
                  <p className="bg-surface-muted px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-tertiary">{group.heading}</p>
                  <ul className="divide-y divide-line">
                    {group.items.map((session) => (
                      <li key={session.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                        <span className="w-[46px] shrink-0 font-mono text-[12.5px] text-ink">{formatTime(session.startedAt)}</span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-secondary">
                          {session.locationLabel ?? (session.fastCharger ? 'DC fast charger' : session.chargerType ? String(session.chargerType) : 'Charging')}
                        </span>
                        <span className="shrink-0 font-mono text-[12.5px] text-ink">{formatKwh(session.energyAddedKwh)}</span>
                        <span className="shrink-0 font-mono text-[12px] text-ink-secondary">
                          {formatPercent(session.batteryStartPercent)} → {formatPercent(session.batteryEndPercent)}
                        </span>
                        <span className="w-[62px] shrink-0 text-right font-mono text-[12px] text-ink-tertiary">{formatDuration(session.durationMinutes)}</span>
                        {!session.completed && <Badge variant="warn">unfinished</Badge>}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            <div className="border-t border-line p-4 lg:border-l lg:border-t-0">
              <h3 className="mb-2 text-[12.5px] font-medium text-ink-secondary">Average power per session</h3>
              <ChargePowerChart sessions={sessions.slice(0, 20)} height={180} />
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-tertiary">{label}</dt>
      <dd className="mt-0.5 font-mono text-[17px] leading-6 text-ink">{value}</dd>
    </div>
  )
}
