'use client'

import React from 'react'
import { Card, Badge } from '@/components/ui/primitives'

/**
 * Status Components for different vehicle states
 */

export function VehicleStatus({ state, lastUpdate }: { state: 'awake' | 'sleeping' | 'charging' | 'offline'; lastUpdate: string }) {
  const stateConfig = {
    awake: { icon: '🟢', label: 'Awake', color: 'bg-green-100 dark:bg-green-900/20' },
    sleeping: { icon: '😴', label: 'Sleeping', color: 'bg-blue-100 dark:bg-blue-900/20' },
    charging: { icon: '⚡', label: 'Charging', color: 'bg-yellow-100 dark:bg-yellow-900/20' },
    offline: { icon: '🔌', label: 'Offline', color: 'bg-red-100 dark:bg-red-900/20' },
  }

  const config = stateConfig[state]

  return (
    <Card className={`p-4 ${config.color}`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{config.icon}</span>
        <div>
          <div className="font-semibold text-gray-900 dark:text-white">
            {config.label}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            Last update: {new Date(lastUpdate).toLocaleTimeString()}
          </div>
        </div>
      </div>
    </Card>
  )
}

export function DataFreshness({ timestamp, maxAge = 300 }: { timestamp: string; maxAge?: number }) {
  const age = (new Date().getTime() - new Date(timestamp).getTime()) / 1000
  const isFresh = age < maxAge
  const ageMinutes = Math.round(age / 60)

  return (
    <div
      className={`text-xs px-2 py-1 rounded ${
        isFresh
          ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
          : 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200'
      }`}
    >
      {isFresh ? '✓ Fresh' : `⚠ ${ageMinutes}m old`}
    </div>
  )
}

export function SyncStatus({ isSyncing, lastSync }: { isSyncing: boolean; lastSync: string }) {
  return (
    <div className="flex items-center gap-2">
      {isSyncing ? (
        <>
          <span className="animate-spin">↻</span>
          <span className="text-sm text-gray-600 dark:text-gray-400">Syncing...</span>
        </>
      ) : (
        <>
          <span>✓</span>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Synced {new Date(lastSync).toLocaleTimeString()}
          </span>
        </>
      )}
    </div>
  )
}

export function ErrorStatus({ error, retry }: { error: string; retry: () => void }) {
  return (
    <Card className="p-4 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-red-900 dark:text-red-100">Error</h3>
          <p className="text-sm text-red-800 dark:text-red-200 mt-1">{error}</p>
        </div>
        <button
          onClick={retry}
          className="text-sm px-3 py-1 rounded bg-red-200 hover:bg-red-300 dark:bg-red-800 dark:hover:bg-red-700 text-red-900 dark:text-red-100"
        >
          Retry
        </button>
      </div>
    </Card>
  )
}

export function NetworkStatus({ isOnline }: { isOnline: boolean }) {
  if (isOnline) return null

  return (
    <div className="fixed top-4 right-4 bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50">
      <span>⚠️</span>
      <span>Offline Mode - Using cached data</span>
    </div>
  )
}

