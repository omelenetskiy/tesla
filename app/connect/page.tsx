'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, ExternalLink, KeyRound, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Connect Tesla (§16).
 *
 * The previous screen showed a bare two-field form and never said what belonged in
 * it, so it read like a password prompt. It is not one: this app never asks for a
 * Tesla password (§14). Both paths below end with the same thing — an Owner API
 * access token plus a refresh token held encrypted on the server.
 *
 * Path A is genuinely OAuth (PKCE S256 + state, verifier kept server-side), but
 * Tesla only echoes the authorization code to its own `void/callback` address for
 * `client_id=ownerapi`, so the final URL has to be pasted back. That is a property
 * of Tesla's native client, not a shortcut here.
 */
type Status = { connected: boolean; vehicleCount: number; expiresAt: string | null; message: string | null }

export default function ConnectPage() {
  const router = useRouter()
  const [tab, setTab] = React.useState<'oauth' | 'tokens'>('tokens')
  const [accessToken, setAccessToken] = React.useState('')
  const [refreshToken, setRefreshToken] = React.useState('')
  const [callbackUrl, setCallbackUrl] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  // Read from the query string during the first render rather than in an effect, so
  // an OAuth error arriving from a redirect does not cascade a second render.
  const [error, setError] = React.useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('error'),
  )
  const [ok, setOk] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<Status | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await fetch('/api/tesla/connect', { method: 'PUT' })
      if (!response.ok || cancelled) return
      const payload = (await response.json()) as Omit<Status, 'message'>
      setStatus({ ...payload, message: null })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const submitTokens = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const response = await fetch('/api/tesla/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: accessToken.trim(), refreshToken: refreshToken.trim() }),
    })
    const payload = (await response.json()) as { message?: string; vehicles?: { count: number; status: string } }
    setBusy(false)
    if (!response.ok) {
      setError(payload.message ?? 'Connection failed')
      return
    }
    setOk(payload.message ?? 'Tesla connected')
    window.setTimeout(() => router.push('/'), 1_400)
  }

  const submitCallback = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const response = await fetch('/api/tesla/auth/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callbackUrl: callbackUrl.trim() }),
    })
    const payload = (await response.json()) as { message?: string }
    setBusy(false)
    if (!response.ok) {
      setError(payload.message ?? 'Authorization could not be completed')
      return
    }
    setOk(payload.message ?? 'Tesla connected')
    window.setTimeout(() => router.push('/'), 1_400)
  }

  const startOAuth = async () => {
    setError(null)
    // The server builds the PKCE request and redirects; the popup lands on Tesla's
    // void callback, whose URL is copied back into the field below.
    const response = await fetch('/api/tesla/connect', { method: 'GET', redirect: 'manual' })
    const target = response.headers.get('location') ?? response.url
    const popup = window.open(target, 'tesla-oauth', 'width=520,height=760')
    if (!popup) {
      setError('Your browser blocked the sign-in window. Allow pop-ups for this site, or copy the sign-in link.')
      return
    }
    setTab('oauth')
  }

  return (
    <main className="flex min-h-dvh items-start justify-center bg-canvas p-4 sm:items-center">
      <div className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div className="border-b border-line px-5 py-4">
          <h1 className="text-[19px] font-semibold tracking-[-0.01em] text-ink">Connect Tesla</h1>
          <p className="mt-1 text-[13px] leading-5 text-ink-secondary">
            Your Tesla password is never entered here or stored by this app. Both options end with the same pair of Owner API tokens on the server.
          </p>
        </div>

        {status?.connected && (
          <div className="flex items-start gap-2.5 border-b border-ok-line bg-ok-soft px-5 py-3">
            <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
            <p className="text-[13px] leading-5 text-ink">
              Already connected{status.vehicleCount ? ` · ${status.vehicleCount} vehicle${status.vehicleCount > 1 ? 's' : ''}` : ''}
              {status.expiresAt ? ` · token valid until ${new Date(status.expiresAt).toLocaleString()}` : ''}
            </p>
          </div>
        )}

        <div className="flex gap-1 border-b border-line px-5 pt-4">
          {([
            { id: 'tokens', label: 'Paste tokens', icon: KeyRound },
            { id: 'oauth', label: 'Sign in with Tesla', icon: Link2 },
          ] as const).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'flex h-9 items-center gap-2 rounded-t-lg border-b-2 px-3 text-[13px] font-medium transition-colors',
                tab === item.id ? 'border-accent text-ink' : 'border-transparent text-ink-secondary hover:text-ink',
              )}
            >
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </button>
          ))}
        </div>

        <div className="px-5 py-5">
          {tab === 'tokens' ? (
            <form onSubmit={submitTokens} className="space-y-4">
              <ol className="space-y-2 rounded-lg border border-line bg-canvas p-3.5 text-[12.5px] leading-5 text-ink-secondary">
                <li>
                  1. Install <a href="https://github.com/adriankumpf/tesla_auth/releases/latest" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">Tesla Auth<ExternalLink className="size-3" aria-hidden /></a> — a desktop CLI.
                </li>
                <li>
                  2. Run <code className="rounded-xs bg-surface-muted px-1.5 py-0.5 font-mono text-[11.5px] text-ink">tesla-auth login</code> — you sign into Tesla in the browser it opens.
                </li>
                <li>
                  3. Run <code className="rounded-xs bg-surface-muted px-1.5 py-0.5 font-mono text-[11.5px] text-ink">tesla-auth token -o owner</code> and copy both values.
                </li>
                <li>These are long strings starting <code className="font-mono text-[11.5px]">eyJ…</code>. They are access/refresh tokens, not your password.</li>
              </ol>

              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-ink-secondary">Access token</span>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(event) => setAccessToken(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  required
                  placeholder="eyJhbGciOi…"
                  className="h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono text-[13px] text-ink placeholder:text-ink-tertiary focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-ink-secondary">Refresh token</span>
                <input
                  type="password"
                  value={refreshToken}
                  onChange={(event) => setRefreshToken(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  required
                  placeholder="eyJhbGciOi…"
                  className="h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono text-[13px] text-ink placeholder:text-ink-tertiary focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
                />
              </label>

              <button type="submit" disabled={busy} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-4 text-[14px] font-medium text-ink-inverse shadow-xs transition-[filter] hover:brightness-95 disabled:opacity-60">
                {busy ? 'Connecting…' : 'Connect'}
              </button>
            </form>
          ) : (
            <form onSubmit={submitCallback} className="space-y-4">
              <p className="rounded-lg border border-line bg-canvas p-3.5 text-[12.5px] leading-5 text-ink-secondary">
                Opens Tesla&apos;s own sign-in page with a PKCE request generated on the server. Tesla returns the code to its native callback address rather than to this app, so
                after signing in you copy the final URL from the address bar and paste it here.
              </p>
              <button type="button" onClick={() => void startOAuth()} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-[14px] font-medium text-ink shadow-xs hover:bg-surface-muted">
                <Link2 className="size-4" aria-hidden />
                Open Tesla sign-in
              </button>
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-ink-secondary">Paste the final URL (contains code=…&amp;state=…)</span>
                <input
                  type="url"
                  value={callbackUrl}
                  onChange={(event) => setCallbackUrl(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  required
                  placeholder="https://auth.tesla.com/void/callback?code=…"
                  className="h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono text-[12.5px] text-ink placeholder:text-ink-tertiary focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
                />
              </label>
              <button type="submit" disabled={busy} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-4 text-[14px] font-medium text-ink-inverse shadow-xs hover:brightness-95 disabled:opacity-60">
                {busy ? 'Completing…' : 'Complete connection'}
              </button>
            </form>
          )}

          {error && (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2.5 text-[12.5px] leading-5 text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">{error}</span>
            </p>
          )}
          {ok && (
            <p role="status" className="mt-4 flex items-start gap-2 rounded-lg border border-ok-line bg-ok-soft px-3 py-2.5 text-[12.5px] text-ink">
              <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
              {ok}
            </p>
          )}

          <p className="mt-4 text-[11.5px] leading-4 text-ink-tertiary">
            Tokens are encrypted with AES-256-GCM before storage, refreshed automatically, and never sent to the browser or written to logs.
          </p>
        </div>
      </div>
    </main>
  )
}
