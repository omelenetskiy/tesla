# DriveScope — Tesla Fleet API + Telemetry

DriveScope is split into two parts:

- **Frontend**: the Next.js app on Netlify at `app.omelenetskiy.xyz`
- **Backend**: the Tesla Fleet Telemetry receiver on the Oracle VM at `telemetry.omelenetskiy.xyz`

## What changed

- Removed polling entry points (`/api/collect`, Netlify collect function)
- Removed Fleet API compatibility shim files
- Enforced Fleet authorization gate for app pages
- Added static `.well-known` flow for Tesla virtual key hosting
- Separated frontend hosting from telemetry hosting

## Local run

```bash
npm install
npm run dev
```

## Validation

```bash
npm run lint
npm run check:deploy
npm run verify
npm run build
```

`npm run check:deploy` validates the Tesla virtual key files and the telemetry TLS file layout. If it reports missing files, the remaining manual work is:

- deploy the app on Netlify so `/.well-known/appspecific/com.tesla.3p.public-key.pem` is reachable over HTTPS
- issue a publicly trusted TLS certificate for `deploy/fleet-telemetry/` on your VM
- register the partner account and pair the key on the vehicle
- start the telemetry receiver and then configure the car to send telemetry to it

## Required environment variables

Create `.env` from `.env.example` and set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TESLA_TOKEN_ENCRYPTION_KEY`
- `NEXT_PUBLIC_APP_URL`
- `TESLA_FLEET_REGION` (`na` | `eu` | `cn`)
- `TESLA_FLEET_CLIENT_ID`
- `TESLA_FLEET_CLIENT_SECRET`
- `TESLA_FLEET_REDIRECT_URI` (optional if `NEXT_PUBLIC_APP_URL` is set)
- `TESLA_FLEET_PRIVATE_KEY_PATH`

## Mandatory access flow

1. Sign in to app account at `/login` (Supabase identity)
2. Open `/tesla-login`
3. Connect Tesla via `/api/fleet/connect`
4. Complete Tesla OAuth callback (returns to `/tesla-login`)
5. Only then dashboard/routes are unlocked

If Fleet authorization is missing, app routes redirect to `/tesla-login?fleet=required`.

## Virtual key setup

Tesla requires your app public key at this exact path:

- `https://<your-domain>/.well-known/appspecific/com.tesla.3p.public-key.pem`

In this repo, place file at:

- `public/.well-known/appspecific/com.tesla.3p.public-key.pem`

Generate the keypair:

```bash
./deploy/fleet-telemetry/make-key.sh
```

Then:

1. Copy `deploy/fleet-telemetry/keys/public.pem` to `public/.well-known/appspecific/com.tesla.3p.public-key.pem`
2. Verify the URL serves the PEM on your domain
3. Register partner domain:

```bash
node --env-file=.env --import ./scripts/register.mjs deploy/fleet-telemetry/register-partner.mts --dry-run
node --env-file=.env --import ./scripts/register.mjs deploy/fleet-telemetry/register-partner.mts
```

4. Pair the key on the vehicle as a trusted user:

```text
https://tesla.com/_ak/<your-domain>
```

## Netlify note

Keep `.well-known` under `public/` so Netlify publishes it as static content.

## Oracle Cloud telemetry receiver

Use `deploy/fleet-telemetry/` on your VM **only for telemetry**. The VM should not proxy the frontend app anymore.

Core flow:

1. Wait for `telemetry.omelenetskiy.xyz` DNS to resolve to the VM
2. Prepare a publicly trusted TLS certificate (`issue-cert.sh`)
3. Start the receiver with `docker-compose up -d` (or `docker compose up -d` if the plugin is installed)
4. Make sure the `vehicle-command-proxy` service is running and point `TESLA_HTTP_PROXY_URL` at it:

```bash
export TESLA_HTTP_PROXY_URL=https://telemetry.omelenetskiy.xyz:4443
```

5. Configure vehicle telemetry:

```bash
node --env-file=.env --import ./scripts/register.mjs deploy/fleet-telemetry/configure-vehicle.mts --dry-run
node --env-file=.env --import ./scripts/register.mjs deploy/fleet-telemetry/configure-vehicle.mts --hostname=<telemetry-host> --port=443
```

6. Re-check sync state after driving

## Context used for docs

- Tesla migration contract in `docs/TESLA_FLEET_MIGRATION_PLAN.md`
- Reference implementation ideas from `qcteslaguy/tesla-fleet-api-demo`
- Next.js static/public and matcher behavior cross-checked via Context7 (`/vercel/next.js`)
