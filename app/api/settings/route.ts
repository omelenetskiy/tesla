import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { diagnoseFleetAuth } from '@/lib/fleet/tokens'
import { FleetConfigError, consentRevokeUrl, fleetConfig } from '@/lib/fleet/config'
import { resolveVehicle } from '@/lib/tesla/service'

export const dynamic = 'force-dynamic'

function fleetCookieAllowed(fleet: Record<string, unknown>): boolean {
  const auth = fleet.auth as { state?: string } | undefined
  return fleet.configured === true && auth?.state === 'AUTHORIZED'
}

/**
 * GET /api/settings - the Fleet account state, and nothing else.
 */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })

  try {
    const supabase = getSupabaseAdmin()
    const row = await resolveVehicle(user.id, new URL(request.url).searchParams.get('vehicle'))

    let fleet: Record<string, unknown>
    try {
      const config = fleetConfig()
      fleet = {
        configured: true,
        region: config.region,
        redirectUri: config.redirectUri,
        revokeUrl: consentRevokeUrl(config.clientId, config.redirectUri.replace(/\/api\/fleet\/callback$/, '/tesla-login')),
        auth: await diagnoseFleetAuth(user.id),
      }
    } catch (error) {
      fleet = {
        configured: false,
        reason: error instanceof FleetConfigError ? 'not-configured' : 'config-error',
        detail: error instanceof Error ? error.message : 'Unknown configuration error',
      }
    }

    if (!row) {
      const response = NextResponse.json({ connected: false, fleet })
      if (fleetCookieAllowed(fleet)) {
        response.cookies.set('fleet_authorized', '1', {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 60 * 60 * 24 * 90,
        })
      } else {
        response.cookies.delete('fleet_authorized')
      }
      return response
    }

    const { data: settings } = await supabase
      .from('user_settings')
      .select('distance_unit, temperature_unit, time_zone, locale, location_history_enabled')
      .eq('user_id', user.id)
      .maybeSingle()

    const response = NextResponse.json({
      connected: true,
      fleet,
      vehicle: { id: row.id, name: row.display_name, distanceUnit: row.distance_unit },
      settings: settings ?? null,
    })
    if (fleetCookieAllowed(fleet)) {
      response.cookies.set('fleet_authorized', '1', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 90,
      })
    } else {
      response.cookies.delete('fleet_authorized')
    }
    return response
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        fleet: {
          configured: false,
          reason: 'backend-error',
          detail: error instanceof Error ? error.message : 'Settings backend is temporarily unavailable.',
        },
      },
      { status: 503 },
    )
  }
}

/** PATCH /api/settings - display units only. */
export async function PATCH(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })

  let body: { distanceUnit?: string; temperatureUnit?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Malformed request body' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  if (body.distanceUnit || body.temperatureUnit) {
    if (body.distanceUnit && !['km', 'mi'].includes(body.distanceUnit)) return NextResponse.json({ message: 'Invalid distance unit' }, { status: 400 })
    if (body.temperatureUnit && !['C', 'F'].includes(body.temperatureUnit)) return NextResponse.json({ message: 'Invalid temperature unit' }, { status: 400 })
    const { error } = await supabase.from('user_settings').upsert({
      user_id: user.id,
      ...(body.distanceUnit ? { distance_unit: body.distanceUnit } : {}),
      ...(body.temperatureUnit ? { temperature_unit: body.temperatureUnit } : {}),
      updated_at: new Date().toISOString(),
    })
    if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
