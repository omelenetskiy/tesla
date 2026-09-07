'use client'

import * as React from 'react'
import { BatteryChart, EnergyChart, RangeChart } from '@/components/charts/telemetry-charts'
import { Gauge } from '@/components/ui/gauge'
import { Segmented } from '@/components/ui/segmented'
import { PanelSkeleton } from '@/components/dashboard/vehicle-panels'
import { useFeed } from '@/components/shell/app-shell'
import type { BatterySnapshot } from '@/lib/tesla/models'
import { formatEfficiency, formatKm, formatPercent, formatTempCelsius } from '@/lib/format'

/**
 * Battery = ENERGY STATE (§9): current figure, then history, then health.
 *
 * The health panel is conditional by design. Degradation needs a long history of
 * full-charge references; publishing a number from a few days of snapshots would be
 * a fabrication, so the panel states what is missing instead.
 */
const RANGES = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
] as const

type Range = (typeof RANGES)[number]['value']

export default function BatteryPage() {
  const feed = useFeed()
  const [range, setRange] = React.useState<Range>('7d')
  const [snapshots, setSnapshots] = React.useState<BatterySnapshot[]>([])
  const [loadedRange, setLoadedRange] = React.useState<Range | null>(null)
  const [origin, setOrigin] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await fetch(`/api/history?range=${range}`, { cache: 'no-store' })
      if (!response.ok) {
        if (!cancelled) setLoadedRange(range)
        return
      }
      const payload = (await response.json()) as { history?: { battery?: BatterySnapshot[] }; origin?: string }
      if (cancelled) return
      setSnapshots(payload.history?.battery ?? [])
      setOrigin(payload.origin ?? null)
      setLoadedRange(range)
    })()
    return () => {
      cancelled = true
    }
  }, [range])

  const loading = loadedRange !== range
  const status = feed.snapshot?.status ?? null
  const soc = status?.charge.stateOfCharge ?? null

  const series = snapshots.map((snapshot) => ({ at: snapshot.at, value: snapshot.stateOfCharge }))
  const rangeSeries = snapshots.map((snapshot) => ({ at: snapshot.at, value: snapshot.ratedRangeKm }))
  const values = series.map((point) => point.value).filter((value): value is number => value !== null)
  const charging = snapshots.filter((snapshot) => snapshot.chargingConnection === 'charging').length

  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <section className="rounded-xl border border-line bg-surface p-4" aria-label="Current battery state">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <Gauge value={soc} size={158} caption="battery" />
          <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-7 gap-y-4 sm:grid-cols-3">
            <Figure label="Range" value={status?.charge.ratedRangeKm != null ? formatKm(status.charge.ratedRangeKm) : '—'} />
            <Figure label="Usable" value={formatPercent(status?.charge.usableStateOfCharge ?? null)} />
            <Figure label="Cabin temp" value={formatTempCelsius(status?.climate.insideTempC ?? null)} />
            <Figure label="Charge limit" value={formatPercent(status?.charge.chargeLimitPercent ?? null)} />
            <Figure label="Connector" value={status ? connectorLabel(status.charge.chargingConnection) : '—'} />
            <Figure label="Snapshot" value={feed.snapshot ? `${feed.snapshot.source === 'tesla_api' ? 'live' : 'cached'}` : '—'} />
          </dl>
        </div>
      </section>

      <section className="min-w-0 rounded-xl border border-line bg-surface p-4" aria-label="Battery history">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-[14px] font-semibold text-ink">Charge history</h2>
          <Segmented ariaLabel="History range" size="sm" options={RANGES.map((item) => ({ value: item.value, label: item.label }))} value={range} onChange={(value) => setRange(value as Range)} />
        </div>
        {loading && <PanelSkeleton rows={4} className="h-[210px]" />}
        {!loading && <BatteryChart points={series} height={210} />}
        {!loading && origin === 'reconstructed_from_snapshots' && snapshots.length > 0 && (
          <p className="mt-2 text-[11.5px] leading-4 text-ink-tertiary">
            Built from {snapshots.length} telemetry snapshots. Segments between snapshots are drawn as a line, not as measurements.
          </p>
        )}
      </section>

      <section className="min-w-0 rounded-xl border border-line bg-surface p-4" aria-label="Range history">
        <h2 className="mb-3 text-[14px] font-semibold text-ink">Range</h2>
        <RangeChart points={rangeSeries} height={180} />
      </section>

      <div className="min-w-0 space-y-3">
        <section className="rounded-xl border border-line bg-surface p-4" aria-label="Period figures">
          <h2 className="mb-3 text-[14px] font-semibold text-ink">Period figures</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5">
            <Figure label="Lowest" value={formatPercent(values.length ? Math.min(...values) : null)} />
            <Figure label="Highest" value={formatPercent(values.length ? Math.max(...values) : null)} />
            <Figure label="Snapshots charging" value={String(charging)} />
            <Figure label="Efficiency" value={formatEfficiency(efficiencyFrom(snapshots))} />
          </dl>
          <p className="mt-2.5 text-[11.5px] leading-4 text-ink-tertiary">
            Efficiency is range lost per percent of charge across driving snapshots — the only consumption figure the stored data supports directly.
          </p>
        </section>

        <section className="rounded-xl border border-line bg-surface p-4" aria-label="Battery health">
          <h2 className="text-[14px] font-semibold text-ink">Battery health</h2>
          {snapshots.length < 30 ? (
            <p className="mt-1.5 text-[12.5px] leading-5 text-ink-secondary">
              Not shown. Degradation needs at least 30 full-charge reference points over a long period; there are {snapshots.length}. Any figure here would be an
              extrapolation rather than a measurement.
            </p>
          ) : (
            <p className="mt-1.5 text-[12.5px] leading-5 text-ink-secondary">
              {snapshots.length} snapshots collected. Rated-capacity degradation still requires the Owner API to report full-charge capacity; until it does, this panel stays
              empty rather than estimating.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-tertiary">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-[17px] leading-6 text-ink">{value}</dd>
    </div>
  )
}

function connectorLabel(connection: string): string {
  if (connection === 'charging') return 'Charging'
  if (connection === 'complete') return 'Complete'
  if (connection === 'no_power') return 'No power'
  if (connection === 'stopped') return 'Stopped'
  if (connection === 'disconnected') return 'Disconnected'
  return 'Unknown'
}

/** Range lost per percent of charge, ignoring charging and odometer-less spans. */
function efficiencyFrom(snapshots: BatterySnapshot[]): number | null {
  const samples: number[] = []
  for (let index = 1; index < snapshots.length; index += 1) {
    const previous = snapshots[index - 1]
    const current = snapshots[index]
    if (current.chargingConnection === 'charging' || previous.chargingConnection === 'charging') continue
    const drop = (previous.stateOfCharge ?? 0) - (current.stateOfCharge ?? 0)
    const distance = (current.odometerKm ?? 0) - (previous.odometerKm ?? 0)
    if (drop > 0 && distance > 0.3) samples.push((drop * 1000) / distance)
  }
  if (!samples.length) return null
  return Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length)
}
