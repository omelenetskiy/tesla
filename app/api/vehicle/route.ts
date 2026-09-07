import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { listVehicleSummaries, listVehicleRows, readVehicleStatus, resolveVehicle } from '@/lib/tesla/service'
import { buildFleetClient, fleetReadMessage, fleetVehicleTag, pickFleetRow, readFleetStatus, syncFleetVehicles } from '@/lib/fleet/service'
import { readFleetCredential } from '@/lib/fleet/tokens'
import { describeTeslaError } from '@/lib/tesla/errors'

export const dynamic = 'force-dynamic'

/**
 * GET /api/vehicle — the dashboard's single read.
 *
 * Fleet first: when the account holds a Fleet token, this route *is* the startup data path,
 * and it creates the vehicle row on the way through. The Owner API branch below stays only
 * until P6 removes it, so a deployment that has not re-authorized yet still shows something.
 */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })

  const url = new URL(request.url)
  const requestedVehicleId = url.searchParams.get('vehicle')

  const credential = await readFleetCredential(user.id).catch(() => null)
  if (credential) {
    // Not resolveVehicle: that returns the oldest row, which on a previously-Owner-API
    // account is the legacy one with no addressable identifier.
    let row = pickFleetRow(await listVehicleRows(user.id), requestedVehicleId)
    if (!row || !fleetVehicleTag(row)) {
      // The vehicle list is the only thing that can produce a usable row, and it needs no
      // id itself — so the first read after authorizing repairs the state instead of
      // reporting "no vehicle connected" forever.
      const bootstrap = buildFleetClient(user.id)
      try {
        await syncFleetVehicles(user.id, bootstrap)
      } catch (error) {
        const vehicles = await listVehicleSummaries(user.id).catch(() => [])
        return NextResponse.json({
          snapshot: null,
          vehicles,
          selectedVehicleId: null,
          needsConnection: false,
          message: `Connected to Tesla, but the vehicle list failed: ${describeTeslaError(error)}`,
        })
      }
      row = pickFleetRow(await listVehicleRows(user.id), requestedVehicleId)
    }

    if (row) {
      const client = buildFleetClient(user.id, row.id)
      const { snapshot, wakeHint, authState } = await readFleetStatus(row, client)
      const vehicles = await listVehicleSummaries(user.id).catch(() => [])
      return NextResponse.json({
        snapshot,
        vehicles,
        selectedVehicleId: row.id,
        vehicleInfo: { id: row.provider_vehicle_id, name: row.display_name, model: row.model ?? 'Tesla' },
        wakeHint,
        authState,
        message: snapshot.error?.message ?? fleetReadMessage(snapshot.collectionReason),
      })
    }

    return NextResponse.json({
      snapshot: null,
      vehicles: [],
      selectedVehicleId: null,
      needsConnection: false,
      message: 'Your Tesla account is connected, but the account returned no vehicles for this app. Check that the vehicle is shared with it in the Tesla app.',
    })
  }

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
