# DriveScope - Tesla Fleet API + Telemetry

**📚 Полный гайд по развёртыванию**: [**SETUP_RU.md**](./SETUP_RU.md) (Русский) — пошаговое руководство на русском
**✅ Чек-лист учётных данных**: [**CREDENTIALS_CHECKLIST_RU.md**](./CREDENTIALS_CHECKLIST_RU.md) (Русский) — все требуемые параметры и конфигурация

DriveScope is now Fleet-first:

- Tesla Fleet API for authorization, commands, and on-demand reads
- Fleet Telemetry as the only continuous data source
- Mandatory app login plus mandatory Fleet authorization before entering the app

## What changed

- Removed legacy polling entry points (`/api/collect`, Netlify collect function)
- Removed legacy API compatibility shim files
- Enforced Fleet authorization gate for app pages
- Added static `.well-known` flow for Tesla virtual key hosting

## Local run

```bash
npm install
npm run dev
```

## Validation

```bash
npm run lint
npm run verify
npm run build
```

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

## Database migrations

Apply Supabase migrations in order:

```text
001_owner_api.sql
002_telemetry_history.sql
003_tesla_oauth_tokens.sql
004_core_models.sql
005_history_derivation.sql
006_fix_polling_precedence_and_log_constraints.sql
007_fleet_credentials.sql
008_fleet_request_types.sql
```

## Mandatory access flow

1. Sign in to app account at `/login` (Supabase identity)
2. Open `/tesla-login`
3. Connect Tesla via `/api/fleet/connect`
4. Complete Tesla OAuth callback (returns to `/tesla-login`)
5. Only then dashboard/routes are unlocked

If Fleet authorization is missing, app routes redirect to `/tesla-login?fleet=required`.

## Virtual key setup (required for commands + telemetry config)

Tesla requires your app public key at this exact path:

- `https://<your-domain>/.well-known/appspecific/com.tesla.3p.public-key.pem`

In this repo, place file at:

- `public/.well-known/appspecific/com.tesla.3p.public-key.pem`

Generate keypair:

```bash
./deploy/fleet-telemetry/make-key.sh
```

Then:

1. Copy `deploy/fleet-telemetry/keys/public.pem` to `public/.well-known/appspecific/com.tesla.3p.public-key.pem`
2. Verify URL serves the PEM on your domain
3. Register partner domain:

```bash
node --env-file=.env --import ./scripts/register.mjs deploy/fleet-telemetry/register-partner.mts --dry-run
node --env-file=.env --import ./scripts/register.mjs deploy/fleet-telemetry/register-partner.mts
```

4. Pair key on vehicle as trusted user:

```text
https://tesla.com/_ak/<your-domain>
```

## Netlify note (.well-known hosting)

If web app is deployed on Netlify, keep `.well-known` under `public/` in the deploy source so it is published as static content.

## Oracle Cloud (Always Free) telemetry receiver

Use `deploy/fleet-telemetry/` on your VM.

Core flow:

1. Prepare TLS cert (`issue-cert.sh`)
2. Start receiver (`docker compose up -d`)
3. Configure vehicle telemetry target:

```bash
node --env-file=.env --import ./scripts/register.mjs deploy/fleet-telemetry/configure-vehicle.mts --dry-run
node --env-file=.env --import ./scripts/register.mjs deploy/fleet-telemetry/configure-vehicle.mts --hostname=<telemetry-host> --port=443
```

4. Re-check sync state after driving

## Context used for docs

- Tesla migration contract in `docs/TESLA_FLEET_MIGRATION_PLAN.md`
- Reference implementation ideas from `qcteslaguy/tesla-fleet-api-demo`
- Next.js static/public and matcher behavior cross-checked via Context7 (`/vercel/next.js`)
