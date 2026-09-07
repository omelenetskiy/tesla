# Overview dashboard surface brief

## Scope

The first responsive dashboard surface for a private Tesla owner. Mode: Operate.

## Audience, job, action, proof, constraints

The audience is one Tesla owner checking the app from a laptop or phone. Their job is to understand current cached status and recent vehicle activity quickly. The primary action is reviewing trustworthy data; the secondary action is opening a clearly labeled current-status request. Proof is freshness, source state, recent charging/trip records, battery trend, and last-known location. Constraints are sleep preservation, mobile readability, accessibility, no proprietary Tesla branding, and synthetic data clearly labeled until backend integration.

## Direction contract

**THESIS:** A sleep-safe vehicle command wall that makes freshness and collection decisions visible, refusing the default live-telemetry control room.

**OWN-WORLD:** Absolute black field, phosphor orange and acid-green telemetry, red reserved for condition bars, bilingual-style stacked labels, ruled panels, and seven-segment counters; the glow is restrained to measured readouts, never alarm theatre.

**STORY:** The owner sees what is known, when it was known, what happened recently, and why the app is not waking the car for ordinary browsing; the visual system feels like a calm instrument wall rather than a crisis.

**FIRST VIEWPORT:** A slim command rail anchors navigation; the main field opens with a stacked “VEHICLE / STATUS” title and freshness sentence, then a ruled telemetry band with sleep state, battery, range, and a safe cached-data action; the lower grid starts charging/trip activity beside the latest-known location panel.

**FORM:** Nineties mecha-anime command wall translated into a sleep-safe observability dashboard, assigned direction 4, seed key `33415362`.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved decisions

- Exact Supabase schema and auth flow
- Provider-backed map implementation and location retention controls
- Tesla API credential flow and supported vehicle/model fields


