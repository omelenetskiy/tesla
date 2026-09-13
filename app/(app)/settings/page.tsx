'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Bug, ExternalLink, KeyRound, Monitor, Moon, Palette, ShieldCheck, Sun } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/utils'
import { formatAge } from '@/lib/format'
import { ageSecondsSince, useNow } from '@/lib/hooks/use-now'
import { type ThemePreference, useTheme } from '@/lib/hooks/use-theme'

/**
 * Settings.
 *
 * Two facts are kept apart on purpose: whether the app is *authorized* with Tesla, and
 * whether a *vehicle row* exists locally. The previous build conflated them, so a
 * successful authorization still rendered "Connect Tesla" — the vehicle sync is a later
 * phase, and until it lands the account is connected with no row.
 */
type FleetAuth = {
  state: string
  connected: boolean
  accessTokenValid: boolean
  refreshTokenPresent: boolean
  expiresAt: string | null
  scopes: string[] | null
  region: string | null
  audienceMatchesConfig: boolean | null
  configuredRegion: string
  detail: string | null
}
type FleetStatus =
  | { configured: true; region: string; redirectUri: string; revokeUrl: string; auth: FleetAuth }
  | { configured: false; reason: string; detail: string }

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Monitor }> = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

const FLEET_STATE_LABEL: Record<string, string> = {
  NOT_CONNECTED: 'Not authorized',
  AUTHORIZED: 'Authorized',
  AUTH_EXPIRED: 'Token expired',
  AUTH_FAILED: 'Token invalid',
}

export default function SettingsPage() {
  const now = useNow(30_000)
  const { preference, resolved, choose: chooseTheme } = useTheme()
  const [fleet, setFleet] = React.useState<FleetStatus | null>(null)
  // Starts true and only ever goes false: without it the page renders the
  // "not connected" branch for one frame and then jumps to the loaded layout.
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    const response = await fetch('/api/settings', { cache: 'no-store' })
    if (!response.ok) return null
    return (await response.json()) as { fleet?: FleetStatus }
  }, [])

  const apply = React.useCallback((payload: Awaited<ReturnType<typeof load>>) => {
    if (!payload) return
    setFleet(payload.fleet ?? null)
  }, [])

  const reload = React.useCallback(async () => {
    apply(await load())
  }, [apply, load])

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

  // Skeleton mirrors the loaded layout (same cards, same row heights) so nothing
  // shifts when the data lands.
  if (loading) return <SettingsSkeleton />

  return (
    <>
      {/* The callback lands here as /settings?fleet=…, so the outcome of the one flow the
          operator cannot see from the inside has to be stated on arrival. */}
      <React.Suspense fallback={null}>
        <FleetNotice onDismissed={() => void reload()} />
      </React.Suspense>
      <div className="mx-auto w-full max-w-[760px] space-y-3">
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

        <FleetAccountCard fleet={fleet} onDisconnected={() => void reload()} />

        {/*
          The step that is easy to miss and impossible to guess at: Tesla's own wording is
          "Before executing a command or accepting a Fleet Telemetry configuration, the
          vehicle ensures the payload is signed by a private key whose public key is present
          on the vehicle" — so the key gates commands *and* telemetry, but not plain reads.
          Quoted from docs/TESLA_FLEET_MIGRATION_PLAN.md §4a.
        */}
        <section className="rounded-xl border border-line bg-surface p-4" aria-label="Virtual key">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <KeyRound className="size-4 text-ink-tertiary" aria-hidden />
            Virtual key
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-5 text-ink-secondary">
            Commands and the telemetry configuration both require your app&apos;s public key to be installed on the car. Reading stored data does not. Until this is done those two
            calls fail with a signature error that has nothing to do with your token.
          </p>
          <ol className="mt-3 space-y-2 text-[12.5px] leading-5 text-ink-secondary">
            <li className="flex gap-2"><Step n={1} />Create the EC pair once: <span className="font-mono text-[11.5px]">openssl ecparam -name prime256v1 -genkey</span>, then export the public part.</li>
            <li className="flex gap-2"><Step n={2} />Publish the public key at <span className="font-mono text-[11.5px]">https://&lt;your-domain&gt;/.well-known/appspecific/com.tesla.3p.public-key.pem</span> — in this app, drop the file at <span className="font-mono text-[11.5px]">public/.well-known/appspecific/</span> and it is served as-is.</li>
            <li className="flex gap-2"><Step n={3} />Register the key with Tesla through the partner account endpoint.</li>
            <li className="flex gap-2"><Step n={4} />Install it on the car: open <span className="font-mono text-[11.5px]">https://tesla.com/_ak/&lt;your-domain&gt;</span> while signed in as a trusted user, then accept on the vehicle&apos;s screen.</li>
          </ol>
          <p className="mt-2.5 text-[11.5px] leading-4 text-ink-tertiary">
            Step 4 is what the authorization page calls the &quot;virtual key pairing&quot; step. It is a one-time action per vehicle.
          </p>
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
          <p className="mt-2 font-mono text-[11.5px] text-ink-tertiary">{tokenRemaining(fleet?.configured ? fleet.auth.expiresAt : null, now)}</p>
        </section>
      </div>
    </>
  )
}

/**
 * The Tesla account card. One button, one direction.
 *
 * There is no token-paste form any more. It belonged to the Owner API, where the native
 * `ownerapi` client could only echo a code to Tesla's own callback and a desktop app had to
 * mint the pair; the Fleet flow has a real registered redirect URI, so the whole second
 * form was an artifact of a transport we no longer use — and it read as "log in twice".
 */
function FleetAccountCard({ fleet, onDisconnected }: { fleet: FleetStatus | null; onDisconnected: () => void }) {
  const [disconnecting, setDisconnecting] = React.useState(false)

  const disconnect = async () => {
    setDisconnecting(true)
    try {
      await fetch('/api/fleet/credentials', { method: 'DELETE' })
      onDisconnected()
    } finally {
      setDisconnecting(false)
    }
  }

  if (!fleet) {
    return (
      <section className="rounded-xl border border-line bg-surface p-4" aria-label="Tesla account">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <ShieldCheck className="size-4 text-ink-tertiary" aria-hidden />
          Tesla account
        </h2>
        <p className="mt-2 text-[12.5px] text-ink-tertiary">Loading…</p>
      </section>
    )
  }

  if (!fleet.configured) {
    return (
      <section className="rounded-xl border border-warn-line bg-warn-soft p-4" aria-label="Tesla account">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-warn">
          <ShieldCheck className="size-4" aria-hidden />
          Tesla account — not configured
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-5 text-ink-secondary">{fleet.detail}</p>
        <p className="mt-2 text-[11.5px] leading-4 text-ink-tertiary">
          This is a server configuration problem, not a Tesla rejection. Nothing was sent to Tesla.
        </p>
      </section>
    )
  }

  const { auth } = fleet
  const authorized = auth.state === 'AUTHORIZED'
  return (
    <section className="rounded-xl border border-line bg-surface p-4" aria-label="Tesla account">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <ShieldCheck className={cn('size-4', authorized ? 'text-ok' : 'text-ink-tertiary')} aria-hidden />
          Tesla account
        </h2>
        <Badge variant={authorized ? 'ok' : auth.state === 'AUTH_EXPIRED' ? 'warn' : 'neutral'}>{FLEET_STATE_LABEL[auth.state] ?? auth.state}</Badge>
      </div>

      <dl className="mt-3 space-y-2 text-[12.5px]">
        <Row term="Region" value={fleet.region} />
        <Row term="Access token until" value={auth.expiresAt ? new Date(auth.expiresAt).toLocaleString('en-US') : '—'} />
        <Row term="Scopes" value={auth.scopes?.join(' ') ?? '—'} />
        <Row term="Refresh token" value={auth.refreshTokenPresent ? 'stored' : 'not stored'} />
        <Row term="Callback" value={fleet.redirectUri} />
      </dl>

      {auth.detail && <p className="mt-2.5 text-[11.5px] leading-4 text-warn">{auth.detail}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* A full navigation, not fetch(): the response is a redirect to Tesla's domain. */}
        <a
          href="/api/fleet/connect"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-accent bg-accent px-4 text-[13.5px] font-medium text-ink-inverse shadow-xs transition hover:brightness-95"
        >
          {authorized ? 'Re-authorize with Tesla' : 'Connect with Tesla'}
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
        {authorized && (
          <button
            type="button"
            onClick={() => void disconnect()}
            disabled={disconnecting}
            className="inline-flex h-10 items-center rounded-lg border border-line px-3 text-[13px] text-ink-secondary transition hover:bg-surface-muted disabled:opacity-60"
          >
            {disconnecting ? 'Disconnecting…' : 'Forget tokens'}
          </button>
        )}
        {authorized && (
          <a
            href={fleet.revokeUrl}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-ink-secondary transition hover:bg-surface-muted"
          >
            Revoke at Tesla
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>

      <p className="mt-2.5 text-[11.5px] leading-4 text-ink-tertiary">
        Your Tesla password is never shown to this app — you sign in on Tesla&apos;s own page, and this app only ever receives the code and the tokens. &quot;Forget tokens&quot;
        deletes what this server holds; &quot;Revoke at Tesla&quot; withdraws the authorization itself, which is the one to use if this device is being sold or the app is being
        retired.
      </p>
    </section>
  )
}

function Step({ n }: { n: number }) {
  return <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-muted font-mono text-[11px] text-ink-secondary">{n}</span>
}

/**
 * Reads the callback's outcome off the URL.
 *
 * The one-time code cannot be replayed, so a failure has to be *named* here — otherwise
 * the operator sees an unchanged screen and assumes the button did nothing.
 */
function FleetNotice({ onDismissed }: { onDismissed: () => void }) {
  const params = useSearchParams()
  const outcome = params.get('fleet')
  const [dismissed, setDismissed] = React.useState(false)
  if (!outcome || dismissed) return null

  const reason = params.get('reason')
  const detail = params.get('detail')
  const scopes = params.get('scopes')
  const ok = outcome === 'connected'
  const required = outcome === 'required'

  const dismiss = () => {
    setDismissed(true)
    // Strip the query so a refresh does not re-announce a result from the last attempt.
    window.history.replaceState(null, '', '/settings')
    onDismissed()
  }

  return (
    <div
      role="status"
      className={cn('mb-3 flex items-start gap-3 rounded-xl border p-3.5 text-[13px]', ok ? 'border-ok-line bg-ok-soft text-ink' : required ? 'border-warn-line bg-warn-soft text-ink' : 'border-danger-line bg-danger-soft text-ink')}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{ok ? 'Tesla account connected.' : required ? 'Tesla Fleet authorization is required to enter the app.' : `Tesla authorization did not complete${reason ? ` (${reason})` : ''}.`}</span>
        <span className="mt-1 block text-[12.5px] leading-5 text-ink-secondary">
          {ok
            ? `Granted scopes: ${scopes ? scopes.replace(/,/g, ' ') : 'unknown'}. The next step is the virtual key below — commands and telemetry are refused without it.`
            : required
              ? 'Connect Tesla first. Until authorization is complete, dashboard and telemetry pages stay locked by design.'
              : (detail ?? 'Start again from the button below; if it repeats, the reason is shown in the server log.')}
        </span>
      </span>
      <button type="button" onClick={dismiss} className="shrink-0 rounded-md px-2 py-1 text-[12.5px] text-ink-secondary transition hover:bg-surface">
        Dismiss
      </button>
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

/** Same cards, same order and row heights as the loaded page, so nothing shifts. */
function SettingsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[760px] space-y-3" aria-busy="true">
      {/* Appearance */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="h-4 w-28 animate-pulse rounded bg-surface-muted" />
        <div className="mt-2 h-3 w-[78%] animate-pulse rounded bg-surface-muted" />
        <div className="mt-3 h-11 w-[240px] max-w-full animate-pulse rounded-full bg-surface-muted" />
      </div>
      {/* Tesla account */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="h-4 w-32 animate-pulse rounded bg-surface-muted" />
        <div className="mt-3 space-y-2.5">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="h-3.5 animate-pulse rounded bg-surface-muted" style={{ width: `${90 - index * 12}%` }} />
          ))}
        </div>
        <div className="mt-3 h-10 w-48 animate-pulse rounded-lg bg-surface-muted" />
      </div>
      {/* Virtual key */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="h-4 w-24 animate-pulse rounded bg-surface-muted" />
        <div className="mt-2 space-y-1.5">
          <div className="h-3 w-full animate-pulse rounded bg-surface-muted" />
          <div className="h-3 w-[65%] animate-pulse rounded bg-surface-muted" />
        </div>
        <div className="mt-3 space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="size-5 shrink-0 animate-pulse rounded-full bg-surface-muted" />
              <div className="h-3 flex-1 animate-pulse rounded bg-surface-muted" />
            </div>
          ))}
        </div>
      </div>
      {/* Diagnostics */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="h-4 w-32 animate-pulse rounded bg-surface-muted" />
        <div className="mt-2 h-3 w-full animate-pulse rounded bg-surface-muted" />
        <div className="mt-3 h-10 w-40 animate-pulse rounded-lg bg-surface-muted" />
      </div>
      {/* Storage */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="h-4 w-24 animate-pulse rounded bg-surface-muted" />
        <div className="mt-2 h-3 w-[85%] animate-pulse rounded bg-surface-muted" />
        <div className="mt-2 h-3 w-[45%] animate-pulse rounded bg-surface-muted" />
      </div>
    </div>
  )
}
