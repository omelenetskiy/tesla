'use client'

import * as React from 'react'
import Link from 'next/link'
import { Bug, Monitor, Moon, Palette, ShieldCheck, Sun } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/utils'
import { formatAge } from '@/lib/format'
import { ageSecondsSince, useNow } from '@/lib/hooks/use-now'
import { type ThemePreference, useTheme } from '@/lib/hooks/use-theme'

/**
 * Settings.
 *
 * Collection mode is the only control with a physical consequence for the car, so each
 * option states what it will and will not do. The previous build advertised "passive"
 * in the README while the dashboard still issued a live status call on every load;
 * these descriptions match what the polling policy actually does.
 */
type Mode = { id: string; label: string; description: string; impact: string }
type Auth = { state: string; expiresAt: string | null; scopes: string[] | null; refreshTokenPresent: boolean; azp: string | null }

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Monitor }> = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

export default function SettingsPage() {
  const now = useNow(30_000)
  const { preference, resolved, choose: chooseTheme } = useTheme()
  const [modes, setModes] = React.useState<Mode[]>([])
  const [current, setCurrent] = React.useState<string | null>(null)
  const [vehicleName, setVehicleName] = React.useState<string | null>(null)
  const [auth, setAuth] = React.useState<Auth | null>(null)
  const [connected, setConnected] = React.useState(false)
  const [saving, setSaving] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  // Starts true and only ever goes false: without it the page renders the
  // "not connected" branch for one frame and then jumps to the loaded layout.
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    const response = await fetch('/api/settings', { cache: 'no-store' })
    if (!response.ok) return null
    return (await response.json()) as {
      connected: boolean
      modes?: Mode[]
      vehicle?: { name: string; collectionMode: string | null }
      auth?: Auth
    }
  }, [])

  const apply = React.useCallback((payload: Awaited<ReturnType<typeof load>>) => {
    if (!payload) return
    setConnected(payload.connected)
    setModes(payload.modes ?? [])
    setCurrent(payload.vehicle?.collectionMode ?? null)
    setVehicleName(payload.vehicle?.name ?? null)
    setAuth(payload.auth ?? null)
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const payload = await load()
      if (cancelled) return
      apply(payload)
      // Cleared even when the request failed, otherwise the skeleton never ends.
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [load, apply])

  const choose = async (mode: string) => {
    setSaving(mode)
    setNotice(null)
    const response = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collectionMode: mode }),
    })
    const payload = (await response.json()) as { message?: string; collectionMode?: string }
    if (!response.ok) setNotice(payload.message ?? 'Could not change the collection mode')
    else setCurrent(payload.collectionMode ?? mode)
    setSaving(null)
    apply(await load())
  }

  // Skeleton mirrors the loaded layout (same cards, same row heights) so nothing
  // shifts when the data lands.
  if (loading) return <SettingsSkeleton />

  return (
    <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <section className="rounded-xl border border-line bg-surface" aria-label="Collection mode">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-[14px] font-semibold text-ink">Data collection</h2>
          <p className="mt-1 max-w-[620px] text-[12.5px] leading-5 text-ink-secondary">
            {vehicleName ? `Vehicle: ${vehicleName}.` : 'No vehicle connected.'} The mode decides whether the app talks to Tesla and how often.
          </p>
        </div>
        <fieldset className="space-y-2 p-3">
          <legend className="sr-only">Collection mode</legend>
          {modes.map((mode) => {
            const active = current === mode.id
            return (
              <label key={mode.id} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors', active ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-muted')}>
                <input
                  type="radio"
                  name="collection-mode"
                  value={mode.id}
                  checked={active}
                  onChange={() => void choose(mode.id)}
                  disabled={saving !== null}
                  className="mt-1 size-4 shrink-0 accent-[var(--blue)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-medium text-ink">{mode.label}</span>
                    {saving === mode.id && <Badge variant="neutral">saving…</Badge>}
                  </span>
                  <span className="mt-1 block text-[12.5px] leading-5 text-ink-secondary">{mode.description}</span>
                  <span className="mt-1 block font-mono text-[11.5px] text-ink-tertiary">{mode.impact}</span>
                </span>
              </label>
            )
          })}
          {!modes.length && <p className="p-2 text-[13px] text-ink-tertiary">Loading modes…</p>}
        </fieldset>
        {notice && <p role="alert" className="border-t border-danger-line bg-danger-soft px-4 py-2.5 text-[12.5px] text-danger">{notice}</p>}
      </section>

      <div className="min-w-0 space-y-3">
        {/*
          Appearance lives here rather than in the header menu: it is a setting, and a
          driver should not have to open an account menu to change the theme. The choice
          is read through useSyncExternalStore, so the control is correct on the first
          paint and does not depend on any request.
        */}
        <section className="rounded-xl border border-line bg-surface p-4" aria-label="Appearance">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <Palette className="size-4 text-ink-tertiary" aria-hidden />
            Appearance
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-5 text-ink-secondary">
            {preference === 'system'
              ? `Following the device setting, which is currently ${resolved}.`
              : preference === 'dark'
                ? 'Always dark — useful on the car screen at night.'
                : 'Always light — the default for daylight reading.'}
          </p>
          <div className="mt-3">
            <Segmented ariaLabel="Appearance" options={THEME_OPTIONS} value={preference} onChange={(value) => chooseTheme(value)} />
          </div>
        </section>

        <section className="rounded-xl border border-line bg-surface p-4" aria-label="Tesla connection">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <ShieldCheck className="size-4 text-ink-tertiary" aria-hidden />
            Connection
          </h2>
          <dl className="mt-3 space-y-2 text-[12.5px]">
            <Row term="State" value={auth?.state ?? (connected ? 'connected' : 'not connected')} />
            <Row term="Access token until" value={auth?.expiresAt ? new Date(auth.expiresAt).toLocaleString() : '—'} />
            <Row term="Scopes" value={auth?.scopes?.join(' ') ?? '—'} />
            <Row term="Client" value={auth?.azp ?? '—'} />
            <Row term="Refresh token" value={auth?.refreshTokenPresent ? 'stored' : 'not stored'} />
          </dl>
          <p className="mt-2.5 text-[11.5px] leading-4 text-ink-tertiary">
            A Tesla password is never requested or stored. Connection is either OAuth with PKCE or an access/refresh pair generated by an external desktop app.
          </p>
          {!connected && (
            <Link href="/connect" className="mt-2.5 inline-flex h-10 items-center rounded-lg border border-accent bg-accent px-4 text-[13.5px] font-medium text-ink-inverse shadow-xs hover:brightness-95">
              Connect Tesla
            </Link>
          )}
        </section>

        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <Bug className="size-4 text-ink-tertiary" aria-hidden />
            Diagnostics
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-5 text-ink-secondary">
            The Owner API console runs each request live and shows Tesla&apos;s status, timing, sanitized response, history and an authentication check.
          </p>
          <Link href="/debug/api" className="mt-2.5 inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-[13.5px] font-medium text-ink shadow-xs hover:bg-surface-muted">
            Open API console
          </Link>
        </section>

        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-[14px] font-semibold text-ink">Storage</h2>
          <p className="mt-1.5 text-[12.5px] leading-5 text-ink-secondary">
            Tokens are encrypted with AES-256-GCM at rest and never sent to the browser. The request log is kept for 7 days.
          </p>
          <p className="mt-2 font-mono text-[11.5px] text-ink-tertiary">{tokenRemaining(auth?.expiresAt ?? null, now)}</p>
        </section>
      </div>
    </div>
  )
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <dt className="text-ink-tertiary">{term}</dt>
      <dd className="min-w-0 break-words font-mono text-ink">{value}</dd>
    </div>
  )
}

function tokenRemaining(expiresAt: string | null, now: number): string {
  if (!expiresAt) return 'token expiry unknown'
  const remaining = ageSecondsSince(expiresAt, now)
  if (!Number.isFinite(remaining)) return 'token expiry unknown'
  const until = Date.parse(expiresAt) - now
  if (until <= 0) return 'token needs refreshing'
  return `refreshes in ${formatAge(until / 1000).replace(' ago', '')}`
}

/** Same grid, same card sizes and row heights as the loaded page. */
function SettingsSkeleton() {
  return (
    <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" aria-busy="true">
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="border-b border-line px-4 py-3">
          <div className="h-4 w-40 animate-pulse rounded bg-surface-muted" />
          <div className="mt-2 h-3 w-72 animate-pulse rounded bg-surface-muted" />
        </div>
        <div className="space-y-2 p-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-[76px] animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="h-4 w-28 animate-pulse rounded bg-surface-muted" />
          <div className="mt-2 h-3 w-[78%] animate-pulse rounded bg-surface-muted" />
          <div className="mt-3 h-11 w-[240px] max-w-full animate-pulse rounded-full bg-surface-muted" />
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="h-4 w-28 animate-pulse rounded bg-surface-muted" />
          <div className="mt-3 space-y-2.5">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="h-3.5 animate-pulse rounded bg-surface-muted" style={{ width: `${90 - index * 12}%` }} />
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="h-4 w-32 animate-pulse rounded bg-surface-muted" />
          <div className="mt-2 h-3 w-full animate-pulse rounded bg-surface-muted" />
          <div className="mt-3 h-10 w-40 animate-pulse rounded-lg bg-surface-muted" />
        </div>
      </div>
    </div>
  )
}
