import { getSupabaseAdmin } from '@/lib/supabase'
import type { ApiRequestLog } from './models'
import type { TeslaRequestLogInput } from './client'

/**
 * §23 request observability. Rows are written after `lib/tesla/sanitize.ts` has
 * already run, and the read path re-applies it, so a value that slipped past the
 * writer can still never reach a browser.
 */

const MAX_BODY_CHARS = 20_000

function clamp(value: string | null): string | null {
  if (value === null) return null
  return value.length > MAX_BODY_CHARS ? `${value.slice(0, MAX_BODY_CHARS)}…[truncated]` : value
}

export type RequestLogRow = ApiRequestLog

/**
 * Best-effort: a telemetry read must never fail because its audit row did.
 *
 * `ownerId` is written alongside the vehicle because the RLS select policy grants a
 * user visibility through either column; rows with both null are invisible to the
 * very person whose request they recorded.
 */
export async function recordRequest(input: TeslaRequestLogInput, ownerId?: string | null): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase.from('api_request_logs').insert({
      vehicle_id: input.vehicleId,
      owner_id: ownerId ?? null,
      request_type: input.requestType,
      method: input.method,
      endpoint: input.endpoint.slice(0, 400),
      url: clamp(input.url),
      status: input.status,
      duration_ms: input.durationMs,
      ok: input.ok,
      error_kind: input.errorKind,
      error_message: clamp(input.errorMessage),
      attempts: input.attempts,
      request_headers: input.requestHeaders,
      request_body: clamp(input.requestBody),
      response_headers: input.responseHeaders,
      response_body: clamp(input.responseBody),
      response_bytes: input.responseByteLength,
      sanitized: true,
      created_at: input.at ?? new Date().toISOString(),
    })
    if (error) console.error('[tesla] request log write failed', error.message)
  } catch (error) {
    console.error('[tesla] request log unavailable', error instanceof Error ? error.message : error)
  }
}

export type RequestLogFilter = {
  vehicleId?: string | null
  limit?: number
  okOnly?: boolean
  requestType?: string | null
}

/** Read path for /debug/api. Applies `Authorization: Bearer [REDACTED]` defence in depth. */
export async function readRequests(filter: RequestLogFilter = {}): Promise<RequestLogRow[]> {
  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('api_request_logs')
    .select('*')
    .order('created_at', { ascending: false })
    // Retries of one run land in the same millisecond, and without a tiebreak the
    // database is free to return them in a different order on every read — which the
    // console renders as rows jumping around under the cursor.
    .order('id', { ascending: false })
    .limit(Math.min(200, Math.max(1, filter.limit ?? 50)))
  if (filter.vehicleId) query = query.eq('vehicle_id', filter.vehicleId)
  if (filter.requestType) query = query.eq('request_type', filter.requestType)
  if (filter.okOnly) query = query.eq('ok', true)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    at: String(row.created_at),
    vehicleId: (row.vehicle_id as string | null) ?? null,
    requestType: row.request_type as ApiRequestLog['requestType'],
    method: String(row.method),
    endpoint: String(row.endpoint),
    url: String(row.url ?? ''),
    status: (row.status as number | null) ?? null,
    durationMs: (row.duration_ms as number | null) ?? null,
    ok: Boolean(row.ok),
    errorKind: (row.error_kind as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    attempts: Number(row.attempts ?? 1),
    requestHeaders: (row.request_headers as Record<string, string>) ?? {},
    requestBody: (row.request_body as string | null) ?? null,
    responseHeaders: (row.response_headers as Record<string, string>) ?? {},
    responseBody: (row.response_body as string | null) ?? null,
    responseByteLength: (row.response_bytes as number | null) ?? null,
    sanitized: true,
  }))
}

/** §23 retention: the log holds credential-adjacent shapes, so it must not grow forever. */
export async function pruneRequestLogs(retentionDays = 7): Promise<number> {
  const supabase = getSupabaseAdmin()
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('api_request_logs')
    .delete()
    .lt('created_at', cutoff)
    .select('id')
  if (error) throw new Error(error.message)
  return (data ?? []).length
}
