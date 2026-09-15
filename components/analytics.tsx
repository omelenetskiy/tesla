'use client'

import React from 'react'
import { Card } from '@/components/ui/primitives'

/**
 * Advanced Analytics Components for Trip & Charging Data
 */

// Efficiency trend chart
export function EfficiencyTrend({ data }: { data: Array<{ date: string; efficiency: number }> }) {
  const avgEfficiency =
    data.reduce((sum, d) => sum + d.efficiency, 0) / data.length
  const trend = data[data.length - 1].efficiency - data[0].efficiency
  const trendColor = trend > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Efficiency Trend
      </h3>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Current</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {data[data.length - 1].efficiency.toFixed(0)} Wh/km
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Average</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {avgEfficiency.toFixed(0)} Wh/km
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Trend</div>
          <div className={`text-2xl font-bold ${trendColor}`}>
            {trend > 0 ? '+' : ''}{trend.toFixed(0)} Wh/km
          </div>
        </div>
      </div>

      {/* Mini trend visualization */}
      <div className="mt-6 flex items-end gap-1 h-16">
        {data.map((d, i) => (
          <div
            key={i}
            className="flex-1 bg-blue-500 dark:bg-blue-600 rounded-t opacity-70 hover:opacity-100 transition-opacity"
            style={{
              height: `${(d.efficiency / Math.max(...data.map((x) => x.efficiency))) * 100}%`,
            }}
            title={`${d.date}: ${d.efficiency.toFixed(0)} Wh/km`}
          />
        ))}
      </div>
    </Card>
  )
}

// Distance vs Efficiency comparison
export function DistanceEfficiencyAnalysis({
  trips,
}: {
  trips: Array<{ distance: number; efficiency: number }>
}) {
  const avgDistance = trips.reduce((sum, t) => sum + t.distance, 0) / trips.length
  const avgEfficiency = trips.reduce((sum, t) => sum + t.efficiency, 0) / trips.length

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Distance vs Efficiency Analysis
      </h3>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Avg Trip Distance</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {avgDistance.toFixed(1)} km
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Avg Efficiency</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {avgEfficiency.toFixed(0)} Wh/km
          </div>
        </div>
      </div>

      <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
        <p>✓ Longer trips tend to be more efficient</p>
        <p>✓ Highway driving improves efficiency by ~10-15%</p>
        <p>✓ Short trips are less efficient due to cold start</p>
      </div>
    </Card>
  )
}

// Energy savings comparison
export function EnergySavingsAnalysis({
  trips,
}: {
  trips: Array<{ distance: number; efficiency: number }>
}) {
  const totalDistance = trips.reduce((sum, t) => sum + t.distance, 0)
  const totalEnergy = trips.reduce(
    (sum, t) => sum + (t.distance * t.efficiency) / 1000,
    0
  )
  const avgEfficiency = trips.reduce((sum, t) => sum + t.efficiency, 0) / trips.length
  const potentialSavings = ((totalEnergy * avgEfficiency) / avgEfficiency - totalEnergy).toFixed(1)

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Energy Efficiency Analysis
      </h3>
      <div className="space-y-4">
        <div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Distance</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {totalDistance.toFixed(1)} km
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Energy Used</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {totalEnergy.toFixed(1)} kWh
          </div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
          <div className="text-sm text-green-900 dark:text-green-100">
            Potential savings by maintaining {(avgEfficiency - 20).toFixed(0)} Wh/km: ~{potentialSavings} kWh
          </div>
        </div>
      </div>
    </Card>
  )
}

// Monthly statistics
export function MonthlyStatistics({
  trips,
}: {
  trips: Array<{ distance: number; efficiency: number; date: string }>
}) {
  const monthlyData = trips.reduce(
    (acc, trip) => {
      const month = new Date(trip.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
      })
      if (!acc[month]) {
        acc[month] = {
          distance: 0,
          energy: 0,
          trips: 0,
          efficiency: [],
        }
      }
      acc[month].distance += trip.distance
      acc[month].energy += (trip.distance * trip.efficiency) / 1000
      acc[month].trips += 1
      acc[month].efficiency.push(trip.efficiency)
      return acc
    },
    {} as Record<
      string,
      {
        distance: number
        energy: number
        trips: number
        efficiency: number[]
      }
    >
  )

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Monthly Statistics
      </h3>
      <div className="space-y-4">
        {Object.entries(monthlyData).map(([month, data]) => (
          <div
            key={month}
            className="border-b border-gray-200 dark:border-gray-800 pb-4 last:border-0"
          >
            <div className="font-medium text-gray-900 dark:text-white">{month}</div>
            <div className="grid grid-cols-3 gap-4 mt-2 text-sm">
              <div>
                <div className="text-gray-600 dark:text-gray-400">Trips</div>
                <div className="font-semibold">{data.trips}</div>
              </div>
              <div>
                <div className="text-gray-600 dark:text-gray-400">Distance</div>
                <div className="font-semibold">{data.distance.toFixed(0)} km</div>
              </div>
              <div>
                <div className="text-gray-600 dark:text-gray-400">Energy</div>
                <div className="font-semibold">{data.energy.toFixed(1)} kWh</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

