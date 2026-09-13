# Fleet Telemetry on your own machine

**Read this first: it cannot run fully offline.** Three pinned facts decide the shape of any
local setup:

1. Tesla's cloud opens an **outbound mTLS connection to your server**, so it must be reachable
   from the internet. Docs: *"The Fleet Telemetry server must be running on a server exposed to
   the public internet."*
2. The `hostname` you send in the config *"must match the root domain (second-level + first-level
   domain) of the registered application"* — so `telemetry.example.com` is fine if the app is
   registered on `example.com`, and a random tunnel host is not.
3. The server certificate *"must be signed by a commonly trusted certificate authority"*. The
   fleet-telemetry binary is mTLS-only and hard-fails without a cert/key pair.

What that rules out: `localhost`, an `.onion`, a free-tier ngrok random host
(`*.ngrok-free.app` will not share your app's root domain), and a `mkcert`/private-CA cert.

## The virtual key (do this before anything else)

Tesla's docs use "virtual key" for two unrelated things. The one that matters here is the
**application key pair**: an EC key on `prime256v1`, whose public half gets registered and whose
private half signs. The car's own phone key / key card are something else entirely.

> "Before executing a command **or accepting a Fleet Telemetry configuration**, the vehicle
> ensures the payload is signed by a private key whose public key is present on the vehicle."

Four steps, in order, and the order is load-bearing:

```bash
./make-key.sh                       # 1. prime256v1 pair into ./keys/, refuses to overwrite
# 2. publish the public half on the app's own domain:
#    copy ./keys/public.pem to ../public/.well-known/appspecific/com.tesla.3p.public-key.pem
#    and verify https://<your-app-domain>/.well-known/appspecific/com.tesla.3p.public-key.pem
#    serves those exact bytes.
node --env-file=.env --import ./scripts/register.mjs deploy/fleet-telemetry/register-partner.mts --dry-run
#    it fetches your URL, compares the served key with the local one, and refuses to register
#    a domain that does not serve the key — Tesla accepts that registration and then rejects
#    every signed call much later.
# 3. register the domain with Tesla (same script without --dry-run; POST /api/1/partner_accounts)
# 4. install it on the car: open https://tesla.com/_ak/<your-app-domain> as a trusted user and
#    accept on the vehicle screen. Automatic only for B2B-owned vehicles.
```

`configure-vehicle.mts` calls `POST /api/1/vehicles/fleet_status` first and prints
`key paired yes/NO`, so step 4 cannot be silently skipped.

`keys/`, `*.pem`, `*.key` and `*.crt` are gitignored for a reason: a published private key is not
rotatable in place — the car has to be re-paired by a trusted user, in person, at the screen.

## The recipe that does work locally

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

# 4. Tell the car where to send. --dry-run first; it prints the exact body.
node --env-file=.env --import ./scripts/register.mjs \
  deploy/fleet-telemetry/configure-vehicle.mts --dry-run
node --env-file=.env --import ./scripts/register.mjs \
  deploy/fleet-telemetry/configure-vehicle.mts --hostname=$TELEMETRY_HOST --port=443

# 5. Re-run step 4 after driving once. `synced: true` is the car having adopted it.
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
command line. Nothing here has been run against a real vehicle.
