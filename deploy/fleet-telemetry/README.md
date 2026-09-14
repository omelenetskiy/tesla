The recipe that does work locally

The trick is that **issuing** a trusted certificate does not require the machine to be reachable,
if you use DNS validation. Only the inbound TLS connection does, and a tunnel gives you that.

```bash
cd deploy/fleet-telemetry

# 1. A host on the same root domain as your developer.tesla.com app.
#    telemetry.example.com -> any address; the tunnel will carry the traffic.
export TELEMETRY_HOST=telemetry.example.com
./issue-cert.sh                      # DNS-01, no inbound ports, writes ./certs/

# 2. Raw TLS to the origin — the edge must NOT terminate TLS, or the car's client
#    certificate never arrives and every handshake fails.
#    cloudflared:  ingress service: tls://${TELEMETRY_HOST}:443   (see cloudflared.yml)
#    ngrok:        ngrok tcp 443 with a reserved address on your own domain, or
#                  `ngrok edge --tls-passthrough --domain=$TELEMETRY_HOST`
#    Verify against the provider's current docs; both have renamed these flags.

# 3. Run the receiver, dispatching everything to stdout as JSON.
docker compose up -d
docker compose logs -f fleet-telemetry

# 4. Start the vehicle-command proxy and point the app at it.
export TESLA_HTTP_PROXY_URL=https://${TELEMETRY_HOST}:4443

# 5. Tell the car where to send. --dry-run first; it prints the exact body.
node --env-file=.env --import ./scripts/register.mjs \
  deploy/fleet-telemetry/configure-vehicle.mts --dry-run
node --env-file=.env --import ./scripts/register.mjs \
  deploy/fleet-telemetry/configure-vehicle.mts --hostname=$TELEMETRY_HOST --port=443

# 6. Re-run step 5 after driving once. `synced: true` is the car having adopted it.
```

## What the config actually looks like

`config.local.json` differs from the upstream README example in three deliberate ways:

- it uses the **`logger` dispatcher**, so frames appear in `docker compose logs` — no MQTT,
  Redis or Kafka needed while you are developing. The seven dispatchers are exactly
  `pubsub | kafka | kinesis | logger | zmq | mqtt | redis`; there is **no client-facing
  websocket** (the socket on `/` is the vehicles' ingress).
- `transmit_decoded_records: true` + `logger.verbose: true` → JSON instead of protobuf.
- `connectivity` is listed in `records`. It is not on by default, and without it you cannot see
  the car connecting and dropping.
- `reliable_ack` from the README is **not** a real config field — the Go struct uses
  `reliable_ack_sources`. Copying the README key silently does nothing.
## What actually worked in this project on 2026-09-14

This is the concrete pattern that is already verified, not a hypothetical recipe.

### Working production topology

- `app.omelenetskiy.xyz` is the Tesla-registered app domain
- `telemetry.omelenetskiy.xyz` is the telemetry ingress hostname
- nginx owns the public `:443` on the VM and routes by **SNI**
- the telemetry receiver runs behind nginx on `127.0.0.1:8443`
- the vehicle-command proxy stays on `:4443`
- the VM runtime uses:

```bash
docker-compose -f docker-compose.sni-router.yml up -d
```

### Working confirmation sequence

The successful live sequence was:

```bash
# on the VM
cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry
docker-compose -f docker-compose.sni-router.yml up -d

# from the app repo with the Fleet auth and proxy env loaded
export TESLA_HTTP_PROXY_URL=https://telemetry.omelenetskiy.xyz:4443
export TELEMETRY_HOST=telemetry.omelenetskiy.xyz
node --env-file=.env --import ./scripts/register.mjs deploy/fleet-telemetry/configure-vehicle.mts --hostname=$TELEMETRY_HOST --port=443
```

Observed success signals:

```text
key paired   yes  firmware 2026.26.6  telemetry client 1.3.0
create -> {"updated_vehicles":1}
get    -> {"synced":true,"hostname":"telemetry.omelenetskiy.xyz","key_paired":true,...}
```

### Important VM caveat: hairpin/self-resolution

During the live config write, the VM could not reliably reach its own public telemetry hostname on
`:4443`, even though the proxy answered locally. The workaround that unblocked the final config was:

```text
127.0.0.1 telemetry.omelenetskiy.xyz
```

in `/etc/hosts` on the VM.

Why this matters:
- the Fleet command proxy URL still needs the public hostname for Tesla-facing config,
- but the VM may need local loopback resolution to avoid hairpin timeout when it calls itself.


## Checking it

| symptom | meaning |
| --- | --- |
| server log: `tls: bad certificate` | your cert chain is not publicly trusted, or `ca` in the config is not the CA that signed it. Run `tools/check_server_cert.sh` — it reads `hostname`, `ca`, `port` straight out of the vehicle config |
| create → `skipped_vehicles.missing_key` | the app's virtual key is not installed on the car. Register the public key (`partner_accounts` + `/.well-known/appspecific/com.tesla.3p.public-key.pem`), then have a trusted user open `https://tesla.com/_ak/<domain>` |
| create → `unsupported_firmware` | pre-2023.20 firmware (pre-2024.26 if you go through the HTTP proxy) |
| create → `max_configs` / get → `limit_reached` | the car holds the maximum number of app configs (the docs say five in one place and three in another) |
| `412` from any call | the partner account was never registered |
| `synced: false` forever | normal until the car next establishes a backend connection — adoption is event-driven, not timed. Parked cars sit on it |
| connected, but no values | a field is emitted only when its `interval_seconds` elapsed **and** the value changed. Parked and idle produces nothing |
| `429` | per-vehicle limits are shared across every app on the account: 60 realtime / 30 commands / 3 wakes per minute. Tesla documents a 429 as "an indication of faulty application logic" |

## Two things to know before you trust the numbers

- **A field's type is not stable.** The same signal can arrive as `12.3` on one firmware and
  `"12.3"` on another; floats can come in scientific notation (the server rewrites them to a
  string); `Location` can arrive as `"(37.412374 N, 122.145867 W)"`; and `invalid: true` can
  replace the expected value. Anything consuming frames must coerce per **value**, not per field
  name.
- **Car timestamps are vehicle-local**, and alerts have been observed with milliseconds in the
  seconds field. Store `receivedat` alongside every frame and derive trip boundaries from that.

## Status of this directory

`config.local.json` and the config keys are taken from the upstream Go struct and README verbatim.
The tunnel flag names in step 2 are the part I could not verify against current provider docs, so
treat them as the requirement (raw TLS passthrough, no edge termination) rather than a tested
command line. Nothing here has been run against a real vehicle## Live proof-of-data already captured

This directory has now been run against a real vehicle. Decoded `record_payload` log entries have
already been observed for VIN `7SAYGDEFXPF942896`, including sequential `V` frames with fields such
as `PackVoltage` and `PackCurrent`.

What those lines prove:

- Tesla is reaching the ingress successfully
- the vehicle is authenticated and synced
- the receiver is decoding frames, not only accepting TLS
- `IsResend: false` means the observed rows are live flow, not just replayed backlog

Example log pattern:

```text
fleet-telemetry_1 | {"msg":"record_payload","metadata":{"txtype":"V","txid":"..."},"data":{"CreatedAt":"2026-09-14T18:55:07Z","PackCurrent":{"doubleValue":-0.4000000059604645},"Vin":"7SAYGDEFXPF942896"}}
```

So the remaining problem is no longer "make telemetry work". The remaining problem is "persist the
live stream into the app's own database and UI".

## Bridging the live stream into Supabase

The repo now includes a small ingester that reads decoded telemetry logs and writes them into the
app-side database. It stores every raw frame in `fleet_telemetry_events` and synthesizes
`vehicle_states` snapshots so the existing history/UI readers can start using telemetry without a
new frontend protocol.

Run it on the VM checkout or anywhere that can read the telemetry logs and has the app's Supabase
service-role env vars:

```bash
cd /home/ubuntu/TeslaApp
npm run telemetry:ingest -- --compose-file=deploy/fleet-telemetry/docker-compose.sni-router.yml
```

For a simple always-on VM loop, use the wrapper in this directory:

```bash
cd /home/ubuntu/TeslaApp
bash deploy/fleet-telemetry/run-ingest-loop.sh
```

Environment knobs:

- `COMPOSE_FILE` — defaults to `deploy/fleet-telemetry/docker-compose.sni-router.yml`
- `POLL_SECONDS` — defaults to `15`
- `TAIL_LINES` — defaults to `200`

Or pipe logs explicitly:

```bash
cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry
docker-compose -f docker-compose.sni-router.yml logs -f --no-log-prefix fleet-telemetry \
  | (cd /home/ubuntu/TeslaApp && node --env-file=.env --import ./scripts/register.mjs scripts/ingest-fleet-telemetry.mts --stdin)
```

Notes:

- apply the latest Supabase migration before first run so `fleet_telemetry_events` exists
- the ingester accepts both prefixed Compose logs and plain JSON lines
- existing `/api/history` can already reconstruct battery / trip / charging history from
  `vehicle_states` when the derived tables are empty

The tunnel flag names in step 2 are still the part to re-check against current provider docs if you
go back to a tunnel-based topology, so treat them as the requirement (raw TLS passthrough, no edge
termination) rather than a pinned vendor CLI. The VM-backed SNI-router setup in this repo **has**
now been run against a real vehicle and is confirmed to receive live telemetry.
