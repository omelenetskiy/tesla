# Next steps: Tesla app + Oracle telemetry

This file is the working instruction for the next session.

## Current state

### Frontend
- The Next.js frontend should live on Netlify at `app.omelenetskiy.xyz`.
- The frontend is ready while DNS verification is pending.
- `NEXT_PUBLIC_APP_URL` and `TESLA_FLEET_REDIRECT_URI` should point at `https://app.omelenetskiy.xyz`.

### VM / backend
- The Oracle VM is telemetry-only.
- SSH still works with:
  - user: `ubuntu`
  - private key: `~/.ssh/ubuntu-ssh-key-2026-09-14.key`
- nginx on the VM must not proxy the frontend app anymore.

### Tesla key material
- The Tesla app public key is already present and synchronized:
  - `public/.well-known/appspecific/com.tesla.3p.public-key.pem`
- The key matches the private key in:
  - `deploy/fleet-telemetry/keys/private.pem`

### Telemetry
- Telemetry is **not finished yet**.
- Missing pieces:
  - DNS for `telemetry.omelenetskiy.xyz` resolving to the VM
  - a publicly trusted TLS certificate for that hostname
  - `deploy/fleet-telemetry/certs/fullchain.pem`
  - `deploy/fleet-telemetry/certs/privkey.pem`
  - running the Tesla Fleet Telemetry container on the VM
  - configuring the vehicle telemetry target

---

## Important architecture decision

### Recommended split
- **Netlify** = web app only
- **Oracle VM** = telemetry receiver only

### Why
- The web app can stay on Netlify and remain available while DNS for telemetry propagates.
- Telemetry needs a real TLS endpoint and a host name that matches the app's root domain rules.
- If the app is on `*.netlify.app`, that is not a good long-term telemetry root domain to build around unless we use a custom domain.

---

## What still needs to be done

### 1) Keep the app on Netlify
- Make sure the Netlify custom domain `app.omelenetskiy.xyz` is verified.
- Keep the Tesla virtual key file in `public/.well-known/appspecific/com.tesla.3p.public-key.pem`.

### 2) Issue TLS for telemetry
On the VM, after DNS for `telemetry.omelenetskiy.xyz` resolves to the VM:

```bash
cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry
export TELEMETRY_HOST=telemetry.omelenetskiy.xyz
./issue-cert.sh
```

This should create:
- `deploy/fleet-telemetry/certs/fullchain.pem`
- `deploy/fleet-telemetry/certs/privkey.pem`

### 3) Start telemetry receiver
On the VM:

```bash
cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry
docker-compose up -d
docker-compose logs -f fleet-telemetry
```

### 4) Configure the car
After the server is reachable:

```bash
cd /home/ubuntu/TeslaApp
export TESLA_HTTP_PROXY_URL=https://telemetry.omelenetskiy.xyz:4443
node --env-file=.env --import ./scripts/register.mjs deploy/fleet-telemetry/configure-vehicle.mts --dry-run
node --env-file=.env --import ./scripts/register.mjs deploy/fleet-telemetry/configure-vehicle.mts --hostname=$TELEMETRY_HOST --port=443
```

> `configure-vehicle.mts` sends `fleet_telemetry_config` through the vehicle-command HTTP proxy.
> If `TESLA_HTTP_PROXY_URL` is not set, the non-dry-run call will fail before it reaches Tesla.

### 5) Verify Tesla pairing
- Open `https://tesla.com/_ak/<your-domain>` as a trusted user.
- Confirm the key on the car screen.
- Re-run `configure-vehicle.mts` and check for:
  - `key paired yes`
  - `synced: true`

---

## Deployment rules to remember

### Frontend
- Must keep `public/.well-known/appspecific/com.tesla.3p.public-key.pem` in the deployed app source.
- The app must serve that file over HTTPS.
- `NEXT_PUBLIC_APP_URL` and `TESLA_FLEET_REDIRECT_URI` should point to the real web app URL.

### Telemetry
- The telemetry hostname must be a real hostname under a domain we control.
- The TLS certificate must be publicly trusted.
- The server must listen on `443`.
- Raw TLS passthrough is required if a tunnel is used.
- The VM should not redirect telemetry to the app login page.

---

## Connection notes for next time

### Direct SSH
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119
```

### If direct SSH ever fails
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key \
  -o ProxyCommand='ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key -W %h:%p -p 443 ocid1.instanceconsoleconnection.oc1.eu-frankfurt-1.antheljr74jhmvycm3zjcjksuluztrfu3maz7kkmzpojv2bid6zsnowmloka@instance-console.eu-frankfurt-1.oci.oraclecloud.com' \
  ubuntu@130.61.30.119
```
