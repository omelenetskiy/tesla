import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { legacyVehicleFromStatus } from '@/lib/tesla/compat'
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
  if (!user) return NextResponse.json({ message: 'Требуется вход в приложение' }, { status: 401 })

  const url = new URL(request.url)
  const requestedVehicleId = url.searchParams.get('vehicle')
  const row = await resolveVehicle(user.id, requestedVehicleId)
  if (!row) {
    return NextResponse.json({
      message: 'Автомобиль не подключён',
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

  const legacy = snapshot.status
    ? legacyVehicleFromStatus(snapshot.status, row.display_name, snapshot.ageSeconds)
    : null

  return NextResponse.json({
    // New contract.
    snapshot: { ...snapshot },
    vehicles,
    selectedVehicleId: row.id,
    // Temporary projection for the pre-redesign dashboard (lib/tesla/compat.ts).
    vehicle: legacy,
    vehicleInfo: { id: row.provider_vehicle_id, name: row.display_name, model: row.model ?? 'Tesla' },
    source: snapshot.source,
    collection: snapshot.error ? 'failed' : snapshot.source === 'cache' ? 'skipped' : 'success',
    reason: snapshot.collectionReason,
    collectedAt: snapshot.status ? snapshot.collectedAt : null,
    wakeHint: snapshot.wakeHint,
    authState: snapshot.authState,
    message: snapshot.error?.message ?? cacheMessage(snapshot.collectionReason, snapshot.source),
  })
}

/** Russian copy for the cache/skip outcomes, kept out of the service layer (§D3). */
function cacheMessage(reason: string | null, source: string): string | undefined {
  if (source === 'tesla_api') return undefined
  switch (reason) {
    case 'vehicle_sleeping':
      return 'Автомобиль спит. Показаны последние сохранённые данные.'
    case 'wake_confirmation_required':
      return 'Нужно подтверждение на «Запросить актуальный статус» — это может разбудить автомобиль.'
    case 'fresh_cache':
    case 'within_live_interval':
      return undefined
    case 'status_check_failed':
    case 'collection_failed':
      return 'Не удалось обновить данные. Показаны последние сохранённые значения.'
    case 'vehicle_sleeping_no_cache':
      return 'Автомобиль спит. Сохранённых данных пока нет.'
    default:
      return undefined
  }
}
