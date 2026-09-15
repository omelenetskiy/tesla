'use client'

import React, { useState, useEffect } from 'react'
import { AppShell } from '@/components/app-shell'
import { Card } from '@/components/ui/primitives'
import { LineChart, ProgressBar, MetricsSummary } from '@/components/ui/charts'
import { LoadingState, Alert } from '@/components/ui/forms'
import { useLocalStorage } from '@/lib/hooks/use-data'

export default function BatteryPage() {
  const [loading, setLoading] = useState(true)
  const [batteryLevel, setBatteryLevel] = useState(75)
  const [stats, setStats] = useLocalStorage('batteryStats', {
    maxSOC: 100,
    minSOC: 15,
    avgSOC: 65,
    degradation: 3.2,
    cycleCount: 234,
  })

  useEffect(() => {
    setTimeout(() => setLoading(false), 500)
  }, [])

  const batteryHistory = [
    { timestamp: '2026-09-15T11:00:00.000Z', value: 60, label: '1h ago' },
    { timestamp: '2026-09-15T11:20:00.000Z', value: 65, label: '' },
    { timestamp: '2026-09-15T11:40:00.000Z', value: 72, label: '' },
    { timestamp: '2026-09-15T12:00:00.000Z', value: batteryLevel, label: 'Now' },
  ]

  const estimatedRange = (batteryLevel * 4.5).toFixed(0)

  if (loading) {
    return (
      <AppShell>
        <LoadingState message="Loading battery data..." />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="space-y-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Battery</h1>

        {/* Main Battery Status */}
        <Card className="p-8">
          <div className="text-center mb-8">
            <div className="text-8xl font-bold text-gray-900 dark:text-white mb-4">
              {batteryLevel}%
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              Current State of Charge
            </p>
          </div>

          <div className="mb-8">
            <ProgressBar
              value={batteryLevel}
              max={100}
              label="Battery Level"
              color="bg-blue-500"
              showValue={false}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                Estimated Range
              </h3>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">
                {estimatedRange} km
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                Battery Capacity
              </h3>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">
                75 kWh
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                Usable Capacity
              </h3>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">
                72 kWh
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                Temperature
              </h3>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">
                22°C
              </div>
            </div>
          </div>
        </Card>

        {/* Battery History Chart */}
        <LineChart
          data={batteryHistory}
          title="Battery Level (Last 1 hour)"
          unit="%"
          height="h-80"
        />

        {/* Battery Health */}
        <Card className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Battery Health
          </h2>

          <MetricsSummary
            metrics={[
              {
                label: 'Health Status',
                value: 'Excellent',
                trend: 'stable',
              },
              {
                label: 'Cycle Count',
                value: stats.cycleCount,
                trend: 'up',
              },
              {
                label: 'Degradation',
                value: stats.degradation,
                unit: '%',
                trend: 'down',
              },
            ]}
          />
        </Card>

        {/* Battery Statistics */}
        <Card className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Statistics
          </h2>

          <div className="space-y-4">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200 dark:border-gray-800">
              <span className="text-gray-600 dark:text-gray-400">Max SOC (Today)</span>
              <span className="font-semibold text-gray-900 dark:text-white">{stats.maxSOC}%</span>
            </div>
            <div className="flex justify-between items-center pb-4 border-b border-gray-200 dark:border-gray-800">
              <span className="text-gray-600 dark:text-gray-400">Min SOC (Today)</span>
              <span className="font-semibold text-gray-900 dark:text-white">{stats.minSOC}%</span>
            </div>
            <div className="flex justify-between items-center pb-4 border-b border-gray-200 dark:border-gray-800">
              <span className="text-gray-600 dark:text-gray-400">Average SOC (Today)</span>
              <span className="font-semibold text-gray-900 dark:text-white">{stats.avgSOC}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Total Degradation</span>
              <span className="font-semibold text-gray-900 dark:text-white">{stats.degradation}%</span>
            </div>
          </div>
        </Card>

        {/* Charging Recommendations */}
        <Card className="p-6 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
          <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-4">
            💡 Tips for Battery Longevity
          </h2>
          <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
            <li>• Avoid charging to 100% daily - optimal range is 20-80%</li>
            <li>• Keep battery away from extreme heat or cold</li>
            <li>• Use Supercharger sparingly - Level 2 charging is gentler</li>
            <li>• Current degradation rate: Excellent (under 5% per 100k km)</li>
          </ul>
        </Card>
      </div>
    </AppShell>
  )
}

