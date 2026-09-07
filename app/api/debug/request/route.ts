import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { CATALOG, CATALOG_GROUPS, ENVIRONMENT_FOR_CLIENT } from '@/lib/tesla/catalog'
import { resolveVehicle } from '@/lib/tesla/service'
import { executeDebugRequest } from '@/lib/tesla/debug-runner'
import { TeslaApiError } from '@/lib/tesla/errors'

export const dynamic = 'force-dynamic'

/** POST /api/debug/request — runs one catalog request for the console (§27). */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Требуется вход в приложение' }, { status: 401 })

  let body: { entryId?: string; vehicleId?: string; environmentId?: string; pathParams?: Record<string, string>; query?: Record<string, string>; body?: string; confirmUnsafe?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Некорректное тело запроса' }, { status: 400 })
  }
  if (!body.entryId) return NextResponse.json({ message: 'Не выбран запрос из каталога' }, { status: 400 })

  const row = await resolveVehicle(user.id, body.vehicleId ?? null)
  if (!row) return NextResponse.json({ message: 'Автомобиль не подключён — выполнять запрос не от чего' }, { status: 409 })

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
          message: error instanceof Error ? error.message : 'Запрос не выполнен',
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
  if (!user) return NextResponse.json({ message: 'Требуется вход в приложение' }, { status: 401 })
  const row = await resolveVehicle(user.id, new URL(request.url).searchParams.get('vehicle'))
  return NextResponse.json({
    groups: CATALOG_GROUPS,
    entries: CATALOG,
    environments: ENVIRONMENT_FOR_CLIENT,
    defaultPathParams: row
      ? {
          id: row.owner_api_id ?? (row.provider_vehicle_id?.length <= 12 ? row.provider_vehicle_id : ''),
          vehicle_id: row.vehicle_id ?? row.provider_vehicle_id ?? '',
        }
      : {},
    vehicleConnected: Boolean(row),
  })
}
