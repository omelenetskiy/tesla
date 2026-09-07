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
  if (!user) return NextResponse.json({ message: 'Требуется вход в приложение' }, { status: 401 })
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
        { id: 'credentials', label: 'Пара токенов сохранена', state: 'fail' as ItemState, detail: 'Автомобиль не подключён — зайдите в «Подключение Tesla»' },
        { id: 'access_token', label: 'Access token принят SSO', state: 'unknown' as ItemState, detail: 'Нет учётных данных' },
        { id: 'refresh_token', label: 'Refresh token сохранён', state: 'unknown' as ItemState, detail: 'Нет учётных данных' },
        { id: 'owner_api', label: 'Owner API отвечает', state: 'unknown' as ItemState, detail: 'Проверке нужен токен' },
        { id: 'vehicle_list', label: 'Список автомобилей', state: 'fail' as ItemState, detail: 'В базе нет ни одного автомобиля' },
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
      label: 'Пара токенов сохранена',
      state: auth.connected ? 'pass' : 'fail',
      detail: auth.connected ? `Области: ${(auth.scopes ?? []).join(' ') || 'неизвестны'} · клиент: ${auth.azp ?? '—'}` : 'Подключите токены на /connect',
    },
    {
      id: 'access_token',
      label: 'Access token принят SSO',
      state: auth.state === 'AUTHORIZED' || auth.accessTokenValid ? 'pass' : auth.state === 'API_UNAVAILABLE' ? 'unknown' : 'fail',
      detail: `${auth.state} · до ${auth.expiresAt ? new Date(auth.expiresAt).toLocaleString('ru-RU') : '—'}${auth.detail ? ` · ${auth.detail}` : ''}`,
    },
    {
      id: 'refresh_token',
      label: 'Refresh token сохранён',
      state: auth.refreshTokenPresent ? 'pass' : 'fail',
      detail: auth.refreshTokenPresent ? 'Фактическую ротацию проверяет запрос «Обновить access token»' : 'Автообновление невозможно без него',
    },
    {
      id: 'owner_api',
      label: 'Owner API отвечает',
      state: probe.reachable ? 'pass' : probe.status === 403 ? 'fail' : 'fail',
      detail: probe.reachable
        ? `HTTP ${probe.status} за ${probe.durationMs} мс`
        : `HTTP ${probe.status ?? '—'} за ${probe.durationMs} мс · ${probe.error?.message ?? 'нет соединения'}`,
    },
    {
      id: 'vehicle_list',
      label: 'Список автомобилей',
      state: probe.vehicleCount > 0 ? 'pass' : 'fail',
      detail: `В аккаунте: ${probe.vehicleCount} · в базе: активный автомобиль ${row.owner_api_id ? `id ${row.owner_api_id}` : 'без короткого id'}`,
    },
    {
      id: 'short_id',
      label: 'Короткий id сохранён',
      state: row.owner_api_id ? 'pass' : 'fail',
      detail: row.owner_api_id
        ? 'Путь /api/1/vehicles/{id} собирается из него'
        : 'Сохранён только длинный vehicle_id — состояния будут 404. Обновите список автомобилей.',
    },
    {
      id: 'snapshots',
      label: 'Есть история снимков',
      state: (snapshotCount ?? 0) > 0 ? 'pass' : 'unknown',
      detail: `vehicle_states: ${snapshotCount ?? 0} стр.`,
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
          ? `Разделы получены: ${['drive', 'charge', 'climate', 'state'].filter((key) => (status.status as Record<string, unknown>)[key]).join(', ')}`
          : 'Ответ без данных',
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
