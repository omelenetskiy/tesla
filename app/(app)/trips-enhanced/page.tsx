'use client'

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExportDialog, useDataExport } from '@/components/export'
import { FilterBar } from '@/components/filters'
import { MetricsSummary } from '@/components/ui/charts'
import { Alert, LoadingState } from '@/components/ui/forms'
import { Button, Card, Badge } from '@/components/ui/primitives'
import { Trip, TripsTable } from '@/components/ui/table'
import { usePagination, useTrips } from '@/lib/hooks/use-data'
import { calculateTripStats, TripStatInput } from '@/lib/utils/stats'
import { formatKwhPer100Km } from '@/lib/format'

type DateRange = '7d' | '30d' | '90d' | '1y'
type SortBy = 'date' | 'distance' | 'efficiency'

const getLocationLabel = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'name' in value) {
    const name = (value as { name?: unknown }).name
    if (typeof name === 'string') return name
  }
  return 'Unknown'
}

export default function TripsPage() {
  const router = useRouter()
  const [dateRange, setDateRange] = useState<DateRange>('30d')
  const [sortBy, setSortBy] = useState<SortBy>('date')
  const { trips, loading, error } = useTrips(dateRange)
  const { isOpen, setIsOpen, exportData } = useDataExport()

  const sortedTrips = useMemo(() => {
    const sorted = [...trips] as TripStatInput[]

    if (sortBy === 'date') {
      sorted.sort((a, b) => new Date(b.startTime ?? 0).getTime() - new Date(a.startTime ?? 0).getTime())
    } else if (sortBy === 'distance') {
      sorted.sort((a, b) => (b.distance ?? 0) - (a.distance ?? 0))
    } else {
      sorted.sort((a, b) => (a.efficiency ?? 0) - (b.efficiency ?? 0))
    }

    return sorted
  }, [trips, sortBy])

  const { currentItems, totalPages, currentPage, setCurrentPage, hasNextPage, hasPrevPage } = usePagination(sortedTrips, 10)

  const tableTrips = useMemo<Trip[]>(
    () =>
      currentItems.map((trip, index) => ({
        id: String((trip as { id?: string }).id ?? `trip-${index}`),
        startTime: trip.startTime ?? new Date().toISOString(),
        endTime: trip.endTime ?? new Date().toISOString(),
        distance: trip.distance ?? null,
        energyUsedKwh: (trip as { energyUsedKwh?: number | null }).energyUsedKwh ?? null,
        startLocation: getLocationLabel((trip as { startLocation?: unknown }).startLocation),
        endLocation: getLocationLabel((trip as { endLocation?: unknown }).endLocation),
        efficiency: trip.efficiency ?? null,
        status: 'completed',
      })),
    [currentItems],
  )

  const stats = useMemo(() => calculateTripStats(sortedTrips), [sortedTrips])

  if (loading) {
    return <LoadingState message="Loading trips..." />
  }

  if (error) {
    return <Alert variant="error" title="Error" message={error.message} onClose={() => {}} />
  }

  return (
    <div className="space-y-6">
      <Card className="border-accent-line bg-accent-soft/60 p-5">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="info">Trip analytics</Badge>
              <Badge variant="success">Archive ready</Badge>
            </div>
            <p className="mt-3 max-w-[56ch] text-sm leading-6 text-ink-secondary">
              Browse routes, compare efficiency, and open each drive for map detail or export.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">Current range</div>
              <div className="mt-2 text-lg font-semibold text-ink">{dateRange.toUpperCase()}</div>
            </div>
            <Button onClick={() => setIsOpen(true)}>Export</Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">Total trips</div>
            <div className="mt-2 font-mono text-2xl font-semibold tracking-[-0.03em] text-ink">{stats.totalTrips}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">Distance</div>
            <div className="mt-2 font-mono text-2xl font-semibold tracking-[-0.03em] text-ink">{stats.totalDistance} km</div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">Avg efficiency</div>
            <div className="mt-2 font-mono text-2xl font-semibold tracking-[-0.03em] text-ink">{formatKwhPer100Km(stats.avgEfficiency)}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">Avg distance</div>
            <div className="mt-2 font-mono text-2xl font-semibold tracking-[-0.03em] text-ink">{stats.avgDistance} km</div>
          </div>
        </div>
      </Card>

      <MetricsSummary
        metrics={[
          { label: 'Total distance', value: stats.totalDistance, unit: 'km' },
          { label: 'Avg efficiency', value: formatKwhPer100Km(stats.avgEfficiency), unit: undefined },
          { label: 'Max speed', value: stats.maxSpeed, unit: 'km/h' },
        ]}
      />

      <Card className="p-4 sm:p-5">
        <FilterBar
          onFilter={(filters) => {
            const nextRange = filters.dateRange as DateRange | undefined
            if (nextRange) setDateRange(nextRange)
          }}
          onSort={(sort) => setSortBy(sort as SortBy)}
          sortBy={sortBy}
          filters={{ dateRange }}
        />
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-line px-6 py-5">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">Drive list</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink">Recent trips</h2>
        </div>
        <div className="p-2 sm:p-3">
          <TripsTable trips={tableTrips} isLoading={false} onRowClick={(trip) => router.push(`/trips/${trip.id}`)} />
        </div>
      </Card>

      <div className="flex items-center justify-between border-t border-line pt-4">
        <div className="text-sm text-ink-secondary">
          Page {currentPage} of {totalPages}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={!hasPrevPage}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={!hasNextPage}
          >
            Next
          </Button>
        </div>
      </div>

      <ExportDialog
        isOpen={isOpen}
        onCloseAction={() => setIsOpen(false)}
        onExportAction={(format) => exportData(sortedTrips as Record<string, unknown>[], format)}
      />
    </div>
  )
}
