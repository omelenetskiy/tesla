import crypto from 'node:crypto'
import http2 from 'node:http2'
import { authBaseForHost, authBaseForIssuer, teslaConfig } from './config'
import { TeslaApiError } from './errors'
import { redactText } from './sanitize'

/**
 * Tesla OAuth (§15) — authorization code + PKCE S256 only.
 *
 * This module deliberately has no way to submit a Tesla password. The previous
 * implementation scraped the SSO form (`identity`/`credential` POST, `_csrf`,
 * MFA factor endpoints); requirement §14 forbids the application ever holding a
 * password, and the scraped flow is also the one most likely to trip Tesla's WAF,
 * so both functions are removed rather than left as unused code.
 */

export type TeslaTokenSet = {
  access_token: string
  refresh_token?: string | null
  expires_in?: number
  id_token?: string
  token_type?: string
}

export type TeslaAuthorizationRequest = {
  url: string
  state: string
  codeVerifier: string
  codeChallenge: string
  createdAt: string
}

export type DecodedTeslaToken = {
  exp: number | null
  iat: number | null
  iss: string | null
  aud: string | string[] | null
  azp: string | null
  scp: string[] | null
  sub: string | null
  ouCode: string | null
}

function randomUrlValue(bytes: number) {
  return crypto.randomBytes(bytes).toString('base64url')
}

/**
 * `client_id=ownerapi` is the documented native-client identifier and is what makes
 * the Fleet API endpoints accept the resulting bearer token. `redirect_uri` is Tesla's own
 * void callback: the authorization code is echoed there, never to our origin, which
 * is why `/connect` captures the callback URL and finishes the exchange server-side.
 */
export function buildAuthorizationUrl(input: { state: string; codeChallenge: string; loginHint?: string }, authBase: string = teslaConfig.authBaseUrl): string {
  // The redirect target is the void callback on the same auth host, and it must be
  // byte-identical to the one replayed at the token endpoint or Tesla rejects the
  // exchange with `redirect_uri does not match`.
  const origin = new URL(authBase).origin
  const url = new URL(`${authBase}/authorize`)
  url.search = new URLSearchParams({
    client_id: teslaConfig.clientId,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
    redirect_uri: `${origin}/void/callback`,
    response_type: 'code',
    scope: teslaConfig.scopes.join(' '),
    state: input.state,
    ...(input.loginHint ? { login_hint: input.loginHint } : {}),
  }).toString()
  return url.toString()
}

export function createAuthorizationRequest(): TeslaAuthorizationRequest {
  const state = randomUrlValue(32)
  const codeVerifier = randomUrlValue(64)
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
  return {
    url: buildAuthorizationUrl({ state, codeChallenge }),
    state,
    codeVerifier,
    codeChallenge,
    createdAt: new Date().toISOString(),
  }
}

export function decodeTeslaToken(accessToken: string): DecodedTeslaToken {
  const segment = accessToken.split('.')[1]
  if (!segment) {
    throw new TeslaApiError('invalid_grant', 'Tesla token is not a JWT — check the token pair from Tesla Auth')
  }
  let claims: Record<string, unknown>
  try {
    claims = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<string, unknown>
  } catch {
    throw new TeslaApiError('invalid_grant', 'Failed to parse the Tesla token claims')
  }
  const scp = typeof claims.scp === 'string' ? [claims.scp] : Array.isArray(claims.scp) ? (claims.scp as string[]) : null
  return {
    exp: typeof claims.exp === 'number' ? claims.exp : null,
    iat: typeof claims.iat === 'number' ? claims.iat : null,
    iss: typeof claims.iss === 'string' ? claims.iss : null,
    aud: (claims.aud as string | string[] | undefined) ?? null,
    azp: typeof claims.azp === 'string' ? claims.azp : null,
    scp,
    sub: typeof claims.sub === 'string' ? claims.sub : null,
    ouCode: typeof claims.ou_code === 'string' ? claims.ou_code : null,
  }
}

/** ISO timestamp from the token's own `exp`, which beats trusting `expires_in`. */
export function accessTokenExpiryIso(accessToken: string): string | null {
  try {
    const { exp } = decodeTeslaToken(accessToken)
    return exp ? new Date(exp * 1000).toISOString() : null
  } catch {
    return null
  }
}

export function isAccessTokenValid(accessToken: string, skewMs = teslaConfig.expirySkewMs): boolean {
  try {
    const { exp } = decodeTeslaToken(accessToken)
    if (!exp) return true
    return exp * 1000 > Date.now() + skewMs
  } catch {
    return false
  }
}

/**
 * Token exchange over HTTP/2 + TLS 1.3.
 *
 * This is the most likely reason the Fleet API answered 403 for a token that
 * `userinfo` accepted. TeslaMate fixed the same class of failure in v4.0.1 by
 * pinning only its auth pool to `[:http1, :http2]` + `tlsv1.3` (PR #5406, "fix:
 * enable HTTP/2 and set TLS to 1.3 for TESLA_AUTH_HOST") and kept using the Owner
 * API for individual accounts — its `TESLA_API_HOST` pool carries no such
 * requirement, and its docs still state "Individual users: the Fleet API is
 * currently still accessible".
 *
 * Node's global fetch is undici and cannot negotiate HTTP/2, so the auth host gets a
 * hand-rolled h2 client. If h2 cannot be established this falls back to fetch, which
 * reproduces the previous behaviour rather than breaking authentication outright.
 */
async function postTokenHttp2(tokenUrl: string, payload: Record<string, string>): Promise<{ status: number; text: string } | null> {
  const url = new URL(tokenUrl)
  const body = JSON.stringify(payload)
  return new Promise((resolve) => {
    let client: http2.ClientHttp2Session
    try {
      client = http2.connect(url.origin, { minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3' })
    } catch {
      resolve(null)
      return
    }
    const settle = (value: { status: number; text: string } | null) => {
      clearTimeout(timer)
      client.destroy()
      resolve(value)
    }
    const timer = setTimeout(() => settle(null), teslaConfig.requestTimeoutMs + 3_000)
    client.on('error', () => settle(null))

    const request = client.request({
      [http2.constants.HTTP2_HEADER_METHOD]: 'POST',
      [http2.constants.HTTP2_HEADER_PATH]: `${url.pathname}${url.search}`,
      [http2.constants.HTTP2_HEADER_CONTENT_TYPE]: 'application/json',
      accept: 'application/json',
      'user-agent': 'DriveScope/1.0',
      [http2.constants.HTTP2_HEADER_CONTENT_LENGTH]: String(Buffer.byteLength(body)),
    })
    let text = ''
    let status = 0
    request.on('response', (headers) => {
      status = Number(headers[http2.constants.HTTP2_HEADER_STATUS])
    })
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      text += chunk
    })
    request.on('error', () => settle(null))
    request.on('end', () => settle(status ? { status, text } : null))
    request.end(body)
  })
}

/**
 * Posts a token request.
 *
 * Takes the *complete* URL. Callers build it from `authBaseFor*` and append only the
 * endpoint name, because the previous version appended `/oauth2/v3/token` to a value
 * that already contained the path and silently produced a 404 for every refresh.
 */
async function postToken(tokenUrl: string, form: Record<string, string>): Promise<TeslaTokenSet> {
  const target = new URL(tokenUrl)
  const endpoint = target.pathname
  const viaHttp2 = await postTokenHttp2(tokenUrl, form)
  let status: number
  let text: string
  if (viaHttp2) {
    status = viaHttp2.status
    text = viaHttp2.text
  } else {
    const fetched = await fetch(tokenUrl, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'DriveScope/1.0' },
      body: JSON.stringify(form),
      cache: 'no-store',
    })
    status = fetched.status
    text = await fetched.text()
  }

  const lowered = text.toLowerCase()
  if (lowered.includes('captcha') || lowered.includes('challenge')) {
    throw new TeslaApiError('challenge', 'Tesla asked for a browser challenge. Complete sign-in in a normal browser, then retry.', { status, endpoint, method: 'POST', authOrigin: target.origin })
  }
  let payload: TeslaTokenSet & { error?: string; error_description?: string }
  try {
    payload = JSON.parse(text) as TeslaTokenSet & { error?: string; error_description?: string }
  } catch {
    throw new TeslaApiError('malformed', `Tesla token endpoint returned non-JSON (${status})`, { status, endpoint, method: 'POST', authOrigin: target.origin, responseBody: redactText(text).slice(0, 400) })
  }
  if (!payload.access_token) {
    const kind = status === 400 || status === 401 ? 'invalid_grant' : 'unknown'
    throw new TeslaApiError(kind, payload.error_description || payload.error || `Token exchange failed with ${status}`, { status, endpoint, method: 'POST', authOrigin: target.origin, responseBody: redactText(text).slice(0, 400) })
  }
  if (payload.access_token.split('.').length !== 3) {
    // An undecodable token has no known expiry, so it cannot be refreshed safely.
    throw new TeslaApiError('malformed', `Tesla returned a token that is not a JWT (${status})`, { status, endpoint, method: 'POST', authOrigin: target.origin })
  }
  return payload
}

export async function exchangeAuthorizationCode(input: { code: string; codeVerifier: string; issuer?: string | null }): Promise<TeslaTokenSet> {
  const authBase = authBaseForIssuer(input.issuer)
  const origin = new URL(authBase).origin
  return postToken(`${authBase}/token`, {
    grant_type: 'authorization_code',
    client_id: teslaConfig.clientId,
    code: input.code,
    code_verifier: input.codeVerifier,
    redirect_uri: `${origin}/void/callback`,
  })
}

/**
 * §17/§18: refresh against the issuer that minted the token, not a hardcoded global
 * host — the previous refresh path always used auth.tesla.com and would fail a
 * China account whose tokens live on auth.tesla.cn.
 */
export async function refreshTokens(refreshToken: string, authHost?: string | null): Promise<TeslaTokenSet> {
  return postToken(`${authBaseForHost(authHost)}/token`, {
    grant_type: 'refresh_token',
    client_id: teslaConfig.clientId,
    refresh_token: refreshToken,
    scope: teslaConfig.scopes.join(' '),
  })
}

/**
 * Read-only credential liveness check (§41 "✓ Access token valid").
 * `userinfo` answers for a live session even when the Fleet API itself is gated,
 * which is exactly the distinction the debug console has to show.
 */
export async function verifyAccessToken(accessToken: string, authBase: string = teslaConfig.authBaseUrl): Promise<{ ok: boolean; status: number; subject?: string | null }> {
  const response = await fetch(`${authBase}/userinfo`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'User-Agent': 'DriveScope/1.0' },
    cache: 'no-store',
  })
  if (!response.ok) {
    await response.body?.cancel()
    return { ok: false, status: response.status, subject: null }
  }
  const payload = (await response.json().catch(() => null)) as { sub?: string } | null
  return { ok: true, status: response.status, subject: payload?.sub ?? null }
}

/** Extracts `code` + `state` from a pasted callback URL, validating the shape. */
export function parseCallbackUrl(callbackUrl: string, expectedState: string): { code: string; issuer: string | null } {
  let url: URL
  try {
    url = new URL(callbackUrl.trim())
  } catch {
    throw new TeslaApiError('invalid_grant', 'Paste the full callback URL from the browser address bar')
  }
  const trusted = teslaConfig.isTrustedAuthHost(url.hostname)
  if (!trusted) throw new TeslaApiError('invalid_grant', `Untrusted callback host: ${url.hostname}`)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  if (error) throw new TeslaApiError('invalid_grant', `Tesla returned an authorization error: ${error}`)
  if (!code) throw new TeslaApiError('invalid_grant', 'The callback URL has no code parameter')
  if (state !== expectedState) throw new TeslaApiError('invalid_grant', 'state does not match — start the connection again')
  return { code, issuer: url.searchParams.get('issuer') }
}
