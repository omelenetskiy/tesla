import { NextRequest, NextResponse } from 'next/server'
import { decryptSecret } from '@/lib/crypto'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { exchangeAuthorizationCode, parseCallbackUrl } from '@/lib/fleet/auth'
import { FleetConfigError, fleetConfig } from '@/lib/fleet/config'
import { saveFleetTokenSet } from '@/lib/fleet/tokens'
import { TeslaApiError } from '@/lib/tesla/errors'

export const dynamic = 'force-dynamic'

type PendingAuthorization = { state?: string; nonce?: string; userId?: string; createdAt?: number }

const MAX_AGE_MS = 10 * 60_000

function failure(request: NextRequest, reason: string, detail?: string) {
  const suffix = detail ? `&detail=${encodeURIComponent(detail.slice(0, 200))}` : ''
  return NextResponse.redirect(new URL(`/tesla-login?fleet=error&reason=${reason}${suffix}`, request.url))
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return failure(request, 'session-expired')

  const cookie = request.cookies.get('fleet_oauth')?.value
  if (!cookie) return failure(request, 'no-pending-authorization')

  let pending: PendingAuthorization
  try {
    pending = JSON.parse(decryptSecret(cookie)) as PendingAuthorization
  } catch {
    return failure(request, 'unreadable-authorization-state')
  }

  if (!pending.userId || pending.userId !== user.id) return failure(request, 'authorization-mismatch')
  if (!pending.state) return failure(request, 'authorization-mismatch')
  if (pending.createdAt && Date.now() - pending.createdAt > MAX_AGE_MS) return failure(request, 'authorization-expired')

  const incoming = new URL(request.url)
  let code: string
  try {
    const parsed = parseCallbackUrl(incoming.toString(), pending.state)
    code = parsed.code
  } catch (error) {
    if (error instanceof TeslaApiError) {
      const reason = error.kind === 'invalid_grant' ? (error.status ? 'tesla-refused' : 'state-mismatch') : 'malformed-callback'
      return failure(request, reason, error.message)
    }
    return failure(request, 'malformed-callback')
  }

  let config
  try {
    config = fleetConfig()
  } catch (error) {
    return failure(request, error instanceof FleetConfigError ? 'not-configured' : 'config-error')
  }

  try {
    const tokenSet = await exchangeAuthorizationCode({ code }, config)
    const saved = await saveFleetTokenSet({ ownerId: user.id, tokenSet, config })
    const response = NextResponse.redirect(new URL(`/tesla-login?fleet=connected&scopes=${encodeURIComponent((saved.scopes ?? []).join(','))}`, request.url))
    response.cookies.set('fleet_authorized', '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 90,
    })
    response.cookies.delete('fleet_oauth')
    return response
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error'
    const response = failure(request, error instanceof TeslaApiError ? `exchange-${error.kind}` : 'exchange-failed', detail)
    response.cookies.delete('fleet_oauth')
    return response
  }
}
