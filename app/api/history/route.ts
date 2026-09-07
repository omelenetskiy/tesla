import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
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
  if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })

  const url = new URL(request.url)
  const requested = url.searchParams.get('range') as HistoryRange | null
  const range: HistoryRange = requested && (RANGES as readonly string[]).includes(requested) ? requested : '30d'

  const row = await resolveVehicle(user.id, url.searchParams.get('vehicle'))
  if (!row) {
    return NextResponse.json({ range, origin: 'empty', historyTablesMissing: true, snapshotCount: 0, history: { battery: [], trips: [], charging: [] } })
  }

  const bundle = await readHistory(row.id, range)

  return NextResponse.json({
    range,
    origin: bundle.origin,
    historyTablesMissing: bundle.historyTablesMissing,
    snapshotCount: bundle.snapshotCount,
    history: { battery: bundle.battery, trips: bundle.trips, charging: bundle.charging },
  })
}
