'use client'

import React from 'react'
import { Badge } from '@/components/ui/badge'

interface Column<T> {
  key: keyof T
  label: string
  render?: (value: any, row: T) => React.ReactNode
  width?: string
}

interface TableProps<T> {
  data: T[]
  columns: Column<T>[]
  isLoading?: boolean
  isEmpty?: boolean
  emptyMessage?: string
  onRowClick?: (row: T) => void
  sortBy?: keyof T
  sortOrder?: 'asc' | 'desc'
  onSort?: (key: keyof T) => void
}

export function Table<T extends { id?: string }>({
  data,
  columns,
  isLoading,
  isEmpty,
  emptyMessage = 'No data',
  onRowClick,
  sortBy,
  sortOrder,
  onSort,
}: TableProps<T>) {
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-200 dark:bg-gray-800 rounded" />
        ))}
      </div>
    )
  }

  if (isEmpty || data.length === 0) {
    return (
      <div className="text-center py-12 text-gray-600 dark:text-gray-400">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <tr>
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={`
                  px-6 py-3 text-left text-sm font-semibold
                  text-gray-900 dark:text-white
                  ${col.width || ''}
                  ${onSort ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800' : ''}
                `}
                onClick={() => onSort?.(col.key)}
              >
                <div className="flex items-center gap-2">
                  {col.label}
                  {onSort && sortBy === col.key && (
                    <span className="text-gray-600 dark:text-gray-400">
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
          {data.map((row, idx) => (
            <tr
              key={row.id || idx}
              className={`
                border-b border-gray-200 dark:border-gray-800
                hover:bg-gray-50 dark:hover:bg-gray-900/50
                transition-colors
                ${onRowClick ? 'cursor-pointer' : ''}
              `}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td
                  key={String(col.key)}
                  className="px-6 py-4 text-sm text-gray-900 dark:text-white"
                >
                  {col.render ? col.render(row[col.key], row) : String(row[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Specialized table for trips
export interface Trip {
  id: string
  startTime: string
  endTime: string
  distance: number
  startLocation: string
  endLocation: string
  efficiency: number
  status: 'completed' | 'in_progress' | 'cancelled'
}

export function TripsTable({
  trips,
  onRowClick,
  isLoading,
}: {
  trips: Trip[]
  onRowClick?: (trip: Trip) => void
  isLoading?: boolean
}) {
  const columns: Column<Trip>[] = [
    {
      key: 'startTime',
      label: 'Date',
      render: (value) => new Date(value).toLocaleDateString(),
      width: 'w-32',
    },
    {
      key: 'startLocation',
      label: 'Start',
      render: (value) => value || '—',
      width: 'w-40',
    },
    {
      key: 'endLocation',
      label: 'End',
      render: (value) => value || '—',
      width: 'w-40',
    },
    {
      key: 'distance',
      label: 'Distance',
      render: (value) => `${(value as number).toFixed(1)} km`,
      width: 'w-24',
    },
    {
      key: 'efficiency',
      label: 'Efficiency',
      render: (value) => `${(value as number).toFixed(0)} Wh/km`,
      width: 'w-28',
    },
    {
      key: 'status',
      label: 'Status',
      render: (value) => (
        <Badge
          variant={
            value === 'completed'
              ? 'success'
              : value === 'in_progress'
                ? 'info'
                : 'warning'
          }
        >
          {String(value)}
        </Badge>
      ),
      width: 'w-24',
    },
  ]

  return (
    <Table<Trip>
      data={trips}
      columns={columns}
      isLoading={isLoading}
      isEmpty={trips.length === 0}
      emptyMessage="No trips found"
      onRowClick={onRowClick}
    />
  )
}

// Specialized table for charging sessions
export interface ChargingSession {
  id: string
  startTime: string
  endTime: string
  startSoc: number
  endSoc: number
  energyAdded: number
  location: string
  chargerType: string
}

export function ChargingTable({
  sessions,
  onRowClick,
  isLoading,
}: {
  sessions: ChargingSession[]
  onRowClick?: (session: ChargingSession) => void
  isLoading?: boolean
}) {
  const columns: Column<ChargingSession>[] = [
    {
      key: 'startTime',
      label: 'Date',
      render: (value) => new Date(value).toLocaleDateString(),
      width: 'w-32',
    },
    {
      key: 'location',
      label: 'Location',
      render: (value) => value || '—',
      width: 'w-40',
    },
    {
      key: 'chargerType',
      label: 'Charger',
      render: (value) => value || '—',
      width: 'w-32',
    },
    {
      key: 'startSoc',
      label: 'Start SOC',
      render: (value) => `${(value as number).toFixed(0)}%`,
      width: 'w-24',
    },
    {
      key: 'endSoc',
      label: 'End SOC',
      render: (value) => `${(value as number).toFixed(0)}%`,
      width: 'w-24',
    },
    {
      key: 'energyAdded',
      label: 'Energy Added',
      render: (value) => `${(value as number).toFixed(1)} kWh`,
      width: 'w-28',
    },
  ]

  return (
    <Table<ChargingSession>
      data={sessions}
      columns={columns}
      isLoading={isLoading}
      isEmpty={sessions.length === 0}
      emptyMessage="No charging sessions found"
      onRowClick={onRowClick}
    />
  )
}

