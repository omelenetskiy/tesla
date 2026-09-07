# KITE // Vehicle Systems

Sleep-safe Tesla vehicle data dashboard MVP.

## Run locally

```bash
npm install
npm run dev
``` 

Open `http://localhost:3000`.

## Checks

```bash
npm run lint
npm run build
npm audit --omit=dev
```

## Supabase and Tesla Owner API setup

Copy `.env.example` to `.env.local` and set the Supabase project values plus a random encryption secret:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
TESLA_API_BASE_URL=https://owner-api.teslamotors.com
TESLA_TOKEN_ENCRYPTION_KEY=generate-a-long-random-secret
COLLECTION_CRON_SECRET=generate-another-random-secret
```

Run `supabase/migrations/001_owner_api.sql`, `supabase/migrations/002_telemetry_history.sql`, and `supabase/migrations/003_tesla_oauth_tokens.sql` in the Supabase SQL editor, in that order. Open `/login`, create an account, download [Tesla Auth](https://github.com/adriankumpf/tesla_auth/releases/latest), and generate Owner API access and refresh tokens in that app. Paste both tokens at `/connect`; the server validates the access token against the Owner API `/api/1/products` endpoint, encrypts both tokens with `TESLA_TOKEN_ENCRYPTION_KEY`, and never receives the Tesla password. This follows TeslaMate's token flow and does not use Fleet API.

`POST /api/collect` is the background collector. Call it from a Netlify scheduled function or another scheduler with `Authorization: Bearer $COLLECTION_CRON_SECRET`. It checks `/api/1/vehicles?page=1` first and skips sleeping/offline vehicles; only `online` vehicles receive the detailed telemetry request and get a new `vehicle_states` snapshot.

### Netlify scheduled collection

For the scheduled function to work in production, configure these variables in the Netlify site settings for the deployed site:

- `URL` — the public HTTPS URL of this Netlify deployment. Do not use `localhost`.
- `COLLECTION_CRON_SECRET` — the same random value used by the Next.js app.
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TESLA_API_BASE_URL=https://owner-api.teslamotors.com`
- `TESLA_TOKEN_ENCRYPTION_KEY`

Deploy the site with the Netlify Functions runtime enabled. The function runs every 15 minutes, calls `/api/collect`, checks `/api/1/products`, and does not call `wake_up`. When the vehicle is not `online`, the previous `vehicle_states` snapshot remains the latest data. A scheduled function is not a live ping: it only records a new snapshot when the vehicle is already online.

The dashboard is passive by default. Loading the dashboard and opening the map read Supabase only. `Request current status` requires a second confirmation; only after that confirmation does the server call Owner API `wake_up` when the car is not online, then request `vehicle_data`. If that request fails, the UI keeps the previous snapshot and shows the failure reason.

## Current scope

- Responsive Russian dashboard for desktop and mobile widths
- Cached vehicle state, freshness labels, battery metrics, and latest-known location map
- Server-only Tesla Owner API adapter with defensive response normalization
- Single-vehicle dashboard with cache-first loading and explicit fresh status requests
- Supabase email/password authentication with cookie-backed server sessions
- Per-user vehicle ownership, encrypted Tesla credentials, snapshots, and collection audit events
- Tesla SSO authorization-code exchange and automatic refresh-token rotation
- Background collection that checks vehicle status before requesting detailed telemetry

The dashboard contains no demo vehicle, route, charging, or map data. When Owner API does not provide a field, the interface shows it as unavailable instead of inventing a value.

## Known limitation

The adapter uses the community-documented Tesla Owner API at `https://owner-api.teslamotors.com`. Tesla SSO can require MFA or present a WAF browser challenge; the app does not automatically retry either case, to avoid triggering additional SSO protections. Access and refresh tokens are encrypted server-side, and expired access tokens are refreshed automatically. Detailed telemetry can still wake an already-asleep vehicle when a user explicitly requests current status, so the UI labels that action.
