import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase'

export type FieldFreshnessQuery = {
  vehicleId: string
  limit?: number
}

export type PersistedFieldFreshness = {
  vehicleId: string
  fieldName: string
  lastObservedAt: string | null
  lastUpdateAt: string | null
  receptionCount: number
  unavailableSince: string | null
  stalenessMinutes: number | null
}

type FreshnessRow = {
  vehicle_id: unknown
  field_name: unknown
  last_observed_at: unknown
  last_update_at: unknown
  reception_count: unknown
  unavailable_since: unknown
}

type QueryBuilder = {
  select: (columns: string) => QueryBuilder
  eq: (column: string, value: string) => QueryBuilder
  order: (column: string, options: { ascending: boolean }) => QueryBuilder
  limit: (count: number) => QueryBuilder
  then: PromiseLike<unknown>['then']
}

function optionalDate(value: unknown, name: string): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(`Invalid ${name} in telemetry field freshness.`)
  return value
}

function integer(value: unknown): number {
  const result = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isInteger(result) || result < 0) throw new Error('Invalid reception_count in telemetry field freshness.')
  return result
}

function normalize(row: FreshnessRow, vehicleId: string, now: number): PersistedFieldFreshness | null {
  if (row.vehicle_id !== vehicleId || typeof row.field_name !== 'string' || row.field_name.trim() === '') return null
  const lastObservedAt = optionalDate(row.last_observed_at, 'last_observed_at')
  const lastUpdateAt = optionalDate(row.last_update_at, 'last_update_at')
  return {
    vehicleId,
    fieldName: row.field_name,
    lastObservedAt,
    lastUpdateAt,
    receptionCount: integer(row.reception_count),
    unavailableSince: optionalDate(row.unavailable_since, 'unavailable_since'),
    stalenessMinutes: lastObservedAt === null ? null : Math.max(0, (now - Date.parse(lastObservedAt)) / 60_000),
  }
}

export async function readFieldFreshness(
  query: FieldFreshnessQuery,
  client: SupabaseClient = getSupabaseAdmin(),
  now = Date.now(),
): Promise<PersistedFieldFreshness[]> {
  if (!query.vehicleId.trim()) throw new Error('vehicleId must not be empty.')
  const limit = query.limit === undefined ? 100 : Math.min(Math.max(Math.floor(query.limit), 1), 100)
  const response = await client
    .from('telemetry_field_freshness')
    .select('vehicle_id, field_name, last_observed_at, last_update_at, reception_count, unavailable_since')
    .eq('vehicle_id', query.vehicleId)
    .order('field_name', { ascending: true })
    .limit(limit) as unknown as QueryBuilder
  const payload = response as unknown as { data?: FreshnessRow[] | null; error?: { message?: string } | null }
  if (payload.error) throw new Error(`Could not read telemetry field freshness: ${payload.error.message ?? 'unknown error'}`)
  return (payload.data ?? [])
    .map((row) => normalize(row, query.vehicleId, now))
    .filter((row): row is PersistedFieldFreshness => row !== null)
}


