'use client'

import React from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LineChart, MetricsSummary, TimelineChart } from '@/components/ui/charts'

// Trip Detail View
export interface TripDetail {
  id: string
  startTime: string
  endTime: string
  distance: number
  startLocation: { lat: number; lng: number; name: string }
  endLocation: { lat: number; lng: number; name: string }
  efficiency: number
  energyUsedKwh?: number | null
  startSoc: number
  endSoc: number
  maxSpeed: number
  avgSpeed: number
  elevation: number
  samples: Array<{
    timestamp: string
    lat: number
    lng: number
    speed: number
    soc: number
    power: number
  }>
}

export function TripDetailView({ trip }: { trip: TripDetail }) {
  const duration =
    (new Date(trip.endTime).getTime() - new Date(trip.startTime).getTime()) / 1000 / 60

  const chart_data = trip.samples.map((s) => ({
    timestamp: s.timestamp,
    value: s.soc,
  }))

  const events = [
    {
      time: trip.startTime,
      title: 'Trip Started',
      description: `From ${trip.startLocation.name}`,
      status: 'completed' as const,
    },
    {
      time: new Date(
        new Date(trip.startTime).getTime() + duration * 30 * 60000
      ).toISOString(),
      title: 'Halfway',
      description: `${(trip.distance / 2).toFixed(1)} km traveled`,
      status: 'completed' as const,
    },
    {
      time: trip.endTime,
      title: 'Trip Ended',
      description: `At ${trip.endLocation.name}`,
      status: 'completed' as const,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6">
        <div className="flex justify-between items-start mb-4">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Trip Details
          </h1>
          <Badge variant="success">Completed</Badge>
        </div>
        <div className="text-gray-600 dark:text-gray-400">
          {new Date(trip.startTime).toLocaleDateString()} •{' '}
          {Math.round(duration)} minutes
        </div>
      </Card>

      {/* Key Metrics */}
      <MetricsSummary
        metrics={[
          {
            label: 'Distance',
            value: trip.distance.toFixed(1),
            unit: 'km',
          },
          {
            label: 'Efficiency',
            value: trip.efficiency.toFixed(0),
            unit: 'Wh/km',
          },
          {
            label: 'Energy Used',
            value: trip.energyUsedKwh == null ? '—' : trip.energyUsedKwh.toFixed(1),
            unit: 'kWh',
          },
          {
            label: 'Max Speed',
            value: trip.maxSpeed.toFixed(0),
            unit: 'km/h',
          },
          {
            label: 'Avg Speed',
            value: trip.avgSpeed.toFixed(0),
            unit: 'km/h',
          },
          {
            label: 'Elevation',
            value: trip.elevation.toFixed(0),
            unit: 'm',
          },
        ]}
      />

      {/* Battery Level Chart */}
      <LineChart
        data={chart_data}
        title="Battery Level During Trip"
        unit="%"
        height="h-80"
      />

      {/* Route Summary */}
      <Card className="p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          Route
        </h2>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              Start
            </h3>
            <div className="text-lg text-gray-900 dark:text-white">
              {trip.startLocation.name}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {trip.startLocation.lat.toFixed(6)}, {trip.startLocation.lng.toFixed(6)}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              End
            </h3>
            <div className="text-lg text-gray-900 dark:text-white">
              {trip.endLocation.name}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {trip.endLocation.lat.toFixed(6)}, {trip.endLocation.lng.toFixed(6)}
            </div>
          </div>
        </div>
      </Card>

      {/* Timeline */}
      <TimelineChart events={events} title="Trip Timeline" />
    </div>
  )
}

// Charging Session Detail View
export interface ChargingSessionDetail {
  id: string
  startTime: string
  endTime: string
  location: { lat: number; lng: number; name: string }
  chargerType: 'L1' | 'L2' | 'L3' | 'DC'
  startSoc: number
  endSoc: number
  energyAdded: number
  maxPower: number
  avgPower: number
  cost?: number
  samples: Array<{
    timestamp: string
    soc: number
    power: number
  }>
}

export function ChargingDetailView({ session }: { session: ChargingSessionDetail }) {
  const duration =
    (new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 1000 /
    60

  const chart_data = session.samples.map((s) => ({
    timestamp: s.timestamp,
    value: s.soc,
  }))

  const chargerColors = {
    L1: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100',
    L2: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100',
    L3: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100',
    DC: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6">
        <div className="flex justify-between items-start mb-4">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Charging Session
          </h1>
          <Badge variant="success">Completed</Badge>
        </div>
        <div className="text-gray-600 dark:text-gray-400">
          {new Date(session.startTime).toLocaleDateString()} • {Math.round(duration)} minutes
        </div>
      </Card>

      {/* Key Metrics */}
      <MetricsSummary
        metrics={[
          {
            label: 'Energy Added',
            value: session.energyAdded.toFixed(1),
            unit: 'kWh',
          },
          {
            label: 'Start SOC',
            value: session.startSoc.toFixed(0),
            unit: '%',
          },
          {
            label: 'End SOC',
            value: session.endSoc.toFixed(0),
            unit: '%',
          },
          {
            label: 'Max Power',
            value: session.maxPower.toFixed(0),
            unit: 'kW',
          },
          {
            label: 'Avg Power',
            value: session.avgPower.toFixed(0),
            unit: 'kW',
          },
          ...(session.cost
            ? [
                {
                  label: 'Cost',
                  value: session.cost.toFixed(2),
                  unit: '$',
                },
              ]
            : []),
        ]}
      />

      {/* Charger Info */}
      <Card className="p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          Charger
        </h2>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              Type
            </h3>
            <Badge className={chargerColors[session.chargerType]}>
              {session.chargerType}
            </Badge>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              Location
            </h3>
            <div className="text-lg text-gray-900 dark:text-white">
              {session.location.name}
            </div>
          </div>
        </div>
      </Card>

      {/* Power Chart */}
      <LineChart
        data={session.samples.map((s) => ({
          timestamp: s.timestamp,
          value: s.power,
        }))}
        title="Power During Charging"
        unit="kW"
        height="h-80"
      />

      {/* SOC Chart */}
      <LineChart
        data={chart_data}
        title="Battery Level During Charging"
        unit="%"
        height="h-80"
      />
    </div>
  )
}

