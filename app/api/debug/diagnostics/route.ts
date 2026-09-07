import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { diagnoseAuth } from '@/lib/tesla/tokens'
import { probeOwnerApi, readVehicleStatus, resolveVehicle } from '@/lib/tesla/service'
import { readRequests } from '@/lib/tesla/request-log'

export const dynamic = 'force-dynamic'

type ItemState = 'pass' | 'fail' | 'unknown'

/**
 * GET /api/debug/diagnostics — §41's checklist, built from evidence rather than
 * optimism. Every item carries the observation that decided it, and the payload
 * links to the request rows behind a failure so a red cross is followed by the
 * actual sanitised response, not a guess.
 */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })
  const url = new URL(request.url)
  const row = await resolveVehicle(user.id, url.searchParams.get('vehicle'))
  const supabase = getSupabaseAdmin()

  const historyTables: Record<string, ItemState> = {}
  for (const table of ['trips', 'charging_sessions', 'battery_snapshots', 'activity_events', 'api_request_logs']) {
    const { error } = await supabase.from(table).select('id').limit(1)
    historyTables[table] = error && /Could not find|does not exist/i.test(error.message ?? '') ? 'fail' : 'pass'
  }

  if (!row) {
    return NextResponse.json({
      connected: false,
      historyTables,
      items: [
        { id: 'credentials', label: 'Token pair stored', state: 'fail' as ItemState, detail: 'No vehicle connected — open "Tesla connection"' },
        { id: 'access_token', label: 'Access token accepted by SSO', state: 'unknown' as ItemState, detail: 'No credentials' },
        { id: 'refresh_token', label: 'Refresh token stored', state: 'unknown' as ItemState, detail: 'No credentials' },
        { id: 'owner_api', label: 'Owner API responds', state: 'unknown' as ItemState, detail: 'The check needs a token' },
        { id: 'vehicle_list', label: 'Vehicle list', state: 'fail' as ItemState, detail: 'No vehicle in the database' },
      ],
      recentFailures: [],
    })
  }

  const [auth, probe] = await Promise.all([diagnoseAuth(row.id, user.id), probeOwnerApi(row)])
  const [{ count: snapshotCount }, recent] = await Promise.all([
    supabase.from('vehicle_states').select('id', { count: 'exact', head: true }).eq('vehicle_id', row.id),
    readRequests({ vehicleId: row.id, limit: 8 }).catch(() => []),
  ])

  const items: Array<{ id: string; label: string; state: ItemState; detail: string }> = [
    {
      id: 'credentials',
      label: 'Token pair stored',
      state: auth.connected ? 'pass' : 'fail',
      detail: auth.connected ? `Scopes: ${(auth.scopes ?? []).join(' ') || 'unknown'} · client: ${auth.azp ?? '—'}` : 'Authorize under Settings → Tesla account',
    },
    {
      id: 'access_token',
      label: 'Access token accepted by SSO',
      state: auth.state === 'AUTHORIZED' || auth.accessTokenValid ? 'pass' : auth.state === 'API_UNAVAILABLE' ? 'unknown' : 'fail',
      detail: `${auth.state} · until ${auth.expiresAt ? new Date(auth.expiresAt).toLocaleString('en-US') : '—'}${auth.detail ? ` · ${auth.detail}` : ''}`,
    },
    {
      id: 'refresh_token',
      label: 'Refresh token stored',
      state: auth.refreshTokenPresent ? 'pass' : 'fail',
      detail: auth.refreshTokenPresent ? 'The "Refresh access token" request checks actual rotation' : 'Auto-refresh is impossible without it',
    },
    {
      id: 'owner_api',
      label: 'Owner API responds',
      state: probe.reachable ? 'pass' : probe.status === 403 ? 'fail' : 'fail',
      detail: probe.reachable
        ? `HTTP ${probe.status} in ${probe.durationMs} ms`
        : `HTTP ${probe.status ?? '—'} in ${probe.durationMs} ms · ${probe.error?.message ?? 'no connection'}`,
    },
    {
      id: 'vehicle_list',
      label: 'Vehicle list',
      state: probe.vehicleCount > 0 ? 'pass' : 'fail',
      detail: `In account: ${probe.vehicleCount} · in database: active vehicle ${row.owner_api_id ? `id ${row.owner_api_id}` : 'with no short id'}`,
    },
    {
      id: 'short_id',
      label: 'Short id stored',
      state: row.owner_api_id ? 'pass' : 'fail',
      detail: row.owner_api_id
        ? 'The /api/1/vehicles/{id} path is built from it'
        : 'Only the long vehicle_id is stored — the state requests will 404. Refresh the vehicle list.',
    },
    {
      id: 'snapshots',
      label: 'Snapshot history exists',
      state: (snapshotCount ?? 0) > 0 ? 'pass' : 'unknown',
      detail: `vehicle_states: ${snapshotCount ?? 0} rows.`,
    },
  ]

  // One telemetry attempt, so §41's "✓ Vehicle data / ✗ Climate state" is answered by
  // a real call rather than inferred from the list probe.
  if (probe.reachable) {
    const status = await readVehicleStatus({ row, force: true })
    items.push({
      id: 'vehicle_data',
      label: 'vehicle_data',
      state: status.error ? 'fail' : status.status ? 'pass' : 'unknown',
      detail: status.error
        ? `${status.error.message}${status.error.status ? ` (${status.error.status})` : ''}`
        : status.status
          ? `Sections received: ${['drive', 'charge', 'climate', 'state'].filter((key) => (status.status as Record<string, unknown>)[key]).join(', ')}`
          : 'Response without data',
    })
  }

  return NextResponse.json({
    connected: true,
    vehicle: { id: row.id, name: row.display_name, ownerApiId: row.owner_api_id ?? null, legacyProviderId: row.provider_vehicle_id ?? null },
    auth,
    probe,
    items,
    historyTables,
    recentFailures: recent
      .filter((entry) => !entry.ok)
      .map((entry) => ({ id: entry.id, endpoint: entry.endpoint, status: entry.status, kind: entry.errorKind, at: entry.at, message: entry.errorMessage })),
    lastSuccesses: recent.filter((entry) => entry.ok).map((entry) => ({ id: entry.id, endpoint: entry.endpoint, at: entry.at, durationMs: entry.durationMs })),
  })
}
