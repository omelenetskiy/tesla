'use client'

import React from 'react'
import { Card, Badge } from '@/components/ui/primitives'

export interface AppAlert {
  id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'error' | 'success'
  timestamp: string
  read: boolean
}

export function AlertItem({ alert, onDismiss }: {
  alert: AppAlert
  onDismiss: (id: string) => void
}) {
  const colors = {
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  }

  const textColors = {
    info: 'text-blue-900 dark:text-blue-100',
    warning: 'text-yellow-900 dark:text-yellow-100',
    error: 'text-red-900 dark:text-red-100',
    success: 'text-green-900 dark:text-green-100',
  }

  const icons = {
    info: 'ℹ️',
    warning: '⚠️',
    error: '❌',
    success: '✅',
  }

  return (
    <div className={`border rounded-lg p-4 ${colors[alert.type]}`}>
      <div className="flex gap-4 items-start">
        <span className="text-2xl flex-shrink-0">{icons[alert.type]}</span>
        <div className="flex-1">
          <h3 className={`font-semibold ${textColors[alert.type]}`}>
            {alert.title}
          </h3>
          <p className={`text-sm mt-1 ${textColors[alert.type]}`}>
            {alert.message}
          </p>
          <div className="text-xs mt-2 opacity-75">
            {new Date(alert.timestamp).toLocaleTimeString()}
          </div>
        </div>
        <button
          onClick={() => onDismiss(alert.id)}
          className={`flex-shrink-0 ${textColors[alert.type]} hover:opacity-75`}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export function AlertsList({ alerts, onDismiss }: {
  alerts: AppAlert[]
  onDismiss: (id: string) => void
}) {
  if (alerts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600 dark:text-gray-400">
        No alerts
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <AlertItem key={alert.id} alert={alert} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

export function AlertSummary({ alerts }: { alerts: AppAlert[] }) {
  const counts = {
    error: alerts.filter(a => a.type === 'error').length,
    warning: alerts.filter(a => a.type === 'warning').length,
    success: alerts.filter(a => a.type === 'success').length,
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {counts.error > 0 && (
        <Card className="p-4">
          <Badge variant="error">❌ {counts.error} Error{counts.error !== 1 ? 's' : ''}</Badge>
        </Card>
      )}
      {counts.warning > 0 && (
        <Card className="p-4">
          <Badge variant="warning">⚠️ {counts.warning} Warning{counts.warning !== 1 ? 's' : ''}</Badge>
        </Card>
      )}
      {counts.success > 0 && (
        <Card className="p-4">
          <Badge variant="success">✅ {counts.success} Success</Badge>
        </Card>
      )}
    </div>
  )
}

