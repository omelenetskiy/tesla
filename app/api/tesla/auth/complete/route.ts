import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decryptSecret } from '@/lib/crypto'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { exchangeAuthorizationCode, parseCallbackUrl } from '@/lib/tesla/auth'
import { TeslaApiError } from '@/lib/tesla/errors'
import { syncVehiclesFromList } from '@/lib/tesla/service'
import { TeslaClient } from '@/lib/tesla/client'
import { recordRequest } from '@/lib/tesla/request-log'
import { saveTokenSet } from '@/lib/tesla/tokens'

export const dynamic = 'force-dynamic'

/**
 * Completes the PKCE exchange (§15). The backend owns the session: it decrypts the
 * stored `state` + `code_verifier`, checks the returned `state`, and only then posts
 * the code to Tesla. The verifier is never sent to the browser.
 */
async function complete(callbackUrl: string, userId: string) {
  const sessionCookie = (await cookies()).get('tesla_owner_oauth')
  if (!sessionCookie) throw new TeslaApiError('invalid_grant', 'The Tesla sign-in session has expired. Start the connection again.')

  const saved = JSON.parse(decryptSecret(sessionCookie.value)) as { state?: string; codeVerifier?: string }
  if (!saved.state || !saved.codeVerifier) throw new TeslaApiError('invalid_grant', 'The stored OAuth session is corrupt. Start again.')

  const { code, issuer } = parseCallbackUrl(callbackUrl, saved.state)
  const tokenSet = await exchangeAuthorizationCode({ code, codeVerifier: saved.codeVerifier, issuer })

  const client = new TeslaClient({
    getAccessToken: async () => tokenSet.access_token,
    cacheTtlMs: 0,
    onLog: (entry) => void recordRequest(entry),
  })

  let vehicleSync: { count: number; status: 'ok' | 'unavailable'; reason: string | null } = { count: 0, status: 'unavailable', reason: null }
  let syncedRows: Awaited<ReturnType<typeof syncVehiclesFromList>>['vehicles'] = []
  try {
    const list = await client.getVehicles()
    const result = await syncVehiclesFromList(userId, list)
    syncedRows = result.vehicles
    vehicleSync = { count: result.count, status: 'ok', reason: null }
  } catch (error) {
    vehicleSync = {
      count: 0,
      status: 'unavailable',
      reason: error instanceof TeslaApiError && error.kind === 'forbidden'
        ? 'The token was obtained, but the Owner API rejects vehicle list requests (403). The credentials are stored.'
        : error instanceof Error ? error.message.slice(0, 200) : 'The vehicle list was not fetched',
    }
  }

  const authHost = safeHost(tokenSet.access_token)
  const target = syncedRows[0] ?? null
  if (!target) throw new TeslaApiError('not_found', 'No vehicle found or stored — connect the tokens manually on /connect')

  await saveTokenSet({ vehicleId: target.id, ownerId: userId, tokenSet, authHost })
  return { vehicleSync, credentialVehicleId: target.id, tokenSet }
}

function safeHost(accessToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8')) as { iss?: string }
    const host = payload.iss ? new URL(payload.iss).hostname : null
    return host && host.startsWith('auth.tesla.') ? host : null
  } catch {
    return null
  }
}

/** Browser redirect path: Tesla sends the user back here with ?code&state. */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))
  try {
    await complete(request.url, user.id)
    const response = NextResponse.redirect(new URL('/', request.url))
    response.cookies.delete('tesla_owner_oauth')
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth completion failed'
    return NextResponse.redirect(new URL(`/connect?error=${encodeURIComponent(message)}`, request.url))
  }
}

/** Manual path: the void callback lands in the address bar, so the user pastes it. */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })
  let body: { callbackUrl?: string }
  try {
    body = await request.json() as { callbackUrl?: string }
  } catch {
    return NextResponse.json({ message: 'Malformed request body' }, { status: 400 })
  }
  if (!body.callbackUrl?.trim()) {
    return NextResponse.json({ message: 'Paste the full callback URL' }, { status: 400 })
  }
  try {
    const result = await complete(body.callbackUrl, user.id)
    const response = NextResponse.json({
      connected: true,
      credentialVehicleId: result.credentialVehicleId,
      vehicles: result.vehicleSync,
      message: result.vehicleSync.status === 'ok'
        ? `Tesla connected. Vehicles found: ${result.vehicleSync.count}.`
        : result.vehicleSync.reason,
    })
    response.cookies.delete('tesla_owner_oauth')
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth completion failed'
    return NextResponse.json({ message }, { status: error instanceof TeslaApiError && error.status ? 422 : 502 })
  }
}
