'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { hasSupabaseAuthEnv, SUPABASE_AUTH_ENV_ERROR } from '@/lib/supabase-auth-env'

/**
 * Application account (not Tesla). This is a local Supabase identity that owns the
 * vehicle rows and the encrypted tokens — signing in here does not touch Tesla, and
 * it is not where a Tesla password would go.
 */
export default function LoginPage() {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const supabaseConfigured = hasSupabaseAuthEnv()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const configurationError = !supabaseConfigured ? SUPABASE_AUTH_ENV_ERROR : ''

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    if (!supabaseConfigured) {
      setError(SUPABASE_AUTH_ENV_ERROR)
      setLoading(false)
      return
    }
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }
    if (mode === 'signup' && !result.data.session) {
      setError('Account created. Confirm your email, then sign in.')
      setLoading(false)
      return
    }
    router.push('/tesla-login')
    router.refresh()
  }

  const field = 'h-10 w-full rounded-lg border border-line bg-surface px-3 text-[14px] text-ink placeholder:text-ink-tertiary focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25'

  // In the installed app this is the first screen and the one an owner adds to the home
  // screen from, so the card is centred in the space the status bar and the home indicator
  // leave rather than in the whole panel.
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
      <section className="w-full max-w-[380px] rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary">DriveScope</p>
        <h1 className="mt-1 text-[19px] font-semibold tracking-[-0.01em] text-ink">{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
        <p className="mt-1.5 text-[13px] leading-5 text-ink-secondary">
          Step 1 of 2: sign in to your app account. After this screen, you continue to a dedicated Tesla sign-in page that opens Tesla&apos;s own OAuth flow.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-secondary">Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-secondary">Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required className={field} />
          </label>

          {(error || configurationError) && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12.5px] leading-4 text-danger">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0">{error || configurationError}</span>
            </p>
          )}

          <button type="submit" disabled={loading} className="h-10 w-full rounded-lg border border-accent bg-accent px-4 text-[14px] font-medium text-ink-inverse shadow-xs transition-[filter] hover:brightness-95 disabled:opacity-60">
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login')
            setError('')
          }}
          className="mt-3 h-9 w-full rounded-lg text-[13px] text-ink-secondary hover:text-ink"
        >
          {mode === 'login' ? 'Create an account instead' : 'I already have an account'}
        </button>
      </section>
    </main>
  )
}
