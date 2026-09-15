'use client'

import React from 'react'
import { Button } from '@/components/ui/primitives'

export function DateRangeFilter({
  range,
  onChange,
}: {
  range: '7d' | '30d' | '90d' | '1y'
  onChange: (range: '7d' | '30d' | '90d' | '1y') => void
}) {
  const ranges = [
    { value: '7d' as const, label: 'Last 7 days' },
    { value: '30d' as const, label: 'Last 30 days' },
    { value: '90d' as const, label: 'Last 90 days' },
    { value: '1y' as const, label: 'Last year' },
  ]

  return (
    <div className="flex gap-2 flex-wrap">
      {ranges.map((r) => (
        <Button
          key={r.value}
          variant={range === r.value ? 'primary' : 'outline'}
          size="sm"
          onClick={() => onChange(r.value)}
        >
          {r.label}
        </Button>
      ))}
    </div>
  )
}

export function SortFilter({
  sortBy,
  onChange,
}: {
  sortBy: 'date' | 'distance' | 'efficiency'
  onChange: (sort: 'date' | 'distance' | 'efficiency') => void
}) {
  const sorts = [
    { value: 'date' as const, label: 'Date' },
    { value: 'distance' as const, label: 'Distance' },
    { value: 'efficiency' as const, label: 'Efficiency' },
  ]

  return (
    <div className="flex gap-2">
      {sorts.map((s) => (
        <Button
          key={s.value}
          variant={sortBy === s.value ? 'primary' : 'outline'}
          size="sm"
          onClick={() => onChange(s.value)}
        >
          {s.label}
        </Button>
      ))}
    </div>
  )
}

export function FilterBar({
  onFilter,
  onSort,
  sortBy = 'date',
  filters = {},
}: {
  onFilter?: (filters: Record<string, any>) => void
  onSort?: (sort: string) => void
  sortBy?: string
  filters?: Record<string, any>
}) {
  return (
    <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
      <div>
        <label className="text-sm font-medium text-gray-900 dark:text-white block mb-2">
          Date Range
        </label>
        <DateRangeFilter
          range={filters.dateRange || '30d'}
          onChange={(range) => onFilter?.({ ...filters, dateRange: range })}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-gray-900 dark:text-white block mb-2">
          Sort By
        </label>
        <SortFilter
          sortBy={sortBy as 'date' | 'distance' | 'efficiency'}
          onChange={(sort) => onSort?.(sort)}
        />
      </div>
    </div>
  )
}

export function ExportButton() {
  return (
    <Button variant="secondary" size="sm">
      📥 Export
    </Button>
  )
}

