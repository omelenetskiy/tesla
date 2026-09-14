# Agent runbook: Tesla Fleet Telemetry

Purpose: this is the local instruction file an agent should use when continuing Tesla Fleet Telemetry setup for this project.

Last audited: **2026-09-14**

---

## 0. Verified working setup for this project (2026-09-14)

This section is the "do not forget what actually worked" record.

### 0.1 Final working hostnames
- App domain registered with Tesla: `app.omelenetskiy.xyz`
- Telemetry ingress hostname: `telemetry.omelenetskiy.xyz`
- Both share root domain `omelenetskiy.xyz`, which satisfies Tesla's domain rule.

### 0.2 What changed to make it work
The successful production pattern on the Oracle VM was:

1. Point `app.omelenetskiy.xyz` to the VM and serve the Tesla public key from the app host.
2. Register `app.omelenetskiy.xyz` with Tesla until `412` stops.
3. Issue a trusted certificate for `app.omelenetskiy.xyz`.
4. Issue a trusted certificate for `telemetry.omelenetskiy.xyz`.
5. Put nginx on public `:443` and route by **SNI**:
   - `app.omelenetskiy.xyz` -> app TLS vhost
   - `telemetry.omelenetskiy.xyz` -> `127.0.0.1:8443`
6. Run `fleet-telemetry` behind nginx on `127.0.0.1:8443` using:
   - `/home/ubuntu/TeslaApp/deploy/fleet-telemetry/docker-compose.sni-router.yml`
7. Run the vehicle-command proxy on public `:4443`.
8. Confirm the app key is paired on the vehicle.
9. Push telemetry config through the command proxy until the vehicle reports `synced: true`.

### 0.3 The exact success signals that were observed
- Partner registration succeeded for `app.omelenetskiy.xyz`.
- Tesla no longer returned `412` for the live domain.
- `configure-vehicle.mts` reported:

```text
key paired   yes  firmware 2026.26.6  telemetry client 1.3.0
```

- The live config write returned:

```text
create -> {"updated_vehicles":1}
```

- Reading the config back showed:

```text
"synced": true
"hostname": "telemetry.omelenetskiy.xyz"
"key_paired": true
```

### 0.4 Runtime topology that is confirmed working
- public nginx TLS ingress on `:443`
- telemetry receiver bound behind nginx on `127.0.0.1:8443`
- vehicle-command proxy on `:4443`
- app domain `app.omelenetskiy.xyz` serving the Tesla public key
- telemetry domain `telemetry.omelenetskiy.xyz` presenting a valid public certificate

### 0.5 Important VM-only workaround that unblocked live config
The VM hit a **hairpin / self-resolution issue** during live telemetry config:

- from the VM, `telemetry.omelenetskiy.xyz:4443` timed out
- locally, `127.0.0.1:4443` answered correctly

Working workaround used on the VM:

```text
127.0.0.1 telemetry.omelenetskiy.xyz
```

added to `/etc/hosts` on the VM before the live config write.

Why this matters:
- the vehicle-command proxy URL used by `configure-vehicle.mts` must still be the public hostname,
- but the VM itself may need local name resolution pinned to loopback so the request does not hairpin out and stall.

### 0.6 Live proof-of-data already achieved
This is no longer a setup-only system. Real telemetry frames were observed in Docker logs from VIN `7SAYGDEFXPF942896`, including decoded `V` records such as:

- `PackVoltage`
- `PackCurrent`

Observed properties of those frames:
- `msg = record_payload`
- `txtype = V`
- `IsResend = false`
- `txid` increments monotonically
- timestamps advance at a normal live cadence

Interpretation:
- the car is actively delivering telemetry to the server,
- the server is decoding it,
- and the ingress path is proven end-to-end.

### 0.7 What is still missing after setup success
Telemetry is currently confirmed as a **live log stream**, but not yet fully wired into app persistence:

- decoded records arrive in Docker logs
- app-side Supabase persistence still needs a bridge from those records into `vehicle_states` / history
- frontend UI can only use this data after that ingest bridge runs

---

## 1. What Tesla requires according to fresh docs

These points were re-checked against current Tesla Fleet API / Fleet Telemetry documentation.

### 1.1 Public app domain and public key
- Tesla requires an **application EC keypair** on curve `prime256v1` / `secp256r1`.
- The **public** key must be hosted at:
  - `https://<app-domain>/.well-known/appspecific/com.tesla.3p.public-key.pem`
- The **private** key stays private and is used to sign vehicle commands and telemetry configuration.
- Tesla exposes partner verification endpoints such as:
  - `GET /api/1/partner_accounts/public_key?domain={domain}`

### 1.2 Domain rule
- The telemetry hostname must share the same **root domain** as the registered application domain.
- Example: if the app is on `app.omelenetskiy.xyz`, telemetry may be on `telemetry.omelenetskiy.xyz` because both share root domain `omelenetskiy.xyz`.
- A random tunnel hostname on a different root domain is not acceptable for production telemetry config.
- If the registered application domain is `tesla-y-dashboard.netlify.app`, then Tesla will treat the application root domain as `netlify.app`, not `omelenetskiy.xyz`.
- In that case, `telemetry.omelenetskiy.xyz` does **not** satisfy the root-domain rule.

### 1.3 Telemetry server protocol
- The telemetry ingress is **not ordinary HTTP**.
- Tesla Fleet Telemetry accepts a **WebSocket upgrade on `GET /` over mTLS**.
- Vehicles authenticate with client certificates; the server must present a certificate valid for the telemetry hostname.
- Tesla docs require the server certificate to be signed by a **commonly trusted CA** and valid for the hostname with SNI support.

### 1.4 Vehicle configuration flow
- Vehicle telemetry is configured through:
  - `POST /api/1/vehicles/fleet_telemetry_config`
- Tesla docs say this should be sent through the **vehicle-command HTTP proxy**, which signs the configuration using the private key before forwarding it.
- The telemetry config includes:
  - `hostname`
  - `port`
  - `ca`
  - `fields`
  - optional alert types / delivery policy

### 1.5 Pairing requirement
- Before a vehicle accepts Fleet Telemetry config, the vehicle must trust the app key.
- The trusted user must open:
  - `https://tesla.com/_ak/<app-domain>`
- For this project that should be the **app domain**, not the telemetry hostname:
  - `https://tesla.com/_ak/app.omelenetskiy.xyz`
- If Tesla registration is still bound to `tesla-y-dashboard.netlify.app`, then the pairing URL must instead be:
  - `https://tesla.com/_ak/tesla-y-dashboard.netlify.app`

### 1.6 Server-side visibility
- The reference `fleet-telemetry` service can dispatch decoded records to `logger`, `redis`, `kafka`, `kinesis`, `mqtt`, `zmq`, or `pubsub` depending on config.
- With `logger` + `transmit_decoded_records: true`, the server receives telemetry and prints decoded JSON to stdout.
- There is **no customer-facing websocket API** in the reference server. The websocket is the vehicle ingress itself.

---

## 2. Workspace audit: what already exists in this repo

### 2.1 Telemetry deployment assets
Directory: `/Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp/deploy/fleet-telemetry`

Relevant files:
- `README.md` — local setup guide
- `config.local.json` — telemetry server config
- `docker-compose.yml` — telemetry server + vehicle-command proxy
- `cloudflared.yml` — raw TLS passthrough example
- `make-key.sh` — generate app keypair
- `issue-cert.sh` — issue trusted cert via DNS validation
- `register-partner.mts` — register the app domain/key with Tesla
- `configure-vehicle.mts` — push telemetry config to vehicle and read it back

### 2.2 Current telemetry server config
File: `/Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp/deploy/fleet-telemetry/config.local.json`

Current behavior:
- listens on `0.0.0.0:443`
- enables JSON logs
- decodes records before dispatch
- dispatches `V`, `alerts`, `errors`, and `connectivity` to `logger`
- expects certs at:
  - `/etc/fleet-telemetry/certs/fullchain.pem`
  - `/etc/fleet-telemetry/certs/privkey.pem`

Implication:
- **this setup should receive logs and decoded telemetry records in Docker logs**
- **this setup does not persist telemetry anywhere yet**

### 2.3 Current vehicle-command proxy config
File: `/Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp/deploy/fleet-telemetry/docker-compose.yml`

Current behavior:
- runs `tesla/fleet-telemetry:v0.9.4`
- runs `tesla/vehicle-command:latest`
- exposes proxy on `4443`
- mounts the telemetry TLS cert/key into the proxy
- mounts `./keys/private.pem` into the proxy as `TESLA_KEY_FILE`

Implication:
- `TESLA_HTTP_PROXY_URL` should point to `https://telemetry.omelenetskiy.xyz:4443`
- `fleet_telemetry_config` requests in this codebase are already routed through that proxy when `requestType === 'telemetry_config'`

### 2.4 Fleet API client integration
Files:
- `/Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp/lib/fleet/client.ts`
- `/Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp/lib/fleet/config.ts`
- `/Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp/deploy/fleet-telemetry/configure-vehicle.mts`

Verified facts:
- telemetry config requests use the command proxy when `requestType` is `telemetry_config`
- `configure-vehicle.mts` does a `fleet_status` pre-check and reports `key paired yes/NO`
- the script refuses non-dry-run configuration unless `TESLA_HTTP_PROXY_URL` is set
- configured telemetry fields include speed, location, SOC, ranges, charge metrics, pack voltage/current, temperatures, locks, doors, charge port, and TPMS

### 2.5 Local key material
Verified locally:
- `/Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp/deploy/fleet-telemetry/keys/private.pem` exists
- `/Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp/deploy/fleet-telemetry/keys/public.pem` exists
- `/Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp/public/.well-known/appspecific/com.tesla.3p.public-key.pem` exists
- the public key served from the repo matches the local private key fingerprint

### 2.6 Local certificate state
Verified locally:
- `/Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp/deploy/fleet-telemetry/certs` does **not** exist in the local workspace

Implication:
- local repo is missing the runtime cert artifacts expected by `docker-compose.yml`
- certs do exist on the VM runtime copy under `/home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs`

### 2.7 Data ingestion gap
Important current limitation:
- there is **no telemetry receiver application code** inside Next.js itself; Tesla terminates on the separate Go receiver
- there is **no customer-facing websocket endpoint for the frontend**
- there is **no completed persistence bridge from receiver output into the app's Supabase tables yet**
- the existing SQL migration contains historical battery/location/trips tables, but they are not automatically filled by the receiver out of the box

Conclusion:
- the server is already proven to receive and decode real telemetry
- the remaining engineering work is to ingest that live stream into app storage and UI readers

---

## 3. External verification performed on 2026-09-14

These checks were actually performed from the workspace machine.

### 3.1 DNS
Verified:
- `telemetry.omelenetskiy.xyz -> 130.61.30.119`
- public DoH resolvers now also return `app.omelenetskiy.xyz -> 130.61.30.119`

Implication:
- telemetry hostname is externally routable
- the app hostname has been moved to the VM, though some recursive resolvers may still cache the stale CNAME temporarily

### 3.2 Hosted public key
Verified:
- `https://tesla-y-dashboard.netlify.app/.well-known/appspecific/com.tesla.3p.public-key.pem` returns `HTTP/2 200`
- `https://app.omelenetskiy.xyz/.well-known/appspecific/com.tesla.3p.public-key.pem` is served correctly from the Oracle VM when resolved to `130.61.30.119`

Current interpretation:
- the migration from the old Netlify hostname to `app.omelenetskiy.xyz` has now been completed
- Tesla registration is live on `app.omelenetskiy.xyz`
- the Netlify host is only historical context now, not the active partner domain

### 3.3 Telemetry TLS
Verified with `openssl s_client`:
- connection established to `130.61.30.119:443`
- certificate CN is `telemetry.omelenetskiy.xyz`
- chain verification succeeded (`Verification: OK`)
- TLS handshake succeeds externally

### 3.4 Ports
Verified externally:
- VM SSH port `22` is reachable
- VM TLS port `443` is reachable

Verified directly on the VM:
- telemetry ingress is listening on `*:443`
- vehicle-command proxy is listening on `0.0.0.0:4443`
- telemetry metrics are listening on `127.0.0.1:9090`
- telemetry profiler is listening on `127.0.0.1:4269`

### 3.5 Oracle VM runtime status
Verified directly on the VM:
- `/home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/fullchain.pem` exists
- `/home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/privkey.pem` exists
- `/home/ubuntu/TeslaApp/deploy/fleet-telemetry/keys/private.pem` exists
- `/home/ubuntu/TeslaApp/deploy/fleet-telemetry/keys/public.pem` exists
- `/etc/letsencrypt/live/app.omelenetskiy.xyz/fullchain.pem` exists
- `/etc/letsencrypt/live/app.omelenetskiy.xyz/privkey.pem` exists
- `fleet-telemetry_fleet-telemetry_1` is running behind `127.0.0.1:8443`
- `fleet-telemetry_vehicle-command-proxy_1` is running
- nginx is listening publicly on `:443` and routing by SNI

Additional fact:
- the VM uses `docker-compose`, not `docker compose`

### 3.6 Runtime log interpretation
Recent telemetry server logs show repeated TLS handshake failures from ordinary internet clients that:
- did not present a client certificate,
- offered unsupported ALPN / HTTP protocol combinations,
- or reset the connection.

This is expected noise for a public mTLS endpoint and does **not** by itself mean the telemetry setup is broken.

Recent proxy logs prove that the vehicle-command proxy has already received telemetry-related requests and forwarded them to Tesla Fleet API endpoints such as:
- `fleet_status`
- `fleet_telemetry_config`
- `fleet_telemetry_config_jws`

### 3.7 Important interpretation note
A plain request like:
- `curl https://telemetry.omelenetskiy.xyz/`
may fail or terminate unexpectedly even when the telemetry server is healthy, because this endpoint expects the Fleet Telemetry websocket + mTLS flow, not a normal browser HTTP request.

### 3.8 Live vehicle telemetry observed
Verified from runtime logs:
- decoded `record_payload` frames arrived for VIN `7SAYGDEFXPF942896`
- multiple `V` records were observed with sequential `txid` values
- values included real pack measurements such as `PackVoltage` and `PackCurrent`
- records were marked `IsResend: false`

Implication:
- this is genuine live car data, not only infrastructure readiness
- telemetry ingress, TLS, pairing, and vehicle-side sync are all effectively proven

---

## 4. Current status and remaining blockers

### Resolved issue A — Tesla app domain registration
This is now complete:
- partner registration for `app.omelenetskiy.xyz` succeeded
- Tesla no longer returns `412`
- the active pairing/app domain is now the custom domain under `omelenetskiy.xyz`

### Partially resolved issue B — runtime cert artifacts are absent locally
The local workspace lacks:
- `deploy/fleet-telemetry/certs/fullchain.pem`
- `deploy/fleet-telemetry/certs/privkey.pem`

Verified:
- they do exist on the VM,
- the live telemetry endpoint presents a valid certificate for `telemetry.omelenetskiy.xyz`,
- the containers are running with the expected mounted cert directory.

Remaining concern:
- the local workspace still cannot reproduce the runtime deployment without re-issuing or securely copying certs into place on the VM during setup.

### Resolved issue C — actual vehicle streaming
This is now confirmed:
- a real vehicle has been observed sending decoded `V` records
- `key paired yes` has been confirmed
- `synced: true` has been confirmed
- live battery-pack telemetry values have been seen in logs

### Resolved issue D — vehicle pairing
This is now confirmed by Tesla responses:
- the vehicle trusts the app key
- `configure-vehicle.mts` reports `key paired yes`
- the app no longer depends on the temporary Netlify pairing hostname

### Remaining blocker E — no completed persistence bridge yet
If the product requirement is “the server receives logs and data from the car”, that requirement is already satisfied.

If the requirement is “the app stores and displays telemetry”, additional work is still required:
- bridge the live receiver output into Supabase/Postgres
- normalize enough fields into `vehicle_states` for the existing UI/history readers
- optionally persist raw telemetry frames for audit/debugging
- optionally materialize trip / charging / battery history tables from those snapshots

---

## 5. Recommended next actions in order

### 0) Historical note: paths that were considered before the final fix

These options are kept for context, but the project no longer needs them because `app.omelenetskiy.xyz` is already working.

#### Option A — fastest fix if the only problem is the broken DNS record
- Current broken state observed during audit:
  - `app.omelenetskiy.xyz -> tesla-y-dashboard.netlify.app.omelenetskiy.xyz`
- For a Netlify subdomain setup, the target should normally be the real hostname:
  - `tesla-y-dashboard.netlify.app`
- If the DNS provider appended `.omelenetskiy.xyz` automatically, correct the record to the full target.
- This is the lowest-risk option and may validate quickly once the malformed record is corrected.

#### Option B — bypass Netlify validation entirely by serving the custom domain from Oracle VM
- Point `app.omelenetskiy.xyz` directly to the Oracle VM with an `A` record.
- Terminate HTTPS on the VM with Let's Encrypt.
- Serve the Tesla public key locally at:
  - `/.well-known/appspecific/com.tesla.3p.public-key.pem`
- Either:
  - host the whole app on the VM, or
  - reverse-proxy normal app traffic to `https://tesla-y-dashboard.netlify.app`.
- This avoids waiting for Netlify custom-domain verification.
- Repo assets for this path now exist in:
  - `/Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp/deploy/domain-router/README.md`
  - `/Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp/deploy/domain-router/install-on-vm.sh`
  - `/Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp/deploy/fleet-telemetry/docker-compose.sni-router.yml`

#### Option C — temporary new subdomain under the same root
- Use a fresh subdomain under `omelenetskiy.xyz`, for example `tesla.omelenetskiy.xyz`.
- Point it directly to the VM and serve the public key there.
- Register that domain with Tesla.
- Telemetry can remain on `telemetry.omelenetskiy.xyz` because both stay under the same root domain `omelenetskiy.xyz`.

Important limitation:
- no option is truly “instant” worldwide, because DNS caches exist,
- but switching to a direct VM-backed `A` record usually converges much faster than waiting on a third-party platform-specific domain validation flow.

### Step 1 — preserve the working registration and routing state

Verify the custom app domain and public key still answer correctly:

```bash
curl -I https://app.omelenetskiy.xyz/
curl -I https://app.omelenetskiy.xyz/.well-known/appspecific/com.tesla.3p.public-key.pem
curl https://app.omelenetskiy.xyz/.well-known/appspecific/com.tesla.3p.public-key.pem
```

### Step 2 — verify or re-issue telemetry certs on the VM
On the VM:

```bash
cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry
ls -la certs/
openssl x509 -in certs/fullchain.pem -noout -subject -issuer -dates
```

If missing or stale:

```bash
cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry
export TELEMETRY_HOST=telemetry.omelenetskiy.xyz
./issue-cert.sh
```

### Step 3 — verify the telemetry containers on the VM
On the VM:

```bash
cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry
docker-compose ps
docker-compose logs --tail=100 fleet-telemetry
docker-compose logs --tail=100 vehicle-command-proxy
sudo ss -tlnp | grep -E ':(443|4443|9090|4269)\b'
```

Healthy signals:
- `fleet-telemetry` running
- `vehicle-command-proxy` running
- port `443` listening
- port `4443` listening
- no endless `tls: bad certificate` loop

### Step 4 — verify partner registration and pairing are still healthy
First dry-run:

```bash
cd /Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp
node --env-file=.env --import ./scripts/register.mjs deploy/fleet-telemetry/register-partner.mts --dry-run
```

For the current intended setup, pairing should use:

```text
https://tesla.com/_ak/app.omelenetskiy.xyz
```

### Step 5 — configure the vehicle telemetry target

```bash
cd /Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp
export TESLA_HTTP_PROXY_URL=https://telemetry.omelenetskiy.xyz:4443
export TELEMETRY_HOST=telemetry.omelenetskiy.xyz
node --env-file=.env --import ./scripts/register.mjs deploy/fleet-telemetry/configure-vehicle.mts --dry-run
node --env-file=.env --import ./scripts/register.mjs deploy/fleet-telemetry/configure-vehicle.mts --hostname=$TELEMETRY_HOST --port=443
```

Success signals:
- `key paired yes`
- no `skipped_vehicles.missing_key`
- `synced: true` eventually after the vehicle reconnects

### Step 6 — confirm server-side receipt of telemetry
On the VM:

```bash
cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry
docker-compose -f docker-compose.sni-router.yml logs -f fleet-telemetry
```

Expected:
- connectivity events
- alert records
- decoded `V` records as JSON when the car is awake / changing state

### Step 7 — add persistence and app-side replay
Logs alone are no longer the question; the remaining work is to connect the live stream into the app.

Implement one of:

#### Option A — fastest MVP
- keep `logger`
- add a sidecar or host process that tails Docker logs and inserts normalized events into Supabase

#### Option B — production-leaning
- switch dispatcher to `redis` or `kafka`
- write a consumer service
- store telemetry raw frames + normalized projections

Suggested normalized storage targets:
- latest vehicle state
- raw event log with `received_at`
- location history
- charging session events
- trip boundary events
- battery history

---

## 6. Canonical project facts to remember

- App domain: `app.omelenetskiy.xyz`
- Telemetry domain: `telemetry.omelenetskiy.xyz`
- VM IP: `130.61.30.119`
- VM SSH user: `ubuntu`
- VM SSH key path: `~/.ssh/ubuntu-ssh-key-2026-09-14.key`
- Telemetry TLS ingress port: `443`
- Vehicle-command proxy port: `4443`
- Metrics port: `9090`
- Profiler port: `4269`
- Public key path in app: `public/.well-known/appspecific/com.tesla.3p.public-key.pem`
- Private key path in repo: `deploy/fleet-telemetry/keys/private.pem`

---

## 7. What an agent should say about current status

Accurate status summary:
- telemetry hostname DNS is configured and presents a valid public TLS certificate
- app domain `app.omelenetskiy.xyz` is registered with Tesla and serves the public key
- repo key material is internally consistent
- vehicle-command proxy is working and has been used to apply live telemetry config
- `key paired yes` and `synced: true` are confirmed
- live decoded `V` records from the real vehicle have already been observed in Docker logs
- there is still no completed app-side persistence bridge or websocket fan-out for telemetry yet
- the current remaining gap is **store the live telemetry stream into Supabase/UI**, not **make Tesla talk to the receiver**


