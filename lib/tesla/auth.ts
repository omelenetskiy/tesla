import crypto from 'node:crypto'
import { teslaConfig, authOriginForIssuer } from './config'
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
 * the Owner API accept the resulting bearer token. `redirect_uri` is Tesla's own
 * void callback: the authorization code is echoed there, never to our origin, which
 * is why `/connect` captures the callback URL and finishes the exchange server-side.
 */
export function buildAuthorizationUrl(input: { state: string; codeChallenge: string; loginHint?: string }, authOrigin = teslaConfig.authOrigin): string {
  const url = new URL(`${authOrigin}${'/oauth2/v3/authorize'}`)
  url.search = new URLSearchParams({
    client_id: teslaConfig.clientId,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
    redirect_uri: `${authOrigin}/void/callback`,
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
    throw new TeslaApiError('invalid_grant', 'Токен Tesla не является JWT — проверьте пару токенов из Tesla Auth')
  }
  let claims: Record<string, unknown>
  try {
    claims = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<string, unknown>
  } catch {
    throw new TeslaApiError('invalid_grant', 'Не удалось разобрать claims токена Tesla')
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

async function postToken(authOrigin: string, form: Record<string, string>): Promise<TeslaTokenSet> {
  const response = await fetch(`${authOrigin}/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'DriveScope/1.0',
    },
    body: JSON.stringify(form),
    cache: 'no-store',
  })
  const text = await response.text()
  const lowered = text.toLowerCase()
  if (lowered.includes('captcha') || lowered.includes('challenge')) {
    throw new TeslaApiError('challenge', 'Tesla запросила браузерную проверку. Завершите вход в обычном браузере и повторите позже.', { status: response.status, endpoint: '/oauth2/v3/token', method: 'POST', authOrigin })
  }
  let payload: TeslaTokenSet & { error?: string; error_description?: string }
  try {
    payload = JSON.parse(text) as TeslaTokenSet & { error?: string; error_description?: string }
  } catch {
    throw new TeslaApiError('malformed', `Токен-эндпоинт Tesla вернул не-JSON (${response.status})`, { status: response.status, endpoint: '/oauth2/v3/token', method: 'POST', authOrigin, responseBody: redactText(text).slice(0, 400) })
  }
  if (!response.ok || !payload.access_token) {
    const kind = response.status === 400 || response.status === 401 ? 'invalid_grant' : 'unknown'
    throw new TeslaApiError(kind, payload.error_description || payload.error || `Обмен токена завершился с ${response.status}`, { status: response.status, endpoint: '/oauth2/v3/token', method: 'POST', authOrigin, responseBody: redactText(text).slice(0, 400) })
  }
  return payload
}

export async function exchangeAuthorizationCode(input: { code: string; codeVerifier: string; issuer?: string | null }): Promise<TeslaTokenSet> {
  const authOrigin = authOriginForIssuer(input.issuer)
  return postToken(`${authOrigin}/oauth2/v3`, {
    grant_type: 'authorization_code',
    client_id: teslaConfig.clientId,
    code: input.code,
    code_verifier: input.codeVerifier,
    redirect_uri: `${authOrigin}/void/callback`,
  })
}

/**
 * §17/§18: refresh against the issuer that minted the token, not a hardcoded global
 * host — the previous refresh path always used auth.tesla.com and would fail a
 * China account whose tokens live on auth.tesla.cn.
 */
export async function refreshTokens(refreshToken: string, authHost?: string | null): Promise<TeslaTokenSet> {
  const origin = authHost ? authOriginForIssuer(`https://${authHost}`) : teslaConfig.authOrigin
  return postToken(`${origin}${teslaConfig.authPath}`, {
    grant_type: 'refresh_token',
    client_id: teslaConfig.clientId,
    refresh_token: refreshToken,
    scope: teslaConfig.scopes.join(' '),
  })
}

/**
 * Read-only credential liveness check (§41 "✓ Access token valid").
 * `userinfo` answers for a live session even when the Owner API itself is gated,
 * which is exactly the distinction the debug console has to show.
 */
export async function verifyAccessToken(accessToken: string, authOrigin = teslaConfig.authOrigin): Promise<{ ok: boolean; status: number; subject?: string | null }> {
  const response = await fetch(`${authOrigin}${teslaConfig.authPath}/userinfo`, {
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
    throw new TeslaApiError('invalid_grant', 'Вставьте полный URL возврата из address bar браузера')
  }
  const trusted = teslaConfig.isTrustedAuthHost(url.hostname)
  if (!trusted) throw new TeslaApiError('invalid_grant', `Недоверенный хост возврата: ${url.hostname}`)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  if (error) throw new TeslaApiError('invalid_grant', `Tesla вернула ошибку авторизации: ${error}`)
  if (!code) throw new TeslaApiError('invalid_grant', 'В URL возврата нет параметра code')
  if (state !== expectedState) throw new TeslaApiError('invalid_grant', 'state не совпадает — начните подключение заново')
  return { code, issuer: url.searchParams.get('issuer') }
}
