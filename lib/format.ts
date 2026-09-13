// Formatting only. There is deliberately no label/translation layer: components render
// English text at the point of use, so nothing here maps an enum to a display string.

const LOCALE = 'en-US'

function number(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value)
}

export const DASH = '—'

export function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : `${number(Math.round(value))}%`
}

export function formatKm(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : `${number(value, 1)} km`
}

/** One decimal below 100 km: a 28 km commute should not lose its precision. */
export function formatDistanceShort(value: number | null | undefined): string {
  if (value === null || value === undefined) return DASH
  return value < 100 ? `${number(value, 1)} km` : `${number(Math.round(value))} km`
}

export function formatKmh(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : `${number(Math.round(value))} km/h`
}

export function formatKw(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : `${number(value, 1)} kW`
}

export function formatKwh(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : `${number(value, 1)} kWh`
}

export function formatVolts(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : `${number(Math.round(value))} V`
}

export function formatAmps(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : `${number(value, 1)} A`
}

export function formatTempCelsius(value: number | null | undefined): string {
  if (value === null || value === undefined) return DASH
  const digits = Math.abs(value) < 10 ? 1 : 0
  return `${new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)}°C`
}

export function formatEfficiency(whPerKm: number | null | undefined): string {
  return whPerKm === null || whPerKm === undefined ? DASH : `${number(Math.round(whPerKm))} Wh/km`
}

const PSI_TO_BAR = 0.06804596395872915

/**
 * Tesla reports tyre pressure in psi; the market this car is driven in reads bar.
 * Converted at the edge of the model rather than stored, so the raw field stays
 * comparable with the alert thresholds, which are psi.
 */
export function psiToBar(psi: number): number {
  return psi * PSI_TO_BAR
}

export function formatBar(psi: number | null | undefined): string {
  if (psi === null || psi === undefined || !Number.isFinite(psi)) return DASH
  return `${number(psiToBar(psi), 1)} bar`
}

/** kWh/100 km from Wh/km — the unit the car's own screen uses. */
export function formatKwhPer100Km(whPerKm: number | null | undefined): string {
  if (whPerKm === null || whPerKm === undefined || !Number.isFinite(whPerKm)) return DASH
  return `${number(whPerKm / 10, 1)} kWh/100 km`
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return DASH
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return DASH
  return new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' }).format(at)
}

export function formatDateTimeShort(iso: string | null | undefined): string {
  if (!iso) return DASH
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return DASH
  return new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(at)
}

/** `8s ago` / `43m ago` / `3h ago` — compact enough for an in-car status line. */
export function formatAge(ageSeconds: number): string {
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0) return DASH
  if (ageSeconds < 10) return 'just now'
  if (ageSeconds < 60) return `${Math.round(ageSeconds)}s ago`
  const minutes = Math.round(ageSeconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}

/** `1h 20m`, `45m`. A 40-minute trip never renders as `0h`. */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return DASH
  const total = Math.round(minutes)
  if (total < 1) return '<1m'
  if (total < 60) return `${total}m`
  const hours = Math.floor(total / 60)
  const rest = total % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

export function formatDayHeading(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return DASH
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return DASH
  const day = new Date(at)
  const today = new Date(now)
  const startOfDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((startOfDay(today) - startOfDay(day)) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return new Intl.DateTimeFormat(LOCALE, { month: 'long', day: 'numeric', year: day.getFullYear() === today.getFullYear() ? undefined : 'numeric' }).format(day)
}

/** Groups a newest-first list under Today / Yesterday / date headings (§8). */
export function groupByDay<T>(items: T[], of: (item: T) => string | null | undefined): Array<{ key: string; heading: string; items: T[] }> {
  const groups = new Map<string, { key: string; heading: string; items: T[] }>()
  for (const item of items) {
    const iso = of(item)
    if (!iso) continue
    const at = Date.parse(iso)
    if (!Number.isFinite(at)) continue
    const key = iso.slice(0, 10)
    const existing = groups.get(key)
    if (existing) existing.items.push(item)
    else groups.set(key, { key, heading: formatDayHeading(iso), items: [item] })
  }
  return Array.from(groups.values())
}

// ── Styling helpers (not text) ──────────────────────────────────────────────
export function presenceTone(presence: string): 'accent' | 'ok' | 'neutral' | 'outline' {
  if (presence === 'driving') return 'accent'
  if (presence === 'charging') return 'ok'
  if (presence === 'parked') return 'neutral'
  return 'outline'
}

export function freshnessTone(freshness: string): 'ok' | 'accent' | 'warn' | 'danger' {
  if (freshness === 'live') return 'ok'
  if (freshness === 'recent') return 'accent'
  if (freshness === 'stale') return 'warn'
  return 'danger'
}

/** Colour per vehicle state, shared by markers, badges and gauges. */
export const PRESENCE_COLOR: Record<string, string> = {
  driving: 'var(--blue)',
  charging: 'var(--green)',
  parked: 'var(--ink-tertiary)',
  sleeping: 'var(--ink-tertiary)',
  offline: 'var(--border-strong)',
}

export function completenessNote(filled: number, total: number): string | null {
  if (total <= 0 || filled >= total) return null
  return `${total - filled} of ${total} values unavailable`
}
