'use client'

import React from 'react'
import { RefreshCw, ShieldCheck, Zap } from 'lucide-react'
import { BatteryWidget, LastTripWidget, ChargingWidget, EfficiencyWidget, StatsWidget } from '@/components/dashboard-widgets'
import { LineChart, MetricsSummary } from '@/components/ui/charts'
import { TripsTable } from '@/components/ui/table'
import { Button, Card, Badge } from '@/components/ui/primitives'

export default function DashboardPage() {
  const batteryPercent = 75
  const [refreshing, setRefreshing] = React.useState(false)

  const handleRefresh = () => {
    setRefreshing(true)
    window.setTimeout(() => setRefreshing(false), 900)
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="p-6 sm:p-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">Live telemetry</Badge>
                <Badge variant="success">Vehicle online</Badge>
              </div>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-ink sm:text-5xl">
                Dashboard
              </h1>
              <p className="mt-3 max-w-[58ch] text-base leading-7 text-ink-secondary">
                Battery, charging, and route state in one view with faster scanning and cleaner metric hierarchy.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-line bg-surface-muted px-4 py-3">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
                  <ShieldCheck className="size-3.5" />
                  System
                </div>
                <div className="mt-2 text-lg font-semibold text-ink">Sync healthy</div>
              </div>
              <Button variant="primary" size="md" isLoading={refreshing} onClick={handleRefresh}>
                {!refreshing && <RefreshCw className="size-4" />}
                Refresh
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">Charging window</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink">Tonight 01:00</h2>
            </div>
            <div className="grid size-11 place-items-center rounded-2xl border border-line bg-surface-muted text-accent">
              <Zap className="size-5" />
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-2xl border border-line bg-surface-muted p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">Next goal</div>
              <div className="mt-2 text-lg font-semibold text-ink">80% by departure</div>
            </div>
            <div className="rounded-2xl border border-line p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">Automation</div>
              <div className="mt-2 text-sm font-semibold text-ink">Off-peak charging is armed and waiting for cheap energy.</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <BatteryWidget level={batteryPercent} range={338} />
        <LastTripWidget distance={45.2} efficiency={220} date="2026-09-15T12:00:00.000Z" />
        <ChargingWidget lastCharge="2026-09-15T08:00:00.000Z" nextCharge="2026-09-16T12:00:00.000Z" />
        <EfficiencyWidget current={220} average={225} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsWidget label="Total distance" value="5,432" unit="km" icon="Road" />
        <StatsWidget label="Sessions" value="24" icon="Grid" />
        <StatsWidget label="Avg efficiency" value="21.8" unit="kWh/100 km" icon="Energy" />
        <StatsWidget label="Last charge" value="2h" icon="Recent" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <LineChart
          data={[
            { timestamp: '2026-09-15T11:00:00.000Z', value: 65 },
            { timestamp: '2026-09-15T11:15:00.000Z', value: 68 },
            { timestamp: '2026-09-15T11:30:00.000Z', value: 71 },
            { timestamp: '2026-09-15T11:45:00.000Z', value: 73 },
            { timestamp: '2026-09-15T12:00:00.000Z', value: batteryPercent },
          ]}
          title="Battery level"
          unit="%"
          height="h-80"
        />

        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">Health snapshot</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink">Battery health</h2>
            </div>
            <Badge variant="success">Stable</Badge>
          </div>
          <MetricsSummary
            metrics={[
              { label: 'Health', value: 'Excellent', trend: 'stable' },
              { label: 'Cycles', value: '234', trend: 'up' },
              { label: 'Degradation', value: '3.2', unit: '%', trend: 'down' },
            ]}
          />
        </Card>
      </div>

      <Card className="p-0">
        <div className="border-b border-line px-6 py-5">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">Recent history</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink">Trips</h2>
        </div>
        <div className="p-2 sm:p-3">
          <TripsTable trips={[]} isLoading={false} />
        </div>
      </Card>
    </div>
  )
}
