import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { legacyHistoryFromBundle } from '@/lib/tesla/compat'
import { readHistory, type HistoryRange } from '@/lib/tesla/history'
import { resolveVehicle } from '@/lib/tesla/service'

export const dynamic = 'force-dynamic'

const RANGES = ['24h', '7d', '30d', '90d', 'all'] as const

/**
 * GET /api/history?range=7d — trips, charging sessions and the battery series.
 *
 * `origin` and `historyTablesMissing` are part of the contract: a history rebuilt
 * from 15-minute snapshots is coarser than a measured one, and §8/§39 require the UI
 * to say so instead of drawing a smooth line it has no data for.
 */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Требуется вход в приложение' }, { status: 401 })

  const url = new URL(request.url)
  const requested = url.searchParams.get('range') as HistoryRange | null
  const range: HistoryRange = requested && (RANGES as readonly string[]).includes(requested) ? requested : '30d'

  const row = await resolveVehicle(user.id, url.searchParams.get('vehicle'))
  if (!row) {
    return NextResponse.json({ battery: [], trips: [], charging: [], stats: null, origin: 'empty', historyTablesMissing: true, range, snapshotCount: 0 })
  }

  const bundle = await readHistory(row.id, range)
  const legacy = legacyHistoryFromBundle(bundle)

  return NextResponse.json({
    range,
    origin: bundle.origin,
    historyTablesMissing: bundle.historyTablesMissing,
    snapshotCount: bundle.snapshotCount,
    // New contract: domain models under `history`.
    history: { battery: bundle.battery, trips: bundle.trips, charging: bundle.charging },
    // Temporary projection for the pre-redesign dashboard (lib/tesla/compat.ts).
    battery: legacy.battery,
    trips: legacy.trips,
    charging: legacy.charging,
    stats: legacy.stats,
  })
}
