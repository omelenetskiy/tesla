import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { diagnoseFleetAuth } from '@/lib/fleet/tokens'
import { FleetConfigError, consentRevokeUrl, fleetConfig } from '@/lib/fleet/config'
import { resolveVehicle } from '@/lib/tesla/service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/settings — the Fleet account state, and nothing else.
 *
 * The collection-mode section this used to drive is gone: with telemetry as the only
 * continuous source and "never wake the car" as the rule, there was no mode left to choose.
 * Keeping the control would have implied a knob that no longer changes anything.
 */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const row = await resolveVehicle(user.id, new URL(request.url).searchParams.get('vehicle'))

  /*
   * Fleet state is reported independently of the vehicle row. Coupling the two is what
   * made a successful authorization look like a failure: the token was stored, but no
   * vehicle had been synced yet (that is P2, blocked on the unpinned response shape), so
   * the card went straight back to "Connect Tesla" and the operator saw the flow as
   * broken. Two facts, two lines.
   */
  let fleet: Record<string, unknown>
  try {
    const config = fleetConfig()
    fleet = {
      configured: true,
      region: config.region,
      redirectUri: config.redirectUri,
      // The URL that withdraws the grant on Tesla's side. Our own delete only forgets the
      // tokens; without this the operator has to go hunting for the setting.
      revokeUrl: consentRevokeUrl(config.clientId, config.redirectUri.replace(/\/api\/fleet\/callback$/, '/settings')),
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
    return NextResponse.json({ connected: false, fleet })
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('distance_unit, temperature_unit, time_zone, locale, location_history_enabled')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    connected: true,
    fleet,
    vehicle: { id: row.id, name: row.display_name, distanceUnit: row.distance_unit },
    settings: settings ?? null,
  })
}

/** PATCH /api/settings — display units only. */
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
