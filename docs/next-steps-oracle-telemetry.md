# Next steps: Tesla app + Oracle telemetry

This file is the working instruction for the next session.

Last verified: **2026-09-14**

## Current state

### Frontend / app domain
- The intended long-term app domain is `app.omelenetskiy.xyz`.
- Public DNS for `app.omelenetskiy.xyz` has been changed to `A 130.61.30.119`.
- Some resolvers may still cache the previous broken CNAME temporarily, but public DoH resolvers already return the new `A` record.
- `app.omelenetskiy.xyz` now presents a valid TLS certificate on the Oracle VM.
- The Tesla public key is served correctly from:
  - `https://app.omelenetskiy.xyz/.well-known/appspecific/com.tesla.3p.public-key.pem`
  when the hostname is resolved to the VM.

### VM / backend
- The Oracle VM is telemetry-only plus app-domain routing.
- SSH works with:
  - user: `ubuntu`
  - private key: `~/.ssh/ubuntu-ssh-key-2026-09-14.key`
- nginx is now acting as the public ingress on `:443`.
- The VM uses `docker-compose`, not `docker compose`.

### Tesla key material
- The Tesla app public key is present in the repo:
  - `public/.well-known/appspecific/com.tesla.3p.public-key.pem`
- The local key pair exists in:
  - `deploy/fleet-telemetry/keys/private.pem`
  - `deploy/fleet-telemetry/keys/public.pem`
- The repo public key matches the local private key fingerprint.

### Telemetry and routing
- `telemetry.omelenetskiy.xyz` resolves to the Oracle VM: `130.61.30.119`.
- TLS on `telemetry.omelenetskiy.xyz:443` is live and externally verified.
- TLS on `app.omelenetskiy.xyz:443` is also live and externally verified when resolved to the VM.
- nginx now owns external `:443` and routes by SNI:
  - `telemetry.omelenetskiy.xyz` -> `127.0.0.1:8443` -> Fleet Telemetry
  - `app.omelenetskiy.xyz` -> `127.0.0.1:9443` -> internal nginx HTTPS proxy
- The vehicle-command proxy remains on:
  - `0.0.0.0:4443`
- Metrics and profiler remain on localhost:
  - `127.0.0.1:9090`
  - `127.0.0.1:4269`
- The telemetry ingress on `443` is a Fleet Telemetry **mTLS + WebSocket** endpoint, not a user-facing HTTP page.
- The current server configuration only logs decoded telemetry to container stdout (`logger` dispatcher). There is **no app-side ingestion pipeline, no database persistence, and no frontend websocket endpoint** yet.

### Current Tesla-side blocker
- Dry-run partner registration for `app.omelenetskiy.xyz` succeeded.
- Live partner registration failed with Fleet API `412`:
  - `Root domain omelenetskiy.xyz must match registered allowed origin on https://developer.tesla.com/dashboard/app-details/4a420ab6-d667-4e2b-9cb3-b98be275db7c`
- This means the app's allowed origin / app domain in `developer.tesla.com` still points at the old Netlify host and must be updated manually before Tesla will accept `app.omelenetskiy.xyz`.

---

## Critical domain constraint

Tesla requires the telemetry hostname to share the same **root domain** as the registered application domain.

That means:
- if the registered app domain is `tesla-y-dashboard.netlify.app`, Tesla sees the root domain as `netlify.app`
- `telemetry.omelenetskiy.xyz` is under root domain `omelenetskiy.xyz`
- those roots do **not** match

For the intended long-term architecture:
- move Tesla registration to `app.omelenetskiy.xyz`
- keep the public key there
- then pair with `https://tesla.com/_ak/app.omelenetskiy.xyz`
- keep telemetry on `telemetry.omelenetskiy.xyz:443`

Both app and telemetry will then share the root domain `omelenetskiy.xyz`.

---

## What still needs to be done

### 1) Update the app settings in `developer.tesla.com`
Manual step required:
- open the Tesla app details page:
  - `https://developer.tesla.com/dashboard/app-details/4a420ab6-d667-4e2b-9cb3-b98be275db7c`
- replace the old Netlify allowed origin / app domain with:
  - `https://app.omelenetskiy.xyz`
- ensure the redirect URI is also aligned with the real callback route:
  - `https://app.omelenetskiy.xyz/api/fleet/callback`

This is the only confirmed blocker preventing partner registration on the custom domain.

### 2) Re-run partner registration on the custom domain
After the developer-portal update:

```bash
cd /home/ubuntu/TeslaApp
node --env-file=.env --import ./scripts/register.mjs deploy/fleet-telemetry/register-partner.mts --domain=app.omelenetskiy.xyz
```

Expected result:
- no `412`
- Tesla accepts the custom domain registration

### 3) Pair the app key with the vehicle
After Tesla accepts the custom domain registration, pair with:

```text
https://tesla.com/_ak/app.omelenetskiy.xyz
```

Expected result:
- the app key becomes trusted by the vehicle

### 4) Configure the vehicle telemetry target
After pairing is done:

```bash
cd /home/ubuntu/TeslaApp
export TELEMETRY_HOST=telemetry.omelenetskiy.xyz
export TESLA_HTTP_PROXY_URL=https://telemetry.omelenetskiy.xyz:4443
node --env-file=.env --import ./scripts/register.mjs deploy/fleet-telemetry/configure-vehicle.mts --dry-run
node --env-file=.env --import ./scripts/register.mjs deploy/fleet-telemetry/configure-vehicle.mts --hostname="$TELEMETRY_HOST" --port=443
```

Expected success signals:
- `key paired yes`
- no `skipped_vehicles.missing_key`
- `synced: true` eventually after the car reconnects to Tesla backend

### 5) Confirm the server is actually receiving telemetry
On the VM:

```bash
cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry
docker-compose -f docker-compose.sni-router.yml logs -f fleet-telemetry
```

Look for:
- `connectivity` records,
- alert records,
- decoded `V` records when the car is awake and values change.

### 6) If you want more than logs, add ingestion
Right now the server can receive telemetry and print decoded records to Docker logs, but nothing persists them.

To satisfy the goal “the server receives logs and data from the car” durably, add one of these next:
1. **Fastest path**: keep `logger`, ship container logs into a parser/ingester that inserts into Supabase/Postgres.
2. **More robust path**: switch `records.V` from `logger` to `redis` or `kafka`, then add a consumer service that stores normalized telemetry.
3. Add an internal API route like `/api/telemetry/latest` only after data is persisted.

---

## Useful validation commands

```bash
curl -I --resolve app.omelenetskiy.xyz:443:130.61.30.119 https://app.omelenetskiy.xyz/
curl -I --resolve app.omelenetskiy.xyz:443:130.61.30.119 https://app.omelenetskiy.xyz/.well-known/appspecific/com.tesla.3p.public-key.pem
printf '' | openssl s_client -connect 130.61.30.119:443 -servername app.omelenetskiy.xyz -brief
printf '' | openssl s_client -connect 130.61.30.119:443 -servername telemetry.omelenetskiy.xyz -brief
```

---

## Connection notes for next time

### Direct SSH
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119
```

