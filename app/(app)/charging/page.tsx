'use client'

import * as React from 'react'
import { BatteryCharging, Clock3, MapPin, TimerReset, Zap } from 'lucide-react'
import { ChargePowerChart } from '@/components/charts/telemetry-charts'
import { MetricRow, PanelSkeleton } from '@/components/dashboard/vehicle-panels'
import { useFeed } from '@/components/shell/app-shell'
import { Badge, Card } from '@/components/ui/primitives'
import { Gauge } from '@/components/ui/gauge'
import { formatAmps, formatDateTimeShort, formatDuration, formatKm, formatKw, formatKwh, formatPercent, formatTime, groupByDay } from '@/lib/format'
import type { ChargingSession } from '@/lib/tesla/models'
import { cn } from '@/lib/utils'

export default function ChargingPage() {
  const feed = useFeed()
  const [sessions, setSessions] = React.useState<ChargingSession[]>([])
  const [loading, setLoading] = React.useState(true)
  const [historyError, setHistoryError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const response = await fetch('/api/history?range=90d', { cache: 'no-store' })
        if (!response.ok) {
          if (cancelled) return
          setSessions([])
          setHistoryError('Could not load charging history. Please try again shortly.')
          return
        }

        const payload = (await response.json()) as { history?: { charging?: ChargingSession[] } }
        if (cancelled) return

        setSessions(payload.history?.charging ?? [])
        setHistoryError(null)
      } catch {
        if (cancelled) return
        setSessions([])
        setHistoryError('Could not load charging history. Please try again shortly.')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
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

  const averageEnergy = totals.count > 0 ? totals.energy / totals.count : 0
  const liveBadge = charging ? 'success' : 'default'
  const liveLabel = charging ? 'Charging now' : 'Idle'

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="p-6 sm:p-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">Energy input</Badge>
                <Badge variant={liveBadge}>{liveLabel}</Badge>
              </div>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-ink sm:text-5xl">Charging</h1>
              <p className="mt-3 max-w-[58ch] text-base leading-7 text-ink-secondary">
                Live charger state stays on top, while recent sessions below make it easier to review energy added, time spent, and where the car actually charged.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-120">
              <SummaryTile label="90d energy" value={formatKwh(totals.energy || null)} tone="accent" />
              <SummaryTile label="Sessions" value={String(totals.count)} tone="default" />
              <SummaryTile label="Avg / session" value={totals.count > 0 ? formatKwh(averageEnergy) : '—'} tone="success" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">Current connector</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink">{charge?.chargingConnection ?? 'Unknown'}</h2>
            </div>
            <div className="grid size-11 place-items-center rounded-2xl border border-line bg-surface-muted text-accent">
              <BatteryCharging className="size-5" />
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div className="rounded-2xl border border-line bg-surface-muted p-4">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
                <TimerReset className="size-3.5" />
                Latest telemetry
              </div>
              <div className="mt-2 text-lg font-semibold text-ink">{formatDateTimeShort(feed.snapshot?.collectedAt)}</div>
              <p className="mt-1 text-sm leading-6 text-ink-secondary">
                {charging && charge ? `${formatKw(charge.chargerPowerKw)} active input · ${formatAmps(charge.chargerActualCurrentA)}` : 'Waiting for a live charging session.'}
              </p>
            </div>

            <div className="rounded-2xl border border-line p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">History window</div>
              <p className="mt-2 text-sm leading-6 text-ink-secondary">
                Stored session history covers the last 90 days and is derived from telemetry snapshots, so unfinished sessions can appear before the car reports a final state.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card className={cn('p-6', charging ? 'border-ok-line bg-ok-soft/25' : '')} aria-label={charging ? 'Current charging session' : 'Charging status'}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={liveBadge}>{liveLabel}</Badge>
              {charge?.fastChargerType ? <Badge variant="info">{charge.fastChargerType}</Badge> : null}
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-ink">Current session</h2>
            <p className="mt-2 max-w-[62ch] text-sm leading-6 text-ink-secondary">
              {charging && charge
                ? 'Power, added energy, and location are kept together so the live session reads like a single charging story instead of disconnected metrics.'
                : status
                  ? `Connector state: ${charge?.chargingConnection ?? 'unknown'}. Historical sessions remain available below.`
                  : 'No current snapshot is available. Historical sessions remain available below.'}
            </p>
          </div>

          <div className="text-sm text-ink-secondary">Updated {formatDateTimeShort(feed.snapshot?.collectedAt)}</div>
        </div>

        <div className="mt-6">
          {charging && charge && status ? (
            <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)_260px]">
              <div className="rounded-3xl border border-line bg-surface p-5">
                <Gauge value={charge.stateOfCharge} size={170} thickness={13} caption="battery" color="var(--green)" />
              </div>

              <dl className="grid gap-x-5 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
                <Figure label="Power" value={formatKw(charge.chargerPowerKw)} />
                <Figure label="Added" value={formatKwh(charge.chargeSessionEnergyAddedKwh)} />
                <Figure label="Range added" value={charge.chargeSessionAddedRangeKm !== null ? formatKm(charge.chargeSessionAddedRangeKm) : '—'} />
                <Figure label="Time to full" value={charge.minutesToFullCharge !== null ? formatDuration(charge.minutesToFullCharge) : '—'} />
                <Figure label="Voltage" value={charge.chargerVoltage !== null ? `${charge.chargerVoltage} V` : '—'} />
                <Figure label="Current" value={formatAmps(charge.chargerActualCurrentA)} />
              </dl>

              <div className="rounded-3xl border border-line bg-surface-muted p-5">
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">Session notes</div>
                <ul className="mt-4 space-y-2.5 text-[13px]">
                  {charge.fastChargerType ? (
                    <MetricRow icon={Zap}>
                      {charge.fastChargerPresent ? 'DC fast charging' : 'AC charging'} · {charge.fastChargerType}
                    </MetricRow>
                  ) : null}
                  {status.drive.latitude !== null && status.drive.longitude !== null ? (
                    <MetricRow icon={MapPin}>
                      <span className="font-mono text-[12.5px]">
                        {status.drive.latitude.toFixed(4)}, {status.drive.longitude.toFixed(4)}
                      </span>
                    </MetricRow>
                  ) : null}
                  <MetricRow icon={Clock3} muted>
                    Updated {formatDateTimeShort(feed.snapshot?.collectedAt)}
                  </MetricRow>
                </ul>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-6 rounded-3xl border border-line bg-surface p-5">
              <Gauge value={charge?.stateOfCharge ?? null} size={120} thickness={10} caption="battery" color="var(--ink-tertiary)" />
              <div className="min-w-0 max-w-[60ch]">
                <p className="text-base font-medium text-ink">Not charging</p>
                <p className="mt-2 text-sm leading-6 text-ink-secondary">
                  The connector is currently idle. Use the session history below to review where charging happened, how much energy was added, and whether any session ended early.
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-0" aria-label="Charging history">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-5">
          <div className="mr-auto">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">Recent history</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink">Charging sessions</h2>
          </div>
          <span className="font-mono text-[12.5px] text-ink-secondary">{totals.count} sessions</span>
          <span className="font-mono text-[12.5px] text-ink-tertiary">{formatKwh(totals.energy || null)}</span>
          <span className="font-mono text-[12px] text-ink-tertiary">{formatDuration(totals.minutes || null)}</span>
        </div>

        {loading ? (
          <div className="p-6">
            <PanelSkeleton rows={4} />
          </div>
        ) : historyError ? (
          <div className="px-6 py-8">
            <div className="rounded-2xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger">{historyError}</div>
          </div>
        ) : !sessions.length ? (
          <p className="px-6 py-8 text-center text-sm leading-6 text-ink-tertiary">
            No charging sessions yet. Sessions appear once telemetry collection has captured a complete charging window.
          </p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]">
            <ul className="divide-y divide-line">
              {groups.map((group) => (
                <li key={group.key}>
                  <p className="bg-surface-muted px-6 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-tertiary">{group.heading}</p>
                  <ul className="divide-y divide-line">
                    {group.items.map((session) => (
                      <li key={session.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-6 py-3">
                        <span className="w-11.5 shrink-0 font-mono text-[12.5px] text-ink">{formatTime(session.startedAt)}</span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-secondary">
                          {session.locationLabel ?? (session.fastCharger ? 'DC fast charger' : session.chargerType ? String(session.chargerType) : 'Charging')}
                        </span>
                        <span className="shrink-0 font-mono text-[12.5px] text-ink">{formatKwh(session.energyAddedKwh)}</span>
                        <span className="shrink-0 font-mono text-[12px] text-ink-secondary">
                          {formatPercent(session.batteryStartPercent)} → {formatPercent(session.batteryEndPercent)}
                        </span>
                        <span className="w-15.5 shrink-0 text-right font-mono text-[12px] text-ink-tertiary">{formatDuration(session.durationMinutes)}</span>
                        {!session.completed ? <Badge variant="warning">unfinished</Badge> : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>

            <div className="border-t border-line p-6 xl:border-l xl:border-t-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">Power trend</div>
                  <h3 className="mt-2 text-lg font-semibold text-ink">Average power per session</h3>
                </div>
                <Badge variant="info">Last {Math.min(sessions.length, 20)}</Badge>
              </div>
              <div className="mt-5 rounded-3xl border border-line bg-surface-muted p-4">
                <ChargePowerChart sessions={sessions.slice(0, 20)} height={180} />
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'default' | 'accent' | 'success'
}) {
  const tones: Record<'default' | 'accent' | 'success', string> = {
    default: 'border-line bg-surface-muted text-ink',
    accent: 'border-accent-line bg-accent-soft text-accent',
    success: 'border-ok-line bg-ok-soft text-ok',
  }

  return (
    <div className={cn('rounded-2xl border p-4', tones[tone])}>
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-current/70">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-current">{value}</div>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-3xl border border-line bg-surface p-4">
      <dt className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-tertiary">{label}</dt>
      <dd className="mt-2 font-mono text-[18px] leading-6 text-ink">{value}</dd>
    </div>
  )
}
