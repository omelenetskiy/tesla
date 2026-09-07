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
  return NextResponse.redirect(new URL(`/settings?fleet=error&reason=${reason}${suffix}`, request.url))
}

/**
 * Fleet callback (§P1).
 *
 * Exempt from the auth redirect in proxy.ts on purpose: if the app session lapsed while the
 * operator was at Tesla, a redirect to /login would consume the one-time code and lose it.
 * Landing here lets the exchange fail with a stated reason instead.
 *
 * Vehicle syncing is deliberately *not* done here. The response shape of
 * `GET /api/1/vehicles` is not in the pinned contract yet (plan §4b, C4), and inventing
 * field names is exactly how the Owner API build ended up putting a 16-digit streaming id
 * into a path. That arrives in P2, where the console can capture the real payload.
 */
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

  // The cookie is bound to the session that started it, so a code issued for one browser
  // cannot be completed by another.
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
    const response = NextResponse.redirect(new URL(`/settings?fleet=connected&scopes=${encodeURIComponent((saved.scopes ?? []).join(','))}`, request.url))
    response.cookies.delete('fleet_oauth')
    return response
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error'
    // A used or replayed code cannot be retried, so the cookie is cleared either way —
    // leaving it would let a refresh button re-post a dead code and report a confusing 400.
    const response = failure(request, error instanceof TeslaApiError ? `exchange-${error.kind}` : 'exchange-failed', detail)
    response.cookies.delete('fleet_oauth')
    return response
  }
}
