'use client'

import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Card, Badge } from '@/components/ui/primitives'
import { LineChart, MetricsSummary, TimelineChart } from '@/components/ui/charts'
import { LoadingState, EmptyState, Alert } from '@/components/ui/forms'

const TripMap = dynamic(() => import('@/components/map').then((mod) => ({ default: mod.TripMap })), {
  loading: () => <div className="h-96 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />,
  ssr: false,
})

interface PageProps {
  params: Promise<{ id: string }>
}

interface TripSample {
  timestamp: string
  lat: number
  lng: number
  speed: number
  soc: number
  power: number
}

interface TripDetail {
  id: string
  startTime: string
  endTime: string
  distance: number | null
  startLocation: {
    lat: number
    lng: number
    name: string
  } | null
  endLocation: {
    lat: number
    lng: number
    name: string
  } | null
  efficiency: number | null
  energyUsedKwh: number | null
  startSoc: number | null
  endSoc: number | null
  maxSpeed: number | null
  avgSpeed: number | null
  elevation: number | null
  samples: TripSample[]
}

export default function TripDetailPageV2({ params }: PageProps) {
  const resolvedParams = React.use(params)
  const tripId = resolvedParams.id
  const [trip, setTrip] = useState<TripDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadTrip = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`/api/trips/${tripId}`, { cache: 'no-store' })
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null
          throw new Error(payload?.message ?? 'Failed to load trip details')
        }

        const payload = (await response.json()) as TripDetail
        if (!cancelled) setTrip(payload)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load trip details')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadTrip()
    return () => {
      cancelled = true
    }
  }, [tripId])

  if (loading) {
    return <LoadingState message="Loading trip details..." />
  }

  if (error) {
    return <Alert variant="error" title="Error" message={error} onClose={() => setError(null)} />
  }

  if (!trip) {
    return <EmptyState icon="🚫" title="Trip Not Found" description="The trip you're looking for doesn't exist" />
  }

  const duration = (new Date(trip.endTime).getTime() - new Date(trip.startTime).getTime()) / 1000 / 60
  const unavailable = 'Unavailable'
  const hasMapPoints = Boolean(trip.startLocation && trip.endLocation)

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Trip Details</h1>
          <div className="mt-2 text-gray-600 dark:text-gray-400">
            {new Date(trip.startTime).toLocaleDateString()} • {Math.max(1, Math.round(duration))} minutes
          </div>
        </div>
        <Badge variant="success">Completed</Badge>
      </div>

      {hasMapPoints ? (
        <TripMap
          startLat={trip.startLocation!.lat}
          startLng={trip.startLocation!.lng}
          endLat={trip.endLocation!.lat}
          endLng={trip.endLocation!.lng}
          distance={trip.distance ?? 0}
          samples={trip.samples}
        />
      ) : (
        <Alert
          variant="warning"
          title="Map unavailable"
          message="Trip coordinates are missing for this record."
        />
      )}

      <MetricsSummary
        metrics={[
          { label: 'Distance', value: trip.distance == null ? unavailable : trip.distance.toFixed(1), unit: trip.distance == null ? undefined : 'km' },
          { label: 'Efficiency', value: trip.efficiency == null ? unavailable : trip.efficiency.toFixed(0), unit: trip.efficiency == null ? undefined : 'Wh/km' },
          { label: 'Energy Used', value: trip.energyUsedKwh == null ? unavailable : trip.energyUsedKwh.toFixed(1), unit: trip.energyUsedKwh == null ? undefined : 'kWh' },
          { label: 'Max Speed', value: trip.maxSpeed == null ? unavailable : trip.maxSpeed.toFixed(0), unit: trip.maxSpeed == null ? undefined : 'km/h' },
          { label: 'Avg Speed', value: trip.avgSpeed == null ? unavailable : trip.avgSpeed.toFixed(0), unit: trip.avgSpeed == null ? undefined : 'km/h' },
          { label: 'Elevation', value: trip.elevation == null ? unavailable : trip.elevation.toFixed(0), unit: trip.elevation == null ? undefined : 'm' },
        ]}
      />

      <LineChart
        data={trip.samples.map((sample) => ({
          timestamp: sample.timestamp,
          value: sample.soc,
        }))}
        title="Battery Level During Trip"
        unit="%"
        height="h-80"
      />

      <Card className="p-6">
        <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">Route</h2>
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">Start</h3>
            <div className="text-lg text-gray-900 dark:text-white">{trip.startLocation?.name ?? 'Unknown'}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {trip.startLocation ? `${trip.startLocation.lat.toFixed(6)}, ${trip.startLocation.lng.toFixed(6)}` : 'No coordinates'}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">End</h3>
            <div className="text-lg text-gray-900 dark:text-white">{trip.endLocation?.name ?? 'Unknown'}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {trip.endLocation ? `${trip.endLocation.lat.toFixed(6)}, ${trip.endLocation.lng.toFixed(6)}` : 'No coordinates'}
            </div>
          </div>
        </div>
      </Card>

      <TimelineChart
        events={[
          {
            time: trip.startTime,
            title: 'Trip Started',
            description: `From ${trip.startLocation?.name ?? 'Unknown location'}`,
            status: 'completed' as const,
          },
          {
            time: new Date(new Date(trip.startTime).getTime() + (duration / 2) * 60000).toISOString(),
            title: 'Halfway',
            description: trip.distance == null ? 'Distance unavailable' : `${(trip.distance / 2).toFixed(1)} km traveled`,
            status: 'completed' as const,
          },
          {
            time: trip.endTime,
            title: 'Trip Ended',
            description: `At ${trip.endLocation?.name ?? 'Unknown location'}`,
            status: 'completed' as const,
          },
        ]}
        title="Trip Timeline"
      />
    </div>
  )
}
