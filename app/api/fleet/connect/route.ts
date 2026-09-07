import { NextResponse } from 'next/server'
import { encryptSecret } from '@/lib/crypto'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { buildAuthorizationUrl, createAuthorizationRequest } from '@/lib/fleet/auth'
import { FleetConfigError, fleetConfig } from '@/lib/fleet/config'

export const dynamic = 'force-dynamic'

/**
 * Fleet owner authorization (§P1).
 *
 * `state` and `nonce` are generated here and stored encrypted in an httpOnly cookie, so
 * neither reaches page JavaScript. The cookie is `sameSite: lax` deliberately: the callback
 * is a top-level GET navigation from Tesla, and `Strict` would withhold the cookie and
 * turn every successful authorization into a state mismatch.
 *
 * No Tesla password is collected anywhere in this flow — the operator authenticates on
 * Tesla's own page, and the only secret this app ever sees is the code, then the tokens.
 */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  let config
  try {
    config = fleetConfig()
  } catch (error) {
    const reason = error instanceof FleetConfigError ? 'not-configured' : 'config-error'
    const detail = error instanceof Error ? encodeURIComponent(error.message.slice(0, 200)) : ''
    return NextResponse.redirect(new URL(`/settings?fleet=error&reason=${reason}${detail ? `&detail=${detail}` : ''}`, request.url))
  }

  // Refuse before sending the user to Tesla, not after. With a stale redirect URI the flow
  // *looks* successful — Tesla authorizes, redirects, and the one-time code dies on a 404
  // that this app never sees. The code cannot be replayed, so every attempt is wasted.
  if (config.redirectPathWarning) {
    return NextResponse.redirect(new URL(`/settings?fleet=error&reason=wrong-callback-path&detail=${encodeURIComponent(config.redirectPathWarning)}`, request.url))
  }

  const authorization = createAuthorizationRequest()
  const url = buildAuthorizationUrl(authorization, config)
  const response = NextResponse.redirect(url)
  response.cookies.set('fleet_oauth', encryptSecret(JSON.stringify({ state: authorization.state, nonce: authorization.nonce, userId: user.id, createdAt: Date.now() })), {
    httpOnly: true,
    maxAge: 600,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
  return response
}
