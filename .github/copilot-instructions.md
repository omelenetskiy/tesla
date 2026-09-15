# DriveScope Copilot Instructions

DriveScope is a Next.js Tesla vehicle monitoring and analytics application. It collects current state and historical telemetry through the Tesla Fleet API, normalizes it into application models, stores it in Supabase, and presents compact analytics-oriented UI.

## Read project context first

Before implementing a non-trivial task, inspect the relevant files under `.github/instructions/` and use them as the source of project-specific rules:

- `product.md` — product purpose and boundaries.
- `architecture.md` — layers, ownership, and repository map.
- `frontend.md` — data flow and frontend conventions.
- `design.md` — Untitled UI, density, responsive behavior, and visual rules.
- `data-model.md` — entities, units, nullability, and derived data.
- `tesla-fleet-api.md` — Fleet API verification, security, and telemetry rules.
- `pages.md` — information architecture and page responsibilities.
- `coding-rules.md` — implementation quality rules.
- `workflow.md` — required agent workflow and validation.

Deployment- and VM-specific procedures remain in the existing `.github/AGENT_INSTRUCTIONS.md`, `.github/DEPLOYMENT_RUNBOOK.md`, and `.github/TROUBLESHOOTING.md`; read those only when the task concerns deployment or the telemetry receiver.

## Mandatory rules

1. Inspect existing code, abstractions, tests, and instruction files before changing code.
2. Keep Tesla/Fleet-specific code isolated in `lib/fleet/`, with application normalization and domain models in `lib/tesla/`.
3. Never invent Tesla endpoints, fields, units, scopes, or capabilities. Verify them against official documentation and the existing client/configuration.
4. Never expose credentials, tokens, private keys, or unsanitized credential-bearing data to the browser or logs.
5. Preserve `null`/unavailable states; never fabricate data or convert missing values to zero.
6. Keep business calculations out of React components and keep raw provider responses out of frontend contracts.
7. Reuse existing components and utilities before creating new ones. Use the established Untitled UI/React Aria-based component structure rather than introducing another UI system.
8. Keep the interface compact, accessible, mobile-first, and information-dense; do not redesign unrelated screens.
9. Make the smallest change that solves the task and do not refactor unrelated code.
10. Validate changed code with type checking, linting, and relevant tests.

When instructions conflict with existing behavior, inspect the implementation and tests first, identify the conflict explicitly, and preserve established conventions unless the task requires a deliberate change.

