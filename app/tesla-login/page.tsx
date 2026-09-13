'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, ShieldCheck } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

type FleetAuth = {
  state: string
  expiresAt: string | null
  scopes: string[] | null
  detail: string | null
}

type FleetStatus =
  | { configured: true; region: string; redirectUri: string; revokeUrl: string; auth: FleetAuth }
  | { configured: false; reason: string; detail: string }

function FleetBanner() {
  const params = useSearchParams()
  const outcome = params.get('fleet')
  const reason = params.get('reason')
  const detail = params.get('detail')
  const scopes = params.get('scopes')
  if (!outcome) return null

  const isConnected = outcome === 'connected'
  const isRequired = outcome === 'required'
  return (
    <section
      role="status"
      className={[
        'rounded-xl border px-3.5 py-3 text-[13px]',
        isConnected ? 'border-ok-line bg-ok-soft text-ink' : isRequired ? 'border-warn-line bg-warn-soft text-ink' : 'border-danger-line bg-danger-soft text-ink',
      ].join(' ')}
    >
      <p className="font-medium">
        {isConnected
          ? 'Tesla account connected.'
          : isRequired
            ? 'Tesla authorization is required to enter the app.'
            : `Tesla authorization did not complete${reason ? ` (${reason})` : ''}.`}
      </p>
      <p className="mt-1 text-[12.5px] leading-5 text-ink-secondary">
        {isConnected
          ? `Granted scopes: ${scopes ? scopes.replace(/,/g, ' ') : 'unknown'}.`
          : detail ?? 'Try again from the button below. If it repeats, check server logs.'}
      </p>
    </section>
  )
}

export default function TeslaLoginPage() {
  const router = useRouter()
  const [fleet, setFleet] = React.useState<FleetStatus | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [disconnecting, setDisconnecting] = React.useState(false)
  const [signingOutEverywhere, setSigningOutEverywhere] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await fetch('/api/settings', { cache: 'no-store' })
      if (!response.ok) {
        if (!cancelled) setLoading(false)
        return
      }
      const payload = (await response.json()) as { fleet?: FleetStatus }
      if (!cancelled) {
        setFleet(payload.fleet ?? null)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const disconnect = async () => {
    setDisconnecting(true)
    try {
      await fetch('/api/fleet/credentials', { method: 'DELETE' })
      const response = await fetch('/api/settings', { cache: 'no-store' })
      if (!response.ok) return
      const payload = (await response.json()) as { fleet?: FleetStatus }
      setFleet(payload.fleet ?? null)
    } finally {
      setDisconnecting(false)
    }
  }

  const auth = fleet?.configured ? fleet.auth : null
  const connected = auth?.state === 'AUTHORIZED'
  const hasTeslaTokens = Boolean(fleet?.configured && auth && auth.state !== 'NOT_CONNECTED')

  const signOutEverywhere = async () => {
    setSigningOutEverywhere(true)
    try {
      await fetch('/api/fleet/credentials', { method: 'DELETE' })
      await createSupabaseBrowserClient().auth.signOut()
      router.replace('/login')
      router.refresh()
    } finally {
      setSigningOutEverywhere(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
      <section className="w-full max-w-[460px] space-y-3 rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary">DriveScope</p>
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">Tesla sign-in</h1>
        <p className="text-[13px] leading-5 text-ink-secondary">
          This page is only for Tesla Fleet authorization. Your Tesla password is entered on Tesla&apos;s own domain.
        </p>

        <React.Suspense fallback={null}>
          <FleetBanner />
        </React.Suspense>

        {loading ? (
          <p className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-[12.5px] text-ink-secondary">Checking connection status…</p>
        ) : !fleet ? (
          <p className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12.5px] text-danger">Could not load Fleet status.</p>
        ) : !fleet.configured ? (
          <p className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{fleet.detail}</p>
        ) : connected ? (
          <div className="space-y-2 rounded-lg border border-ok-line bg-ok-soft px-3 py-3">
            <p className="flex items-center gap-2 text-[13px] font-medium text-ink"><CheckCircle2 className="size-4 text-ok" aria-hidden /> Tesla connected</p>
            <p className="text-[12.5px] text-ink-secondary">Region: {fleet.region}</p>
            <p className="text-[12.5px] text-ink-secondary">Scopes: {auth?.scopes?.join(' ') ?? '—'}</p>
            <p className="text-[12.5px] text-ink-secondary">Access token until: {auth?.expiresAt ? new Date(auth.expiresAt).toLocaleString('en-US') : '—'}</p>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-warn-line bg-warn-soft px-3 py-3">
            <p className="flex items-center gap-2 text-[13px] font-medium text-ink"><AlertTriangle className="size-4 text-warn" aria-hidden /> Tesla is not connected</p>
            <p className="text-[12.5px] text-ink-secondary">Connect your Tesla account to unlock dashboard and vehicle pages.</p>
            {auth?.detail ? <p className="text-[12.5px] text-warn">{auth.detail}</p> : null}
          </div>
        )}

        <div className="space-y-2">
          <a
            href="/api/fleet/connect"
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-4 text-[14px] font-medium text-ink-inverse shadow-xs transition hover:brightness-95"
          >
            <ShieldCheck className="size-4" aria-hidden />
            {connected ? 'Re-authorize with Tesla' : 'Sign in with Tesla'}
          </a>

          {hasTeslaTokens ? (
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={disconnecting}
              className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-line px-4 text-[13.5px] text-ink-secondary transition hover:bg-surface-muted disabled:opacity-60"
            >
              {disconnecting ? 'Disconnecting…' : 'Forget Tesla tokens'}
            </button>
          ) : null}

          {fleet?.configured && connected ? (
            <a href={fleet.revokeUrl} className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-line px-4 text-[13px] text-ink-secondary transition hover:bg-surface-muted">
              Revoke at Tesla
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}

          <button
            type="button"
            onClick={() => void signOutEverywhere()}
            disabled={signingOutEverywhere}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-danger-line bg-danger-soft px-4 text-[13.5px] text-danger transition hover:brightness-95 disabled:opacity-60"
          >
            {signingOutEverywhere ? 'Signing out…' : 'Sign out everywhere'}
          </button>
        </div>

        <div className="pt-1 text-center">
          <Link href={connected ? '/' : '/login'} className="text-[12.5px] text-ink-secondary underline-offset-2 hover:text-ink hover:underline">
            {connected ? 'Open dashboard' : 'Back to app login'}
          </Link>
        </div>
      </section>
    </main>
  )
}

