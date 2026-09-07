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

## Supabase and Owner API setup

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

Run `supabase/migrations/001_owner_api.sql` in the Supabase SQL editor. Then open `/login`, create an account, and connect an Owner API access token at `/connect`. The token is validated against `/api/1/vehicles`, encrypted with `TESLA_TOKEN_ENCRYPTION_KEY`, and never returned to the browser.

`POST /api/collect` is the background collector. Call it from a Netlify scheduled function or another scheduler with `Authorization: Bearer $COLLECTION_CRON_SECRET`. It checks `/api/1/vehicles` first and skips sleeping/offline vehicles; only `online` vehicles receive the detailed telemetry request and get a new `vehicle_states` snapshot.

## Current scope

- Responsive overview dashboard for desktop and mobile widths
- Cached vehicle state, freshness labels, battery trend, recent activity, and latest-known location panel
- Server-only Tesla owner API adapter with defensive response normalization
- Single-vehicle dashboard with cache-first loading and explicit fresh status requests
- Supabase email/password authentication with cookie-backed server sessions
- Per-user vehicle ownership, encrypted Owner API credentials, snapshots, and collection audit events
- Background collection that checks vehicle status before requesting detailed telemetry

## Known limitation

The adapter uses Tesla's Owner API endpoint shape and defensive normalization, but Tesla may change authentication, endpoints, or response fields. The current connection flow accepts an Owner API access token; a production OAuth authorization-code flow should replace token paste when your Tesla developer application credentials are available. Detailed telemetry can still wake an already-asleep vehicle when a user explicitly requests current status, so the UI labels that action.
