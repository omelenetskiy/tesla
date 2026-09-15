# Architecture

## Intended flow

```text
Tesla Fleet API
      ↓
Fleet API client
      ↓
API adapters / normalization
      ↓
Application domain models
      ↓
Supabase database
      ↓
Application services and repositories
      ↓
Analytics and calculations
      ↓
Next.js Route Handlers / server layer
      ↓
Frontend hooks and data contracts
      ↓
Pages and reusable UI components
```

## Repository map

- `app/` — Next.js App Router layouts, pages, loading/not-found states, and API Route Handlers under `app/api/`.
- `components/base/` — low-level accessible UI primitives and Untitled UI-derived building blocks.
- `components/application/`, `components/dashboard/`, `components/charts/`, `components/map/`, `components/shell/` — feature and composite presentation components.
- `lib/fleet/` — Fleet configuration, OAuth/token handling, HTTP client, service layer, telemetry ingestion, and Fleet-specific behavior.
- `lib/tesla/` — Tesla/application models, provider normalization, errors, sanitization, history derivation, and vehicle service logic.
- `lib/energy/`, `lib/geo/`, `lib/map/`, `lib/hooks/`, `lib/format.ts` — reusable domain calculations, geocoding/map helpers, client hooks, and formatting.
- `supabase/migrations/` — ordered schema, indexes, RLS policies, telemetry/history tables, and security constraints.
- `tests/` — Jest and integration tests; `scripts/` contains verification, ingestion, and deployment utilities.

## Layer responsibilities

### External integration
`lib/fleet/config.ts`, `lib/fleet/auth.ts`, `lib/fleet/client.ts`, `lib/fleet/tokens.ts`, and Fleet ingestion files own Tesla-specific URLs, authentication, requests, retries, telemetry payloads, and provider errors. Keep this code server-side.

### Adapters and domain models
`lib/tesla/normalize.ts` converts provider response shapes and units into internal models. `lib/tesla/models.ts` is the application contract. Do not pass raw Fleet response objects through the application.

### Persistence
Supabase access belongs in server-only services, repositories, and Route Handlers. Migrations define the durable schema, indexes, RLS, encryption-related storage, and deduplication constraints. Preserve owner/vehicle scoping.

### Business logic
History derivation, energy accounting, freshness, aggregation, and validation belong in `lib/` services/calculators, not React components or JSX event handlers.

### Server/API layer
`app/api/**/route.ts` authenticates requests, resolves the user/vehicle, calls application services, and returns application-level DTOs. It should not expose provider payloads or duplicate domain calculations.

### Frontend
Hooks in `lib/hooks/` fetch application DTOs. Pages compose feature components. Reusable components render data and states; they should not own complex API calls or Tesla-specific logic.

Do not force a new architecture when an existing module already owns the responsibility. Extend the nearest established layer and keep public contracts stable.
