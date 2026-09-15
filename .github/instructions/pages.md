# Application Information Architecture

TeslaMate is a reference for data and analytics only. Do not reproduce Grafana dashboards or their visual hierarchy. Pages should expose compact summaries with drill-down details, trustworthy freshness, and clear relationships.

## Main navigation

The current App Shell has Dashboard, Battery, Charging, Trips, Calendar, Alerts, and Settings routes. The target conceptual information architecture is:

```text
Dashboard

Drives
├── Drives
├── Drive Details
└── Drive Stats

Charging
├── Charges
├── Charge Details
└── Charging Stats

Battery
├── Charge Level
├── Battery Health
├── Projected Range
└── Vampire Drain

Analytics
├── Efficiency
├── Mileage
└── Statistics

Places
├── Locations
├── Visited
└── Trips

Timeline

Vehicle
├── States
└── Software Updates

Settings
├── API / Connection
├── Data Collection
└── Diagnostics
```

When adding a page, first inspect the actual route tree and existing navigation. Do not create duplicate routes or pretend a conceptual page already exists.

## Page responsibilities

### Dashboard
Answer what the vehicle is doing now: presence, freshness, battery/SOC, range, location, charging/driving status, key warnings, and a compact recent activity summary. Link to relevant detail pages.

### Drives / Drive Details / Drive Stats
List drives with time, duration, distance, energy, efficiency, route and confidence. Detail views show start/end, route, telemetry availability, battery delta, speeds, energy provenance, and related timeline events. Stats aggregate over filters and must disclose coverage.

### Charges / Charge Details / Charging Stats
List and detail charging sessions with start/end, duration, location, SOC delta, energy added, power, voltage/current, charger type, cost, and data completeness. Aggregate charging cost and energy only over valid sessions.

### Battery pages
Show SOC and projected/rated range history, health indicators, degradation trends, and parked loss/vampire drain. Separate measured observations from estimates and expose time windows, gaps, and assumptions.

### Analytics
Efficiency, mileage, and general statistics should support time/vehicle filters, server-side aggregation where appropriate, comparison periods, units, and empty/insufficient-data states.

### Places / Visited / Trips
Show named locations, visit history, route/trip relationships, geocoding availability, and optional maps. Never fabricate addresses or routes when coordinates are unavailable.

### Timeline
Provide a normalized chronological view of drives, charging, state changes, updates, alerts, and integration events. Support time filtering and event detail.

### Vehicle / States / Software Updates
Show normalized state transitions, freshness, software observations, and provider availability. Distinguish current state from historical snapshots.

### Settings / API, Data Collection, Diagnostics
Manage account/Fleet connection, collection preferences, units/timezone, permissions, request diagnostics, telemetry coverage, and safe error details. Keep secrets out of all UI responses.
