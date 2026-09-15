# Coding Rules

## General

- Inspect existing code, tests, migrations, and related routes before editing.
- Prefer the smallest coherent change and preserve existing public contracts.
- Reuse existing abstractions, hooks, formatters, repositories, and components.
- Avoid unnecessary dependencies and duplicate logic.
- Keep TypeScript strict and strongly typed; avoid `any` and unsafe casts.
- Do not rewrite or reformat unrelated files.
- Keep server-only code and browser code clearly separated.

## Components

- Search before creating a component, hook, helper, or design primitive.
- Prefer the existing Untitled UI/React Aria-based components and variants.
- Keep components focused and keep business logic outside presentation.
- Preserve semantic HTML, keyboard support, labels, focus states, and responsive behavior.

## Data and units

- Never fabricate data, addresses, energy, routes, or metrics.
- Preserve `null`, unavailable, stale, partial, and low-confidence states.
- Never convert missing numeric data to zero.
- Validate every external value before persistence or calculation.
- Keep canonical units consistent: km, km/h, kW, kWh, Wh/km, °C, percentages, and minutes.
- Record source/provenance for derived analytics where the existing schema supports it.

## API and security

- Do not invent Tesla endpoints or response fields.
- Keep provider DTOs separate from application models.
- Do not expose access/refresh tokens, client secrets, private keys, or service-role credentials.
- Preserve authentication, owner/vehicle authorization, RLS, sanitization, and deduplication.
- Return application-level DTOs rather than raw provider payloads.

## Error and data states

Every data-driven feature should consider:

```text
loading
loaded
empty
error
stale
unavailable
partial
```

Errors should be actionable but safe. Log diagnostics only through existing sanitized server paths.

## Performance

Consider pagination, server-side filtering/sorting, database indexes, aggregation, lazy loading, and virtualization. Do not load unnecessary historical telemetry into the browser. Avoid independent polling loops and repeated API calls from multiple components.

## Validation

After changes, run the relevant type check, lint, and focused tests; run the full suite when practical. Review changed files for mobile/desktop behavior, accessibility, null states, stale data, security, and unrelated regressions.
