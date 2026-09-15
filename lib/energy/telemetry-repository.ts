import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase'
import { calculateEnergyBySession, type SessionEnergyResult, type TelemetrySessionSampleRow } from './telemetry-adapter'

type SessionType = TelemetrySessionSampleRow['session_type']

export type TelemetrySampleQuery = {
  ownerId: string
  vehicleId: string
  sessionId?: string
  sessionType?: SessionType
  from?: string
  to?: string
  maxGapMs?: number
}

export type PersistedSessionEnergy = SessionEnergyResult & {
  ownerId: string
  vehicleId: string
  sampleCount: number
  calculationMethod: 'measured_power_integration' | null
  coveragePercent: number | null
}

type RawSample = {
  owner_id: unknown
  vehicle_id: unknown
  session_id: unknown
  session_type: unknown
  field_name: unknown
  numeric_value: unknown
  observed_at: unknown
}

type QueryBuilder = {
  select: (columns: string) => QueryBuilder
  eq: (column: string, value: string) => QueryBuilder
  gte: (column: string, value: string) => QueryBuilder
  lt: (column: string, value: string) => QueryBuilder
  order: (column: string, options: { ascending: boolean }) => QueryBuilder
  then: PromiseLike<unknown>['then']
}

function isSessionType(value: unknown): value is SessionType {
  return value === 'trip' || value === 'charging' || value === 'parked'
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeSample(row: RawSample, query: TelemetrySampleQuery): TelemetrySessionSampleRow | null {
  if (row.owner_id !== query.ownerId || row.vehicle_id !== query.vehicleId) return null
  if (typeof row.session_id !== 'string' || row.session_id.length === 0) return null
  if (!isSessionType(row.session_type) || typeof row.field_name !== 'string' || row.field_name.length === 0) return null
  if (typeof row.observed_at !== 'string' || !Number.isFinite(Date.parse(row.observed_at))) return null

  return {
    session_id: row.session_id,
    session_type: row.session_type,
    field_name: row.field_name,
    numeric_value: finiteNumber(row.numeric_value),
    observed_at: row.observed_at,
  }
}

function assertQueryValue(value: string, name: string): void {
  if (value.trim() === '') throw new Error(`${name} must not be empty.`)
}

function buildQuery(client: SupabaseClient, query: TelemetrySampleQuery): QueryBuilder {
  const builder = client
    .from('telemetry_session_samples')
    .select('owner_id, vehicle_id, session_id, session_type, field_name, numeric_value, observed_at')
    .eq('owner_id', query.ownerId)
    .eq('vehicle_id', query.vehicleId)

  if (query.sessionId) builder.eq('session_id', query.sessionId)
  if (query.sessionType) builder.eq('session_type', query.sessionType)
  if (query.from) builder.gte('observed_at', query.from)
  if (query.to) builder.lt('observed_at', query.to)
  return builder.order('observed_at', { ascending: true }) as unknown as QueryBuilder
}

function resultFor(
  result: SessionEnergyResult,
  query: TelemetrySampleQuery,
  sampleCount: number,
): PersistedSessionEnergy {
  return {
    ...result,
    ownerId: query.ownerId,
    vehicleId: query.vehicleId,
    sampleCount,
    calculationMethod: result.accounting?.verified ? 'measured_power_integration' : null,
    coveragePercent: result.accounting?.coverage.coveragePercent ?? null,
  }
}

/** Reads owned persisted samples and calculates energy independently per session. */
export async function readSessionEnergy(
  query: TelemetrySampleQuery,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<PersistedSessionEnergy[]> {
  assertQueryValue(query.ownerId, 'ownerId')
  assertQueryValue(query.vehicleId, 'vehicleId')

  const response = await buildQuery(client, query)
  const payload = response as unknown as { data?: RawSample[] | null; error?: { message?: string } | null }
  if (payload.error) throw new Error(`Could not read telemetry session samples: ${payload.error.message ?? 'unknown error'}`)

  const rows = (payload.data ?? [])
    .map((row) => normalizeSample(row, query))
    .filter((row): row is TelemetrySessionSampleRow => row !== null)
  const grouped = calculateEnergyBySession(rows, query.maxGapMs)
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.session_id, (counts.get(row.session_id) ?? 0) + 1)

  return grouped.map((result) => resultFor(result, query, counts.get(result.sessionId) ?? 0))
}
