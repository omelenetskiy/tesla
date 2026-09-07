'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setError('Supabase is not configured. Add the public project URL and key to the deployment environment.')
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
    router.push(mode === 'signup' ? '/connect' : '/')
    router.refresh()
  }

  return <main className="auth-shell"><section className="auth-panel"><p className="eyebrow">DRIVE / SCOPE</p><h1>{mode === 'login' ? 'Sign in to your vehicle data' : 'Create your private workspace'}</h1><p className="auth-copy">Your Tesla credentials stay encrypted on the server. Ordinary dashboard views use saved data and never call the vehicle.</p><form onSubmit={submit}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="request-status auth-submit" disabled={loading}>{loading ? 'Working...' : mode === 'login' ? 'Sign in' : 'Create account'}</button></form><button className="text-link auth-switch" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}>{mode === 'login' ? 'Create an account' : 'I already have an account'}</button></section></main>
}
