import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { listVehicleSummaries, readVehicleStatus, resolveVehicle } from '@/lib/tesla/service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/vehicle — the dashboard's single read.
 *
 * Accepts `?vehicle=<uuid>` for the selector and `?fresh=true&allowWake=true` for
 * the explicit, confirmed current-status action. Everything else is decided by the
 * state-aware polling policy, so ordinary navigation costs zero Tesla requests once
 * a fresh snapshot exists (§21, §48).
 */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })

  const url = new URL(request.url)
  const requestedVehicleId = url.searchParams.get('vehicle')
  const row = await resolveVehicle(user.id, requestedVehicleId)
  if (!row) {
    return NextResponse.json({
      message: 'No vehicle connected',
      needsConnection: true,
      status: null,
      vehicle: null,
      vehicles: [],
    })
  }

  const force = url.searchParams.get('fresh') === 'true'
  const mayWake = url.searchParams.get('allowWake') === 'true'
  const snapshot = await readVehicleStatus({ row, force, mayWake })
  const vehicles = await listVehicleSummaries(user.id).catch(() => [])

  return NextResponse.json({
    snapshot,
    vehicles,
    selectedVehicleId: row.id,
    // Kept for the shell's header, which shows the configured identity.
    vehicleInfo: { id: row.provider_vehicle_id, name: row.display_name, model: row.model ?? 'Tesla' },
    wakeHint: snapshot.wakeHint,
    authState: snapshot.authState,
    message: snapshot.error?.message ?? cacheMessage(snapshot.collectionReason, snapshot.source),
  })
}

/** User-facing copy for the cache/skip outcomes, kept out of the service layer (§D3). */
function cacheMessage(reason: string | null, source: string): string | undefined {
  if (source === 'tesla_api') return undefined
  switch (reason) {
    case 'vehicle_sleeping':
      return 'The vehicle is asleep. Showing the last stored data.'
    case 'passive_mode_no_requests':
      return 'Passive mode: the app reads the database and never contacts Tesla.'
    case 'wake_confirmation_required':
      return 'The "Refresh" action needs your confirmation — it may wake the vehicle.'
    case 'fresh_cache':
    case 'within_live_interval':
    case 'first_collect':
      return undefined
    case 'status_check_failed':
    case 'collection_failed':
      return 'The update failed. Showing the last stored values.'
    default:
      return undefined
  }
}
