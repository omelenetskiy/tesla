import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { listVehicleSummaries, listVehicleRows } from '@/lib/tesla/service'
import { buildFleetClient, fleetReadMessage, fleetVehicleTag, pickFleetRow, readFleetStatus, syncFleetVehicles } from '@/lib/fleet/service'
import { readFleetCredential } from '@/lib/fleet/tokens'
import { describeTeslaError } from '@/lib/tesla/errors'

export const dynamic = 'force-dynamic'

/**
 * GET /api/vehicle — the dashboard's single read.
 *
 * Fleet first: when the account holds a Fleet token, this route *is* the startup data path,
 * and it creates the vehicle row on the way through. The legacy branch below stays only
 * until P6 removes it, so a deployment that has not re-authorized yet still shows something.
 */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })

  const url = new URL(request.url)
  const requestedVehicleId = url.searchParams.get('vehicle')

  const credential = await readFleetCredential(user.id).catch(() => null)
  if (!credential) {
    const response = NextResponse.json(
      {
        snapshot: null,
        vehicles: [],
        selectedVehicleId: null,
        needsConnection: true,
        message: 'Tesla Fleet authorization is required before entering the app.',
      },
      { status: 403 },
    )
    response.cookies.delete('fleet_authorized')
    return response
  }

  // Not resolveVehicle: that returns the oldest row, which on a previously-Owner-API
  // account is the legacy one with no addressable identifier.
  let row = pickFleetRow(await listVehicleRows(user.id), requestedVehicleId)
  if (!row || !fleetVehicleTag(row)) {
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

  if (!row) {
    return NextResponse.json({
      snapshot: null,
      vehicles: [],
      selectedVehicleId: null,
      needsConnection: false,
      message: 'Your Tesla account is connected, but the account returned no vehicles for this app. Check that the vehicle is shared with it in the Tesla app.',
    })
  }

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

