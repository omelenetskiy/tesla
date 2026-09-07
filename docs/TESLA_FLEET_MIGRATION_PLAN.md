# Tesla Fleet API + Fleet Telemetry — migration plan

Status: **draft, awaiting Phase 0 pinning.** Supersedes the Owner API plan in
`TESLA_API_MIGRATION_PLAN.md`. The Owner API is dead for this product *by decision*, not by
platform sunset: the operator obtained an Oracle Cloud VM and chose Fleet API + Fleet
Telemetry as the only data path.

Written before any code, per the original brief's rule.

---

## 0. Decisions taken by the operator (2026-09-08)

| # | Decision |
| --- | --- |
| D1 | Receiver = the official `tesla/fleet-telemetry` Go binary on the Oracle Cloud VM, as a systemd unit. Not a hand-written protocol implementation. **Corrected after research:** the repo is `teslamotors/fleet-telemetry` (not `tesla/…`), and it has **no client-facing WebSocket** — the socket at `/` is the vehicles' mTLS ingress. Our app must consume one of its seven dispatchers (`pubsub`, `kafka`, `kinesis`, `logger`, `zmq`, `mqtt`, `redis`); P4 uses **MQTT with a broker on the same VM**, whose payloads are JSON, one field per message. |
| D2 | Fleet credentials are **fully ready**: developer.tesla.com app with `client_id`, ES256 private key, owner authorization can be performed. |
| D3 | Delete the **polling machinery only**: `/api/collect`, polling policy/profiles, wake-on-read, the state-aware scheduler. Keep the Next.js routes that serve the UI and run on-demand commands. |
| D4 | Basemap stays OpenFreeMap vector (`bright`), with the overzoom smear guard already shipped. |
| D5 | **No polling anywhere.** Telemetry is the only continuous source. Direct API calls happen only on an explicit command (button, console Send). |
| D6 | Streaming begins when the operator enters the car; trips and charging sessions are derived from the stream, not from snapshots. |

## 1. Target topology

```
        Tesla cloud ──mTLS, Tesla-initiated──▶ fleet-telemetry (VM :443, public-CA server cert)
                                                    │  dispatcher: MQTT (JSON, one field per message)
                                                    ▼
                                        mosquitto (localhost on the VM)
                                                    │  subscribe
                                                    ▼
                                        ingest worker (this repo, on the VM)
                                                    │  upsert / insert
                                                    ▼
                                              Supabase (Postgres + RLS)
                                                    ▲  realtime subscription (push, not polling)
        Browser ──▶ Next.js app ──reads──────────────┘
                          │
                          └──/api/fleet/command──▶ Fleet API (owner-scoped token, on demand only)
```

Consequences that shape everything below:

- **The VM receiver never holds a Tesla token.** Tesla connects *to* it; it only has to prove
  its own TLS identity and authenticate our ingest worker as a WebSocket client. The
  owner-scoped token lives only in the app's credential store and is used for commands,
  on-demand reads and telemetry-config management.
- **The app POSTs the telemetry config** (`fleet_telemetry_config`) with the owner token; the
  car then opens the stream to the VM host named in that config.
- **"Realtime" on the dashboard is a Supabase subscription**, i.e. push. It is not polling and
  is therefore compatible with D5.

## 2. Data model

New migration `007_fleet_telemetry.sql`:

| Table | Purpose |
| --- | --- |
| `telemetry_latest` | One row per vehicle: `vehicle_id` PK, `payload jsonb`, `updated_at`. The live dashboard reads this; the ingest worker upserts it per frame batch. |
| `telemetry_frames` | Append-only frames: `vehicle_id`, `field`, `value` (jsonb), `captured_at`, `received_at`. Partitioned by day on `captured_at`; retention policy (30 days) enforced by dropping partitions. Source for trip/charge derivation and the pack-voltage chart. |
| `telemetry_connection` | `vehicle_id` PK, `state` (`connected`/`disconnected`), `last_frame_at`, `receiver_host`. Drives the header status pill and the "streaming" indicator. |
| `fleet_credentials` (replaces `vehicle_credentials`) | `owner_id`, `access_token` (encrypted), `refresh_token` (encrypted), `expires_at`, `scopes text[]`, `vins text[]`, `auth_host`. Same at-rest encryption and RLS as today. |

Existing tables reused unchanged: `trips`, `charging_sessions`, `battery_snapshots`,
`activity_events`, `api_request_logs`, `user_settings`, `vehicles` (keyed by VIN from now on).

Obsolete after Phase 6: `collection_events`, the `polling_profile`/`collection_mode` columns,
`vehicle_states` snapshot rows (superseded by `telemetry_latest`). Dropped in `008_drop_polling.sql`,
**after** the ingest path is proven, never before.

## 3. Deletion list (exact)

| Path | What goes |
| --- | --- |
| `app/api/collect/route.ts` | whole route (the poll entry point) |
| `lib/tesla/provider.ts` | whole module: `PollingRule`, `DEFAULT_POLLING_POLICY`, `RELAXED_`, `PASSIVE_`, `POLLING_PROFILES`, `policyFor`, `resolvePollingProfile`, `shouldCollect` |
| `lib/tesla/service.ts` | `readVehicleStatus` force/wake path, `logCollectionFailure`, cache-first snapshot reads → replaced by `telemetry_latest` reads |
| `lib/hooks/use-vehicle.ts` | the interval map (`driving 10s / charging 30s / parked 5min`) → replaced by a Supabase realtime subscription |
| `app/(app)/settings/page.tsx` | the "Data collection" passive/relaxed/aggressive section → replaced by a "Telemetry" section (fields, intervals, enable/disable) |
| `lib/tesla/catalog.ts` | Owner API entries → Fleet catalog (commands + on-demand reads + telemetry config) |
| `lib/tesla/client.ts` | the Owner API HTTP client → new `lib/fleet/client.ts`; **keep** `sanitize.ts`, `errors.ts`, `request-log.ts` |
| `app/connect/page.tsx` | PKCE paste flow → Fleet owner-authorization redirect, with a paste-the-code fallback |
| `scripts/verify-tesla.mts` | becomes `scripts/verify-fleet.mts` pinning the Phase 0 table |

## 4. Phase 0 — pin the contract before any code

No implementation may assume a row that is not `PINNED`. A row flips to `PINNED` only with a
verbatim quote from the cited source recorded in this document.

### 4a. Pinned — authentication (2026-09-08)

Source: archived copy of `https://developer.tesla.com/docs/fleet-api/authentication/third-party-tokens`
(the live page is a JavaScript shell with no server-rendered content, so it cannot be quoted
directly) and `.../getting-started/regions-countries`.

**C1 — token endpoint. `PINNED`.**

> `POST https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token`
>
> "Important: calls to `/token` must use the `fleet-auth.prd.vn.cloud.tesla.com` domain as these
> calls can come from application servers and require different rate limits."

**C1a — the hypothesis was wrong, twice.** The token host is **not** `auth.tesla.com` (that is the
*authorize* host), and the third-party flow has **no `client_assertion`, no JWT, no ES256** —
those appear only in the partner/business flows. The quoted code exchange is:

> ```
> curl --request POST \
>   --header 'Content-Type: application/x-www-form-urlencoded' \
>   --data-urlencode 'grant_type=authorization_code' \
>   --data-urlencode "client_id=$CLIENT_ID" \
>   --data-urlencode "client_secret=$CLIENT_SECRET" \
>   --data-urlencode "code=$CODE" \
>   --data-urlencode "audience=$AUDIENCE" \
>   --data-urlencode "redirect_uri=$CALLBACK" \
>   'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token'
> ```

Body keys per grant: `authorization_code` → `grant_type, client_id, client_secret, code,
audience, redirect_uri, scope`; `refresh_token` → `grant_type, client_id, refresh_token`.
**No PKCE** — the authorize parameter list contains `nonce`, not `code_challenge`. The whole
`lib/tesla/auth.ts` PKCE machinery is therefore replaced, not adapted.

**C2 — authorize URL and scopes. `PINNED`.**

> `https://auth.tesla.com/oauth2/v3/authorize?&client_id=$CLIENT_ID&locale=en-US&prompt=login&redirect_uri=$REDIRECT_URI&response_type=code&scope=openid%20vehicle_device_data%20offline_access&state=$STATE`

Authorize parameters: `response_type, client_id, redirect_uri, scope, state, nonce,
prompt_missing_scopes, require_requested_scopes, show_keypair_step`.

> `prompt_missing_scopes` — "When true, the user will be prompted to authorize scopes, if they have
> not already granted all required scopes."
> `require_requested_scopes` — "When true, the user must authorize all requested scopes to proceed."

Full scope strings: `openid offline_access user_data vehicle_device_data vehicle_cmds
vehicle_charging_cmds`. (`vehicle_cmds`, not `vehicle_commands` as hypothesised.)

**C3 — Fleet API base URLs by region. `PINNED`.**

> North America, Asia-Pacific (excluding China): `https://fleet-api.prd.na.vn.cloud.tesla.com`
> Europe, Middle East, Africa: `https://fleet-api.prd.eu.vn.cloud.tesla.com`
> China: `https://fleet-api.prd.cn.vn.cloud.tesla.cn`

And `audience` is defined as: "Must be a Fleet API base URL" — so **the audience is the region base
URL, and the region is a property of the credential**, not a runtime guess.

> "To make calls to vehicles in China, create an account on https://www.tesla.cn/ and create a
> separate application on https://developer.tesla.cn/. This requires a +86 phone number."

**Consequence for the operator's private key.** The ES256 key pair is not used to obtain a
third-party token. It is used to **sign vehicle commands**, which is a P2/C6 concern. So "I have
the private key" is correct and needed — just not in P1. Until C6 is pinned, P1 must not read the
key file.

### 4b. Pinned — the virtual key (2026-09-08, added after the operator asked)

Source: archived `.../fleet-api/virtual-keys/developer-guide` and `.../endpoints/vehicle-commands`.

> "A virtual key is a public/private key pair which enables authorization when interacting
> with a vehicle."
> "The private key is kept securely on the application's server." … "public key must be added
> to the vehicle by a trusted user"
> **"Before executing a command or accepting a Fleet Telemetry configuration, the vehicle
> ensures the payload is signed by a private key whose public key is present on the vehicle."**
> "To accept commands, a vehicle must have an application's virtual key installed."

**This changes P3, not just P2.** The key gates *telemetry configuration* as well as commands,
so the receiver cannot be enabled before the key is installed on the car. Plain reads
(`vehicle_data`, the vehicle list) are not gated by it.

Installation, as quoted:

1. `openssl ecparam -name prime256v1 -genkey …` then export the public part.
2. Host it at `https://<developer-domain>/.well-known/appspecific/com.tesla.3p.public-key.pem`
   — for this app, the file can be dropped in `public/.well-known/appspecific/` and Next serves
   it at that exact path with no code.
3. Register it with Tesla via the partner account **register** endpoint (`C12`, unpinned).
4. Owner opens `https://tesla.com/_ak/<developer-domain>?vin=<VIN>` as a trusted user; for B2B
   vehicles this is automatic.

> "The easiest method to sign commands is through the Vehicle Command Proxy." — "A cryptographic
> key used by the Vehicle Command Proxy to sign payloads sent to the vehicle."

So local EC signing may not be required at all: the proxy signs. The exact headers and the
signed string are **not** in the archived command page (`ABSENT`), which is why C6 stays open and
why P1 does not read the private key file.

| Id | Contract point | Status |
| --- | --- | --- |
| C12 | Partner account `register` endpoint for the public key | UNPINNED |
| C13 | Whether commands go through the Vehicle Command Proxy (no local signing) or require local ES256 signing, and the exact headers | UNPINNED |

### 4c. Pinned — endpoints, telemetry, frames (2026-09-08, from the live Gatsby spec blobs)

The docs pages are Gatsby: the SSR HTML carries only a summary, while the parameter tables,
scopes and response examples ship as JSON inside webpack chunk
`8d5ef0369d90cf6456cbf86edc853e380b108a7f-*.js` (spec) and `ba0f3f94db0db7d01fbe8161be1639a318f41231-*.js`
(strings). Everything below was read out of those, i.e. it is what the live site renders.

**C4 / C4a — `PINNED`.** Every vehicle path is `{vin}`-keyed; **there is no `/api/1/vehicles/{id}`
in Fleet API.** The list returns all four identifiers, so keying internal state on `id` is the
Owner-API habit that would 404 on every follow-up call:

> `GET /api/1/vehicles` — "Returns vehicles belonging to the account. This endpoint is paginated with a default page size of 100 vehicles." (`page`, `per_page`; scopes `[vehicle_device_data]`)
> `{"response":[{"id":100021,"vehicle_id":99999,"vin":"TEST00000000VIN01",…,"state":"online","id_s":"100021",…}],"pagination":{…},"count":1}`
> `GET /api/1/vehicles/{vin}` — and for the awake check: "Fetch the vehicle endpoint and inspect the `state` attribute. Ensure it is not `offline` or `asleep`."

**C5 — `PINNED`.** `GET /api/1/vehicles/{vin}/vehicle_data`, scopes `[vehicle_device_data, vehicle_location]`,
single allowed query param `endpoints`:

> "String of URL-encoded, semicolon-separated values. Can be many of 'charge_state', 'climate_state', 'closures_state', 'drive_state', 'gui_settings', 'location_data', 'charge_schedule_data', 'preconditioning_schedule_data', 'vehicle_config', 'vehicle_state', 'vehicle_data_combo'. The 'location_data' and 'location_state' endpoints require 'vehicle_location' scope"

> "Regularly polling this endpoint is not recommended and will be expensive… For vehicles running firmware versions 2023.38+, location_data is required to fetch vehicle location."

**C6 — `PINNED`.** `POST /api/1/vehicles/{vin}/command/<name>`; `wake_up` is the exception —
`POST /api/1/vehicles/{vin}/wake_up` (scope `vehicle_device_data`, pricing `wakes`). Bodies:
`set_temps{driver_temp,passenger_temp}`, `set_preconditioning_max{on,manual_override}`,
`set_charging_amps{charging_amps}`, `set_charge_limit{percent}`, `set_sentry_mode{on}`,
`window_control{command,lat,lon}`, `adjust_volume{volume}`, `remote_seat_heater_request{seat_position,level}`;
no body for `auto_conditioning_start/stop`, `charge_start/stop`, `charge_port_door_open/close`,
`door_lock/unlock`, `honk_horn`, `flash_lights`, media controls. Universal answer
`{"response":{"result":true,"reason":""}}`. Signing is done by the **Vehicle Command Proxy**:
"When it receives a request, it signs the command with a virtual key before passing the request to
Fleet API. If a command is not signed, the vehicle will reject the request and perform no action."

**C7 — `PINNED`, and my hypothesis was wrong.** There is no `configs` array, no `fieldname`, no
`interval`. The receiver's address is **in the body**:

> `POST /api/1/vehicles/fleet_telemetry_config` body `{"vins":[…],"config":{"hostname","ca","port","fields":{"<Field>":{"interval_seconds","minimum_delta","resend_interval_seconds","include_fields"}},"alert_types","exp","delivery_policy"}}`
> `hostname` — "URL of the fleet-telemetry server, **must match the root domain (second-level + first-level domain) of the registered application**"
> `ca` — "Certificate authority cert for fleet-telemetry server" · `port` — required
> `GET /api/1/vehicles/{vin}/fleet_telemetry_config` → `{"response":{"synced":true,"config":{…},"limit_reached":false,"key_paired":false}}`
> "`synced` set to `false` means the vehicle will attempt to adopt the target config **when it next establishes a backend connection**."
> `DELETE /api/1/vehicles/{vin}/fleet_telemetry_config` — scope `[vehicle_device_data]` only

Rejection buckets verbatim: `missing_key`, `unsupported_hardware`, `unsupported_firmware`,
`max_configs`. Note the docs contradict themselves on capacity — create says five per vehicle,
`get` says three.

**C8 — `PINNED`.** Names are the proto `Field` enum spellings. **`Speed`, `Power` and `Heading`
do not exist**: the real names are `VehicleSpeed`, `GpsHeading`, and there is no generic power
field (only `ACChargingPower`, `DCChargingPower`, `HvacPower`, `PowershareInstantaneousPowerKW`).
**`PackVoltage` and `PackCurrent` do exist** (proto tags 6 and 7) — so the reference dashboard's
"Pack Current / Pack Voltage" tiles are sourceable. **No cellular or Wi-Fi field exists at all**
(a regex over all 239 documented names for `cell|wifi|lte|network|signal` matched only
`LightsTurnSignal`), so those two tiles from the screenshot cannot be built from telemetry.
`Odometer`, `Soc`, `Location`, `InsideTemp`, `OutsideTemp`, `DetailedChargeState`, `ChargerVoltage`,
`ChargeAmps`, `RouteLine`, `DestinationName`, `MilesToArrival`, `HvacFanSpeed`, `ClimateKeeperMode`,
`TpmsPressure*`, `Locked`, `SentryMode`, `SoftwareUpdate*` all exist. 239 fields are documented as
configurable; the proto enum has 270 (the extra 31 are `Unknown`, `Deprecated_*`,
`Experimental_1..15` and a handful of new ones).

**C9 — `PINNED`, with a name correction.** There is no `tesla_pb` package. The vehicle-data frame
is `Payload` in package `telemetry.vehicle_data` (`protos/vehicle_data.proto`):

> `message Payload { repeated Datum data = 1; google.protobuf.Timestamp created_at = 2; string vin = 3; bool is_resend = 4; }`
> `message Datum { Field key = 1; Value value = 2; }`
> `message Value { oneof value { string string_value = 1; int32 int_value = 2; … float float_value = 4; bool boolean_value = 6; LocationValue location_value = 7; … bool invalid = 10; } }`

Plus `VehicleAlerts`/`VehicleAlert{name,audiences,started_at,ended_at}`,
`VehicleErrors`/`VehicleError{name,tags,body}`, and
`VehicleConnectivity{vin,connection_id,status,created_at,network_interface}` with
`enum ConnectivityEvent { UNKNOWN=0; CONNECTED=1; DISCONNECTED=2; }`.

**C10 — `PINNED`.** Config keys are lower-case: `host`, `port`, `log_level`, `json_log_enable`,
`namespace`, `rate_limit{enabled,message_limit,message_interval_time}`, `monitoring{…}`,
`records{"V","alerts","errors","connectivity"}` → dispatcher lists, `tls{server_cert,server_key,ca_file}`,
`transmit_decoded_records`. The authoritative Go struct uses `reliable_ack_sources`, **not** the
`reliable_ack` the README shows. Server side is mTLS-only and hard-fails without certs
(`ClientAuth: tls.RequireAndVerifyClientCert`); Tesla's CA bundle is embedded in the binary, and the
vehicle's identity comes from the client certificate CN — `deviceID = strings.ReplaceAll(fullCert.Subject.CommonName, ".", "-")`.
FAQ: "ensure the server certificate is signed by a commonly trusted certificate authority";
`tools/check_server_cert.sh` reads `{hostname, ca, port}` to verify.

**C11 — `PINNED`.** Limits are per device, per account, **shared across all of the account's apps**:
realtime data 60/min, device commands 30/min, wakes 3/min, auth ≤20 req/sec. `408` = "the vehicle is
not 'online' when a request is made"; `429` = "Receiving status code 429 is an indication of faulty
application logic", read `RateLimit-*-Reset` / `Retry-After`. `406` if `Content-Type` is not
`application/json`; `412` if the partner account was never registered; `422` if the vehicle does not
speak the command protocol; `421` wrong region. Every sub-500 response is billed, and exceeding the
billing limit **deletes** fleet-telemetry configs which "will not be restored".
**No propagation delay is documented** — adoption is event-driven (see C7), with adjacent figures of
10–60 s to wake and up to 10 min for scope changes. Once streaming, the collector buckets at 500 ms
and emits a field only when its interval elapsed *and* the value changed; on connectivity loss the car
buffers 5000 messages, and reconnect backoff caps at 30 s.

**C14 — new, `PINNED`:** consent management is a page, not an endpoint:
`https://auth.tesla.com/user/revoke/consent?revoke_client_id=$CLIENT_ID&back_url=$RETURN_URL` —
wired into Settings as "Revoke at Tesla".

**C15 — new, `PINNED`:** the refresh token is "single use only and expires after 3 months", and "the
most recently used refresh token is valid for up to 24 hours" — which is why `saveFleetTokenSet`
always overwrites the stored refresh secret.

> One quote from the vehicle_data page settles the polling question: polling that endpoint is
> described as **"expensive"**, and Fleet Telemetry is recommended instead. That is Tesla's own
> documentation agreeing with decision D5.

### 4d. Evidence from the operator's working reference app (`../App`)

A small Express implementation the operator pointed at as "how it works". Read directly
(`src/tesla.js`, `src/server.js`, `src/auth.js`, `scripts/register-partner.js`).

**C12 — `PINNED` by working code.** Partner registration is `POST {fleet_base}/api/1/partner_accounts`
with body `{domain}`, carrying a **client_credentials** token:

> ```js
> await axios.post('https://auth.tesla.com/oauth2/v3/token', {
>   grant_type: 'client_credentials', client_id, client_secret,
>   scope: 'openid vehicle_device_data vehicle_cmds vehicle_charging_cmds',
>   audience: REGIONS[region] })
> …
> await axios.post(`${base}/api/1/partner_accounts`, { domain }, { headers: { Authorization: `Bearer ${token}` } })
> ```
> and the public key is served at `/.well-known/appspecific/com.tesla.3p.public-key.pem`
> (`app.get('/.well-known/appspecific/com.tesla.3p.public-key.pem', …)` → `keys/public.pem`).

**C4a — corrected.** The reference resolves the path identifier as `vid = v.id_s || String(v.id)`,
so **`{vehicle_tag}` accepts the short id as well as the VIN**. Tesla's docs only ever write
`{vehicle_tag}` without defining it, and the earlier "every path is `{vin}`-keyed" reading was too
narrow. `lib/fleet/client.ts:fleetVehicleTag` therefore prefers the VIN and falls back to the short
id, while still rejecting the long `vehicle_id` — that one is a 404 in both sources.

**Two places where the reference contradicts Tesla's documentation**, recorded rather than silently
resolved, because both appear to work in practice:

| Point | Tesla docs | `../App` | This app |
| --- | --- | --- | --- |
| Token host | `fleet-auth.prd.vn.cloud.tesla.com` ("must") | `auth.tesla.com/oauth2/v3/token` | documented host |
| Third-party exchange | no PKCE; `audience` required | PKCE (`code_challenge`/`code_verifier`), **no** `audience` | no PKCE, `audience` sent |

The discovery document Tesla serves actually advertises `token_endpoint:
auth.tesla.com/oauth2/v3/token`, so the documented "must" is about rate-limit routing rather than
capability. This app follows the documentation; if an exchange ever fails, the callback now shows
Tesla's own error body rather than a blank screen, which is what distinguishes the two shapes
immediately.

**What the reference does *not* have**, and this app does: telemetry, a database, request logging
with redaction, per-owner refresh serialisation, a typed error taxonomy, or the virtual-key
signature path. It stores tokens in a signed cookie and polls `vehicle_data` on demand.

### 4e. Still open

| Id | Contract point | Status |
| --- | --- | --- |
| C13 | Whether commands go through the Vehicle Command Proxy (no local signing) or need local ES256 signing, and the proxy's own endpoints | PARTIAL — the reference signs nothing and calls the REST commands directly; the docs say an unsigned command is rejected by the car. Needs one live command to settle |

## 5. Phases

Each phase ends green on `tsc`, `lint`, `build` and the verify harness.

**P1 — Fleet auth + credential store.** `lib/fleet/auth.ts` (client assertion signing, token
exchange, owner-authorization URL, refresh with the existing per-vehicle serialization),
`fleet_credentials` migration, `/connect` rewrite, diagnostics items. *Acceptance:* C1/C2 PINNED;
a real owner authorization completes; diagnostics show a live token.

> **Status 2026-09-08: code complete, awaiting the operator's live run.** Shipped as
> `lib/fleet/{config,auth,tokens}.ts`, `supabase/migrations/007_fleet_credentials.sql`,
> `app/api/fleet/{connect,callback,credentials}/route.ts`, the `fleet_oauth` state cookie, the
> proxy exemption for the callback, the Settings rewrite (the Owner API token-paste page is
> deleted), and 47 checks in `npm run verify` that restate the §4a quotes. Deviations from this
> row: there is no client assertion to sign (C1a), serialisation is per **owner** rather than per
> vehicle, and `vehicle_location` was added to the scope list after research showed
> `vehicle_data` and `fleet_telemetry_config` both require it.
>
> P1 also removed the second login form the operator reported: `/connect` (tabs "Paste tokens" /
> "Sign in with Tesla") and `/api/tesla/{connect,auth/*}` are gone, and `/api/settings` no longer
> derives "connected" from the vehicle row — that conflation is why a successful authorization
> still rendered "Connect Tesla".

**P2 — Fleet client + on-demand reads + commands.** `lib/fleet/client.ts` reusing
`sanitize`/`errors`/`request-log`; **VIN-keyed** vehicle resolution (C4 is now pinned, so the sync
needs no live capture); command wrappers behind the existing confirmation control. *Acceptance:*
`GET /api/1/vehicles` populates `vehicles.vin`; the console runs `wake_up` and one climate command
against the real car; a 408 is reported as "asleep", never retried blindly (3 wakes/min, shared).

**P3 — Telemetry config management.** Settings "Telemetry" section: field multiselect, interval
per field, enable/disable → `fleet_telemetry_config` create/get/delete. *Acceptance:* C7/C8 PINNED;
after enabling, `telemetry_connection` shows `connected` within the documented propagation delay.
**Blocked by the virtual key being installed on the vehicle (§4b) — the config POST is signature-
gated exactly like a command, so this phase cannot be tested before the operator completes step 4.**

**P4 — VM receiver artifacts.** `deploy/fleet-telemetry/`: config file, systemd unit, certbot
notes for the Oracle VM, and `services/telemetry-ingest/` (Node worker in this repo) that
connects to the receiver's protobuf WebSocket and writes to Supabase. *Acceptance:* C9/C10 PINNED;
a frame round-trips car → VM → `telemetry_frames`.

**P5 — Live reads + derivation.** `telemetry_latest` upserts, Supabase realtime on the dashboard,
trip/charge derivation from frames (reuse `history.ts` logic, re-pointed at frames), stream-end
closes the open trip. *Acceptance:* a real drive produces a trip row and a live speed gauge with
zero polling requests in `api_request_logs`.

**P6 — Delete the polling machinery and the Owner API client** (section 3), migrations 007/008.
*Acceptance:* `grep -r "polling\|/api/collect" app lib` is empty; verify harness passes.

**P7 — Dashboard expansion** per the widget spec in section 6.

**P8 — Debug console rewrite** to the Fleet catalog, in call order: auth → vehicles → telemetry
config → commands → on-demand read.

## 6. Dashboard widget spec (operator's reference screenshot)

| Widget | Source | Notes |
| --- | --- | --- |
| Hero: model image, location name ("Not home"), odometer | static asset per model; `Location` vs stored home coords; `Odometer` | home coords become a Settings field |
| Battery bar + % + range + energy kWh | `Soc`, `EstBatteryRange`; energy = usable level × pack capacity constant per model | constant table, never invented per-vehicle |
| Cellular / Wi-Fi tiles | **Not sourceable.** C8: no cellular, Wi-Fi, LTE, network or signal field exists in the 239 documented names | Show the stream's own connection state (`VehicleConnectivity`, which does carry `network_interface`) and label it as that. Not a fake signal bar |
| Realtime speed gauge | `VehicleSpeed` (there is no field named `Speed`) | |
| Route + Distance tiles | `DestinationName`, `RouteLine`, `MilesToArrival`, `MinutesToArrival`, `RouteLastUpdated` — all gated on the `vehicle_location` scope | Now in `FLEET_SCOPES`; if the app was registered without that scope, consent will fail loudly rather than silently |
| Map with live route | `Location` + `GpsHeading` frames | route = polyline of the current trip's points |
| Charge toggle | `ChargeState` / `DetailedChargeState` + commands `charge_start`/`charge_stop` | command on demand, per D5 |
| Battery health: pack current / pack voltage + V-over-time chart | `PackVoltage`, `PackCurrent` — **both exist** (proto tags 6, 7); `ChargerVoltage`/`ChargeAmps` while charging | chart from `telemetry_frames` |
| Climate card: setpoint, heat/cool, fan, HVAC, cabin overheat, inside/outside temp | `InsideTemp`, `OutsideTemp` + commands `set_temps`, `auto_conditioning_start/stop`, `set_preconditioning_max` | fan % and HVAC on/off are command-only values: show the last commanded value, labelled as such |

Rule carried over from the original brief: **never fabricate a value.** A widget whose field is
absent from the stream renders an explicit "not reported" state, exactly as today's empty states do.

## 7. Risks and open questions

1. **Receiver TLS.** Tesla validates the receiver's certificate chain; a self-signed cert will be
   refused. Oracle VM + Let's Encrypt (certbot) on port 443 is the assumed path; C10 confirms.
2. **Stream lifetime.** Telemetry flows while the car is awake; parking ends it. Trips must close
   on stream end *and* on an inactivity timeout, or a parked car leaves an open trip forever.
3. **Frozen parked state.** With no polling (D5), a parked car's data is as old as its last
   session. The UI must say "last seen <age>" everywhere instead of implying liveness — the
   existing `StatusPill` age logic already does this.
4. **Commands wake the car** and are rate-limited (C11); every command button needs the existing
   confirmation + in-flight disabling.
5. **Token refresh** must keep the current per-vehicle serialization (`refreshChain`); a parallel
   refresh invalidates the rotating refresh token.
6. **The ingest worker is a second deployable.** It must survive VM reboots (systemd), reconnect
   with backoff, and never drop frames silently — a gap counter in `telemetry_connection`.

## 8. What stays

`sanitize.ts`, `errors.ts`, `request-log.ts` (redaction is transport-independent), the JSON viewer,
charts, the map with its overzoom guard, the shell/navigation/theme, English-only strings, and the
executable-verify-harness pattern (`scripts/verify-*.mts`).

## 9. Facts that will bite us

Ranked by how silently each one breaks, all of them consequences of §4 rather than opinions.

1. **`Value` is a `oneof` whose branch varies by firmware.** The MQTT README says it plainly: a
   float "might be received as `12.3` (numeric) in one version and as `\"12.3\"` (string) in
   another". The server itself patches two more cases at runtime — scientific notation
   (`1e-3` → `"0.00100"` as a *string*) and `Location` arriving as `"(37.412374 N, 122.145867 W)"`.
   **A decoder that assumes one type per field silently drops data.** The ingest layer must coerce
   per value, never per field name, and must handle `invalid: true` replacing the expected type.
2. **Config adoption is event-driven, not timed.** `synced: false` means "on the next backend
   connection", so enabling telemetry on a parked car can sit unapplied indefinitely. The UI must
   show `synced` and `key_paired` rather than implying the setting took effect.
3. **Limits are per vehicle and shared across every app on the account**: 60 realtime, 30 commands,
   **3 wakes per minute**. A wake is also the natural thing to retry on a 408, which is exactly the
   loop that trips the limit. `429` is documented as "an indication of faulty application logic".
4. **Every sub-500 response is billed, including rejected commands**, and exceeding the billing
   limit **deletes** the fleet-telemetry configurations, which "will not be restored". The console
   must not be able to fire a loop by accident.
5. **`hostname` in the telemetry config must match the registered app's root domain**, and the
   server certificate must chain to a publicly trusted CA. Both failures surface only as
   `tls: bad certificate` noise on the VM while the car quietly never streams.
6. **`set_charge_limit` returns success for an invalid percent**, and `set_temps` /
   `set_preconditioning_max` are `required` in the Fleet API spec but optional in the proxy's
   parser — so a payload tested through the proxy can still 4xx against the API directly. Validate
   the range (50–100) client-side and read back the value rather than trusting the ack.
7. **Vehicle timestamps are vehicle-local.** "Treating the reported value as Pacific Time will
   yield the date and time in the vehicle's timezone" — and alerts arrive with milliseconds in the
   seconds field, which the Go server repairs heuristically. Store `receivedat` alongside every
   frame and derive trip boundaries from it, not from the car's clock.
8. **There is no staging environment and no simulator**, so the first real call is the test. That is
   what the console is for, and why the `dry-run` preview stays in it.
9. **DNS must not be cached** ("Excessive DNS TTL/caching can lead to stale DNS information") — so
   the ingest worker must resolve per connection rather than pin an address at startup.
10. **`406` if `Content-Type` is not `application/json`** on Fleet API calls, while the *token*
    endpoint requires `application/x-www-form-urlencoded`. Two different required encodings on two
    adjacent hosts; the client must not share one header block between them.
