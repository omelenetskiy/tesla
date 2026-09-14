# 2026-09-14 Resume Note (Telemetry + DNS Pending)

## Why this note exists
Keep an exact restart point for the next session after DNS validation, so no telemetry setup work is lost.

## Confirmed current state

### 1) Vehicle Command Proxy path is fixed
- `fleet_telemetry_config` is now sent through `vehicle-command` proxy.
- The previous Tesla error is resolved:
  - `This endpoint must be called through the Vehicle Command HTTP Proxy`

### 2) VM services are up
- Host: `130.61.30.119`
- `fleet-telemetry` container: running
- `vehicle-command-proxy` container: running, listening on `:4443`
- Proxy startup log confirms:
  - `Listening on 0.0.0.0:4443`

### 3) Telemetry config write through proxy succeeded (critical proof)
Executed on VM with proxy URL set to localhost:

```bash
export TESLA_HTTP_PROXY_URL=https://127.0.0.1:4443
export NODE_TLS_REJECT_UNAUTHORIZED=0
npx tsx deploy/fleet-telemetry/configure-vehicle.mts \
  --hostname=tesla-y-dashboard.netlify.app \
  --port=443 \
  --ca-file=deploy/fleet-telemetry/certs/fullchain.pem
```

Result:
- `create -> {"updated_vehicles":1}`
- `get -> {"synced":true,"config":null,"limit_reached":false,"key_paired":true}`

This proves proxy signing + Fleet telemetry config call works end-to-end.

### 4) Remaining blocker is domain matching + telemetry destination
- Using `--hostname=telemetry.omelenetskiy.xyz` returns:
  - `hostname domain does not match with partner account`
- Reason: current partner account domain is in Netlify app family, while telemetry receiver is on `*.omelenetskiy.xyz`.

### 5) Current receiver metrics
- VM telemetry metrics still show no live vehicle socket:
  - `num_connections 0`
- This is expected until vehicle is configured with a hostname in the correct partner-domain family that routes to the telemetry receiver.

## What was checked about frontend domain
- `https://tesla-y-dashboard.netlify.app/.well-known/appspecific/com.tesla.3p.public-key.pem` is reachable (`HTTP 200`) and returns a valid PEM.
- `app.omelenetskiy.xyz` is currently pending DNS/validation and not yet usable as active app domain.

## Files finalized locally in this session
- `lib/fleet/config.ts`
  - restored and includes `commandProxyUrl` from `TESLA_HTTP_PROXY_URL`
- `lib/fleet/client.ts`
  - command-like requests route through proxy (`command`, `wake_up`, `telemetry_config`)
- `deploy/fleet-telemetry/configure-vehicle.mts`
  - restored; logs proxy; refuses non-dry-run telemetry config without `TESLA_HTTP_PROXY_URL`
- `deploy/fleet-telemetry/docker-compose.yml`
  - includes `vehicle-command-proxy`
  - proxy runs as `user: root` to read mounted private key

## Resume procedure when DNS is validated

### Step A: partner domain and key endpoint must be reachable on final domain family
Use a domain under `omelenetskiy.xyz` (for example `app.omelenetskiy.xyz`) with working:
- `https://<app-domain>/.well-known/appspecific/com.tesla.3p.public-key.pem`

### Step B: register partner for that domain
Run on VM:

```bash
cd /home/ubuntu/TeslaApp
set -a
source .env
set +a
npx tsx deploy/fleet-telemetry/register-partner.mts --domain=app.omelenetskiy.xyz
```

### Step C: apply telemetry config for receiver host
Run on VM:

```bash
cd /home/ubuntu/TeslaApp
set -a
source .env
set +a
export TESLA_HTTP_PROXY_URL=https://127.0.0.1:4443
export NODE_TLS_REJECT_UNAUTHORIZED=0
npx tsx deploy/fleet-telemetry/configure-vehicle.mts \
  --hostname=telemetry.omelenetskiy.xyz \
  --port=443 \
  --ca-file=deploy/fleet-telemetry/certs/fullchain.pem
```

### Step D: verify live telemetry

```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry && docker-compose logs -f --tail=80 fleet-telemetry'
```

```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'curl -s http://127.0.0.1:9090/metrics | grep num_connections'
```

Expected after drive/wake activity:
- `num_connections` > `0`
- non-scanner telemetry events appear in logs

## Important notes for next session
- Keep using proxy for telemetry config calls.
- Do not remove `user: root` from `vehicle-command-proxy` in `deploy/fleet-telemetry/docker-compose.yml` (private key read permission).
- `NODE_TLS_REJECT_UNAUTHORIZED=0` was used only to trust localhost proxy cert in script execution; this is operational tooling-only and should not be baked into app runtime.

