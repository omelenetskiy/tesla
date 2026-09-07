# Tesla Vehicle Data App — Agent Instructions

## 1. Mission

Build a responsive web application and mobile-friendly experience for collecting, storing, and visualizing data from a Tesla vehicle. The primary product goals are:

- Charging history and charging sessions
- Trips and driving history
- Battery health and battery-level trends
- A map showing the vehicle's latest known position

The product should be inspired by the **information density, historical reporting, and observability mindset of TeslaMate**, but it must not copy TeslaMate's code, branding, UI, or assets. Reuse the product lessons, not the implementation.

The application must work well in a desktop browser and on mobile-sized screens. Prefer a responsive PWA/web architecture unless the user explicitly requests a separate native application.

## 2. Required technology direction

Use free or free-tier solutions whenever they are practical:

- **Tesla data source:** [Tesla API documentation](https://tesla-api.timdorr.com/)
- **Database and backend services:** Supabase (Postgres, Auth, Edge Functions, and scheduled jobs where appropriate)
- **Web hosting and frontend deployment:** Vercel or an equivalent free-tier platform
- **Maps:** use a free/open map solution where possible, such as OpenStreetMap tiles through a suitable provider, while respecting that provider's usage policy
- **Frontend:** choose a mature, accessible responsive web stack already present in the repository; if no stack exists, prefer TypeScript and a lightweight React-based framework suitable for Vercel

Do not add paid infrastructure, proprietary SDKs, or a native wrapper unless there is a clear technical reason and the user has approved it. Keep provider-specific integrations behind small adapters so they can be replaced later.

## 3. Tesla API and vehicle safety rules

The vehicle must **never be woken without a demonstrated need**. This is the most important operational constraint.

### 3.1 API boundaries

- Treat `https://tesla-api.timdorr.com/` as an unofficial/community API reference, not as a guaranteed Tesla contract.
- Read the API documentation before implementing an endpoint. Do not invent endpoint names, request bodies, response fields, or authentication behavior.
- Isolate Tesla API calls in a server-side adapter/service. Never call the Tesla API directly from browser code with a client secret or long-lived vehicle token.
- Expect API failures, expired credentials, rate limits, changed response shapes, unavailable vehicles, and command rejection.
- Store raw provider responses only when useful for debugging and retention policy allows it; normalize application data into stable internal models.
- Make the provider adapter replaceable so an official Tesla integration can be introduced later.

### 3.2 Sleep-aware polling policy

Every data collection job must follow this sequence:

1. Check the local database for the vehicle's last known state, `last_seen_at`, `last_poll_at`, and sleep/awake status.
2. Check whether a fresh cached value already satisfies the request. If it does, return the cached value and make no Tesla request.
3. Determine whether the requested data normally requires the car to be awake. Prefer endpoints and cached telemetry that do not require waking the car.
4. If the car is asleep and the operation is not explicitly urgent or user-requested, skip the call and record a reason such as `vehicle_sleeping` or `fresh_cache`.
5. Apply a per-vehicle cooldown, exponential backoff, and a global request budget before any request.
6. Only wake the vehicle when the requested operation truly requires current data and the user has explicitly opted into that behavior, or when a narrowly defined collection policy says it is necessary.
7. After collecting data, stop polling promptly. Never keep the car awake through aggressive loops.

The UI must always show data freshness, for example: `Updated 8 minutes ago`, `Live request skipped because the vehicle is sleeping`, or `Last known location`. Never imply that stale data is live.

Do not implement these patterns:

- Polling every few seconds from a browser tab
- Multiple independent jobs polling the same vehicle
- Automatic retries that repeatedly wake the car
- Calling a wake endpoint merely to render a dashboard
- Background geolocation tracking unless the user explicitly requests it and the platform permits it
- Exposing a manual `refresh` action without explaining whether it may wake the vehicle

### 3.3 Collection tiers

Use explicit collection tiers, configurable per vehicle:

- **Passive:** database/cache only; never wake the vehicle
- **Conservative:** collect only when the vehicle is already awake or when a scheduled policy allows a single request
- **On demand:** a user-triggered fresh request, with an explicit warning if it may wake the vehicle

Record the decision for every attempted or skipped collection in an audit/event table. This makes battery impact and unexpected behavior diagnosable.

## 4. Recommended system architecture

Use a server-first architecture:

- **Frontend:** responsive dashboard, charts, trip views, charging views, battery views, and map view
- **Server API layer:** authenticated application endpoints that read normalized data and enqueue/perform carefully governed collection requests
- **Tesla adapter:** the only module allowed to communicate with the Tesla API
- **Supabase Postgres:** normalized time-series and event data, user/vehicle ownership, collection settings, job state, and audit records
- **Supabase Edge Functions:** scheduled collection, normalization, retries with limits, and secure Tesla API access
- **Supabase scheduled jobs/pg_cron or an approved scheduler:** low-frequency background collection; do not rely on a browser tab being open
- **Vercel:** frontend hosting and small server routes where useful; do not use short-lived request handlers as an unbounded polling worker

Keep frontend reads separate from collection writes. A dashboard load should read Supabase/cache and should not implicitly trigger a Tesla request.

## 5. Data model expectations

Design migrations before feature code. Names may vary, but the model should cover at least:

- `users` / Supabase Auth identity
- `vehicles` with provider vehicle ID, display name, ownership, and collection policy
- `vehicle_credentials` or a secure token reference; never expose secrets to clients
- `vehicle_states` for normalized snapshots and freshness metadata
- `battery_snapshots` for state of charge, range, charging state, battery/energy metrics when available
- `charging_sessions` with start/end times, location, energy, duration, and source confidence
- `trips` with start/end times, distance, duration, energy/range deltas, and start/end coordinates where available
- `vehicle_locations` with timestamp, latitude, longitude, accuracy/source metadata, and retention controls
- `collection_runs` or `collection_events` for attempted, skipped, successful, and failed work, including the wake decision
- `user_settings` and per-vehicle collection settings

Use UTC timestamps in storage. Convert to the user's timezone only in presentation. Add indexes for vehicle plus time, charging sessions, trips, and map history. Define retention and privacy behavior for precise location data before shipping location history.

## 6. Security and privacy requirements

- Keep Tesla credentials and access tokens server-side only.
- Use environment variables or a managed secret store; never commit `.env`, tokens, refresh tokens, or raw credentials.
- Enforce Supabase Row Level Security for every user-owned table.
- Verify ownership before reading vehicle data or starting a collection job.
- Avoid logging access tokens, full provider payloads containing secrets, or unnecessary precise locations.
- Provide a way to delete a vehicle's data and location history.
- Make location features opt-in where appropriate and explain who can see the data.
- Validate all data at the server boundary and handle malformed provider responses defensively.
- Use least-privilege service credentials for scheduled functions.

## 7. Product and UX requirements

The core navigation should make these destinations easy to reach:

1. Overview — current cached status and freshness
2. Charging — sessions, energy, duration, cost fields only if configured by the user
3. Trips — timeline, route, distance, duration, and energy context
4. Battery — state-of-charge history, range trends, and battery-related metrics available from the provider
5. Map — latest known position first, with optional historical tracks
6. Settings — vehicle, account, privacy, collection mode, schedule, units, timezone, and data deletion

Important states to design, not postpone:

- No connected vehicle
- Expired or invalid credentials
- Vehicle asleep
- Data is stale
- Collection is disabled
- Tesla API unavailable or rate-limited
- Partial trip or charging session
- Missing GPS or battery fields
- Empty history for a newly connected vehicle
- Mobile offline/read-only mode
- Multiple vehicles, if supported later

Avoid presenting a single unexplained “Refresh” button. Use clear actions such as `Use cached data`, `Request current status`, and `Collect now (may wake vehicle)` when those actions differ operationally.

## 8. Mandatory Impeccable design workflow

Any agent working on the frontend, interaction design, responsive behavior, copy, accessibility, or visual polish **must use the `/impeccable` skill** at `/Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp/.claude/skills/impeccable/`.

Required workflow:

1. Read `.claude/skills/impeccable/SKILL.md` and follow its routing rules.
2. Run the skill's context setup once per session when implementing UI.
3. Read existing `PRODUCT.md`, `DESIGN.md`, and relevant surface briefs if they exist; do not invent missing project context.
4. For a new surface, use the new-work/shape guidance before writing UI.
5. Before editing UI, load the relevant craft-floor guidance as required by the skill.
6. Build for the **Operate** mode: scanability, trust, native expectations, accessibility, and data clarity outrank decoration.
7. Treat desktop and mobile as first-class layouts. Check narrow screens, touch targets, keyboard navigation, reduced motion, color contrast, loading states, and readable charts.
8. After implementation, perform the bounded visual verification pass required by the skill and use the `impeccable-finish-reviewer` agent when a finished review is needed.
9. If a design system is established, keep tokens and durable decisions documented rather than scattering one-off styles.

The visual direction should feel calm, precise, and trustworthy: telemetry and freshness should be legible at a glance, while charts and maps can provide depth without making the interface look like an alarm console. Do not imitate Tesla's proprietary product UI or branding.

## 9. Engineering workflow for agents

Before changing code:

- Inspect the repository and identify the current framework, scripts, and environment configuration.
- Find existing conventions and reuse them.
- Check whether the relevant API, schema, migration, and UI already exist.
- State the smallest safe implementation plan in the task notes or pull request.

While changing code:

- Prefer small, reviewable changes.
- Add migrations and tests with data features.
- Keep provider-specific code isolated.
- Make idempotency explicit for scheduled collection and session aggregation.
- Use feature flags or disabled-by-default settings for operations that may wake a vehicle.
- Do not silently change polling frequency, retention, privacy, or credential behavior.

Before finishing:

- Run the repository's formatter, linter, type checker, and tests when available.
- Test sleep, stale cache, timeout, rate-limit, malformed-response, and duplicate-job cases.
- Test desktop and mobile layouts and keyboard accessibility for UI changes.
- Review logs for secrets and precise data leakage.
- Document any required environment variables, Supabase migrations, cron schedules, and deployment steps.
- Report known limitations, especially unofficial API behavior and fields that are unavailable for a specific Tesla model or firmware.

## 10. Definition of done

A feature is complete only when it:

- Works from an authenticated user boundary with RLS/ownership checks
- Uses cached data before considering a Tesla request
- Cannot wake the vehicle accidentally through ordinary navigation
- Exposes freshness and failure states clearly
- Persists normalized, timestamped data with an idempotent collection path
- Has responsive and accessible UI for browser and mobile widths
- Includes tests for its collection and failure behavior
- Has no committed secrets or unnecessary sensitive logs
- Is documented well enough for another agent to operate safely

When requirements conflict, prioritize vehicle sleep preservation, user privacy, data correctness, and transparent UX over freshness or visual novelty.

