# DriveScope Product Scope Expansion

**Status:** Planned product scope
**Owner:** Product + frontend + telemetry
**Depends on:** `TELEMETRY_PRODUCT_ROADMAP.md`, `TELEMETRY_ROADMAP_PROGRESS.md`
**Principle:** show only observed, derived-with-known-formula, or explicitly unavailable data. Never fabricate vehicle state, routes, energy, addresses, costs, or degradation.

This document captures the product scope requested for the TeslaMate-inspired analytics surface. It expands the existing Phase 4–7 page checklist into user-facing sections, route expectations, data contracts, and delivery order.

## 1. Product navigation map

| Section | Route | Product role | Delivery phase |
|---|---|---|---|
| Overview | `/` or `/dashboard` | Current high-level vehicle state | A |
| Drives | `/trips` | Raw drive sessions | A |
| Drive Details | `/trips/[id]` | One drive, route, charts, and evidence | A |
| Drive Stats | `/trips/stats` | Aggregated drive analytics | B |
| Charges | `/charging` | Raw charging sessions | A |
| Charge Details | `/charging/[id]` | One session and charging curve | A |
| Charging Stats | `/charging/stats` | Aggregated charging analytics | B |
| Charge Level | `/battery` | SOC and range history | A |
| Battery Health | `/battery/health` | Long-term capacity/range trend | C |
| Projected Range | `/battery/projected-range` | Range projection with confidence | C |
| Efficiency | `/efficiency` | Net/gross consumption analytics | B |
| Mileage | `/mileage` | Distance totals and trends | B |
| Locations | `/locations` | Known locations and geofences | B |
| Visited | `/visited` | Lifetime visited-place map | C |
| Trip | `/trips/combined/[id]` | Multi-drive journey | C |
| States | `/states` | Vehicle-state timeline | B |
| Timeline | `/timeline` | Unified activity audit trail | B |
| Statistics | `/statistics` | Top-level day/week/month/year analytics | B |

Existing routes are reused where present. New routes must be added only with ownership checks and explicit empty/unsupported states.

## 2. Section requirements

### A. Overview — current vehicle state

The Overview is a high-level dashboard, not a command console. It prioritizes current information over controls.

**Vehicle:** name, model, VIN, software version, state (`asleep`, `online`, `driving`, `charging`, `suspended/offline`), last seen, last update.

**Battery:** SOC, rated range, ideal range, estimated remaining range, battery energy remaining, degradation when evidenced, charge limit.

**Location:** latitude, longitude, address, city, country, geofence, current speed, heading.

**Charging when active:** state, power, voltage, current, phases, time to full, charge limit, energy added, charging location.

**Climate:** inside/outside temperature, HVAC state, driver/passenger targets, HVAC power/state when available.

**Recent activity:** last drive, last charge, current session, last known location.

Acceptance: sleeping vehicles show last-known values with their actual timestamp and never become "No data" merely because they are asleep.

### B. Drives — raw drive sessions

Each row represents one drive session.

- Time: start, end, duration.
- Location: start/end address, coordinates, geofence.
- Distance: total, average speed, maximum speed.
- Battery: start/end SOC, SOC delta, start/end range.
- Energy: consumed, net, gross, Wh/km, Wh/mi when derivable.
- Temperature: average, minimum, maximum.
- Route: GPS trace and route geometry when available.

The table should surface: date, from, to, distance, duration, energy, consumption, average speed, battery delta, and temperature. Filters and period summaries must distinguish no drives from no observations.

### C. Drive Details — one drive

Header example: `Berlin → Potsdam`, distance, duration, energy, consumption.

Show start/end time, duration, distance, locations, start/end battery, energy, average/max speed, and temperature. Provide synchronized timeline charts for SOC, speed, power, rated/ideal range, and outside temperature. Provide a complete route map with GPS points, start/end markers, speed visualization, and elevation gain/loss only when observed.

A drive without sufficient GPS remains accessible and must explicitly say `Route unavailable`; endpoint markers must not be presented as a recorded route.

### D. Drive Stats — aggregate drives

For today and selectable periods: drive count, distance, driving time, energy consumed, average consumption, average/max speed, and average temperature.

Charts: distance by day/week/month, energy consumption, consumption over time, average speed, driving time, and trip count. Optional derived insights include best/worst consumption, longest drive, longest trip, frequent route, and most visited destination only after sufficient sample counts are available.

### E. Charges — raw charging sessions

Each row represents one charging session.

- Time: start, end, duration.
- Location: address, geofence, coordinates.
- Battery: start/end SOC, SOC gained.
- Energy: added, used, efficiency, rate.
- Charger: AC/DC when supported, voltage, current, power, phases.
- Cost: recorded cost, cost/kWh, currency, tariff source.
- Range: before, after, added.
- Temperature: outside temperature.

Costs must come from recorded prices or an explicitly configured tariff and include their source.

### F. Charge Details — one charging session

Show charger/location header, start/end time, duration, SOC transition, energy added, range added, cost, efficiency, and a synchronized charging curve for SOC, power, voltage, current, and range. Include charger power, voltage, current, phases, charge rate, requested current, and maximum available current when observed.

### G. Charging Stats — aggregate charging

KPIs: number of charges, energy added/used, total and average cost, cost/kWh, average duration, energy/session, and charge rate. Break down by day/week/month/year, location, AC/DC, home, Supercharger, and other locations where classification exists. Charts cover energy, cost, cost/kWh, duration, average power, and efficiency.

### H. Charge Level — SOC history

Show timestamped SOC, rated range, ideal range, estimated range, and battery energy. Overlay drives, charges, and parked periods as observed intervals. Missing telemetry remains a chart gap, not zero or interpolation.

### I. Battery Health

Show battery capacity, ranges, SOC, estimated degradation, original/current rated range, capacity loss, range loss, and change over 30 days, 6 months, and 1 year. Metrics are hidden or marked insufficient when measurement coverage is inadequate.

### J. Projected Range

Show rated/ideal range history, baseline/original range, degradation estimate, and projected future range. Every projection must display its method, observation window, confidence/coverage, and unavailable state when insufficient history exists.

### K. Efficiency

Preserve the distinction between net and gross consumption. Provide Wh/km and Wh/mi, energy consumed, distance, consumption over time, temperature, speed, distance, and season comparisons. Do not imply causation from scatter plots.

### L. Mileage

Show total mileage plus today/week/month/year totals, with daily, weekly, monthly, and yearly charts. All totals must reconcile with the underlying drive sessions.

### M. Locations

List known addresses/geofences with name, address, coordinates, city, country, visit count, drive/charge counts, energy, time spent, first visit, and last visit. Address enrichment must preserve source and failure state.

### N. Visited

Provide a lifetime map of visited locations, GPS points, addresses, and geofences, with counts and first/last visit metadata. Respect location-history consent and ownership boundaries.

### O. Trip — combined journey

A Trip groups multiple Drive sessions and intermediate stops into one journey. Show total distance, duration, energy, start/end, stops, route, included drives, and included charges. It must remain distinct from an individual Drive.

### P. States

Show state intervals for asleep, online, driving, charging, parked, and offline with start, end, and duration. Preserve state transitions from observed telemetry rather than inferring them from page visits.

### Q. Timeline

Unify drives, charges, online/offline, sleeping, updates, and other vehicle activity into one chronological audit trail. Every event links to its source drive/session where available and identifies whether it is vehicle-reported or application-derived.

### R. Statistics

Top-level day/week/month/year/custom-range table for drives, distance, driving time, energy used, charges, energy/charge, cost, net consumption, gross consumption, and temperature. Aggregates must reconcile with raw sessions and show coverage.

## 3. Shared data contract

Every page/widget must document:

1. User question answered.
2. Exact telemetry inputs and availability.
3. Formula, units, coverage threshold, and null handling.
4. Storage and aggregation strategy.
5. Typed response and ownership check.
6. Freshness/source/calculation-method metadata.
7. Loading, empty, stale, unsupported, and error states.
8. Link to the underlying session/day/event.

Canonical units: km, km/h, kW, kWh, Wh/km, Wh/mi, °C, V, A, and currency with an explicit code.

## 4. Delivery plan

### Phase A — trustworthy current and session surfaces

- Stabilize Overview around cache-first vehicle state.
- Complete Drives and Drive Details using recorded telemetry only.
- Complete Charges and Charge Details with session curves.
- Complete Charge Level/SOC history.
- Preserve MapLibre route lifecycle and show route-unavailable states.

### Phase B — reconciled analytics

- Add Drive Stats, Charging Stats, Efficiency, Mileage, States, Timeline, and Statistics.
- Add day/week/month/year/custom-range aggregation.
- Add server-side downsampling and reconciliation tests.
- Add Calendar as the cross-page activity hub.

### Phase C — long-term intelligence

- Add Battery Health and Projected Range with confidence metadata.
- Add Locations and Visited with consent and geofence provenance.
- Add combined Trip journeys.
- Add route comparisons and derived insights only after minimum sample thresholds.

## 5. Execution order after current work

1. Wire `lib/energy/accounting.ts` to persisted telemetry session samples and expose calculation metadata.
2. Add the Overview data contract and freshness/coverage widgets.
3. Finish Drives/Drive Details fields and route evidence states.
4. Finish Charges/Charge Details fields and charging curves.
5. Build aggregate endpoints and pages for Stats/Efficiency/Mileage/Statistics.
6. Build Calendar/Timeline/States as cross-page history surfaces.
7. Add Health/Projected Range/Locations/Visited/Trip after historical coverage is proven.

## 6. Non-negotiable safety gates

- No automatic `wake_up` from navigation, page load, refresh, calendar navigation, or background jobs.
- No fabricated endpoint routes, addresses, energy, degradation, costs, or projections.
- No SOC-to-kWh conversion using assumed battery capacity.
- No aggregate marked complete when source coverage is incomplete.
- No cross-owner detail access.
- Missing observations are null/gaps, not zeros.
- Every production feature has unit tests, type/build checks, and an ownership/empty-state check.

