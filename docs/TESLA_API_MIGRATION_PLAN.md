# DriveScope → Tesla Companion: Audit & Migration Plan

Status: **awaiting approval**. No component or API file has been modified yet.
Date: 2026-09-08. Baseline: `npm run build` ✅ exit 0, `npm run lint` ✅ clean, HEAD `1e47165`.

---

## 0. Locked decisions (from the user)

| # | Decision |
|---|---|
| D1 | **TeslaMate approach**: Owner API + access/refresh token pair generated in an external desktop app (Tesla Auth / Auth app for Tesla). No Fleet API transport. |
| D2 | **Owner API only.** `https://tesla-api.timdorr.com/` is the contract. No Fleet API terminology in models, UI, or docs. |
| D3 | Interface stays **Russian**. Brief's English section names are labels to translate, not a language switch. |
| D4 | Install **Tailwind CSS + shadcn/ui + Radix**, Lucide (already present), Recharts (present), MapLibre (present). |
| D5 | Visual references are **screenshots the user will re-attach**. PHASE 8 does not start before they arrive. |
| D6 | Supabase migrations: **files only**, user applies them manually (the direct question went unanswered, so no writes to live infra). |

---

## 1. Live-state findings (not from reading code — from the running system)

`collection_events`, 8 rows, **8 failed, 0 succeeded, 0 skipped**. Latest 4:

```
403: forbidden, see https://developer.tesla.com/docs/fleet-api
```

Read-only probe against Tesla with the *stored* credential (all output sanitized, token never printed):

| Check | Result | Meaning |
|---|---|---|
| `auth.tesla.com/oauth2/v3/userinfo` | **200**, returns account + `mfa_status: true` | credential is **alive** |
| JWT claims | `azp=ownerapi`, `scp=[openid,email,offline_access]`, `aud` contains `owner-api.teslamotors.com`, `exp` = 19:34Z | token is a **correct, unexpired Owner API token** |
| `GET /api/1/vehicles?page=1` | **403** | blocked |
| same + `User-Agent: TeslaApp/4.15.2` | **403** | UA is not the cause |
| same, no `User-Agent` | **403** | UA is not the cause |
| `GET /api/1/vehicles/<garbage-uuid>/vehicle_data` | **403**, not 404 | **rejected before routing** — path/id/header never evaluated |
| `owner-api.vn.cloud.tesla.cn` (China) | **403** | not region-specific to global host |
| `fleet-api.prd.na/eu` + same token | **401 invalid bearer token** | Fleet API needs a different token audience |

**Verdict: the 403 is a platform-level gate on the Owner API host, not a request-construction bug.** D1/D2 are therefore implementable and correct as *code*, but they cannot be verified against live telemetry with this credential today. Consequences are handled explicitly in §7 and §8.

DB state: `vehicles` 1 row · `vehicle_states` **0 rows** · `collection_events` 8 · `trips` / `charging_sessions` / `battery_snapshots` / `vehicle_locations` / `user_settings` **do not exist** (migration 002 never applied) · migration 003's *columns* exist on `vehicle_credentials` despite the file never being formally applied (DB is ahead of the migration files).

---

## 2. Endpoint audit vs timdorr docs (§43)

| # | Finding | Evidence | Severity |
|---|---|---|---|
| E1 | `wakeTeslaVehicle` is documented `POST` but `teslaFetch` has **no method parameter** — it issues **GET** `/api/1/vehicles/{id}/wake_up`. Wake can never succeed. | `lib/tesla-api.ts:257`, `teslaFetch` at `:186` (no `method`) | **High** |
| E2 | `provider_vehicle_id` in the live DB holds `3744651726645272` — the long `vehicle_id`. `/api/vehicle` then calls `GET /api/1/vehicles/{id}` with it, where docs require the **short `id`**. Exactly the §44 substitution trap. | `app/api/vehicle/route.ts:26`, `lib/tesla-api.ts:247` | **High** |
| E3 | Identifier semantics are inconsistent per route: `collect` matches `String(item.id) \|\| String(item.vehicle_id)`; `vehicle` (fresh) matches three ways; `getTeslaVehicleData` uses `id_s \|\| id`. No single rule. | `app/api/collect/route.ts`, `app/api/vehicle/route.ts` | **High** |
| E4 | §14 violation: `loginWithTeslaPassword()` + `verifyTeslaMfa()` scrape Tesla's SSO form (`identity`/`credential` POST, `_csrf`, MFA factor endpoints). Currently **dead code** — no route imports it — but the credential-collecting path exists in the repo. | `lib/tesla-auth.ts:141`, `:196` | **High** |
| E5 | Scope drift from §15: requests `vehicle_cmds vehicle_location` in addition to `openid email offline_access`, while §42 says monitoring-only. | `lib/tesla-auth.ts:5` | Medium |
| E6 | §18 broken: `refreshTeslaToken()` hardcodes `https://auth.tesla.com`, ignoring the stored issuer → a China (`auth.tesla.cn`) account refreshes against the wrong host. `exchangeAuthorizationCode` does honour `authOrigin`, so it's half-implemented. | `lib/tesla-auth.ts:222` vs `:206` | Medium |
| E7 | §46 unmet: only `TESLA_API_BASE_URL` is configurable. Auth host/path and WSS host are string literals scattered in `lib/tesla-auth.ts`. No single config layer. | `lib/tesla-auth.ts:3-6` | Medium |
| E8 | 401-vs-403 collapsed into one branch ("credentials were rejected"), so §20's "401 → refresh once" is entangled with a genuine authorization failure. Worse, control flow **string-matches the error message** in 5 places to decide whether to refresh. | `lib/tesla-api.ts:207`, `app/api/vehicle/route.ts:33,98`, `app/api/collect/route.ts`, `app/api/tesla/connect/route.ts` | **High** |
| E9 | No 5xx exponential backoff, no `Retry-After` parsing on 429, no typed error objects. | `lib/tesla-api.ts:203` | Medium |
| E10 | `?page=1` appended to `/api/1/vehicles` — undocumented in timdorr's vehicle-list example; harmless but unverified. | `lib/tesla-api.ts:238` | Low |
| E11 | Units are self-contradictory: type comment says `drive_state.speed` is km/h (`:129`), the normalizer comment says "documented in mph; no conversion needed" (`:145`). `battery_range` labelled miles while the UI implies km. §43 asks to fix exactly this. | `lib/tesla-api.ts:129,145` | **High** (silent data error) |
| E12 | Only `vehicles[0]` is ever persisted, so §6's vehicle selector and multi-vehicle are structurally impossible. | `app/api/tesla/connect/route.ts:44`, `auth/complete:22` | Medium |
| E13 | `data_request/*` sub-endpoints are **not** used — good, matches §43's deprecation warning. Nothing to remove here. | — | ✅ none |

---

## 3. Data-layer and freshness findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| F1 | **Freshness is baked into the stored snapshot.** `normalizeVehicle` computes `getFreshness(state, new Date())` and `lastUpdated: 'just now'`, then the whole object is persisted to `vehicle_states.state`. A cache row served a week later still self-reports `LIVE`. Directly violates §38 "Do not show stale data as current." | `lib/tesla-api.ts:137,172` + insert at `app/api/vehicle/route.ts:41` | **Critical** |
| F2 | Presentation + Russian localization is baked into the *stored model*: `'Последнее известное местоположение'`, `'Заперта'`, `'Открыта'`, `'Недоступно'`, `'Снимок получен из Tesla Owner API'`. Snapshots are not portable and the UI can't be re-skinned without re-collecting data. | `lib/tesla-api.ts:160-168` | **High** |
| F3 | §13's normalized models barely exist: one flat `Vehicle` type. No `VehicleStatus`, `DriveState`, `ChargeState`, `ClimateState`, `VehicleState`, `VehicleConfig`, `Trip`, `ChargingSession`, `BatterySnapshot`, `ActivityEvent`. `charge_state`/`drive_state` types exist only as *raw* API shapes. | `app/data.ts`, `lib/tesla-api.ts:20-77` | **High** |
| F4 | `trips` and `charging_sessions` are **derived on request** by scanning up to 5000 `vehicle_states` rows in JS, with no gap/threshold logic and no persistence — while migration 002 already declares real `trips`/`charging_sessions` tables that nothing reads. Trip boundaries come from 15-min snapshots, so `distance` is an odometer delta and `route` is a handful of coarse points. | `app/api/history/route.ts:15-70`, `supabase/migrations/002_telemetry_history.sql:32,51` | **High** |
| F5 | §48 unmet: no caching, no request dedup, and the "cache-first" GET path still issues a **live Tesla status call on every dashboard load**. | `app/api/vehicle/route.ts:24-36` | Medium |
| F6 | §22 `VehicleDataProvider` abstraction absent; polling specifics leak into routes. | — | Medium |
| F7 | §23 `RequestLog` absent entirely — no table, no model, no redaction layer. | — | Medium |
| F8 | `vehicle_states` stores the entire normalized blob as `state jsonb`; no per-column battery/range/odometer → battery-history and degradation queries are table scans of JSON. | `001_owner_api.sql:22` | Medium |

Security review (✅ working, keep as-is): AES-256-GCM with per-secret random IV + auth tag, key derived from env (`lib/crypto.ts`); `.env` correctly gitignored; refresh-token rotation stored when returned (`lib/tesla-credentials.ts:36`); `vehicle_credentials` has **no** RLS read policy, so it is not client-readable; tokens never appear in API responses or logs; `/api/collect` guarded by bearer secret with constant-shape comparison; RLS enabled on all tables with owner-scoped policies.

One crypto note: `sha256(env)` as the key derivation is a single hash with no salt or iteration. Acceptable for a single-owner MVP; documented as a known limitation, not changed here.

---

## 4. Frontend findings

- **One 631-line `app/page.tsx`** holds the entire dashboard; `app/globals.css` is 1134 lines of hand-written CSS; `app/components/live-map.tsx` (160) is the only extracted component. `app/layout.tsx` is 23 lines.
- No `components/ui/`, no `components.json`, no Tailwind/Radix/CVA/`tailwind-merge` in `package-lock.json` → §5's stack is entirely absent today.
- Single route `/` plus `/login`, `/connect`. No `/trips`, `/battery`, `/charging`, `/settings`, `/debug/api`. Navigation as specified in §6 does not exist.
- Two `fetch` call sites (`/api/vehicle`, `/api/history`) — the app does not call Tesla from the browser. ✅ §11 holds today; must be preserved.
- No i18n layer: strings live inline in `page.tsx` and inside `normalizeVehicle` (F2).
- **Zero images in the repo** — the visual references have never been committed.

---

## 5. Target architecture

```
app/(product)/dashboard|trips|battery|charging|settings     ← presentation only, Russian
app/debug/api                                               ← developer console (same design system)
app/api/*                                                   ← application API (auth-bounded, no Tesla objects leak)
        │
lib/tesla/
  config.ts          ← §46 single source: TESLA_AUTH_HOST, TESLA_AUTH_PATH, TESLA_API_HOST, TESLA_WSS_HOST
  errors.ts          ← TeslaApiError{status,kind,retryAfterMs,attempts}; replaces E8 string matching
  client.ts          ← TeslaClient per §19: getVehicles/getVehicle/getVehicleData/
                        getDriveState/getChargeState/getClimateState/getVehicleState/getVehicleConfig
                        + request(method,path) with dedup, 401-refresh-once, 5xx backoff, 429 Retry-After
  normalize.ts       ← raw → §13 domain models; NO strings, NO freshness (F1/F2)
  models.ts          ← Vehicle, VehicleStatus, VehicleLocation, DriveState, ChargeState,
                        ClimateState, VehicleState, VehicleConfig, Trip, ChargingSession,
                        BatterySnapshot, ActivityEvent
  auth.ts            ← PKCE S256 + state, backend-owned session, region from issuer (§15/§18)
  tokens.ts          ← access/refresh lifecycle, rotation, expiry, encrypted at rest (§17)
  request-log.ts     ← RequestLog write + sanitizer (§23/§30)
  provider.ts        ← VehicleDataProvider interface → PollingProvider (StreamingProvider later, §22)
  catalog.ts         ← endpoint definitions + docs text for /debug/api (§26/§31)
lib/format.ts        ← units + Russian presentation, the ONLY place labels are produced
supabase/migrations/ ← 004, 005 (see §6)
```

**Rule enforced in review:** components import from `lib/tesla/models` and `lib/format` only. `rawResponse` never crosses `/api/*` except under `/debug/api`, which is explicitly a diagnostics surface.

### Units contract (fixes E11)
Owner API returns `speed` in the vehicle's unit setting, `battery_range`/`est_battery_range`/`ideal_battery_range` in **miles**, `odometer` in **miles**, `inside_temp`/`outside_temp` in **°C**, `power` in **kW**, `time_to_full_charge` in **hours**, `charge_energy_added` in **kWh**. Store canonical metric (`km`, `km/h`, `°C`, `kW`, `kWh`) with `distanceUnit` on the vehicle row; convert once in `normalize.ts`; format once in `lib/format.ts`.

### Freshness (fixes F1)
Never stored. Computed from the row's `collected_at` at read time → `LIVE ≤30s · RECENT ≤5min · STALE ≤15min · OFFLINE >15min`, plus `Sleeping` as a distinct vehicle state (§7's five states: Driving/Parked/Charging/Sleeping/Offline).

---

## 6. Schema plan (files written; user applies in the SQL editor)

- **004_core_models.sql** — `vehicles` +`vehicle_id` (long, for cross-endpoint identity), `owner_api_id` (short, for `{id}` paths), `distance_unit`, `polling_profile`; `activity_events` (§13); **`api_request_logs`** (§23, sanitized columns, 7-day retention); `battery_snapshots` promoted to typed columns (`soc`, `usable_soc`, `range_km`, `battery_heater_on`, `rated_12v`).
- **005_trips_charging.sql** — real `trips` and `charging_sessions` populated **server-side at collection time** from odometer/GPS/`charging_state` transitions, replacing F4's request-time derivation; indexes on `(vehicle_id, started_at desc)`; trip gap rule (odometer delta > 0.5 km and ≤ 30 min between online snapshots); `partial` flag for interrupted sessions (§7 of AGENTS.md).
- Backfill: on first successful collection, migrate existing `vehicle_states` rows into `battery_snapshots` / `trips` / `charging_sessions`. With 0 rows today this is a no-op, but the code path is required before history exists.
- Data repair for E2: one-time reconcile of `provider_vehicle_id`, writing the short id into `owner_api_id`. Since `/api/1/vehicles` currently 403s, this runs opportunistically when a vehicle list succeeds.

## 7. Polling policy (§21) — state-aware, sleep-preserving

| State | Live refresh | Cache |
|---|---|---|
| Driving | 10 s | 5 s |
| Charging | 30 s | 10 s |
| Parked / idle | 5 min | 5 min |
| Sleeping | none | indefinite, labelled "последнее известное" |
| Offline | none | stale + explicit warning |

Configurable per vehicle via `polling_profile`. `wake_up` stays behind an explicit two-step confirmation and is recorded in `activity_events`. AGENTS.md §3.2 stays binding: cache first, never a browser-tab poll loop, no retry that repeatedly wakes the car.

## 8. Debug console (§24–§32)

`/debug/api`, three-pane desktop (catalog · request · response) collapsing to a tabbed stack on narrow/in-car screens. Groups: Authentication, Vehicles, Vehicle State, Charging, Climate, Driving, Commands *(only if implemented — currently none, so the group renders "not implemented" rather than exposing dead commands)*, Streaming.

Runs through the **same `TeslaClient`** as the product, so it exercises real retry/refresh/dedup and logs real `api_request_logs` rows. Response tab shows status, duration, timestamp, pretty-printed collapsible JSON with search, plus Headers / Request / cURL tabs; history restores request+response; diagnostics panel renders §41's ✓/✗ checklist (access token valid · refresh token valid · Owner API reachable · vehicle list · vehicle data) from probe results with sanitized bodies only.

Because D1/D2 currently yield 403, the console's first real job is to let you mint a fresh token pair in Tesla Auth, paste it, and immediately see whether a *newly registered* token clears the gate — the one variable this audit cannot test.

---

## 9. Execution order (each phase verified before the next)

| Phase | Work | Verification |
|---|---|---|
| P4 | `config.ts` + `errors.ts` + `TeslaClient` (typed errors, POST support → E1, single id rule → E2/E3, refresh-once-on-401 → E8, backoff/Retry-After → E9) | unit checks with a stubbed transport; no live dependency |
| P5 | `auth.ts`/`tokens.ts`: delete password+MFA scraper (E4), trim scopes (E5), issuer-driven region (E6), rotation + `AUTH_*` states (§45) | `/connect` renders; refresh path exercised against `auth.tesla.com` (read-only userinfo) |
| P6 | `request-log.ts` + sanitizer + 004/005 files (§23/§30) | redaction test: Authorization/Bearer/`refresh_token`/secret/cookie/PKCE-verifier → `[REDACTED]` |
| P7 | `/debug/api` (§24–§32) | §40 checklist, item by item |
| P8 | Navigation shell + Dashboard/Trips/Battery/Charging/Settings IA, MapView + chart primitives (§34/§35) | build + desktop/narrow/in-car widths |
| P9 | Tailwind + shadcn visual system | contrast, touch targets, reduced motion |
| P10 | In-car pass: ≥44 px targets, no hover-only actions, no horizontal overflow, large SoC | 1280×800 Tesla viewport |
| P11 | §51 acceptance run + `lint`/`build`/`npm audit` | report honestly, including anything unverifiable |

**P8–P10 are gated on D5 (screenshots).** P4–P7 are not, and they are where the real defects are.

---

## 10. Open items

1. **Screenshots** — not yet re-attached. Blocking P8–P10.
2. **Live telemetry cannot be verified** under D1/D2 with the current credential (§1). I will not fabricate data to make screens look populated; empty/unavailable states are built as first-class UI per §39, and `vehicle_states`/`trips` will populate only once Tesla's gate clears.
3. `AGENTS.md` and `PRODUCT.md` are **deleted in the working tree** (tracked at HEAD). I treated AGENTS.md's sleep-safety and RLS rules as still binding. If the deletion was unintentional, say so and I'll restore them from `git show HEAD:AGENTS.md`.
4. Mixed-language error strings today (Russian UI + English messages/labels). Under D3 I will normalise user-facing copy to Russian and keep enum values (`Driving`, `Charging`) internal.
5. Supabase migrations: **files only** unless you explicitly authorise applying them (D6).
