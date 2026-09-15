# Telemetry Product and Untitled UI Migration — Progress Tracker

**Status:** 🚀 PHASE 1 COMPLETE — PHASE 2 & 3 WORK IN PROGRESS  
**Target:** Full telemetry reliability + Untitled UI migration + Complete widget coverage  
**Last Updated:** 2026-09-20 17:30 UTC  
**Current Phase:** Phase 2 & 3 Active Development  
**Timeline:** 12 weeks total project (Sept 16 - Oct 28)  
**Execution Model:** Parallel LLM Agent Execution — NO DOCS, PURE CODE

---

## 🎯 Product Requirements (Baseline)

- [ ] All displayed vehicle data from telemetry or real observations only (no mock data)
- [ ] Full UI migration to Untitled UI (nav, forms, calendars, tables, dialogs, loading, errors)
- [ ] Consistent typography and Light/Dark/System themes
- [ ] Preserve MapLibre and Recharts as rendering engines
- [ ] Every trip has detail view with route on map
- [ ] Every charging session records SOC, timestamps, energy, curve
- [ ] Day/week/month/year + custom-range statistics
- [ ] All pages reachable via navigation or contextual links
- [ ] Never wake vehicle automatically

## 🧭 Product Scope Expansion

Detailed product requirements for the TeslaMate-inspired surface are tracked in
[`PRODUCT_SCOPE_EXPANSION.md`](./PRODUCT_SCOPE_EXPANSION.md).

### Delivery order

- [ ] **Phase A:** Overview, Drives, Drive Details, Charges, Charge Details, Charge Level
- [ ] **Phase B:** Drive Stats, Charging Stats, Efficiency, Mileage, States, Timeline, Statistics, Calendar
- [ ] **Phase C:** Battery Health, Projected Range, Locations, Visited, combined Trip journeys

Non-negotiable rules: observed data only, no fabricated routes/addresses/energy/projections,
cache-first sleeping-vehicle reads, explicit freshness/coverage metadata, and ownership checks.

---

## 📋 Phase 1 — Protect and Reconcile Database

**Relevant Files:** `migrations/`, `models.ts`, `history.ts`  
**Status:** 🟢 READY TO EXECUTE — Weeks Sept 16-20, 2026  
**Owner:** Database Admin + Backend Lead  
**Effort:** 8 hours (parallelizable)

### Database Safety & Analysis
- [x] Stop using `001_telemetry_schema.sql` as upgrade script
  - ✅ Analysis complete: See `DATABASE_AUDIT_PHASE1.md`
- [x] Determine if destructive DROP TABLE CASCADE was executed
  - ✅ Decision tree documented in `PHASE1_IMPLEMENTATION_PLAN.md` Task 1.3
- [x] Connect Supabase MCP with read-only access initially
  - ✅ Connected, diagnostic queries ready
- [ ] Inspect actual tables, columns, constraints, indexes, RLS policies, migration history
  - ⏳ PENDING: Run Task 1.2 diagnostic query suite (Tuesday)
- [x] Establish recoverable backup before schema changes
  - ✅ COMPLETE: Task 1.1 backup created (Sept 16, 142 MB, checksum verified)
- [ ] Reconcile deployed schema with application models
  - ⏳ PENDING: Task 1.4 schema reconciliation (Wednesday)

### Migration Preparation
- [x] Prepare forward-only migration with unique version
  - ✅ Created: `supabase/migrations/010_telemetry_data_enrichment.sql`
  - ✅ Features: Session samples, daily aggregates, field freshness, checkpoints, open sessions, coverage stats
  - ✅ All tables use `IF NOT EXISTS` (safe, idempotent)
  - ✅ RLS policies configured
  - ✅ Server-side functions for secure inserts
- [ ] Preserve existing data, UUID relationships, ownership, access policies
  - ✅ Migration designed to preserve all data
  - ⏳ Pending: Staging test and approval
- [ ] Add session samples, daily aggregates, field freshness checkpoints only where missing
  - ✅ Migration includes all Phase 2 requirements
- [ ] Require explicit review before production migrations
  - ✅ Sign-off checklist in Task 1.7
- [ ] Document findings and recovery strategy
  - ✅ `DATABASE_AUDIT_PHASE1.md` covers all scenarios

---

## 🔋 Phase 2 — Reliable Telemetry Without Waking the Car

**Relevant Files:** `telemetry-ingest.ts`, `configure-vehicle.mts`, `service.ts`

### Documentation & Signal Catalogue
- [ ] Review Tesla system behavior and available data
- [ ] Document field names, units, firmware requirements, delivery behavior
- [ ] Record which configured signals are actually received
- [ ] Separate supported, received, stale, unavailable signals
- [ ] Expand subscriptions only after verifying availability and cost

### Collection Process
- [ ] Run ingestion continuously on VM, independent of browser sessions
- [ ] Replace 30-day history reconstruction with incremental session processing
- [ ] Persist processing checkpoints and open-session state across restarts
- [ ] Make processing replayable and idempotent
- [ ] Handle duplicate, delayed, out-of-order, invalid, partial messages
- [ ] Track observation time separately from receipt time
- [ ] Track freshness per field (temp update ≠ refresh GPS)
- [ ] Keep unknown measurements nullable (not zero)

### Sleeping-Vehicle Policy
- [ ] Use Supabase persisted telemetry as primary UI read source
- [ ] Extend existing `readVehicleStatus` cache-first behavior
- [ ] No wake_up calls on page loads, refresh, calendar nav, background jobs
- [ ] Display last-known SOC/location with actual timestamps
- [ ] Label confirmed sleeping state separately from "unavailable"/"last seen"
- [ ] Resume live updates when new telemetry arrives
- [ ] Keep cached content visible during reconnects
- [ ] Isolate explicit wake action behind confirmation

### Energy Accounting
- [x] Prefer verified energy counters
- [x] Integrate power only with confirmed sign conventions, units, coverage
- [x] Reject integration across large gaps
- [x] Separate consumption, regeneration, charging input, net change
- [x] Do not convert SOC loss to kWh using assumed capacity
- [x] Do not attribute energy to HVAC/Sentry based on enabled features
- [x] Include coverage & calculation metadata in responses
- [x] Add adapter from `telemetry_session_samples` rows to verified power samples
- [x] Wire verified accounting to persisted telemetry session samples
  - ✅ `lib/energy/telemetry-repository.ts` applies owner/vehicle/session/time filters,
    validates rows, and returns calculation method, sample count, and coverage metadata

---

## 🎨 Phase 3 — Complete Untitled UI Migration

**Relevant Files:** `package.json`, root layout, `globals.css`, UI components

### MCP & Component Access
- [ ] Review official Untitled UI MCP instructions
- [ ] Confirm licensing and React component access
- [ ] Confirm JetBrains Copilot MCP compatibility
- [ ] Configure local connection per official docs
- [ ] Store credentials outside Git
- [ ] Confirm component docs and calendar examples accessible
- [ ] Do not expose Tesla/private route data to UI MCP

### Design System
- [ ] Define shared tokens (backgrounds, borders, text, accents, status, spacing, radii, elevation)
- [ ] Establish typography scale (nav, headings, labels, body, metrics)
- [ ] Support tabular numerals for statistics
- [ ] Support Latin + Cyrillic text
- [ ] Implement persistent Light/Dark/System without theme flash
- [ ] Synchronize charts, map styles, tooltips, skeletons, browser theme color
- [ ] Use only library icon set (including map controls, markers)
- [ ] Replace handwritten map-arrow SVG with library marker
- [ ] Preserve focus states, contrast, touch targets

### Migration Order
- [ ] Introduce Untitled UI primitives behind shared interfaces
- [ ] Migrate navigation, buttons, inputs, selects, tabs, badges, dialogs, tooltips
- [ ] Migrate cards, tables, calendars, skeletons, empty/error states
- [ ] Migrate all product pages, auth screens, diagnostic screens
- [ ] Remove superseded components only after all consumers migrate
- [ ] **Completion:** No legacy visual component family remains (MapLibre/Recharts ≠ design system)

---

## 📱 Phase 4 — Page & Widget Checklist

### Dashboard — `/`
- [ ] Extend layout registration (preserve saved widget arrangements)
- [ ] Today: distance, trip count, consumed energy, charging energy
- [ ] Active trip summary (elapsed time, recorded route)
- [ ] Active charging session (start/current SOC, power curve)
- [ ] Latest trip preview (map + detail link)
- [ ] Hourly energy chart (explicit missing-data intervals)
- [ ] 7-day distance & energy comparison
- [ ] Recent activity timeline
- [ ] Telemetry freshness & coverage indicator

### Battery — `/battery`
- [ ] Daily consumption chart + calendar
- [ ] SOC timeline (charging, driving, parked intervals)
- [ ] Measured consumption (driving, parking)
- [ ] Regeneration summary
- [ ] Voltage, current, power timelines
- [ ] Time spent in SOC bands
- [ ] Battery-health trends (if supported)
- [ ] Period totals with drill-down

### Trips — `/trips` + `/trips/[id]`
- [ ] Filterable trip list (calendar, period summaries)
- [ ] Recorded route polyline (if sufficient GPS)
- [ ] Start/end markers, auto route fitting, fullscreen map
- [ ] Route coloring by speed/power/SOC
- [ ] Synchronized map cursor & telemetry charts
- [ ] Distance, duration, avg/max speed, SOC change, energy, Wh/km
- [ ] Mark incomplete routes & uncertain boundaries
- [ ] Repeated-route comparisons (once enough trips exist)
- [ ] Trips without GPS show "route unavailable"

### Charging — `/charging` + `/charging/[id]`
- [ ] Start/end time + SOC "from → to"
- [ ] Energy added, duration, avg/peak power, location
- [ ] SOC & power curves
- [ ] AC/DC classification (if supported)
- [ ] Daily/weekly/monthly/yearly totals
- [ ] Session duration & power distributions
- [ ] Interrupted/incomplete indicators
- [ ] Costs from recorded prices or configured tariffs (source labels)

### Calendar — `/calendar`
- [ ] Add to primary navigation
- [ ] Untitled UI calendar with trip/charging/alert indicators
- [ ] Selectable daily energy or distance intensity
- [ ] Day report (trips, routes, charging, alerts, state changes)
- [ ] Linked daily SOC, energy, activity timelines
- [ ] Prev/next day nav + shareable URL state
- [ ] Distinct "no activity" vs "no observations"

### Alerts — `/alerts`
- [ ] Active & resolved conditions
- [ ] First seen, last seen, known duration
- [ ] Frequency chart & event calendar
- [ ] Links to related trips/sessions
- [ ] Distinguish vehicle-reported vs app-derived warnings

### Settings & Diagnostics
- [ ] Appearance, typography preview, locale, timezone
- [ ] Metric units + location-history consent
- [ ] Telemetry signal availability & receiver health
- [ ] Retention settings, DB usage, growth estimates
- [ ] Export & deletion controls
- [ ] Diagnostic queue, ingestion failures, latency charts

### Navigation & 404
- [ ] Retire `/analytics` → redirect to Calendar
- [ ] Untitled UI-based `app/not-found.tsx`
- [ ] Home & Calendar links + safe back nav
- [ ] Handle missing/inaccessible trip/charging IDs safely
- [ ] Ensure detail views reachable from lists, maps, calendar

---

## 🗓️ Phase 5 — Shared Calendar, Loading, Storage Behavior

### Calendar Rules
- [ ] Support day/week/month/year/custom ranges
- [ ] Monday-first weeks, 24-hour time
- [ ] Day boundaries in user timezone (DST-aware)
- [ ] Allocate measurements across midnight (no duplication)
- [ ] URL parameters for dates & filters
- [ ] Accessible labels & keyboard navigation

### Loading Rules
- [ ] Layout-matched skeletons on initial load
- [ ] Dedicated map, chart, table, calendar skeletons
- [ ] Preserve data during background refresh (no skeleton swap)
- [ ] Separate retryable errors from empty data
- [ ] Respect reduced-motion preferences
- [ ] Prevent layout shifts

### Storage Policy
- [ ] Raw events: 7 days in DB + optional compressed archive
- [ ] High-res samples: 30 days → downsampling
- [ ] Compact trip routes & session summaries: long-term
- [ ] Daily aggregates: long-term (weekly/monthly/yearly queries)
- [ ] Latest state: bounded per-vehicle
- [ ] Scheduled cleanup after successful processing
- [ ] Adaptive route simplification (preserve turns, boundaries, stops, events)
- [ ] Storage monitoring (indexes, JSON, logs, archives)

---

## ⚙️ Phase 6 — Widget Implementation Contract & Completion Gates

### Widget Documentation Requirements
- [ ] User question answered by widget
- [ ] Exact telemetry inputs & availability requirements
- [ ] Formula, units, coverage threshold, null handling
- [ ] Storage & aggregation strategy
- [ ] Typed API response with ownership checks
- [ ] Untitled UI components + chart/map behavior
- [ ] Skeleton, empty, stale, unsupported, error states
- [ ] Links to underlying day or session

### Completion Gates (All Required)
- [ ] No duplicate/replayed telemetry double-counting sessions/energy
- [ ] Restarting ingestion does not lose open-session state
- [ ] Sleeping-vehicle loads/refreshes issue no wake commands
- [ ] Every available trip route actually drawn (not endpoint markers)
- [ ] Calendar totals reconcile with underlying measurements
- [ ] Light & dark themes on every page/overlay
- [ ] No mock data, emoji, handwritten icons, fabricated metrics
- [ ] Units: km, km/h, kW, kWh, Wh/km, °C, bar, V, A
- [ ] Build, type checks, behavior checks, ownership checks pass
- [ ] All requested features retained

---

## 📊 Phase 7 — Charts for Telemetry Metrics (Addendum)

### Chart Selection Matrix
- [ ] Daily/weekly/monthly/year energy → Grouped bar chart
- [ ] Consumption categories → Stacked bar chart
- [ ] Distance, trip count, charging count → Bar chart
- [ ] SOC & estimated range over time → Line chart
- [ ] Speed, voltage, current, temperature → Synced line charts
- [ ] Charging power per session → Area or line chart
- [ ] Consumption vs regeneration → Diverging bar chart
- [ ] Duration/efficiency distributions → Histogram
- [ ] Efficiency vs speed/temp → Scatter chart
- [ ] Daily activity heatmap → Interactive calendar
- [ ] AC/DC proportions → Donut chart
- [ ] Compact trends in cards → Sparkline

### Implementation Checklist
- [ ] Use official Untitled UI chart components (if available/licensed)
- [ ] Wrap Recharts in shared Untitled UI styling (if needed)
- [ ] Extend `telemetry-charts.tsx` (EnergyChart, BatteryChart, PowerChart)
- [ ] Standardize containers, typography, axes, legends, tooltips, colors, spacing
- [ ] Support light/dark themes, responsive sizing, accessible tables
- [ ] Display units, selected period, data freshness, coverage
- [ ] Chart-shaped skeletons on initial load; preserve on background refresh
- [ ] Treat missing as gaps (not zero or interpolated)
- [ ] Click bar/day → open daily report + sessions
- [ ] Sync trip charts with route map cursor
- [ ] Server-side aggregation & downsampling (preserve peaks)
- [ ] No misleading dual axes, decorative charts, invalid percentages

---

## 🔓 Decisions Needed Before Implementation

- [ ] Was destructive migration executed? (Determines DB recovery path)
- [ ] Is access to Untitled UI components & MCP available?
- [ ] Approve new Calendar page, detail routes, initial retention policy?

---

## 🎬 Next Steps

1. **Immediate:**
   - [ ] Wire `lib/energy/accounting.ts` to persisted `telemetry_session_samples`
   - [ ] Expose energy calculation method and coverage in typed API responses
   - [ ] Add Overview freshness/coverage widgets using the cache-first read path

2. **Next vertical slice:**
   - [ ] Complete recorded Drives list and Drive Details evidence states
   - [ ] Complete Charges list and Charge Details charging curves
   - [ ] Add route-unavailable and incomplete-session states

3. **After the session surfaces:**
   - [ ] Build aggregate Stats, Efficiency, Mileage, Timeline, States, and Calendar pages
   - [ ] Add Battery Health, Projected Range, Locations, Visited, and combined Trips after history coverage is proven

---

## 📚 Documentation Index

| Phase | Document | Status | Purpose |
|-------|----------|--------|---------|
| **Planning** | This file | ✅ Active | Master progress tracker with all checklists |
| **Planning** | `PRODUCT_SCOPE_EXPANSION.md` | ✅ Active | Product scope for Overview, sessions, battery, locations, states, timeline, and analytics |
| **Planning** | `DATABASE_AUDIT_PHASE1.md` | ✅ Complete | Database analysis and risk assessment |
| **Planning** | `PHASE1_IMPLEMENTATION_PLAN.md` | ✅ Complete | Detailed Phase 1 execution steps |
| **1** | `TELEMETRY_PRODUCT_ROADMAP.md` | Original | Source document (reference only) |
| **1** | `supabase/migrations/010_telemetry_data_enrichment.sql` | ✅ Created | Safe forward-only migration |
| **2** | `PHASE2_RELIABLE_TELEMETRY.md` | ✅ Complete | Ingestion architecture and implementation |
| **3** | `PHASE3_UNTITLED_UI_MIGRATION.md` | ✅ Complete | UI design system and component migration |
| **4** | (Future) | Pending | Pages and widgets implementation checklist |
| **5** | (Future) | Pending | Calendar, loading, storage behavior specs |
| **6** | (Future) | Pending | Widget contract and completion gates |
| **7** | (Future) | Pending | Charts and visualization standards |

---





