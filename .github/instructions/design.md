# Design System and Visual Language

## Primary UI library

Untitled UI is the primary component library and the project already contains Untitled UI-derived/base components under `components/base/`, plus application composites under `components/application/` and `components/ui/`. Use the standard component and variant that already exists whenever possible.

Use standard components for buttons, badges, cards, tables, tabs, menus, selects, inputs, dialogs, drawers, tooltips, alerts, navigation, pagination, date controls, charts, and forms. The project also uses React Aria Components for accessible behavior and `@untitledui/icons`; follow existing local patterns.

Do not introduce another component library or create a second custom design system. Existing `lucide-react` usage is legacy/project-local; do not expand it for new UI when an established icon/component pattern is available.

## Customization limits

Prefer standard Untitled UI components and variants. Only add custom styling when a clear product requirement cannot reasonably be met by the existing system. Avoid:

- excessive custom CSS;
- unnecessary gradients or heavy shadows;
- oversized rounded cards;
- decorative elements without information value;
- gratuitous animation;
- card-inside-card nesting;
- generic dashboard or landing-page patterns.

## Visual direction

The product should feel modern, premium, clean, compact, sophisticated, professional, Tesla-specific, and information-dense. It should not look like Grafana, a generic admin dashboard, a marketing landing page, or a wall of giant metric cards.

Prefer compact related KPI groups, concise labels, small metadata, tables, purposeful charts, and clear hierarchy. For example:

```text
Battery
78% · 312 km · Updated 12 sec ago
```

is preferable to three oversized cards for those values. Density must remain readable, not cluttered.

## Responsive rules

Mobile is a first-class platform at approximately 360px, 390px, and 430px. Do not merely shrink desktop layouts; prioritize the most important information and preserve touch-friendly controls. At 768px, 1024px, and 1440px+, use available width for multi-column layouts, tables, maps, side-by-side charts, and metadata. Never introduce horizontal page overflow.

Maps and charts must have explicit loading, empty, error, and unavailable states. Visuals should communicate data provenance and freshness where relevant.
