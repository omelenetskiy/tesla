'use client'

import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

export default function ConnectPage() {
  const router = useRouter()
  const [error] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('error') || '')
  const [callbackUrl, setCallbackUrl] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [refreshToken, setRefreshToken] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function completeConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    try {
      const response = await fetch('/api/tesla/auth/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callbackUrl }) })
      const result = await response.json() as { message?: string }
      if (!response.ok) throw new Error(result.message || 'Tesla connection failed')
      router.push('/')
    } catch (submissionError) {
      setMessage(submissionError instanceof Error ? submissionError.message : 'Tesla connection failed')
      setSubmitting(false)
    }
  }

  async function connectWithTokens(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    try {
      const response = await fetch('/api/tesla/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken, refreshToken }) })
      const result = await response.json() as { message?: string }
      if (!response.ok) throw new Error(result.message || 'Tesla connection failed')
      router.push('/')
    } catch (submissionError) {
      setMessage(submissionError instanceof Error ? submissionError.message : 'Tesla connection failed')
      setSubmitting(false)
    }
  }

  return <main className="auth-shell"><section className="auth-panel"><h1>Подключить Tesla</h1><p className="auth-copy">Создайте токены <strong>Owner API</strong> (не Fleet API). Пароль Tesla и MFA остаются внутри CLI-приложения.</p><p className="auth-note">Скачайте <a href="https://github.com/adriankumpf/tesla_auth/releases/latest" target="_blank" rel="noreferrer">Tesla Auth</a>, выполните <code>tesla-auth login</code> и <code>tesla-auth token -o owner</code>, затем вставьте токены ниже.</p><form onSubmit={connectWithTokens}><label htmlFor="access-token">Access token<input id="access-token" name="accessToken" type="password" required value={accessToken} onChange={(event) => setAccessToken(event.target.value)} autoComplete="off" /></label><label htmlFor="refresh-token">Refresh token<input id="refresh-token" name="refreshToken" type="password" required value={refreshToken} onChange={(event) => setRefreshToken(event.target.value)} autoComplete="off" /></label><button className="request-status auth-submit" type="submit" disabled={submitting}>{submitting ? 'Подключение...' : 'Подключить Owner API'}</button></form>{(error || message) && <p className="form-error" role="alert">{message || error}</p>}<p className="auth-note">Токены передаются на сервер, шифруются и не записываются в логи. Используется Owner API (<code>owner-api.teslamotors.com</code>), не Fleet API.</p></section></main>
}
