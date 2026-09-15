 'use client'

    import { useState } from 'react'
import { ArrowRight, Calendar } from '@untitledui/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/base/buttons/button'
import { Card } from '@/components/ui/card'
import { useDayTrips } from '@/lib/hooks/use-day-trips'
import { localDateKey, summarizeTrips } from '@/lib/utils/daily'
import { formatKwhPer100Km } from '@/lib/format'
import { DayCalendar } from '@/components/application/calendar/day-calendar'

export default function CalendarPage() {
  const today = localDateKey(new Date().toISOString())
  const [selectedDate, setSelectedDate] = useState(today)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const { trips, loading, error, origin, snapshotCount } = useDayTrips(selectedDate)
  const summary = summarizeTrips(trips)
  const days = Array.from({ length: 15 }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() + index - 7)
    return localDateKey(date.toISOString())
  })

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-3">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
            <Calendar className="size-4" aria-hidden /> Daily activity
          </div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.03em] text-ink sm:text-[32px]">{selectedDate}</h1>
          <p className="mt-1 text-[13px] text-ink-secondary">Verified drives for this day.</p>
        </div>
          <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Button type="button" color="secondary" size="sm" aria-label="Open calendar picker" iconLeading={Calendar} onPress={() => setCalendarOpen((open) => !open)}>
            </Button>
            {calendarOpen ? (
              <Card className="absolute right-0 top-full z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] p-4 shadow-lg">
                <DayCalendar selectedDate={selectedDate} onChange={(date) => { setSelectedDate(date); setCalendarOpen(false) }} />
              </Card>
            ) : null}
          </div>
          <Button href={`/day/${selectedDate}`} color="secondary" size="sm" iconTrailing={ArrowRight}>Open day report</Button>
          <Button href="/trips" color="primary" size="sm" iconTrailing={ArrowRight}>All trips</Button>
        </div>
      </section>

      <div className="-mx-1 flex snap-x items-center justify-center gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Days in chronological order">
        {days.map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => setSelectedDate(day)}
            aria-pressed={day === selectedDate}
            className={`flex min-w-[68px] snap-start flex-col rounded-xl border px-2.5 py-2 text-center transition-colors focus-visible:outline-2 focus-visible:outline-accent ${day === selectedDate ? 'border-accent bg-accent-soft text-ink shadow-sm' : day === today ? 'border-accent-line bg-surface text-ink' : 'border-line bg-surface text-ink-secondary hover:bg-surface-muted'}`}
          >
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">{day === today ? 'Today' : new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</span>
            <span className="mt-1 font-mono text-lg font-semibold">{day.slice(8)}</span>
          </button>
        ))}
      </div>

      {error ? <Card className="border-danger p-5 text-sm text-danger">{error.message}</Card> : null}

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Trips', summary.tripCount === 0 ? '—' : String(summary.tripCount)],
          ['Distance', summary.distanceKm === null ? '—' : `${summary.distanceKm.toFixed(1)} km`],
          ['Energy', summary.energyUsedKwh === null ? '—' : `${summary.energyUsedKwh.toFixed(2)} kWh`],
          ['Efficiency', summary.efficiencyWhPerKm === null ? '—' : formatKwhPer100Km(summary.efficiencyWhPerKm)],
        ].map(([label, value]) => (
          <Card key={label} className="p-3.5">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">{label}</div>
            <div className="mt-1.5 font-mono text-xl font-semibold tracking-[-0.03em] text-ink">{loading ? '…' : value}</div>
          </Card>
        ))}
      </section>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
              <h2 className="text-base font-semibold text-ink">Drives</h2>
                <p className="mt-1 text-[12px] text-ink-secondary">{origin ? `Source: ${origin.replaceAll('_', ' ')}` : 'No source loaded yet'} · {snapshotCount} snapshots available</p>
          </div>
          <Badge variant={trips.length ? 'success' : 'default'}>{trips.length ? `${trips.length} recorded` : 'No trips'}</Badge>
        </div>
        {loading ? <div className="mt-5 h-24 animate-pulse rounded-2xl bg-surface-muted" /> : trips.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-line bg-canvas px-4 py-8 text-center text-sm text-ink-tertiary">No verified drives for this day.</div>
        ) : (
          <div className="mt-2 divide-y divide-line">
            {trips.map((trip) => (
                <a key={trip.id} href={`/trips/${trip.id}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:bg-surface-muted/50">
                <span className="flex min-w-0 items-center gap-3"><span className="size-2 rounded-full bg-accent" aria-hidden /><span className="truncate text-sm font-medium text-ink">{new Date(trip.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span className="text-sm text-ink-secondary">{trip.distanceKm == null ? 'Distance unavailable' : `${trip.distanceKm.toFixed(1)} km`}</span></span>
                <span className="text-sm text-ink-secondary">{trip.energyUsedKwh == null ? 'Energy unavailable' : `${trip.energyUsedKwh.toFixed(2)} kWh`}</span>
                </a>
            ))}
          </div>
        )}
      </Card>
      </div>
    )
  }

