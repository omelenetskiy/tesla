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
  if (!sessionCookie) throw new TeslaApiError('invalid_grant', 'Сессия входа в Tesla истекла. Начните подключение заново.')

  const saved = JSON.parse(decryptSecret(sessionCookie.value)) as { state?: string; codeVerifier?: string }
  if (!saved.state || !saved.codeVerifier) throw new TeslaApiError('invalid_grant', 'Сохранённая сессия OAuth повреждена. Начните заново.')

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
        ? 'Токен получен, но Owner API отклоняет запросы списка автомобилей (403). Учётные данные сохранены.'
        : error instanceof Error ? error.message.slice(0, 200) : 'Список автомобилей не получен',
    }
  }

  const authHost = safeHost(tokenSet.access_token)
  const target = syncedRows[0] ?? null
  if (!target) throw new TeslaApiError('not_found', 'Автомобиль не найден и не сохранён — подключите токены вручную на /connect')

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
    const message = error instanceof Error ? error.message : 'Завершение OAuth не удалось'
    return NextResponse.redirect(new URL(`/connect?error=${encodeURIComponent(message)}`, request.url))
  }
}

/** Manual path: the void callback lands in the address bar, so the user pastes it. */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Требуется вход в приложение' }, { status: 401 })
  let body: { callbackUrl?: string }
  try {
    body = await request.json() as { callbackUrl?: string }
  } catch {
    return NextResponse.json({ message: 'Некорректное тело запроса' }, { status: 400 })
  }
  if (!body.callbackUrl?.trim()) {
    return NextResponse.json({ message: 'Вставьте URL возврата целиком' }, { status: 400 })
  }
  try {
    const result = await complete(body.callbackUrl, user.id)
    const response = NextResponse.json({
      connected: true,
      credentialVehicleId: result.credentialVehicleId,
      vehicles: result.vehicleSync,
      message: result.vehicleSync.status === 'ok'
        ? `Tesla подключена. Найдено автомобилей: ${result.vehicleSync.count}.`
        : result.vehicleSync.reason,
    })
    response.cookies.delete('tesla_owner_oauth')
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Завершение OAuth не удалось'
    return NextResponse.json({ message }, { status: error instanceof TeslaApiError && error.status ? 422 : 502 })
  }
}
