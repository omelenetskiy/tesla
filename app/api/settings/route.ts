import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { diagnoseAuth } from '@/lib/tesla/tokens'
import { resolveVehicle } from '@/lib/tesla/service'

export const dynamic = 'force-dynamic'

const COLLECTION_MODES = ['passive', 'conservative', 'on_demand'] as const
type CollectionMode = (typeof COLLECTION_MODES)[number]

function describeMode(mode: CollectionMode) {
  if (mode === 'passive') {
    return {
      label: 'Passive',
      description: 'Database reads only. The app never contacts Tesla at all, so the data is not refreshed.',
      impact: 'Zero impact on charge',
    }
  }
  if (mode === 'conservative') {
    return {
      label: 'Conservative',
      description: 'Periodic check of whether the vehicle is reachable. Telemetry is requested only when it is already online; no wake-up call is made.',
      impact: 'Minimal: one cheap request per scheduled run',
    }
  }
  return {
    label: 'On demand',
    description: 'Updates when you press "Refresh". Between requests the stored data is shown.',
    impact: 'Depends on how often you press it',
  }
}

/**
 * GET /api/settings — effective configuration plus the honest consequence of the
 * collection mode, so the screen can explain battery impact instead of hiding it
 * behind a word like "aggressive".
 */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const row = await resolveVehicle(user.id, new URL(request.url).searchParams.get('vehicle'))

  if (!row) {
    return NextResponse.json({
      connected: false,
      modes: COLLECTION_MODES.map((mode) => ({ id: mode, ...describeMode(mode) })),
    })
  }

  const [{ data: settings }, auth] = await Promise.all([
    supabase.from('user_settings').select('distance_unit, temperature_unit, time_zone, locale, location_history_enabled').eq('user_id', user.id).maybeSingle(),
    diagnoseAuth(row.id, user.id),
  ])

  return NextResponse.json({
    connected: true,
    vehicle: { id: row.id, name: row.display_name, collectionMode: row.collection_mode, pollingProfile: row.polling_profile, distanceUnit: row.distance_unit },
    settings: settings ?? null,
    auth: { state: auth.state, expiresAt: auth.expiresAt, scopes: auth.scopes, azp: auth.azp, refreshTokenPresent: auth.refreshTokenPresent },
    modes: COLLECTION_MODES.map((mode) => ({ id: mode, ...describeMode(mode) })),
  })
}

/** PATCH /api/settings — writes the collection mode (validated) and display units. */
export async function PATCH(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })

  let body: { collectionMode?: string; distanceUnit?: string; temperatureUnit?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Malformed request body' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const row = await resolveVehicle(user.id)
  if (!row) return NextResponse.json({ message: 'No vehicle connected' }, { status: 404 })

  if (body.collectionMode !== undefined) {
    if (!(COLLECTION_MODES as readonly string[]).includes(body.collectionMode)) {
      return NextResponse.json({ message: 'Invalid collection mode' }, { status: 400 })
    }
    const { error } = await supabase.from('vehicles').update({ collection_mode: body.collectionMode }).eq('id', row.id).eq('owner_id', user.id)
    if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  }

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

  const updated = await resolveVehicle(user.id)
  return NextResponse.json({ ok: true, collectionMode: updated?.collection_mode ?? null })
}
