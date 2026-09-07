'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ConnectPage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const response = await fetch('/api/tesla/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accessToken: token }) })
    const payload = await response.json()
    if (!response.ok) {
      setError(payload.message || 'Owner API connection failed')
      setLoading(false)
      return
    }
    router.push('/')
    router.refresh()
  }

  return <main className="auth-shell"><section className="auth-panel"><p className="eyebrow">OWNER API CONNECTION</p><h1>Connect your Tesla</h1><p className="auth-copy">Paste an Owner API access token. It is validated once, encrypted before storage, and never sent to the browser again.</p><form onSubmit={submit}><label>Owner API access token<input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="request-status auth-submit" disabled={loading}>{loading ? 'Checking token...' : 'Connect vehicle'}</button></form><p className="auth-note">The app only collects telemetry after checking the vehicle status. Sleeping vehicles are skipped by background collection.</p></section></main>
}
