import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { CATALOG, CATALOG_GROUPS } from '@/lib/tesla/catalog'
import { teslaConfig } from '@/lib/tesla/config'
import { resolveOwnerApiId } from '@/lib/tesla/identity'
import { resolveVehicle } from '@/lib/tesla/service'
import { executeDebugRequest } from '@/lib/tesla/debug-runner'
import { TeslaApiError } from '@/lib/tesla/errors'

export const dynamic = 'force-dynamic'

/** POST /api/debug/request — runs one catalog request for the console (§27). */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })

  let body: { entryId?: string; vehicleId?: string; environmentId?: string; pathParams?: Record<string, string>; query?: Record<string, string>; body?: string; confirmUnsafe?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Malformed request body' }, { status: 400 })
  }
  if (!body.entryId) return NextResponse.json({ message: 'No catalog request selected' }, { status: 400 })

  const row = await resolveVehicle(user.id, body.vehicleId ?? null)
  if (!row) return NextResponse.json({ message: 'No vehicle connected — there is nothing to run the request against' }, { status: 409 })

  try {
    const result = await executeDebugRequest({
      entryId: body.entryId,
      environmentId: body.environmentId ?? null,
      vehicleRow: row,
      pathParams: body.pathParams ?? {},
      query: body.query ?? {},
      body: body.body ?? null,
      confirmUnsafe: Boolean(body.confirmUnsafe),
    })
    return NextResponse.json(result)
  } catch (error) {
    // The runner throws before any response exists; surface it as an inspectable
    // failure rather than a 500, so the console can show §30's sanitised error.
    return NextResponse.json(
      {
        ok: false,
        status: error instanceof TeslaApiError ? error.status ?? null : null,
        durationMs: null,
        error: {
          kind: error instanceof TeslaApiError ? error.kind : 'unknown',
          status: error instanceof TeslaApiError ? error.status ?? null : null,
          message: error instanceof Error ? error.message : 'The request did not run',
        },
        diagnostics: [],
      },
      { status: error instanceof TeslaApiError && error.kind === 'conflict' ? 409 : 200 },
    )
  }
}

/** GET /api/debug/catalog — the left-hand request list plus docs (§26, §31). */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })
  const row = await resolveVehicle(user.id)
  // Prefill values are the identifiers actually on file, so the common case is
  // "press Send" rather than "go find your id in another window". `owner_api_id` is
  // the short id every state path needs; when it is unknown the field stays empty —
  // the long `vehicle_id` is never offered as `:id`, because Tesla rejects it there.
  const ownerApiId = resolveOwnerApiId(row ?? {})
  return NextResponse.json({
    groups: CATALOG_GROUPS,
    entries: CATALOG,
    apiBaseUrl: teslaConfig.apiBaseUrl,
    defaultPathParams: {
      id: ownerApiId ?? '',
      vehicle_id: row?.vehicle_id ?? row?.provider_vehicle_id ?? '',
    },
    vehicleConnected: Boolean(row),
    vehicleName: row?.display_name ?? null,
    needsShortId: Boolean(row) && !ownerApiId,
  })
}
