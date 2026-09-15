# Domain Data Model

## Model rules

Raw provider telemetry, normalized application data, and derived analytics are different concepts:

```text
Raw telemetry
    ↓
Normalized data
    ↓
Derived metrics
    ↓
Analytics and presentation
```

Application models in `lib/tesla/models.ts` use canonical metric units and nullable fields. Presentation labels belong in formatting/UI code, not stored domain models.

Canonical units are km, km/h, kW, kWh, Wh/km, °C, percentages, and minutes. Fleet miles/range/odometer values must be converted exactly once; preserve raw values where auditability requires it. Never treat missing data as zero.

## Core entities

### Vehicle
The connected Tesla and its identity/configuration. Important fields include internal database UUID, Fleet short tag used for path requests, long Fleet vehicle ID for cross-endpoint identity, VIN, display name, model/configuration, owner, current presence, software version, and latest state. Source is Fleet API/telemetry; current summaries are normalized and derived freshness is calculated at read time.

### Drive
A continuous driving session derived from state/telemetry. Fields include start/end, duration, start/end positions, route, distance, odometer delta, battery start/end, measured energy consumed, efficiency, average/max speed, temperature when available, confidence, partial status, and source/provenance. Energy and efficiency are derived only from valid measured telemetry; unavailable values remain `null`.

### Position
A historical GPS/vehicle sample with timestamp, latitude, longitude, heading, accuracy when available, source (`live` or `last_known`), and vehicle relationship. Coordinates follow the repository's route convention; inspect existing map/route helpers before changing it.

### TelemetrySample
A time-stamped normalized observation such as SOC, speed, power, pack voltage/current, location, odometer, charging state, or climate. Raw events remain auditable in Fleet telemetry storage; samples may be coalesced for calculations and must retain timestamps and units.

### ChargingSession
A continuous charge session with start/end, duration, location, start/end SOC, energy added, average/peak power, voltage/current, charger type, fast-charge state, phases when available, and cost when configured. Charging measurements and driving consumption must not be conflated.

### VehicleState
A normalized current/historical state such as `asleep`, `online`, `driving`, `charging`, `parked`, or `offline`. The repository's `VehiclePresence` uses these states; connectivity and presence are related but distinct. A sleeping vehicle may have no fresh location or battery detail.

### Location
A known vehicle position or named/geocoded place, optionally with source, accuracy, address label, and timestamps. Reverse geocoding is optional and failure must display an unavailable state rather than a fabricated name.

### Geofence
A user- or system-defined geographic boundary associated with a location/place. It may support visits and timeline interpretation; do not assume a geofence exists in the current schema without checking migrations.

### Trip
A higher-level journey that may contain multiple drives, stops, or charging sessions. It includes time range, distance, route, places, energy, and linked sessions/events. A trip is not automatically identical to one raw drive; preserve provenance and confidence.

### SoftwareUpdate
A vehicle software version/update observation with version, state, availability, timestamps, and optional release metadata. Provider availability and actual installation must remain distinct.

### TimelineEvent
A normalized chronological event such as drive started/completed, charging started/completed, state transition, software update, alert, or credential/API event. Events should have type, occurred time, vehicle/owner relationship, source, data payload, and a dedupe key where persisted.

### BatterySnapshot
A time-series battery observation containing SOC, usable SOC when available, rated/projected range, charging state, odometer, position when available, and timestamp. Battery health and vampire drain are analytics over snapshots, not raw fields unless explicitly measured.

## Relationships and provenance

A Vehicle has many positions, telemetry samples, states, drives, charging sessions, trips, battery snapshots, software updates, and timeline events. Drives and charging sessions may contribute to trips and timeline events. Analytics must reference their source samples/time coverage and distinguish measured, normalized, estimated, and unavailable values.
