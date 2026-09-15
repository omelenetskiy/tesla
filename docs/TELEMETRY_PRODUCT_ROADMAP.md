Plan: Telemetry Product and Untitled UI Migration
Status: Active roadmap
Target document: TELEMETRY_PRODUCT_ROADMAP.md
Execution order: Data safety → telemetry reliability → design system → widgets → release readiness.
This is the architecture and delivery roadmap. The expanded product scope for Overview, Drives, Charges, battery, locations, states, timeline, and analytics is tracked in `PRODUCT_SCOPE_EXPANSION.md`. Supabase and Untitled UI access remain explicit prerequisites where required below.
Product requirements
All displayed vehicle data comes from telemetry or previously stored real observations.
No mock data, generated statistics, emoji, or handwritten icon graphics.
Fully migrate the application’s UI to Untitled UI, including navigation, forms, calendars, tables, dialogs, loading states, and error pages.
Provide consistent typography and Light / Dark / System themes.
Preserve MapLibre and Recharts as specialized rendering engines, styled through the shared design system.
Every recorded trip has a detail view with its recorded route drawn on a map.
Every charging session records its available start/end SOC, timestamps, energy, and charging curve.
Provide day, week, month, year, and custom-range statistics.
Every product page is reachable through navigation or contextual links.
Never wake the vehicle automatically.

Phase 1 — Protect and reconcile the database
Relevant files: migrations, models.ts, history.ts
Stop using 001_telemetry_schema.sql as an upgrade script.
Determine whether its destructive DROP TABLE … CASCADE statements were executed.
Connect Supabase MCP to the correct project, initially with read-only access.
Inspect actual tables, columns, constraints, indexes, RLS policies, migration history, and storage usage.
Establish a recoverable backup before any schema changes.
Reconcile the deployed schema with existing application models.
Prepare a new forward-only migration with a unique version.
Preserve existing data, UUID vehicle relationships, ownership, and access policies.
Add session samples, daily aggregates, field freshness, and processing checkpoints only where missing.
Require explicit review before applying production migrations.
Important: The attached migration recreates tables with names and types different from the original application schema. Adding IF NOT EXISTS does not reconcile those differences. Destructive recreation is not an acceptable repair.
If previously stored data was deleted, recovery depends on available backups or retained raw telemetry; do not promise reconstruction without evidence.

Phase 2 — Reliable telemetry without waking the car
Relevant files: telemetry-ingest.ts, configure-vehicle.mts, service.ts
Documentation and signal catalogue
Review Tesla’s system behavior and available data.
Document exact field names, units, firmware requirements, delivery behavior, and unavailable-value semantics.
Record which configured signals are actually received from this vehicle.
Separate supported, received, stale, and unavailable signals.
Expand subscriptions only after verifying field availability and collection cost.
Collection process
Run ingestion continuously on the VM, independently of browser sessions.
Replace repeated 30-day history reconstruction with incremental session processing.
Persist processing checkpoints and open-session state across restarts.
Make processing replayable and idempotent, including failures after raw-event insertion.
Handle duplicate, delayed, out-of-order, invalid, and partial messages.
Track observation time separately from receipt time.
Track freshness per field; receiving a temperature update must not refresh an old GPS position.
Keep unknown measurements nullable rather than substituting zero.
Sleeping-vehicle policy
Use Supabase’s latest persisted telemetry state as the primary UI read source.
Extend the existing readVehicleStatus cache-first behavior.
Page loads, refresh buttons, calendar navigation, and background jobs must not call wake_up.
Do not automatically query vehicle data merely because the cached snapshot is old.
Display last-known SOC, location, and other observations with their actual timestamps.
Label confirmed sleeping state separately from “telemetry unavailable” or “last seen.”
Resume live updates when new telemetry arrives naturally.
Keep cached content visible during reconnects and background refreshes.
If an explicit wake action remains, isolate it behind confirmation; never attach it to ordinary refresh.
Energy accounting
Prefer verified energy counters where available.
Integrate power only with confirmed sign conventions, units, and sufficient temporal coverage.
Reject integration across large gaps or stale current/voltage combinations.
Separate consumption, regeneration, charging input, and net change.
Do not convert SOC loss into kWh using an assumed battery capacity.
Do not attribute energy to HVAC or Sentry merely because those features were enabled.
Include coverage and calculation-method metadata in aggregate responses.

Phase 3 — Complete Untitled UI migration
Relevant files: package.json, root layout, globals.css, UI components
MCP and component access
Review the official Untitled UI MCP instructions.
Confirm licensing and access to the required React components and icons.
Confirm JetBrains Copilot compatibility with the documented MCP transport.
Configure the documented connection locally without inventing package names or endpoints.
Store credentials outside Git.
Confirm component documentation and calendar examples are accessible.
Do not expose Tesla credentials or private route histories to the UI MCP.
A local editor connection to a hosted MCP is not the same as running its server locally. Use the deployment model supported by the official integration.
Design system
Define shared tokens for backgrounds, borders, text, accents, status colors, spacing, radii, and elevation.
Establish one typography scale for navigation, headings, labels, body text, and metrics.
Use tabular numerals for statistics and support both Latin and Cyrillic text.
Implement persistent Light / Dark / System settings without a theme flash.
Synchronize charts, map styles, tooltips, skeletons, and browser theme color.
Use only the selected library icon set, including map controls and markers.
Replace existing handwritten map-arrow SVG artwork with a library-based marker.
Preserve visible focus states, readable contrast, and comfortable touch targets.
Migration order
Introduce Untitled UI primitives behind shared component interfaces.
Migrate navigation, buttons, inputs, selects, tabs, badges, dialogs, and tooltips.
Migrate cards, tables, calendars, skeletons, and empty/error states.
Migrate every product page, authentication screen, and diagnostic screen.
Remove superseded components and dependencies only after all consumers migrate.
Completion condition: No legacy visual component family remains in the product. MapLibre and Recharts remain implementation engines, not competing design systems.

Phase 4 — Page and widget checklist
Dashboard — /
Extend dashboard layout registration without losing saved widget arrangements.
Today’s distance, trip count, consumed energy, and charging energy.
Active trip summary with elapsed time and recorded route.
Active charging session with start/current SOC and power curve.
Latest trip preview with map and detail link.
Hourly energy chart with explicit missing-data intervals.
Seven-day distance and energy comparison.
Recent activity timeline.
Telemetry freshness and coverage indicator.
Battery — /battery
Daily consumption chart and selectable calendar.
SOC timeline with charging, driving, and parked intervals.
Measured consumption during driving and parking, where supported.
Regeneration summary where measurable.
Voltage, current, and power timelines.
Time spent in SOC bands.
Battery-health trends only when supported by sufficient valid measurements.
Period totals with drill-down to contributing sessions.
Trips — /trips and /trips/[id]
Filterable trip list with calendar and period summaries.
Recorded route polyline for every trip with sufficient GPS observations.
Start/end markers, automatic route fitting, and fullscreen map.
Route coloring by speed, power, or SOC where samples exist.
Synchronized map cursor and telemetry charts.
Distance, duration, average/max speed, SOC change, energy, and Wh/km.
Clearly marked incomplete routes and uncertain boundaries.
Repeated-route comparisons once enough real trips exist.
Use the existing VehicleMap.route and fitRoute capabilities. Do not fabricate routes from endpoints or conceal GPS gaps. A trip without GPS retains its detail page with an explicit “route unavailable” state.
Charging — /charging and /charging/[id]
Start/end time and SOC “from → to.”
Energy added, duration, average/peak power, and location.
SOC and power curves for each session.
AC/DC classification only when supported by received data.
Daily, weekly, monthly, and yearly charging totals.
Session duration and power distributions.
Interrupted/incomplete session indicators.
Costs only from recorded prices or explicitly configured tariffs, with source labels.
Calendar — /calendar
Add this page to primary navigation as the cross-page activity hub.
Untitled UI calendar with trip, charging, and alert indicators.
Selectable daily energy or distance intensity.
Day report containing trips, route maps, charging sessions, alerts, and available state changes.
Linked daily SOC, energy, and activity timelines.
Previous/next day navigation and shareable URL state.
Distinct states for “no activity” and “no observations.”
Alerts — /alerts
Active and resolved conditions.
First seen, last seen, and known duration.
Frequency chart and event calendar.
Links to related trips or charging sessions.
Clear distinction between vehicle-reported alerts and application-derived warnings.
Settings and diagnostics
Appearance, typography preview, locale, and timezone.
Metric units and location-history consent.
Telemetry signal availability and receiver health.
Retention settings, database usage, and growth estimates.
Export and deletion controls.
Diagnostic queue, ingestion failures, and latency charts accessible from Settings.
Navigation and 404
Keep /analytics retired; redirect it to the new Calendar hub.
Add an Untitled UI-based app/not-found.tsx.
Provide Home and Calendar links plus safe back navigation.
Handle missing/inaccessible trip and charging IDs without exposing another owner’s data.
Ensure detail views are reachable from lists, maps, and calendar events.

Phase 5 — Shared calendar, loading, and storage behavior
Calendar rules
Support day/week/month/year/custom ranges.
Use Monday-first weeks and 24-hour time.
Calculate day boundaries in the user’s timezone, including daylight-saving transitions.
Allocate measurements across midnight without duplicating the parent session.
Keep selected dates and filters in URL parameters.
Provide accessible labels and keyboard navigation.
Loading rules
Show layout-matched skeletons on initial page and widget loads.
Use dedicated map, chart, table, and calendar skeletons.
Preserve existing data during background refresh rather than replacing it with skeletons.
Show retryable errors separately from empty data.
Respect reduced-motion preferences and prevent layout shifts.
Storage policy
Initial proposal, adjusted after measuring actual ingestion volume:
Raw events: seven days in the database, optional compressed archive.
High-resolution samples: 30 days, then downsampling.
Compact trip routes and session summaries: long-term retention.
Daily aggregates: long-term retention for weekly/monthly/yearly queries.
Latest state: bounded per-vehicle storage.
Scheduled cleanup only after successful processing and aggregation.
Adaptive route simplification preserving turns, boundaries, stops, and important events.
Storage monitoring covering indexes, JSON payloads, logs, and archives.

Phase 6 — Widget implementation contract and completion gates
Every widget must document:
User question answered.
Exact telemetry inputs and availability requirements.
Formula, units, coverage threshold, and null handling.
Storage and aggregation strategy.
Typed API response with ownership checks.
Untitled UI components and chart/map behavior.
Skeleton, empty, stale, unsupported, and error states.
Links to its underlying day or session.
Required completion gates:
Duplicate and replayed telemetry cannot double-count sessions or energy.
Restarting ingestion does not lose open-session state.
Sleeping-vehicle page loads and refreshes issue no wake commands.
Every available trip route is actually drawn, not merely represented by endpoint markers.
Calendar totals reconcile with underlying measurements and sessions.
Light and dark themes cover every page and overlay.
No mock production data, emoji, handwritten icons, or fabricated default metrics remain.
Units are km, km/h, kW, kWh, Wh/km, °C, bar, V, and A.
Build, type checks, automated behavior checks, and ownership checks pass without removing requested features.
Decisions needed before implementation
Was the destructive migration executed successfully? This determines the database recovery path.
Is access to the required Untitled UI components and MCP available?
Approve this draft’s new Calendar page, detail routes, and initial retention policy.

Plan Addendum — Charts for Telemetry Metrics
Status: Draft addition to TELEMETRY_PRODUCT_ROADMAP.md; not yet saved.
Use reusable bar-chart and chart components for historical metrics, comparisons, and distributions—not only numeric cards.
Chart selection
Metrics
Chart component
Energy consumed and charged per day/week/month/year
Grouped bar chart
Measurable consumption categories
Stacked bar chart with non-overlapping categories
Distance, trip count, charging-session count
Bar chart
SOC and estimated range over time
Line chart
Speed, voltage, current, and temperature
Line charts with synchronized time axes
Charging power during a session
Area or line chart
Consumption versus regeneration
Diverging bar chart
Trip duration, charging duration, efficiency distributions
Histogram
Efficiency versus speed or outside temperature
Scatter chart; do not imply causation
Daily activity and energy consumption
Interactive calendar heatmap
Category proportions, such as AC/DC charging energy
Donut chart, including an unknown category when needed
Compact trends within dashboard cards
Sparkline with current value and period label
Implementation checklist
Use official Untitled UI chart components where available and licensed.
Otherwise, wrap the existing Recharts components in shared Untitled UI styling; do not hand-build charts with CSS bars or custom SVG.
Extend telemetry-charts.tsx, including existing EnergyChart, BatteryChart, and PowerChart.
Standardize chart containers, typography, axes, legends, tooltips, colors, and spacing.
Support light and dark themes, responsive sizing, and accessible alternative data tables.
Display metric units, selected period, data freshness, and coverage.
Show chart-shaped skeletons during initial loading; preserve existing charts during background refresh.
Treat missing observations as gaps—not zero values or fabricated interpolations.
Allow clicking a bar or calendar day to open its daily report and contributing sessions.
Synchronize trip charts with the selected position on the route map.
Aggregate long periods server-side and downsample dense series without losing important peaks.
Avoid misleading dual axes, decorative charts, and percentages without a valid denominator.
Review point: This adds a mandatory chart-selection and interaction standard to every applicable widget in the roadmap.
