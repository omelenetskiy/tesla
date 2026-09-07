import { teslaConfig } from './config'

/**
 * Endpoint catalog for /debug/api (§26, §31).
 *
 * Every description here traces to https://tesla-api.timdorr.com/ rather than to
 * recollection. Where the docs issue a blanket statement, it is quoted verbatim so
 * the console cannot be read as our own opinion about Tesla's API.
 */

export type CatalogParamLocation = 'path' | 'query' | 'body'

export type CatalogParam = {
  name: string
  in: CatalogParamLocation
  required: boolean
  type: 'string' | 'number' | 'boolean' | 'json'
  description: string
  example?: string
}

/** How the runner executes the entry: through TeslaClient, through the auth layer, or manual only. */
export type CatalogExecutor = 'tesla_client' | 'owner_api_raw' | 'auth_probe' | 'browser_only' | 'not_implemented'

/** `safety` gates the confirmation step: anything but `read` needs an explicit OK. */
export type CatalogSafety = 'read' | 'credential_write' | 'wake' | 'command'

export type CatalogEntry = {
  id: string
  group: CatalogGroupId
  /** Short label shown in the request list. */
  title: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'WSS'
  /** Path template with `:param` placeholders, as rendered in the UI. */
  path: string
  /** §31 Purpose, one or two sentences. */
  purpose: string
  params: CatalogParam[]
  /** §31 Expected response, in plain language plus the envelope shape. */
  expectedResponse: string
  notes: string[]
  docUrl: string
  deprecated: boolean
  /** Documented successor, when `deprecated` is true. */
  replacement?: string
  /** False ⇒ the console shows it as documented-but-unavailable (§26: only expose what is implemented). */
  implemented: boolean
  executor: CatalogExecutor
  safety: CatalogSafety
  /** Whether a real call needs the vehicle awake — drives the §41 sleep-state diagnostics. */
  requiresAwake: boolean
  /** Pre-filled JSON body for POST-style entries. */
  sampleBody?: string
}

export type CatalogGroupId =
  | 'authentication'
  | 'vehicles'
  | 'vehicle_state'
  | 'charging'
  | 'climate'
  | 'driving'
  | 'commands'
  | 'streaming'

export const CATALOG_GROUPS: Array<{ id: CatalogGroupId; title: string; summary: string }> = [
  { id: 'authentication', title: 'Аутентификация', summary: 'Жив ли токен, переживает ли он обновление, какой хост его выдал' },
  { id: 'vehicles', title: 'Автомобили', summary: 'Обнаружение автомобиля и короткий id для всех остальных запросов' },
  { id: 'vehicle_state', title: 'Состояние автомобиля', summary: 'Единый rollup vehicle_data — основной источник телеметрии' },
  { id: 'charging', title: 'Зарядка', summary: 'Раздел charge_state и производные сессии' },
  { id: 'climate', title: 'Климат', summary: 'Раздел climate_state' },
  { id: 'driving', title: 'Движение', summary: 'Раздел drive_state: скорость, координаты, направление' },
  { id: 'commands', title: 'Команды', summary: 'Только wake_up. Остальные команды не реализованы намеренно' },
  { id: 'streaming', title: 'Streaming', summary: 'WSS-эндпоинт: требует vehicle_id, а не id. Не реализован' },
]

const VEHICLE_ID_PARAM: CatalogParam = {
  name: 'id',
  in: 'path',
  required: true,
  type: 'string',
  description:
    'Короткий id из ответа GET /api/1/vehicles. НЕ длинный vehicle_id: документация различает их явно.',
  example: '1234567890',
}

export const OWNER_API_DEPRECATION_QUOTE =
  'All `data_request` endpoints have been deprecated in favor of the `vehicle_data` endpoint.'

export const IDENTIFIER_QUOTE =
  'The `id` field is an identifier for the car on the owner-api endpoint. The `vehicle_id` field is for identifying the car across different endpoints, such as the streaming or Autopark APIs.'

export const USER_AGENT_QUOTE =
  'Avoid setting a `User-Agent` header that looks like a browser (such as Chrome or Safari). The SSO service has protections in place that will require executing JavaScript if a browser-like user agent is detected.'

export const REGION_QUOTE =
  'Should this redirect happen you should continue using the region specific Tesla SSO host name in all subsequent steps.'

export const CATALOG: CatalogEntry[] = [
  // ── Authentication ────────────────────────────────────────────────────────
  {
    id: 'auth-authorize',
    group: 'authentication',
    title: 'Authorize (PKCE)',
    method: 'GET',
    path: `${teslaConfig.authPath}/authorize`,
    purpose: 'Начало Authorization Code + PKCE. Открывается на стороне Tesla; пароль в этом приложении не вводится никогда.',
    params: [
      { name: 'client_id', in: 'query', required: true, type: 'string', description: 'Всегда "ownerapi"', example: 'ownerapi' },
      { name: 'code_challenge', in: 'query', required: true, type: 'string', description: 'SHA-256 от code_verifier в base64url' },
      { name: 'code_challenge_method', in: 'query', required: true, type: 'string', description: 'Всегда "S256"', example: 'S256' },
      { name: 'redirect_uri', in: 'query', required: true, type: 'string', description: 'Tesla отдаёт code только на void-callback', example: `${teslaConfig.authOrigin}/void/callback` },
      { name: 'response_type', in: 'query', required: true, type: 'string', description: 'code' },
      { name: 'scope', in: 'query', required: true, type: 'string', description: 'Всегда "openid email offline_access"', example: 'openid email offline_access' },
      { name: 'state', in: 'query', required: true, type: 'string', description: 'Случайное значение, сверяется при возврате' },
      { name: 'login_hint', in: 'query', required: false, type: 'string', description: 'E-mail аккаунта. С ним Tesla может ответить 303 на региональный SSO-хост' },
    ],
    expectedResponse: '302 на страницу входа Tesla; затем 303 на региональный хост при login_hint из другого региона.',
    notes: [
      REGION_QUOTE,
      USER_AGENT_QUOTE,
      'code_verifier живёт только на сервере (httpOnly cookie, AES-GCM) — на клиент он не отдаётся.',
    ],
    docUrl: 'https://tesla-api.timdorr.com/api-basics/authentication',
    deprecated: false,
    implemented: true,
    executor: 'browser_only',
    safety: 'read',
    requiresAwake: false,
  },
  {
    id: 'auth-userinfo',
    group: 'authentication',
    title: 'Проверить живость токена',
    method: 'GET',
    path: `${teslaConfig.authPath}/userinfo`,
    purpose: 'Read-only проверка, что access token всё ещё принят SSO. Отделяет «токен мёртв» от «эндпоинт закрыт платформой».',
    params: [],
    expectedResponse: '200 с JSON (sub, email, mfa_status) либо 401.',
    notes: [
      'Ответ не содержит токенов; e-mail не сохраняется в логи запросов.',
      'Если здесь 200, а owner-api отвечает 403 — проблема на стороне Tesla, а не учётных данных.',
    ],
    docUrl: 'https://tesla-api.timdorr.com/api-basics/authentication',
    deprecated: false,
    implemented: true,
    executor: 'auth_probe',
    safety: 'read',
    requiresAwake: false,
  },
  {
    id: 'auth-refresh',
    group: 'authentication',
    title: 'Обновить access token',
    method: 'POST',
    path: `${teslaConfig.authPath}/token`,
    purpose: 'Refresh Token Grant. Принудительно обновляет пару токенов и сохраняет результат, включая ротацию refresh token.',
    params: [
      { name: 'grant_type', in: 'body', required: true, type: 'string', description: 'refresh_token' },
      { name: 'client_id', in: 'body', required: true, type: 'string', description: 'ownerapi' },
      { name: 'refresh_token', in: 'body', required: true, type: 'string', description: 'Хранится в БД; в теле запроса не отображается и не логируется' },
      { name: 'scope', in: 'body', required: true, type: 'string', description: 'openid email offline_access' },
    ],
    expectedResponse: '200 с access_token/refresh_token/expires_in. Значения не выводятся — только факт получения и новый срок.',
    notes: [
      '§17: если Tesla вернула новый refresh token, сохраняется именно он.',
      'Обновления одного автомобиля сериализованы: два параллельных refresh с ротируемым секретом могут сжеть рабочий токен.',
    ],
    docUrl: 'https://tesla-api.timdorr.com/api-basics/authentication',
    deprecated: false,
    implemented: true,
    executor: 'auth_probe',
    safety: 'credential_write',
    requiresAwake: false,
    sampleBody: '{"grant_type":"refresh_token","client_id":"ownerapi","refresh_token":"[REDACTED]","scope":"openid email offline_access"}',
  },
  // ── Vehicles ──────────────────────────────────────────────────────────────
  {
    id: 'vehicles-list',
    group: 'vehicles',
    title: 'Список автомобилей',
    method: 'GET',
    path: '/api/1/vehicles',
    purpose: 'Обнаружение автомобилей аккаунта и источник короткого id и поля state (online/asleep/offline).',
    params: [{ name: 'page', in: 'query', required: false, type: 'number', description: 'Не требуется, по умолчанию 1', example: '1' }],
    expectedResponse: '200 {"response":{"count":N,"response":[{id,id_s,vehicle_id,vin,display_name,state,...}]}}',
    notes: [
      IDENTIFIER_QUOTE,
      'Ответ содержит поля tokens и backseat_token — они вырезаются санитайзером до записи в лог.',
      'Единственный эндпоинт, который не будит автомобиль и при этом отдаёт state.',
    ],
    docUrl: 'https://tesla-api.timdorr.com/api-basics/vehicles',
    deprecated: false,
    implemented: true,
    executor: 'tesla_client',
    safety: 'read',
    requiresAwake: false,
  },
  {
    id: 'vehicles-get',
    group: 'vehicles',
    title: 'Автомобиль по id',
    method: 'GET',
    path: '/api/1/vehicles/:id',
    purpose: 'Состояние доступности одного автомобиля без нагрузки телеметрии. Используется как решение «будить или нет» перед vehicle_data.',
    params: [VEHICLE_ID_PARAM],
    expectedResponse: '200 {"response":{...}} — та же структура элемента списка.',
    notes: ['§21: этот вызов решает, делать ли vehicle_data. Спит — телеметрию не запрашиваем.'],
    docUrl: 'https://tesla-api.timdorr.com/api-basics/vehicles',
    deprecated: false,
    implemented: true,
    executor: 'tesla_client',
    safety: 'read',
    requiresAwake: false,
  },
  // ── Vehicle state ─────────────────────────────────────────────────────────
  {
    id: 'vehicle-data',
    group: 'vehicle_state',
    title: 'vehicle_data (rollup)',
    method: 'GET',
    path: '/api/1/vehicles/:id/vehicle_data',
    purpose: 'Единый rollup всей телеметрии: drive_state, climate_state, charge_state, gui_settings, vehicle_state, vehicle_config.',
    params: [VEHICLE_ID_PARAM],
    expectedResponse: '200 {"response":{id,vehicle_id,drive_state,charge_state,climate_state,gui_settings,vehicle_state,vehicle_config,last_updated}}',
    notes: [
      OWNER_API_DEPRECATION_QUOTE,
      '§19: один вызов rollup вместо нескольких section-запросов. Продукт читает только его.',
      'Query-параметров документация не описывает — ничего кроме :id не передаём.',
      'Поле last_updated — источник честной отметки свежести; возраста из ответа достаточно, чтобы не верить сохранённому "just now".',
    ],
    docUrl: 'https://tesla-api.timdorr.com/vehicle/state/data',
    deprecated: false,
    implemented: true,
    executor: 'tesla_client',
    safety: 'read',
    requiresAwake: true,
  },
  {
    id: 'legacy-data',
    group: 'vehicle_state',
    title: 'data (легаси-rollup)',
    method: 'GET',
    path: '/api/1/vehicles/:id/data',
    purpose: 'Более старая версия rollup с той же структурой. Есть в документации, но продукт её не использует.',
    params: [VEHICLE_ID_PARAM],
    expectedResponse: '200 с теми же разделами, без vehicle_config.',
    notes: ['Каталог показывает её для сравнения форм ответов. Используется vehicle_data.'],
    docUrl: 'https://tesla-api.timdorr.com/vehicle/state/data',
    deprecated: false,
    implemented: false,
    executor: 'owner_api_raw',
    safety: 'read',
    requiresAwake: true,
  },
  {
    id: 'latest-vehicle-data',
    group: 'vehicle_state',
    title: 'latest_vehicle_data',
    method: 'GET',
    path: '/api/1/vehicles/:id/latest_vehicle_data',
    purpose: 'Удалённый эндпоинт. Единственная его польза — проверить, что путь действительно больше не существует.',
    params: [VEHICLE_ID_PARAM],
    expectedResponse: '404.',
    notes: ['Задокументирован как возвращающий 404. Продукт его не вызывает.'],
    docUrl: 'https://tesla-api.timdorr.com/vehicle/state/data',
    deprecated: true,
    replacement: 'vehicle_data',
    implemented: false,
    executor: 'owner_api_raw',
    safety: 'read',
    requiresAwake: false,
  },
  {
    id: 'data-request-drive-state',
    group: 'driving',
    title: 'data_request/drive_state',
    method: 'GET',
    path: '/api/1/vehicles/:id/data_request/drive_state',
    purpose: 'Отделён drive_state отдельно. Показывается как иллюстрация устаревшего пути.',
    params: [VEHICLE_ID_PARAM],
    expectedResponse: '200 {"response":{latitude,longitude,speed,power,heading,shift_state,native_*}} или 404.',
    notes: [OWNER_API_DEPRECATION_QUOTE, 'Продукт берёт эти поля из vehicle_data.drive_state.'],
    docUrl: 'https://tesla-api.timdorr.com/vehicle/state/drivestate',
    deprecated: true,
    replacement: 'vehicle_data',
    implemented: false,
    executor: 'owner_api_raw',
    safety: 'read',
    requiresAwake: true,
  },
  {
    id: 'data-request-charge-state',
    group: 'charging',
    title: 'data_request/charge_state',
    method: 'GET',
    path: '/api/1/vehicles/:id/data_request/charge_state',
    purpose: 'Отделён charge_state. Иллюстрация устаревшего пути; данные — в vehicle_data.',
    params: [VEHICLE_ID_PARAM],
    expectedResponse: '200 {"response":{battery_level,battery_range,charging_state,charger_power,...}} или 404.',
    notes: [OWNER_API_DEPRECATION_QUOTE, 'Единицы: battery_range/est_battery_range — мили; charger_power — кВт; time_to_full_charge — часы.'],
    docUrl: 'https://tesla-api.timdorr.com/vehicle/state/chargestate',
    deprecated: true,
    replacement: 'vehicle_data',
    implemented: false,
    executor: 'owner_api_raw',
    safety: 'read',
    requiresAwake: true,
  },
  {
    id: 'data-request-climate-state',
    group: 'climate',
    title: 'data_request/climate_state',
    method: 'GET',
    path: '/api/1/vehicles/:id/data_request/climate_state',
    purpose: 'Отделён climate_state. Иллюстрация устаревшего пути.',
    params: [VEHICLE_ID_PARAM],
    expectedResponse: '200 {"response":{inside_temp,outside_temp,is_climate_on,...}} или 404.',
    notes: [OWNER_API_DEPRECATION_QUOTE, 'Температуры — в °C независимо от единиц расстояния.'],
    docUrl: 'https://tesla-api.timdorr.com/vehicle/state/climatestate',
    deprecated: true,
    replacement: 'vehicle_data',
    implemented: false,
    executor: 'owner_api_raw',
    safety: 'read',
    requiresAwake: true,
  },
  {
    id: 'nearby-charging-sites',
    group: 'charging',
    title: 'nearby_charging_sites',
    method: 'GET',
    path: '/api/1/vehicles/:id/data_request/nearby_charging_sites',
    purpose: 'Список станций Tesla рядом с автомобилем. Единственный раздел, которого нет в vehicle_data.',
    params: [VEHICLE_ID_PARAM],
    expectedResponse: '200 {"response":{"destination_only_charging_sites":[...],"superchargers":[...]}} или 404.',
    notes: ['Формально подпадает под общий отказ от data_request, но замены в rollup у него нет — поэтому помечен как не реализованный, а не удалённый.'],
    docUrl: 'https://tesla-api.timdorr.com/vehicle/state/nearbychargingsites',
    deprecated: false,
    implemented: false,
    executor: 'owner_api_raw',
    safety: 'read',
    requiresAwake: true,
  },
  // ── Commands ──────────────────────────────────────────────────────────────
  {
    id: 'wake-up',
    group: 'commands',
    title: 'wake_up',
    method: 'POST',
    path: '/api/1/vehicles/:id/wake_up',
    purpose: 'Пробуждение автомобиля. Единственная реализованная команда — она нужна циклу сбора.',
    params: [VEHICLE_ID_PARAM],
    expectedResponse: '200 {"response":{...,state:"online"}}; автомобиль может переходить в online несколько секунд.',
    notes: [
      'Метод именно POST. Прежняя реализация объявляла POST в комментарии, а отправляла GET (план E1).',
      '§42/AGENTS.md: вызывается только после явного подтверждения во UI и пишется в activity_events.',
      'Полного списка команд в каталоге нет намеренно: не реализованы — не выставляются (§26).',
    ],
    docUrl: 'https://tesla-api.timdorr.com/vehicle/commands/wake',
    deprecated: false,
    implemented: true,
    executor: 'tesla_client',
    safety: 'wake',
    requiresAwake: false,
  },
  // ── Streaming ─────────────────────────────────────────────────────────────
  {
    id: 'streaming-wss',
    group: 'streaming',
    title: 'Streaming (WSS)',
    method: 'WSS',
    path: `/streaming/:vehicle_id`,
    purpose: 'Поток телеметрии. Целевая реализация VehicleDataProvider после polling-провайдера (§22).',
    params: [
      { name: 'vehicle_id', in: 'path', required: true, type: 'string', description: 'Именно длинный vehicle_id — здесь он используется, а не короткий id', example: '3744651726645272' },
    ],
    expectedResponse: 'WebSocket-соединение с сообщениями trace.',
    notes: [
      IDENTIFIER_QUOTE,
      `Хост берётся из TESLA_WSS_HOST (сейчас ${teslaConfig.wssHost.replace(/^wss:\/\//, '')}).`,
      'Не реализовано: §22 требует только возможность добавить StreamingProvider, не сам поток.',
    ],
    docUrl: 'https://tesla-api.timdorr.com/vehicle/streaming',
    deprecated: false,
    implemented: false,
    executor: 'not_implemented',
    safety: 'read',
    requiresAwake: true,
  },
]

export const CATALOG_BY_ID = new Map(CATALOG.map((entry) => [entry.id, entry]))

export function catalogForGroup(group: CatalogGroupId) {
  return CATALOG.filter((entry) => entry.group === group)
}

/** Only entries the runner can actually execute — the console's default filter. */
export const EXECUTABLE_CATALOG = CATALOG.filter(
  (entry) => entry.executor === 'tesla_client' || entry.executor === 'auth_probe' || entry.executor === 'owner_api_raw',
)

export const ENVIRONMENTS = [
  { id: 'global', label: 'Global — owner-api.teslamotors.com', apiBaseUrl: 'https://owner-api.teslamotors.com', authHost: 'auth.tesla.com' },
  { id: 'china', label: 'China — owner-api.vn.cloud.tesla.cn', apiBaseUrl: `https://${teslaConfig.chinaApiHost}`, authHost: 'auth.tesla.cn' },
] as const

export type EnvironmentId = (typeof ENVIRONMENTS)[number]['id']

export function environmentFor(id: string | null | undefined) {
  return ENVIRONMENTS.find((env) => env.id === id) ?? ENVIRONMENTS[0]
}

/** Client-safe projection: labels and hosts only, no env-derived secrets. */
export const ENVIRONMENT_FOR_CLIENT = ENVIRONMENTS.map((env) => ({ id: env.id, label: env.label, apiBaseUrl: env.apiBaseUrl, authHost: env.authHost }))
