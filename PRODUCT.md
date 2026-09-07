# Tesla Vehicle Data App — Product Context

## Product truth

Tesla Vehicle Data App is a private, calm vehicle observability tool for a Tesla owner. It gathers charging, trip, battery, and latest-known-location data through a server-side adapter and presents the information on browser and mobile-sized screens.

The first release is a single-owner, single-vehicle MVP. It is not a driving control surface and must not send vehicle commands as part of normal browsing.

## Audience and scene

A Tesla owner checks the app briefly from a laptop or phone: before a trip, after charging, or while reviewing recent usage. They want confidence in what happened, not a stream of noisy live telemetry.

## Success

A user can understand the vehicle's cached state, data freshness, recent charging and trip activity, battery trend, and latest known location within seconds. A user can also tell whether a request will use cached data or may wake the vehicle before confirming it.

## Constraints

- Preserve vehicle sleep whenever possible.
- Never expose Tesla credentials in browser code.
- Prefer free/free-tier infrastructure: Supabase and Vercel.
- Treat the community Tesla API documentation as an unstable provider contract.
- Be transparent when data is stale, partial, unavailable, or synthetic.
- Support desktop browser and narrow mobile layouts from the first build.

## Product language

Use precise, plain labels: `Last known`, `Updated`, `Vehicle asleep`, `Use cached data`, and `Request current status`. Avoid implying live data when the app only has a snapshot.

## Explicit assumptions for this unattended init

- The initial build uses synthetic demonstration data labeled in the interface until Supabase is connected.
- The first screen is an authenticated dashboard shell, but authentication itself is not implemented in this first vertical slice.
- Map rendering starts as a privacy-safe latest-known-location panel; a real map provider is a later integration.
- The collection policy defaults to `Passive` and no wake endpoint is called by the frontend.

