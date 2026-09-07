/**
 * Fleet API third-party authorization.
 *
 * This replaces the Owner API's PKCE flow rather than extending it. The pinned contract
 * (`docs/TESLA_FLEET_MIGRATION_PLAN.md` §4a) has no `code_challenge` anywhere — the
 * authorize parameter list carries a `nonce` instead — and the token exchange is
 * `application/x-www-form-urlencoded` with a `client_secret` and a regional `audience`.
 * The ES256 key pair the operator generated is not used here either; it signs vehicle
 * *commands*, which is C6/P2 and deliberately absent from this file.
 *
 * No Tesla password, and no way to collect one: the only secret that ever reaches this
 * module is the app's own client secret, from the environment.
 */

import crypto from 'node:crypto'
import { TeslaApiError } from '../tesla/errors'
import { redactText } from '../tesla/sanitize'
import { fleetConfig, type FleetConfig } from './config'

export type FleetTokenSet = {
  access_token: string
  token_type?: string
  expires_in?: number
  refresh_token?: string
  /** Space-separated, exactly as requested or as Tesla narrowed it. */
  scope?: string
  created_at?: number
}

export type FleetTokenClaims = {
  iss?: string
  aud?: string | string[]
  sub?: string
  exp?: number
  iat?: number
  scp?: string[]
  jti?: string
}

export function createAuthorizationRequest(): { state: string; nonce: string } {
  return { state: crypto.randomBytes(24).toString('base64url'), nonce: crypto.randomBytes(24).toString('base64url') }
}

/**
 * The owner-facing authorize URL.
 *
 * `require_requested_scopes=true` is on purpose: without it Tesla can hand back a token
 * that silently omits `vehicle_cmds`, and the first command is what would reveal that —
 * as a 403 with no hint of the real cause. Failing at consent time is cheaper.
 */
export function buildAuthorizationUrl(input: { state: string; nonce: string }, config: FleetConfig = fleetConfig()): string {
  const url = new URL(config.authorizeUrl)
  url.search = new URLSearchParams({
    client_id: config.clientId,
    locale: 'en-US',
    prompt: 'login',
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state: input.state,
    nonce: input.nonce,
    prompt_missing_scopes: 'true',
    require_requested_scopes: 'true',
  }).toString()
  return url.toString()
}

async function postForm(config: FleetConfig, form: Record<string, string>, endpoint: string): Promise<FleetTokenSet> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs)
  let status: number
  let text: string
  try {
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(form).toString(),
      cache: 'no-store',
      signal: controller.signal,
    })
    status = response.status
    text = await response.text()
  } catch (error) {
    const aborted = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
    throw new TeslaApiError(aborted ? 'timeout' : 'network', aborted ? 'Tesla did not answer the token request in time' : 'Network error calling the Tesla token endpoint', {
      endpoint,
      method: 'POST',
      authOrigin: new URL(config.tokenUrl).origin,
    })
  } finally {
    clearTimeout(timer)
  }

  const lowered = text.toLowerCase()
  if (lowered.includes('captcha') || lowered.includes('challenge')) {
    throw new TeslaApiError('challenge', 'Tesla asked for a browser challenge. Complete the sign-in in a normal browser and retry.', { status, endpoint, method: 'POST', authOrigin: new URL(config.tokenUrl).origin })
  }
  let payload: FleetTokenSet & { error?: string; error_description?: string }
  try {
    payload = JSON.parse(text) as FleetTokenSet & { error?: string; error_description?: string }
  } catch {
    throw new TeslaApiError('malformed', `Tesla token endpoint returned non-JSON (${status})`, { status, endpoint, method: 'POST', authOrigin: new URL(config.tokenUrl).origin, responseBody: redactText(text).slice(0, 400) })
  }
  if (!payload.access_token) {
    const kind = status === 400 || status === 401 ? 'invalid_grant' : 'unauthorized'
    throw new TeslaApiError(kind, payload.error_description || payload.error || `Token exchange failed with ${status}`, { status, endpoint, method: 'POST', authOrigin: new URL(config.tokenUrl).origin, responseBody: redactText(text).slice(0, 400) })
  }
  if (payload.access_token.split('.').length !== 3) {
    // Not a JWT means no readable expiry, which makes safe refresh impossible.
    throw new TeslaApiError('malformed', `Tesla returned a token that is not a JWT (${status})`, { status, endpoint, method: 'POST', authOrigin: new URL(config.tokenUrl).origin })
  }
  return payload
}

export async function exchangeAuthorizationCode(input: { code: string }, config: FleetConfig = fleetConfig()): Promise<FleetTokenSet> {
  return postForm(config, {
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: input.code,
    audience: config.audience,
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(' '),
  }, '/oauth2/v3/token')
}

/**
 * §4a quotes the refresh body as `grant_type, client_id, refresh_token` — no client secret.
 * Sending the secret anyway is not a safe "belt and braces": an undocumented extra field on
 * a rotating-refresh endpoint is how a credential gets invalidated instead of refreshed.
 */
export async function refreshFleetTokens(refreshToken: string, config: FleetConfig = fleetConfig()): Promise<FleetTokenSet> {
  return postForm(config, {
    grant_type: 'refresh_token',
    client_id: config.clientId,
    refresh_token: refreshToken,
  }, '/oauth2/v3/token')
}

export function decodeFleetToken(token: string): FleetTokenClaims | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as FleetTokenClaims
  } catch {
    return null
  }
}

/**
 * Expiry comes from the token itself, with `expires_in` only as a fallback.
 *
 * The stored value is what every refresh decision reads, so trusting a field the server
 * could round-trip differently would reintroduce the class of bug where a live token is
 * refreshed too late — or a dead one too early, forever.
 */
export function accessTokenExpiryIso(token: string, expiresIn?: number): string | null {
  const claims = decodeFleetToken(token)
  if (claims?.exp) return new Date(claims.exp * 1000).toISOString()
  if (expiresIn) return new Date(Date.now() + expiresIn * 1000).toISOString()
  return null
}

export function scopesFromTokenSet(tokenSet: FleetTokenSet): string[] | null {
  const fromScope = (value?: string) => (value ? value.split(/[ ,]+/).filter(Boolean) : [])
  const merged = [...fromScope(tokenSet.scope), ...fromScope(decodeFleetToken(tokenSet.access_token)?.scp?.join(' '))]
  const unique = Array.from(new Set(merged))
  return unique.length ? unique : null
}

export function isAccessTokenValid(expiresAt: string | null, skewMs: number, now = Date.now()): boolean {
  if (!expiresAt) return false
  const expiry = Date.parse(expiresAt)
  return Number.isFinite(expiry) && expiry > now + skewMs
}

/**
 * Reads the code off a pasted callback URL.
 *
 * `state` is verified when the caller supplies the expected value: accepting any code from
 * any callback URL is how a CSRF-issued code gets exchanged by the wrong session.
 */
export function parseCallbackUrl(input: string, expectedState?: string | null): { code: string; state: string | null } {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new TeslaApiError('malformed', 'Paste the full callback URL from the browser address bar, or just the code parameter.')
  }
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  if (error) throw new TeslaApiError('invalid_grant', `Tesla refused the authorization: ${error}${url.searchParams.get('error_description') ? ` — ${url.searchParams.get('error_description')}` : ''}`)
  if (!code) throw new TeslaApiError('malformed', 'No code parameter found in that URL.')
  if (expectedState && state && state !== expectedState) throw new TeslaApiError('invalid_grant', 'The state parameter does not match this authorization attempt. Start the sign-in again.')
  return { code, state }
}
