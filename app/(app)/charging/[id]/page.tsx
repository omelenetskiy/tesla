'use client'

import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { BatteryCharging, Clock3, MapPin, PlugZap } from 'lucide-react'
import { Card, Badge } from '@/components/ui/primitives'
import { LineChart, MetricsSummary } from '@/components/ui/charts'
import { Alert, EmptyState, LoadingState } from '@/components/ui/forms'

const ChargingLocationMap = dynamic(
  () => import('@/components/map').then((mod) => ({ default: mod.ChargingLocationMap })),
  {
    loading: () => <div className="h-96 animate-pulse rounded-3xl bg-surface-muted" />,
    ssr: false,
  },
)

interface PageProps {
  params: { id: string }
}

type ChargerType = 'L1' | 'L2' | 'L3' | 'DC'

interface ChargingSample {
  timestamp: string
  soc: number
  power: number
}

interface ChargingSession {
  id: string
  startTime: string
  endTime: string
  location: {
    lat: number
    lng: number
    name: string
  } | null
  chargerType: ChargerType
  startSoc: number | null
  endSoc: number | null
  energyAdded: number | null
  maxPower: number | null
  avgPower: number | null
  cost?: number | null
  samples: ChargingSample[]
}

const chargerVariant: Record<ChargerType, 'warning' | 'info' | 'success' | 'error'> = {
  L1: 'warning',
  L2: 'info',
  L3: 'success',
  DC: 'error',
}

const chargerCopy: Record<ChargerType, string> = {
  L1: 'Low power overnight charging',
  L2: 'Home or destination charging',
  L3: 'Fast AC charging session',
  DC: 'High power rapid charging',
}

export default function ChargingDetailPageV2({ params }: PageProps) {
  const [session, setSession] = useState<ChargingSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadSession = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`/api/charging/${params.id}`, { cache: 'no-store' })
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null
          throw new Error(payload?.message ?? 'Failed to load charging details')
        }

        const payload = (await response.json()) as ChargingSession
        if (!cancelled) setSession(payload)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load charging details')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadSession()
    return () => {
      cancelled = true
    }
  }, [params.id])

  if (loading) return <LoadingState message="Loading charging details..." />
  if (error) return <Alert variant="error" title="Error" message={error} onClose={() => setError(null)} />
  if (!session) {
    return (
      <EmptyState
        icon="🚫"
        title="Session not found"
        description="The charging session does not exist."
      />
    )
  }

  const duration = (new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 1000 / 60

  return (
    <div className="space-y-6">
      <Card className="p-6 sm:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">Completed</Badge>
              <Badge variant={chargerVariant[session.chargerType]}>{session.chargerType}</Badge>
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-ink sm:text-5xl">
              Charging session
            </h1>
            <p className="mt-3 max-w-[56ch] text-base leading-7 text-ink-secondary">
              {new Date(session.startTime).toLocaleDateString()} at {session.location?.name ?? 'unknown location'}.{' '}
              {Math.max(1, Math.round(duration))} minutes of charging and{' '}
              {session.energyAdded == null ? 'an unknown amount of energy' : `${session.energyAdded.toFixed(1)} kWh added`}.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="rounded-2xl border border-line bg-surface-muted px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
                <PlugZap className="size-3.5" />
                Charger
              </div>
              <div className="mt-2 text-lg font-semibold text-ink">{chargerCopy[session.chargerType]}</div>
            </div>
            <div className="rounded-2xl border border-line px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
                <Clock3 className="size-3.5" />
                Timeline
              </div>
              <div className="mt-2 text-lg font-semibold text-ink">
                {new Date(session.startTime).toLocaleTimeString()} to{' '}
                {new Date(session.endTime).toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <MetricsSummary
        metrics={[
          { label: 'Energy added', value: session.energyAdded == null ? 'Unavailable' : session.energyAdded.toFixed(1), unit: session.energyAdded == null ? undefined : 'kWh', trend: session.energyAdded == null ? undefined : 'up' },
          { label: 'Start SOC', value: session.startSoc == null ? 'Unavailable' : session.startSoc.toFixed(0), unit: session.startSoc == null ? undefined : '%', trend: session.startSoc == null ? undefined : 'stable' },
          { label: 'End SOC', value: session.endSoc == null ? 'Unavailable' : session.endSoc.toFixed(0), unit: session.endSoc == null ? undefined : '%', trend: session.endSoc == null ? undefined : 'up' },
          { label: 'Max power', value: session.maxPower == null ? 'Unavailable' : session.maxPower.toFixed(0), unit: session.maxPower == null ? undefined : 'kW', trend: session.maxPower == null ? undefined : 'up' },
          { label: 'Avg power', value: session.avgPower == null ? 'Unavailable' : session.avgPower.toFixed(0), unit: session.avgPower == null ? undefined : 'kW', trend: session.avgPower == null ? undefined : 'stable' },
          ...(typeof session.cost === 'number'
            ? [{ label: 'Cost', value: session.cost.toFixed(2), unit: '$', trend: 'stable' as const }]
            : []),
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-line px-6 py-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
              Location
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink">Charging map</h2>
          </div>
          <div className="p-3">
            {session.location ? (
              <ChargingLocationMap
                latitude={session.location.lat}
                longitude={session.location.lng}
                name={session.location.name}
              />
            ) : (
              <Alert variant="warning" title="Map unavailable" message="Charging coordinates are missing for this session." />
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
                Site details
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink">Charger</h2>
            </div>
            <div className="grid size-11 place-items-center rounded-2xl border border-line bg-surface-muted text-accent">
              <BatteryCharging className="size-5" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-line bg-surface-muted p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">Type</div>
              <div className="mt-3 flex items-center gap-3">
                <Badge variant={chargerVariant[session.chargerType]}>{session.chargerType}</Badge>
                <span className="text-sm text-ink-secondary">{chargerCopy[session.chargerType]}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-line p-4">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
                <MapPin className="size-3.5" />
                Location
              </div>
              <div className="mt-3 text-lg font-semibold text-ink">{session.location?.name ?? 'Unknown location'}</div>
              <div className="mt-1 text-sm text-ink-secondary">
                {session.location ? `${session.location.lat.toFixed(5)}, ${session.location.lng.toFixed(5)}` : 'No coordinates'}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-line p-4">
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">From</div>
                <div className="mt-2 text-lg font-semibold text-ink">{session.startSoc == null ? 'Unavailable' : `${session.startSoc.toFixed(0)}%`}</div>
              </div>
              <div className="rounded-2xl border border-line p-4">
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">To</div>
                <div className="mt-2 text-lg font-semibold text-ink">{session.endSoc == null ? 'Unavailable' : `${session.endSoc.toFixed(0)}%`}</div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <LineChart
          data={session.samples.map((sample) => ({ timestamp: sample.timestamp, value: sample.power }))}
          title="Power during charging"
          unit="kW"
          height="h-80"
        />

        <LineChart
          data={session.samples.map((sample) => ({ timestamp: sample.timestamp, value: sample.soc }))}
          title="Battery level during charging"
          unit="%"
          height="h-80"
        />
      </div>
    </div>
  )
}
