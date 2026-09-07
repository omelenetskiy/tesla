# DriveScope — Tesla companion

Single-owner Tesla telemetry: current state, location, trips, battery and charging,
plus an Owner API console for diagnosing the integration. Built to be readable at a
glance from the Model Y browser.

Monitoring only. The app sends no vehicle commands.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
```

## Checks

```bash
npm run lint
npm run verify   # 100+ executable checks on the Tesla layer (no network, no DB)
npm run build
npm audit --omit=dev
```

`npm run verify` runs `scripts/verify-tesla.mts` directly on Node 22.18+/24 via a
small ESM resolver in `scripts/` — there is no test framework in this project, and
adding one was not in scope. It pins the behaviours that caused real defects:
redaction, the units contract, the five-state model, the polling gate, and the
401-refreshes / 403-does-not retry policy.

## Environment

| Variable                                                     | Purpose                                                     |
|--------------------------------------------------------------|-------------------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser auth client                                         |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`                 | Server-only data access                                     |
| `TESLA_API_BASE_URL`                                         | Owner API host, default `https://owner-api.teslamotors.com` |
| `TESLA_TOKEN_ENCRYPTION_KEY`                                 | AES-256-GCM key material for stored tokens                  |
| `COLLECTION_CRON_SECRET`                                     | Bearer secret for `POST /api/collect`                       |
| `NEXT_PUBLIC_MAP_STYLE_URL`                                  | Optional basemap override (see below)                       |

## Database

Apply in order in the Supabase SQL editor:

```
001_owner_api.sql
002_telemetry_history.sql
003_tesla_oauth_tokens.sql
004_core_models.sql
005_history_derivation.sql
006_fix_polling_precedence_and_log_constraints.sql
```

006 matters: 004 added `polling_profile NOT NULL DEFAULT 'default'`, which stamped
every existing row and silently overrode a vehicle set to `collection_mode = 'passive'`
— turning a passive vehicle into one issuing live requests. 006 makes the column
nullable, clears values that only the default wrote, and repairs the request-log
constraint.

## Connecting a Tesla

There are **two separate logins**, and conflating them is the most common source of
confusion:

1. **`/login` — this app's own account** (Supabase email + password). It owns the
   vehicle rows and the encrypted tokens. Nothing to do with Tesla.
2. **`/connect` — the Tesla connection.** A Tesla password is never requested,
   accepted, or stored anywhere in this codebase.

`/connect` offers two paths that end in the same thing: an Owner API access token plus
a refresh token, encrypted at rest.

**Path A — paste tokens (the TeslaMate approach).**
[Tesla Auth](https://github.com/adriankumpf/tesla_auth/releases/latest) is an external
desktop CLI. Run `tesla-auth login` (you authenticate with Tesla in your browser), then
`tesla-auth token -o owner`, and paste both values. They are long strings beginning
`eyJ…` — tokens, not credentials.

**Path B — sign in with Tesla (OAuth).**
The server generates `state` and a PKCE `code_verifier` (S256). The verifier is kept in
an encrypted `httpOnly` cookie and never reaches page JavaScript. Because
`client_id=ownerapi` only echoes the authorization code to Tesla's own
`https://auth.tesla.com/void/callback`, the final URL is pasted back into the form to
complete the exchange. That is a property of Tesla's native client, not a shortcut.

After connecting, the server decodes the JWT and **rejects it unless `azp == ownerapi`**,
checks liveness at `userinfo`, attempts `GET /api/1/vehicles`, then stores the pair
encrypted. Expired access tokens are refreshed automatically, with rotation stored, and
concurrent refreshes for one vehicle are serialised so a rotating secret cannot be
burned by a race.

## Collection modes

Set per vehicle in **Settings → Data collection**. The mode is the operator's contract,
not a suggestion:

| Mode             | Behaviour                                                                                              | Battery impact   |
|------------------|--------------------------------------------------------------------------------------------------------|------------------|
| **Passive**      | Database reads only. The app makes **no** Tesla requests.                                              | None             |
| **Conservative** | Cadence-gated connectivity probe; telemetry only when the car reports `online`. Never calls `wake_up`. | Minimal          |
| **On demand**    | Refreshes when you press Refresh.                                                                      | Yours to control |

Cadence by reported state (driving 10s, charging 30s, parked 5min, sleeping 30min probe,
offline 15min) lives in `lib/tesla/provider.ts`. The browser never runs a fixed poll
loop, and an asleep vehicle is never sent a telemetry request — the client checks the
status probe first and skips `vehicle_data` unless the car is online.

Background collection is `POST /api/collect` with `Authorization: Bearer $COLLECTION_CRON_SECRET`,
called from a scheduler. It is exempt from the auth middleware precisely because it is
credential-gated rather than cookie-gated.

## Architecture

```
browser  →  /api/*  →  lib/tesla/service.ts  →  client.ts  →  Owner API
                        (use cases, cache, DB)   (the only module
                                                   that speaks Tesla)
```

- Components import `lib/tesla/models` and `lib/format` only. Raw Tesla payloads never
  cross `/api/*` outside `/api/debug/*`, which is explicitly a diagnostics surface.
- `lib/tesla/client.ts` owns transport: one documented `{id}` rule, in-flight and TTL
  deduplication, 401-refresh-once, 429 `Retry-After`, bounded 5xx backoff, and a
  sanitised log row per attempt.
- `lib/format.ts` formats numbers, durations and dates. There is **no** translation
  layer: interface text is English at the point of use.
- `lib/tesla/provider.ts` defines `VehicleDataProvider`, so a streaming
  implementation can replace polling without touching a component.

## Data freshness

Every live view states whether it is live or cached, and how old it is. Freshness is
computed from the row's `collected_at` at read time and is never stored inside the
snapshot — the previous build baked `lastUpdated: "just now"` into persisted rows, so
week-old data still claimed to be live.

## Map

Defaults to OpenFreeMap's Positron style: no API key, no signup, tiles/fonts/sprites
from one host, light desaturated palette. Override with `NEXT_PUBLIC_MAP_STYLE_URL`.

Do **not** point this at `tile.openstreetmap.org`. Measured directly, that server
returns a 103-byte 1-bit placeholder tile to an application User-Agent and, to a
browser-like one, a real tile plus `x-blocked: Access denied` per its
[tile policy](https://operations.osmfoundation.org/policies/tiles/) — which is how the
map came to render as a grey rectangle.

When the vehicle has no reported position, the map falls back to the browser's own
location (requested only in that case, so a connected car never triggers a permission
prompt) and says so on the map.

## Known limitations

- The Owner API is community-documented, not a guaranteed Tesla contract.
- A `403` whose body references `developer.tesla.com/docs/fleet-api` has been observed
  with a token that `userinfo` accepts. TeslaMate resolved the same signature by pinning
  its **auth host** to HTTP/2 + TLS 1.3 (PR #5406) while continuing to use the Owner API
  for individual accounts. Token calls here use HTTP/2 with a `fetch` fallback; if the
  403 persists, the API console's Authentication group is the place to confirm it.
- Tesla SSO can present a WAF/JS challenge. The app does not retry that automatically,
  since repeated attempts make it worse.
- Battery degradation is deliberately not shown without enough full-charge history.
- Token encryption derives its key with a single SHA-256 of an env value — no salt or
  iteration. Acceptable for a single-owner deployment; a KDF would be the upgrade.
- Location history is stored because trips and charging need it. Deleting a vehicle row
  cascades its data.
