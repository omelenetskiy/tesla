 'use client'

  import { useState } from 'react'
import Link from 'next/link'
  import { ArrowRight, CalendarDays, Route } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useDayTrips } from '@/lib/hooks/use-day-trips'
import { localDateKey, summarizeTrips } from '@/lib/utils/daily'
import { formatKwhPer100Km } from '@/lib/format'
import { DayCalendar } from '@/components/application/calendar/day-calendar'

export default function CalendarPage() {
  const today = localDateKey(new Date().toISOString())
  const [selectedDate, setSelectedDate] = useState(today)
  const { trips, loading, error, origin, snapshotCount } = useDayTrips(selectedDate)
  const summary = summarizeTrips(trips)

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-4">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
            <CalendarDays className="size-4" aria-hidden /> Daily activity
          </div>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-ink sm:text-[36px]">{selectedDate}</h1>
          <p className="mt-1 text-sm text-ink-secondary">Verified drives available for this local calendar day.</p>
        </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link href={`/day/${selectedDate}`}>Open day report <ArrowRight /></Link></Button>
            <Button asChild variant="outline"><Link href="/trips">All trips <ArrowRight /></Link></Button>
          </div>
      </section>

      <Card className="max-w-xl p-5 sm:p-6">
        <DayCalendar selectedDate={selectedDate} onChange={setSelectedDate} />
      </Card>

      {error ? <Card className="border-danger p-5 text-sm text-danger">{error.message}</Card> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Trips', summary.tripCount === 0 ? '—' : String(summary.tripCount)],
          ['Distance', summary.distanceKm === null ? '—' : `${summary.distanceKm.toFixed(1)} km`],
          ['Energy', summary.energyUsedKwh === null ? '—' : `${summary.energyUsedKwh.toFixed(2)} kWh`],
          ['Efficiency', summary.efficiencyWhPerKm === null ? '—' : formatKwhPer100Km(summary.efficiencyWhPerKm)],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">{label}</div>
            <div className="mt-2 font-mono text-2xl font-semibold tracking-[-0.03em] text-ink">{loading ? '…' : value}</div>
          </Card>
        ))}
      </section>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Drives</h2>
            <p className="mt-1 text-sm text-ink-secondary">{origin ? `Source: ${origin.replaceAll('_', ' ')}` : 'No source loaded yet'} · {snapshotCount} snapshots available</p>
          </div>
          <Badge variant={trips.length ? 'success' : 'default'}>{trips.length ? `${trips.length} recorded` : 'No trips'}</Badge>
        </div>
        {loading ? <div className="mt-5 h-24 animate-pulse rounded-2xl bg-surface-muted" /> : trips.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-line bg-canvas px-4 py-8 text-center text-sm text-ink-tertiary">No verified drives for this day.</div>
        ) : (
          <div className="mt-4 divide-y divide-line">
            {trips.map((trip) => (
              <Link key={trip.id} href={`/trips/${trip.id}`} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0 hover:bg-surface-muted/50">
                <span className="flex min-w-0 items-center gap-3"><Route className="size-4 text-accent" aria-hidden /><span className="truncate text-sm font-medium text-ink">{new Date(trip.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span className="text-sm text-ink-secondary">{trip.distanceKm == null ? 'Distance unavailable' : `${trip.distanceKm.toFixed(1)} km`}</span></span>
                <span className="text-sm text-ink-secondary">{trip.energyUsedKwh == null ? 'Energy unavailable' : `${trip.energyUsedKwh.toFixed(2)} kWh`}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
      </div>
    )
  }

