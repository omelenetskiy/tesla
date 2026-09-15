# Frontend Architecture and Conventions

## Stack

The frontend uses Next.js App Router, React 19, strict TypeScript, Tailwind CSS 4, React Aria Components, Recharts, MapLibre GL, and existing components under `components/`. The `@/*` TypeScript alias maps to the repository root.

## Data flow

Keep this separation:

```text
UI primitives
   ↓
feature/domain components
   ↓
page components
   ↓
application hooks and DTO fetching
   ↓
server Route Handlers and services
   ↓
normalized domain data
```

Pages should compose and coordinate. They must not contain complex Tesla API communication, persistence logic, or business calculations. Prefer hooks and server DTOs for loading data.

## Component rules

- Search `components/`, `lib/hooks/`, and existing pages before creating a component or hook.
- Reuse the established base/application/dashboard/chart/map components and utilities.
- Keep components focused on presentation, user interaction, and explicit UI state.
- Keep feature-specific composition close to the feature, but keep generic primitives reusable.
- Keep browser components free of server secrets and service-role access.

## State handling

Every data-driven view should intentionally handle loading, loaded, empty, error, stale, sleeping/offline, and unavailable states. Use timestamps and freshness metadata rather than implying that old data is live.

Use `null` or an explicit unavailable state for missing telemetry. Do not render missing numeric data as `0`, and do not silently invent addresses or routes.

## Responsive and accessible behavior

Design mobile-first and verify at approximately 360px, 390px, 430px, 768px, 1024px, and 1440px+. Avoid horizontal overflow. Preserve keyboard access, semantic headings, visible focus, labels, `aria-*` attributes, useful button titles, and readable contrast.

Use desktop width for multi-column data, tables, maps, and related charts rather than simply scaling mobile content. Avoid rendering unnecessary historical telemetry in the browser.
