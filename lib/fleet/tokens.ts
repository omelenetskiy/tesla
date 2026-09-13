import { decryptSecret, encryptSecret } from '@/lib/crypto'
import { getSupabaseAdmin } from '@/lib/supabase'
import { TeslaApiError } from '../tesla/errors'
import { accessTokenExpiryIso, decodeFleetToken, refreshFleetTokens, scopesFromTokenSet, type FleetTokenSet } from './auth'
import { fleetConfig, type FleetConfig } from './config'

/**
 * Fleet credential lifecycle, keyed by owner.
 *
 * Inherited from the previous layer because both are load-bearing and both were learned
 * the expensive way:
 *  - tokens are encrypted at rest with the existing AES-256-GCM helper;
 *  - a token value never reaches a route handler's JSON body, a log line, or a URL;
 *  - when Tesla returns a new refresh token it always replaces the old one, because the
 *    superseded secret can be invalidated server-side;
 *  - refreshes are serialised per owner. Two parallel refreshes with one rotating secret
 *    is how a working credential gets burned — and with Fleet the grant is per owner, so
 *    the unit of serialisation is the owner, not the vehicle.
 */

type FleetCredentialRow = {
  owner_id: string
  access_token_ciphertext: string
  refresh_token_ciphertext: string | null
  access_token_expires_at: string | null
  refresh_token_expires_at: string | null
  scopes: string[] | null
  region: string
  audience: string
  granted_at: string
  updated_at: string
}

const CREDENTIAL_COLUMNS = 'owner_id, access_token_ciphertext, refresh_token_ciphertext, access_token_expires_at, refresh_token_expires_at, scopes, region, audience, granted_at, updated_at'

export type FleetAuthState = 'NOT_CONNECTED' | 'AUTHORIZED' | 'AUTH_EXPIRED' | 'AUTH_FAILED'

export type StoredFleetCredential = {
  ownerId: string
  accessToken: string
  refreshToken: string | null
  expiresAt: string | null
  scopes: string[] | null
  region: string
  audience: string
  grantedAt: string
}

const refreshChain = new Map<string, Promise<string>>()

async function loadRow(ownerId: string): Promise<FleetCredentialRow | null> {
  const { data, error } = await getSupabaseAdmin().from('fleet_credentials').select(CREDENTIAL_COLUMNS).eq('owner_id', ownerId).maybeSingle()
  if (error) throw new TeslaApiError('unknown', `Failed to read Fleet credentials: ${error.message}`)
  return (data as FleetCredentialRow | null) ?? null
}

export async function readFleetCredential(ownerId: string): Promise<StoredFleetCredential | null> {
  const row = await loadRow(ownerId)
  if (!row) return null
  let accessToken: string
  try {
    accessToken = decryptSecret(row.access_token_ciphertext)
  } catch {
    return null
  }
  return {
    ownerId: row.owner_id,
    accessToken,
    refreshToken: row.refresh_token_ciphertext ? decryptSecret(row.refresh_token_ciphertext) : null,
    expiresAt: row.access_token_expires_at,
    scopes: row.scopes,
    region: row.region,
    audience: row.audience,
    grantedAt: row.granted_at,
  }
}

/** Called by the callback route and the paste-code path. Never returns token material. */
export async function saveFleetTokenSet(input: { ownerId: string; tokenSet: FleetTokenSet; config?: FleetConfig }): Promise<{ expiresAt: string | null; scopes: string[] | null; rotated: boolean }> {
  const config = input.config ?? fleetConfig()
  const expiresAt = accessTokenExpiryIso(input.tokenSet.access_token, input.tokenSet.expires_in)
  const payload: Record<string, unknown> = {
    owner_id: input.ownerId,
    access_token_ciphertext: encryptSecret(input.tokenSet.access_token),
    access_token_expires_at: expiresAt,
    scopes: scopesFromTokenSet(input.tokenSet),
    region: config.region,
    audience: config.audience,
    updated_at: new Date().toISOString(),
  }
  if (input.tokenSet.refresh_token) payload.refresh_token_ciphertext = encryptSecret(input.tokenSet.refresh_token)
  const { error } = await getSupabaseAdmin().from('fleet_credentials').upsert(payload, { onConflict: 'owner_id' })
  if (error) throw new TeslaApiError('unknown', `Failed to save Fleet tokens: ${error.message}`)
  return { expiresAt, scopes: payload.scopes as string[] | null, rotated: Boolean(input.tokenSet.refresh_token) }
}

export async function refreshFleetCredential(ownerId: string): Promise<string> {
  const existing = refreshChain.get(ownerId)
  if (existing) return existing
  const promise = (async () => {
    const row = await loadRow(ownerId)
    if (!row) throw new TeslaApiError('invalid_grant', 'This Tesla account is not connected over Fleet.')
    if (!row.refresh_token_ciphertext) {
      throw new TeslaApiError('invalid_grant', 'No refresh token is stored. Authorize the app with Tesla again — the grant is what issues it.')
    }
    const tokenSet = await refreshFleetTokens(decryptSecret(row.refresh_token_ciphertext))
    await saveFleetTokenSet({ ownerId, tokenSet })
    return tokenSet.access_token
  })().finally(() => refreshChain.delete(ownerId))
  refreshChain.set(ownerId, promise)
  return promise
}

/** The accessor the Fleet client injects everywhere; one place decides expiry. */
export function createFleetAccessTokenProvider(ownerId: string) {
  return async (): Promise<string> => {
    const row = await loadRow(ownerId)
    if (!row) throw new TeslaApiError('invalid_grant', 'This Tesla account is not connected over Fleet.')
    const config = fleetConfig()
    const expiresAt = row.access_token_expires_at ? Date.parse(row.access_token_expires_at) : 0
    if (!expiresAt || expiresAt > Date.now() + config.expirySkewMs) return decryptSecret(row.access_token_ciphertext)
    if (!row.refresh_token_ciphertext) {
      throw new TeslaApiError('invalid_grant', 'The access token expired and no refresh token was stored. Re-authorize the app with Tesla.')
    }
    return refreshFleetCredential(ownerId)
  }
}

export type FleetAuthDiagnostics = {
  state: FleetAuthState
  connected: boolean
  accessTokenValid: boolean
  refreshTokenPresent: boolean
  expiresAt: string | null
  scopes: string[] | null
  region: string | null
  /** The credential's audience vs the configured one — a mismatch is a 403 waiting to happen. */
  audienceMatchesConfig: boolean | null
  configuredRegion: string
  lastCheckedAt: string
  detail: string | null
}

/**
 * Local evidence only.
 *
 * The previous build verified a token by calling userinfo; that path is not in the pinned
 * Fleet contract (§4b) and is deliberately not guessed here. Expiry, the stored scope list
 * and the audience-vs-region consistency are the three things that actually break, and all
 * three are readable without a request.
 */
export async function diagnoseFleetAuth(ownerId: string): Promise<FleetAuthDiagnostics> {
  const config = fleetConfig()
  const base = {
    configuredRegion: config.region,
    lastCheckedAt: new Date().toISOString(),
    scopes: null as string[] | null,
    region: null as string | null,
    audienceMatchesConfig: null as boolean | null,
    detail: null as string | null,
  }
  const row = await loadRow(ownerId)
  if (!row) {
    return { state: 'NOT_CONNECTED', connected: false, accessTokenValid: false, refreshTokenPresent: false, expiresAt: null, ...base }
  }
  const accessToken = decryptSecret(row.access_token_ciphertext)
  const claims = decodeFleetToken(accessToken)
  if (!claims) {
    return {
      state: 'AUTH_FAILED',
      connected: true,
      accessTokenValid: false,
      refreshTokenPresent: Boolean(row.refresh_token_ciphertext),
      expiresAt: row.access_token_expires_at,
      ...base,
      region: row.region,
      detail: 'The stored access token is not a valid JWT',
    }
  }
  const expiresAt = row.access_token_expires_at ?? (claims.exp ? new Date(claims.exp * 1000).toISOString() : null)
  const notExpired = expiresAt ? Date.parse(expiresAt) > Date.now() : false
  const audienceMatchesConfig = row.audience === config.audience
  return {
    state: notExpired ? 'AUTHORIZED' : 'AUTH_EXPIRED',
    connected: true,
    accessTokenValid: notExpired,
    refreshTokenPresent: Boolean(row.refresh_token_ciphertext),
    expiresAt,
    scopes: row.scopes ?? claims.scp ?? null,
    region: row.region,
    audienceMatchesConfig: audienceMatchesConfig,
    configuredRegion: config.region,
    lastCheckedAt: base.lastCheckedAt,
    detail: !audienceMatchesConfig
      ? `Token audience is ${row.audience} but TESLA_FLEET_REGION=${config.region} points at ${config.audience}. Set the region to match the account, then re-authorize.`
      : notExpired
        ? null
        : 'Access token expired; the next call will refresh it.',
  }
}

/** Safe summary for API responses: identity and expiry, never secrets. */
export function describeFleetCredentialError(error: unknown) {
  return {
    message: error instanceof Error ? error.message : 'Unknown error',
    kind: error instanceof TeslaApiError ? error.kind : 'unknown',
    status: error instanceof TeslaApiError ? error.status ?? null : null,
  }
}
