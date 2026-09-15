# Tesla Fleet API Rules

Tesla Fleet API is the external source of vehicle data. Tesla-specific code is isolated in `lib/fleet/`; application normalization and models live in `lib/tesla/`. Keep the boundary explicit:

```text
Fleet API → client/auth → adapter/normalizer → application model
```

## Verification is mandatory

Never invent an endpoint, request shape, response field, scope, unit, capability, or API limitation. Before implementing an integration:

1. Verify the endpoint and HTTP method.
2. Verify path parameters and request body/query.
3. Verify the response envelope and field names.
4. Verify authentication and required scopes.
5. Verify nullable/omitted fields and error responses.
6. Verify units and sign conventions.
7. Verify rate limits, wake/sleep behavior, and provider limitations.
8. Update tests and normalization based on the actual contract.

Use the existing `lib/fleet/config.ts` region configuration, callback path, scopes, client, and error classification as the starting point. Consult official Tesla Fleet documentation whenever behavior is not already established in the repository.

## Authentication and secrets

The app has Supabase account authentication plus a separate Tesla Fleet OAuth flow. Fleet credentials are server-side, encrypted at rest, and handled by `lib/fleet/auth.ts` and `lib/fleet/tokens.ts`. Access tokens, refresh tokens, client secrets, private keys, authorization codes, and raw Authorization headers must never reach browser code, client DTOs, logs, screenshots, or error messages.

Use the server/service-role client only where the existing server-side data path requires it. Preserve RLS and owner/vehicle scoping. Sanitize request/response logging using the established Tesla sanitization utilities.

## Telemetry and units

Raw Fleet events are retained for audit/replay in the telemetry tables. Normalize provider shapes into application models, but do not transform configured metric readings. Current project conventions are metric: km, km/h, kW, kWh, Wh/km, °C; this vehicle reports those configured readings directly. Only convert a field when the verified provider contract explicitly says its unit differs from the configured application unit, and never convert an already-normalized value again.

Pack voltage/current and direct power fields must be validated according to the verified provider contract. Computing power from voltage/current is a derived physical calculation, not a display-unit rewrite. Energy is power integrated over time; exclude invalid or unjustified gaps and report provenance. Do not use SOC as a calibrated power meter unless the product explicitly defines an estimate.

## Expected failures

Handle authentication/authorization errors, expired or revoked grants, missing scopes, rate limits, unavailable or sleeping vehicles, timeouts, malformed responses, network failures, and partial telemetry. Expose safe application-level errors and preserve diagnostic context server-side without secrets.

A sleeping vehicle is not necessarily broken. Do not turn missing state into zero or aggressively wake/poll it.

## Polling and commands

Polling must be centralized in the existing server/feed path; do not create independent polling loops in React components. Respect timeouts, freshness, rate limits, and sleep state. Vehicle controls/commands are secondary product functionality and require separately verified endpoints, scopes, confirmation, and safe error handling.

