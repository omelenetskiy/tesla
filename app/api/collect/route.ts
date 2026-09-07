import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { readHistory, persistDerivedHistory } from '@/lib/tesla/history'
import { pruneRequestLogs } from '@/lib/tesla/request-log'
import { listAllVehicleRows, readVehicleStatus } from '@/lib/tesla/service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function secretMatches(provided: string): boolean {
  const expected = process.env.COLLECTION_CRON_SECRET
  if (!expected) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  // Same-length compare only: a short-circuit === would leak the secret's length.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Background collector. Browser tabs never poll the vehicle (AGENTS.md §3.2); this
 * scheduled endpoint does the waking-free collection instead.
 *
 * Order per vehicle: policy-gated status read → snapshot write → history derivation
 * → idempotent persistence. A sleeping vehicle produces exactly one cheap
 * `/api/1/vehicles/{id}` call and no telemetry request (§21).
 */
export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') ?? ''
  const bearer = authorization.replace(/^Bearer\s+/i, '')
  if (!process.env.COLLECTION_CRON_SECRET || !secretMatches(bearer)) {
    return NextResponse.json({ message: 'Неверный ключ сбора данных' }, { status: 401 })
  }

  const rows = await listAllVehicleRows()
  const results: Array<{ vehicleId: string; outcome: string; reason: string; telemetry: boolean; persisted: unknown }> = []

  for (const row of rows) {
    try {
      const snapshot = await readVehicleStatus({ row })
      if (snapshot.error) {
        results.push({ vehicleId: row.id, outcome: 'failed', reason: snapshot.error.kind, telemetry: false, persisted: null })
        continue
      }
      if (snapshot.source !== 'tesla_api') {
        results.push({ vehicleId: row.id, outcome: 'skipped', reason: snapshot.collectionReason ?? 'no_collection', telemetry: false, persisted: null })
        continue
      }
      const bundle = await readHistory(row.id, '7d')
      const persisted = await persistDerivedHistory({ vehicleId: row.id, ownerId: row.owner_id, bundle })
      results.push({ vehicleId: row.id, outcome: 'success', reason: 'telemetry_collected', telemetry: true, persisted })
    } catch (error) {
      results.push({
        vehicleId: row.id,
        outcome: 'failed',
        reason: error instanceof Error ? error.message.slice(0, 200) : 'collection_failed',
        telemetry: false,
        persisted: null,
      })
    }
  }

  // Retention is enforced by the job that always runs, not by a human remembering.
  const pruned = await pruneRequestLogs(7).catch(() => 0)
  const auditable = rows[0]
  if (auditable) {
    const supabase = getSupabaseAdmin()
    await supabase.from('collection_events').insert({
      vehicle_id: null,
      owner_id: auditable.owner_id,
      outcome: results.some((result) => result.outcome === 'success') ? 'success' : 'skipped',
      reason: `collection_run:${results.length}_vehicles`,
    })
  }

  return NextResponse.json({ collectedAt: new Date().toISOString(), results, prunedLogs: pruned })
}
