'use client'

import { ChevronLeft, ChevronRight } from '@untitledui/icons'
import { getLocalTimeZone, parseDate, today } from '@internationalized/date'
import {
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  Heading,
} from 'react-aria-components'

export function DayCalendar({ selectedDate, onChange }: { selectedDate: string; onChange: (date: string) => void }) {
  const value = parseDate(selectedDate)
  const minimum = today(getLocalTimeZone()).subtract({ months: 3 })

  return (
    <Calendar
      aria-label="Choose telemetry day"
      value={value}
      minValue={minimum}
      onChange={(date) => onChange(date.toString())}
      className="w-full"
    >
      <header className="mb-4 flex items-center justify-between gap-3">
        <Button slot="previous" aria-label="Previous month" className="rounded-lg p-2 text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
          <ChevronLeft className="size-5" aria-hidden />
        </Button>
        <Heading className="text-sm font-semibold text-ink" />
        <Button slot="next" aria-label="Next month" className="rounded-lg p-2 text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
          <ChevronRight className="size-5" aria-hidden />
        </Button>
      </header>
      <CalendarGrid className="w-full border-separate border-spacing-1">
        <CalendarGridHeader>
          {(day) => <CalendarHeaderCell className="pb-2 text-center text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">{day}</CalendarHeaderCell>}
        </CalendarGridHeader>
        <CalendarGridBody>
          {(date) => <CalendarCell date={date} className="flex aspect-square items-center justify-center rounded-xl text-sm text-ink outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-accent ui-selected:bg-accent ui-selected:text-white ui-outside-month:text-ink-tertiary ui-disabled:cursor-not-allowed ui-disabled:opacity-40" />}
        </CalendarGridBody>
      </CalendarGrid>
    </Calendar>
  )
}

