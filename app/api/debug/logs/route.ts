import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { readRequests } from '@/lib/tesla/request-log'

export const dynamic = 'force-dynamic'

/**
 * GET /api/debug/logs — recent sanitised request history (§29).
 *
 * The log is read with the service role, so owner scoping is applied here as well as
 * by RLS: a row is returned only if it has no vehicle or belongs to this user.
 */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })
  const url = new URL(request.url)
  const only = url.searchParams.get('only')
  const rows = await readRequests({
    limit: Number(url.searchParams.get('limit') ?? 50),
    okOnly: only === 'failed' ? false : only === 'ok' ? true : undefined,
    requestType: url.searchParams.get('type'),
  }).catch(() => [])
  const { data: owned } = await getSupabaseAdmin().from('vehicles').select('id').eq('owner_id', user.id)
  const allowed = new Set((owned ?? []).map((row: { id: string }) => row.id))
  return NextResponse.json({
    requests: rows.filter((entry) => !entry.vehicleId || allowed.has(entry.vehicleId)),
  })
}

/** DELETE /api/debug/logs — clears this owner's request history (§29). */
export async function DELETE() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const { data: owned } = await supabase.from('vehicles').select('id').eq('owner_id', user.id)
  const ids = (owned ?? []).map((row: { id: string }) => row.id)
  const { error } = await supabase
    .from('api_request_logs')
    .delete()
    .in('vehicle_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json({ cleared: true })
}
