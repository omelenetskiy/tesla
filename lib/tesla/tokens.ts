import { decryptSecret, encryptSecret } from '@/lib/crypto'
import { getSupabaseAdmin } from '@/lib/supabase'
import { accessTokenExpiryIso, decodeTeslaToken, refreshTokens, verifyAccessToken, type TeslaTokenSet } from './auth'
import { teslaConfig } from './config'
import { TeslaApiError, describeTeslaError } from './errors'

/**
 * Credential lifecycle (§17, §45).
 *
 * Invariants:
 *  - tokens are encrypted at rest with the existing AES-256-GCM helper;
 *  - a token value is never returned to a route handler's JSON body, never logged,
 *    and never interpolated into a URL that gets logged;
 *  - when Tesla returns a new refresh token, the newest one always replaces the old
 *    one, because Tesla can invalidate the superseded secret;
 *  - concurrent refreshes are serialised per vehicle — two parallel refreshes with
 *    the same rotating secret is how a working credential gets burned.
 */

type CredentialRow = {
  vehicle_id: string
  owner_id: string
  access_token_ciphertext: string
  refresh_token_ciphertext: string | null
  access_token_expires_at: string | null
  updated_at: string | null
  /** Added by migration 004; absent until the user applies it, so read defensively. */
  auth_host?: string | null
  region?: string | null
}

const CREDENTIAL_COLUMNS = 'vehicle_id, owner_id, access_token_ciphertext, refresh_token_ciphertext, access_token_expires_at, updated_at'

/** §45 states, surfaced verbatim by /debug/api's authentication panel. */
export type TeslaAuthState =
  | 'NOT_CONNECTED'
  | 'AUTHORIZING'
  | 'AUTHORIZED'
  | 'REFRESHING'
  | 'AUTH_EXPIRED'
  | 'AUTH_FAILED'
  | 'API_UNAVAILABLE'

export type StoredCredential = {
  vehicleId: string
  accessToken: string
  refreshToken: string | null
  expiresAt: string | null
  authHost: string | null
  scopes: string[] | null
  azp: string | null
}

const refreshChain = new Map<string, Promise<string>>()

async function loadCredentialRow(vehicleId: string, ownerId?: string): Promise<CredentialRow | null> {
  const supabase = getSupabaseAdmin()
  let query = supabase.from('vehicle_credentials').select(CREDENTIAL_COLUMNS).eq('vehicle_id', vehicleId)
  if (ownerId) query = query.eq('owner_id', ownerId)
  const { data, error } = await query.maybeSingle()
  if (error) throw new TeslaApiError('unknown', `Чтение учётных данных Tesla не удалось: ${error.message}`)
  return (data as CredentialRow | null) ?? null
}

export async function readCredential(vehicleId: string, ownerId?: string): Promise<StoredCredential | null> {
  const row = await loadCredentialRow(vehicleId, ownerId)
  if (!row) return null
  let claims: ReturnType<typeof decodeTeslaToken> | null = null
  try {
    claims = decodeTeslaToken(decryptSecret(row.access_token_ciphertext))
  } catch {
    claims = null
  }
  return {
    vehicleId: row.vehicle_id,
    accessToken: decryptSecret(row.access_token_ciphertext),
    refreshToken: row.refresh_token_ciphertext ? decryptSecret(row.refresh_token_ciphertext) : null,
    expiresAt: row.access_token_expires_at,
    authHost: row.auth_host ?? null,
    scopes: claims?.scp ?? null,
    azp: claims?.azp ?? null,
  }
}

/** Used by /connect and the OAuth completion path. Never returns token material. */
export async function saveTokenSet(input: { vehicleId: string; ownerId: string; tokenSet: TeslaTokenSet; authHost?: string | null }): Promise<{ expiresAt: string | null; rotated: boolean }> {
  const supabase = getSupabaseAdmin()
  const expiresAt = accessTokenExpiryIso(input.tokenSet.access_token)
    ?? (input.tokenSet.expires_in ? new Date(Date.now() + input.tokenSet.expires_in * 1000).toISOString() : null)
  const payload: Record<string, unknown> = {
    vehicle_id: input.vehicleId,
    owner_id: input.ownerId,
    access_token_ciphertext: encryptSecret(input.tokenSet.access_token),
    updated_at: new Date().toISOString(),
  }
  // Only overwrite the refresh secret when Tesla actually issued a new one (§17).
  if (input.tokenSet.refresh_token) payload.refresh_token_ciphertext = encryptSecret(input.tokenSet.refresh_token)
  if (expiresAt) payload.access_token_expires_at = expiresAt
  if (input.authHost) {
    payload.auth_host = input.authHost
    payload.region = input.authHost === 'auth.tesla.cn' ? 'china' : 'global'
  }
  const { error } = await supabase.from('vehicle_credentials').upsert(payload, { onConflict: 'vehicle_id' })
  if (error) throw new TeslaApiError('unknown', `Сохранение токенов Tesla не удалось: ${error.message}`)
  return { expiresAt, rotated: Boolean(input.tokenSet.refresh_token) }
}

/**
 * Refreshes at most once per vehicle at a time and always persists the newest
 * refresh token before handing the access token back.
 */
export async function refreshCredential(vehicleId: string, ownerId?: string): Promise<string> {
  const existing = refreshChain.get(vehicleId)
  if (existing) return existing
  const promise = (async () => {
    const row = await loadCredentialRow(vehicleId, ownerId)
    if (!row) throw new TeslaApiError('invalid_grant', 'Учётная запись Tesla не подключена')
    if (!row.refresh_token_ciphertext) {
      throw new TeslaApiError('invalid_grant', 'Refresh token отсутствует. Создайте новую пару токенов в Tesla Auth и подключите её на /connect.')
    }
    const refreshToken = decryptSecret(row.refresh_token_ciphertext)
    const tokenSet = await refreshTokens(refreshToken, row.auth_host ?? null)
    await saveTokenSet({ vehicleId, ownerId: row.owner_id, tokenSet, authHost: row.auth_host ?? undefined })
    return tokenSet.access_token
  })().finally(() => refreshChain.delete(vehicleId))
  refreshChain.set(vehicleId, promise)
  return promise
}

/** The accessor injected into TeslaClient — one place decides expiry. */
export function createAccessTokenProvider(vehicleId: string, ownerId?: string) {
  return async () => {
    const row = await loadCredentialRow(vehicleId, ownerId)
    if (!row) throw new TeslaApiError('invalid_grant', 'Учётная запись Tesla не подключена')
    const accessToken = decryptSecret(row.access_token_ciphertext)
    const expiresAt = row.access_token_expires_at ? Date.parse(row.access_token_expires_at) : 0
    if (!expiresAt || expiresAt > Date.now() + teslaConfig.expirySkewMs) return accessToken
    if (!row.refresh_token_ciphertext) {
      throw new TeslaApiError('invalid_grant', 'Access token истёк, refresh token не сохранён. Подключите заново новую пару токенов.')
    }
    return refreshCredential(vehicleId, row.owner_id)
  }
}

export type AuthDiagnostics = {
  state: TeslaAuthState
  connected: boolean
  accessTokenValid: boolean
  refreshTokenPresent: boolean
  expiresAt: string | null
  lastCheckedAt: string
  /** Never a token: only the claim shape, so /debug/api can prove `azp`/`scp`. */
  azp: string | null
  scopes: string[] | null
  authHost: string | null
  detail: string | null
}

/**
 * Composes §45's state machine from local evidence plus a read-only userinfo call.
 * `API_UNAVAILABLE` is deliberately distinct from `AUTH_FAILED`: the Owner API gate
 * we measured is the former while the credential itself is fine.
 */
export async function diagnoseAuth(vehicleId: string, ownerId?: string): Promise<AuthDiagnostics> {
  const base = {
    lastCheckedAt: new Date().toISOString(),
    azp: null as string | null,
    scopes: null as string[] | null,
    authHost: null as string | null,
    detail: null as string | null,
  }
  const row = await loadCredentialRow(vehicleId, ownerId)
  if (!row) {
    return { state: 'NOT_CONNECTED', connected: false, accessTokenValid: false, refreshTokenPresent: false, expiresAt: null, ...base }
  }
  const accessToken = decryptSecret(row.access_token_ciphertext)
  let decoded: ReturnType<typeof decodeTeslaToken> | null = null
  try {
    decoded = decodeTeslaToken(accessToken)
  } catch {
    return {
      state: 'AUTH_FAILED',
      connected: true,
      accessTokenValid: false,
      refreshTokenPresent: Boolean(row.refresh_token_ciphertext),
      expiresAt: row.access_token_expires_at,
      ...base,
      detail: 'Сохранённый access token не является корректным JWT',
    }
  }
  const claims = { azp: decoded.azp, scopes: decoded.scp, authHost: row.auth_host ?? null }
  const expiryKnown = row.access_token_expires_at ? Date.parse(row.access_token_expires_at) : 0
  const notExpired = !expiryKnown || expiryKnown > Date.now()
  const verified = await verifyAccessToken(accessToken, row.auth_host ? `https://${row.auth_host}${teslaConfig.authPath}` : undefined)
  if (!verified.ok) {
    return {
      state: verified.status === 401 || verified.status === 403 ? 'AUTH_EXPIRED' : 'API_UNAVAILABLE',
      connected: true,
      accessTokenValid: false,
      refreshTokenPresent: Boolean(row.refresh_token_ciphertext),
      expiresAt: row.access_token_expires_at,
      ...claims,
      lastCheckedAt: base.lastCheckedAt,
      detail: `userinfo вернул ${verified.status}`,
    }
  }
  return {
    state: notExpired ? 'AUTHORIZED' : 'AUTH_EXPIRED',
    connected: true,
    accessTokenValid: notExpired,
    refreshTokenPresent: Boolean(row.refresh_token_ciphertext),
    expiresAt: row.access_token_expires_at,
    ...claims,
    lastCheckedAt: base.lastCheckedAt,
    detail: notExpired ? null : 'Нужно обновление токена',
  }
}

/** Safe summary for API responses: identity and expiry, never secrets. */
export function describeCredentialError(error: unknown) {
  return {
    message: describeTeslaError(error),
    kind: error instanceof TeslaApiError ? error.kind : 'unknown',
    status: error instanceof TeslaApiError ? error.status ?? null : null,
  }
}
