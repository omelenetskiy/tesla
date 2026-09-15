import type { Trip } from '@/lib/tesla/models'

export type DailyTripSummary = {
  tripCount: number
  distanceKm: number | null
  energyUsedKwh: number | null
  efficiencyWhPerKm: number | null
  maxSpeedKmh: number | null
}

export function localDateKey(value: string, timeZone?: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function summarizeTrips(trips: Trip[]): DailyTripSummary {
  const distance = trips.map((trip) => trip.distanceKm).filter((value): value is number => Number.isFinite(value))
  const energy = trips.map((trip) => trip.energyUsedKwh).filter((value): value is number => Number.isFinite(value))
  const speeds = trips.map((trip) => trip.maxSpeedKmh).filter((value): value is number => Number.isFinite(value))
  const distanceKm = distance.length ? distance.reduce((sum, value) => sum + value, 0) : null
  const energyUsedKwh = energy.length ? energy.reduce((sum, value) => sum + value, 0) : null

  return {
    tripCount: trips.length,
    distanceKm,
    energyUsedKwh,
    efficiencyWhPerKm: energyUsedKwh !== null && distanceKm !== null && distanceKm > 0
      ? (energyUsedKwh * 1000) / distanceKm
      : null,
    maxSpeedKmh: speeds.length ? Math.max(...speeds) : null,
  }
}

export function recentDateKeys(days: number, now = new Date(), timeZone?: string): string[] {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now)
    date.setDate(date.getDate() - index)
    return localDateKey(date.toISOString(), timeZone)
  })
}

