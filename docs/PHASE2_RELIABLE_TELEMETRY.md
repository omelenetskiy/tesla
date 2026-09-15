# Phase 2 — Reliable Telemetry Without Waking the Car

**Status:** In Design  
**Target:** Telemetry ingestion that respects sleeping vehicle state  
**Blockers:** Phase 1 database must be completed first

---

## Overview

Phase 2 transforms telemetry collection from:
- ❌ Ad-hoc, browser-triggered refresh calls (wakes vehicle)
- ❌ 30-day history reconstruction on every load
- ❌ Fragmented signal understanding (unknown if available or stale)

To:
- ✅ Continuous VM-based ingestion (never wakes car)
- ✅ Incremental, idempotent session processing
- ✅ Explicit signal availability tracking
- ✅ Sleepy vehicle friendly (cached snapshots as primary read)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Fleet Telemetry Stream (Streaming API)                         │
│  Receives high-frequency field updates from all vehicles        │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  Ingest Loop (VM-based, independent of browser)                 │
│  ✓ Runs 24/7 whether app is open or not                         │
│  ✓ Never calls wake_up on vehicle                               │
│  ✓ Idempotent: can restart/replay without data loss             │
│  ✓ Fault-tolerant: handles duplicates, gaps, out-of-order       │
└────────────────────┬────────────────────────────────────────────┘
                     │
         ┌───────────┼───────────┬──────────────┐
         │           │           │              │
         ▼           ▼           ▼              ▼
   Raw Events    Session   Field Fresh    Coverage
   (7d buffer)   Processing  Tracking      Stats
```

---

## Relevant Files

**Fleet Telemetry Configuration:**
- `deploy/fleet-telemetry/configure-vehicle.mts` — Register vehicle for streaming
- `deploy/fleet-telemetry/config.local.json` — Local test config
- `deploy/fleet-telemetry/docker-compose.yml` — Container setup

**Application Code:**
- `scripts/ingest-fleet-telemetry.mts` — Current collector entry point
- `lib/fleet/client.ts` — Tesla Fleet API client
- `lib/fleet/config.ts` — Telemetry field catalog
- `lib/fleet/auth.ts` — Token management

**API Endpoints:**
- `app/api/fleet/` — Fleet API proxies
- `app/api/history/` — Trip/charging session queries

---

## Task Breakdown

### Task 2.1: Signal Catalogue & Documentation
**Priority:** CRITICAL  
**Owner:** Data Engineer  
**Dependencies:** Phase 1 complete

**Objective:** Document exactly which signals are:
1. **Supported** - Available from Tesla API
2. **Received** - Actually delivered by this vehicle
3. **Stale** - Stopped arriving (vehicle asleep, signal unavailable)
4. **Unavailable** - Never received

**Tesla Fleet API Signals Reference:**

```typescript
// From Tesla Fleet telemetry (current configuration)
const AVAILABLE_SIGNALS = {
  // Location (§37)
  'location.latitude': { unit: 'degrees', frequency: 'live', vehicle_wake_risk: 'none' },
  'location.longitude': { unit: 'degrees', frequency: 'live', vehicle_wake_risk: 'none' },
  'location.heading': { unit: 'degrees', frequency: 'live', vehicle_wake_risk: 'none' },

  // Motion (§37)
  'drive_state.speed': { unit: 'km/h', frequency: 'live', vehicle_wake_risk: 'none' },
  'drive_state.power': { unit: 'kW', frequency: 'live', vehicle_wake_risk: 'none' },
  'drive_state.shift_state': { unit: 'enum', frequency: 'live', vehicle_wake_risk: 'none' },

  // Battery (§37)
  'charge_state.battery_level': { unit: '%', frequency: 'live', vehicle_wake_risk: 'none' },
  'charge_state.battery_range': { unit: 'km', frequency: 'live', vehicle_wake_risk: 'none' },
  'charge_state.usable_battery_level': { unit: '%', frequency: 'live', vehicle_wake_risk: 'none' },

  // Charging (§37)
  'charge_state.charging_state': { unit: 'enum', frequency: 'live', vehicle_wake_risk: 'none' },
  'charge_state.charger_power': { unit: 'kW', frequency: 'live', vehicle_wake_risk: 'none' },
  'charge_state.charger_voltage': { unit: 'V', frequency: 'live', vehicle_wake_risk: 'none' },
  'charge_state.charger_current': { unit: 'A', frequency: 'live', vehicle_wake_risk: 'none' },
  'charge_state.charge_session_added_kwh': { unit: 'kWh', frequency: 'live', vehicle_wake_risk: 'none' },

  // Vehicle State (§37)
  'vehicle_state.odometer': { unit: 'km', frequency: 'live', vehicle_wake_risk: 'none' },
  'vehicle_state.locked': { unit: 'bool', frequency: 'live', vehicle_wake_risk: 'none' },
  'vehicle_state.doors_open': { unit: 'json', frequency: 'live', vehicle_wake_risk: 'none' },
  'vehicle_state.windows_open': { unit: 'json', frequency: 'live', vehicle_wake_risk: 'none' },

  // Climate (§37)
  'climate_state.inside_temp': { unit: '°C', frequency: 'live', vehicle_wake_risk: 'low' },
  'climate_state.outside_temp': { unit: '°C', frequency: 'live', vehicle_wake_risk: 'none' },
  'climate_state.is_climate_on': { unit: 'bool', frequency: 'live', vehicle_wake_risk: 'low' },
}
```

**Steps:**

1. **Read current signal configuration**
   ```
   File: lib/fleet/config.ts
   Goal: Document each subscribed signal
   ```

2. **Create signal availability matrix**
   ```
   Signal Name | Supported? | Received? | Last Seen | Unavailable Since
   ─────────────────────────────────────────────────────────────────────
   battery_level | Y | Y | 2026-09-14 10:35 | null
   speed_kmh | Y | Y | 2026-09-14 10:38 | null
   location_lat | Y | Y | 2026-09-14 10:38 | null
   ...
   ```

3. **Audit actual received signals**
   - Query `fleet_telemetry_events` for field_names array
   - Analyze which signals are frequently received
   - Identify long gaps (staleness)
   - Document unavailability patterns

4. **Expand subscriptions safely**
   - Do not add signals without measuring their cost
   - Do not request signals known to wake vehicle
   - Document wake-risk for each signal

**Deliverables:**
- [ ] Signal catalogue markdown with all supported signals
- [ ] Per-vehicle signal availability recorded in DB
- [ ] Field freshness tracking implemented (§48)
- [ ] Unavailable-signal detection (§49, §56)

**SQL Query to Audit Signals:**
```sql
-- What signals have we actually received?
SELECT 
  field_names,
  COUNT(*) as event_count,
  MAX(observed_at) as last_seen,
  MIN(observed_at) as first_seen,
  COUNT(DISTINCT observed_at) as unique_timestamps
FROM fleet_telemetry_events
WHERE vehicle_id = 'UUID_HERE'::uuid
GROUP BY field_names
ORDER BY last_seen DESC;

-- Which fields appear in payloads?
SELECT DISTINCT jsonb_object_keys(payload) as field_name
FROM fleet_telemetry_events
WHERE vehicle_id = 'UUID_HERE'::uuid
ORDER BY field_name;

-- Coverage per field
WITH field_occurrences AS (
  SELECT jsonb_object_keys(payload) as field_name
  FROM fleet_telemetry_events
  WHERE vehicle_id = 'UUID_HERE'::uuid
)
SELECT 
  field_name,
  COUNT(*) as occurrences,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM fleet_telemetry_events WHERE vehicle_id = 'UUID_HERE'::uuid), 2) as coverage_percent
FROM field_occurrences
GROUP BY field_name
ORDER BY occurrences DESC;
```

---

### Task 2.2: Continuous Ingestion Loop
**Priority:** CRITICAL  
**Owner:** Backend Engineer  
**Dependencies:** Task 2.1, Phase 1

**Current State:**
- File: `scripts/ingest-fleet-telemetry.mts`
- Status: Exists but needs enhancement

**Goal:** Transform into idempotent, resume-aware, never-wakes ingestion.

**Key Requirements (§2, §42-46):**

```typescript
// Pseudocode for requirements
interface IngestSession {
  // Resumption state (§45)
  lastProcessedTxId: string | null;        // from checkpoint
  openSessions: Map<VehicleId, OpenSession>;

  // Idempotency (§46)
  seenTxIds: Set<string>;                  // deduplicate same txid
  
  // Signal handling (§48)
  fieldFreshness: FieldFreshness;          // track per-field staleness
  
  // No vehicle wake (§50-59)
  useSnapshotAsRead: boolean;              // true: read from DB, false: call vehicle
  noWakeUpCalls: boolean;                  // never call /wake_up endpoint
}

// Main loop
async function ingestLoop(config: IngestConfig) {
  let session = resumeFromCheckpoint(config.vehicleId);
  
  for await (const event of config.streamClient.subscribe([...])) {
    // Duplicate check
    if (session.seenTxIds.has(event.txid)) {
      logger.debug('Duplicate, skipping', { txid: event.txid });
      continue;
    }
    session.seenTxIds.add(event.txid);
    
    // Insert raw event (for audit)
    await db.insertFleetTelemetryEvent(event);
    
    // Track field freshness
    for (const field of event.fields) {
      await db.updateFieldFreshness(vehicleId, field.name, event.observedAt);
    }
    
    // Session derivation (trip/charging)
    const openSession = session.openSessions.get(vehicleId);
    const updated = await deriveSessionTransition(event, openSession);
    if (updated) {
      await db.upsertOpenSession(vehicleId, updated);
      session.openSessions.set(vehicleId, updated);
    }
    
    // Persistence
    if (shouldCheckpoint(event)) {
      await db.upsertCheckpoint(vehicleId, {
        type: 'fleet_event',
        lastProcessedTxId: event.txid,
        openSessions: [...session.openSessions.values()]
      });
    }
  }
}

// Never wake the vehicle
async function readVehicleStatus(vehicleId, options) {
  // CORRECT: read from cache
  const cached = await db.getLatestVehicleSnapshot(vehicleId);
  return { ...cached, age_seconds: calculateAge(cached.collectedAt) };
  
  // WRONG: this line should not exist
  // if (shouldRefresh) await teslaClient.wakeUp(vehicleId);
}
```

**Implementation Plan:**

1. **Enhance `scripts/ingest-fleet-telemetry.mts`**
   - [ ] Add checkpoint resume logic (§45)
   - [ ] Add open session persistence (§44)
   - [ ] Add field freshness updates (§48)
   - [ ] Add duplicate detection (§46)
   - [ ] Add replayable event logging (§46)
   - [ ] Add coverage stats aggregation

2. **Modify `lib/fleet/client.ts`**
   - [ ] Remove any `wake_up()` calls
   - [ ] Add subscription/streaming methods
   - [ ] Add event rate limiting

3. **Create `lib/fleet/ingest.ts`**
   - [ ] Session derivation logic (trip/charging)
   - [ ] Idempotency helpers
   - [ ] Event deduplication
   - [ ] Field freshness logic

4. **Create `lib/fleet/sleep.ts`**
   - [ ] Cache-first vehicle read
   - [ ] Freshness labeling
   - [ ] Sleeping state detection
   - [ ] Explicit wake isolation

**Completion Criteria:**
- [ ] No `wake_up()` calls in normal flow
- [ ] Restarting ingestion doesn't lose data
- [ ] Restarting doesn't duplicate sessions
- [ ] Field freshness tracked per field
- [ ] Sleeping vehicle reads use cache
- [ ] Tests pass (idempotency, deduplication)

---

### Task 2.3: Sleeping-Vehicle Policy Implementation
**Priority:** HIGH  
**Owner:** Frontend Engineer  
**Dependencies:** Task 2.2

**Current Problem:**
- Page loads trigger refresh
- Refresh calls wake_up on vehicle
- Sleeping vehicle wakes unnecessarily

**Solution (§50-59):**

```typescript
// lib/fleet/sleep.ts

export type FreshnessLevel = 'live' | 'recent' | 'stale' | 'offline'

export interface VehicleSnapshot {
  state: VehicleStatus
  collectedAt: Date
  presence: Presence
  freshness: FreshnessLevel
  staleSinceSeconds: number
}

/** Primary read source: cached snapshots, never wake vehicle (§51) */
export async function readVehicleStatus(
  vehicleId: UUID,
  options?: { maxAgeSeconds?: number }
): Promise<VehicleSnapshot> {
  const snapshot = await db.getLatestVehicleState(vehicleId);
  if (!snapshot) {
    return {
      state: null,
      presence: 'offline',
      freshness: 'offline',
      collectedAt: null,
      staleSinceSeconds: null
    };
  }

  const staleSince = secondsSince(snapshot.collectedAt);
  const freshness = labelFreshness(staleSince, snapshot.presence);

  return {
    state: snapshot,
    collectedAt: snapshot.collectedAt,
    presence: snapshot.presence,
    freshness,
    staleSinceSeconds: staleSince
  };
}

/** Explicitly label sleeping vs. stale (§56) */
function labelFreshness(
  staleSinceSeconds: number,
  presence: Presence
): FreshnessLevel {
  // If vehicle is sleeping, that's a valid state, not "stale"
  if (presence === 'sleeping') {
    return 'recent'; // sleeping is intentional, not a failure
  }

  // If presence is unknown and we haven't heard from it, it's offline
  if (staleSinceSeconds > 24 * 3600) {
    return 'offline';
  }

  if (staleSinceSeconds < 60) return 'live';
  if (staleSinceSeconds < 300) return 'recent';
  return 'stale';
}

// UI must explicitly ask for wake (§59)
export async function requestWakeUp(
  vehicleId: UUID,
  options?: { force?: boolean }
): Promise<void> {
  if (!options?.force) {
    // Require explicit user confirmation
    throw new Error('Wake requires explicit user action');
  }

  logger.warn('Wake-up requested by user', { vehicleId });
  await teslaClient.wakeUp(vehicleId);
}

// Never wake automatically (§53, §54)
export async function refreshDashboard(vehicleId: UUID) {
  // ✅ CORRECT: Read cached snapshot
  const snapshot = await readVehicleStatus(vehicleId);

  // ❌ WRONG: Do not wake
  // if (snapshot.staleSinceSeconds > 300) {
  //   await requestWakeUp(vehicleId);
  // }

  return snapshot;
}
```

**UI Components to Audit:**

Search for any refresh/reload handlers:
- [ ] `/app/(app)/dashboard` — no wake on load
- [ ] `/app/(app)/battery` — no wake on load
- [ ] `/app/(app)/trips` — no wake on load
- [ ] `/app/(app)/charging` — no wake on load
- [ ] Refresh button behavior — require confirmation
- [ ] Calendar nav — no wake on date change
- [ ] Background sync jobs — use cache only

**Tests:**
```typescript
describe('Sleeping vehicle policy', () => {
  test('Page load does not wake vehicle', async () => {
    const wake = jest.spyOn(teslaClient, 'wakeUp');
    await dashboard.load();
    expect(wake).not.toHaveBeenCalled();
  });

  test('Refresh button wakes vehicle only with confirmation', async () => {
    const wake = jest.spyOn(teslaClient, 'wakeUp');
    await refresh.click();
    expect(wake).not.toHaveBeenCalled(); // No confirmation yet
    
    await confirmWakeDialog.confirm();
    expect(wake).toHaveBeenCalledWith(vehicleId);
  });

  test('Sleeping vehicle displays with confirmed sleeping label', async () => {
    const snapshot = {
      presence: 'sleeping',
      collectedAt: Date.now() - 30_000,
    };
    await db.saveSnapshot(vehicleId, snapshot);
    
    const display = await dashboard.load();
    expect(display.presenceLabel).toBe('Sleeping');
    expect(display.location).toBe('(Last known)');
  });
});
```

**Completion Criteria:**
- [ ] No automatic wake-up calls in normal flow
- [ ] Refresh button hidden or disabled for sleeping vehicles
- [ ] Sleeping state clearly labeled ("Sleeping" not "No data")
- [ ] Last-known position/SOC displayed with timestamp
- [ ] Explicit wake button only appears after modal confirmation
- [ ] Tests verify no wake on page load
- [ ] Tests verify no wake on calendar navigation
- [ ] Tests verify no wake on background refresh

---

### Task 2.4: Energy Accounting (Verified Data Only)
**Priority:** MEDIUM  
**Owner:** Data Engineer  
**Dependencies:** Task 2.2

**Current Problem:**
- Energy values assumed correct
- No verification of sign conventions
- Gaps in coverage not handled

**Requirements (§60-67):**

```typescript
export interface EnergyAccounting {
  // Separated by activity (§64)
  consumedDrivingKwh: number | null;   // Motor energy
  consumedParkedKwh: number | null;    // Climate, Sentry, etc.
  chargedKwh: number | null;           // Energy added
  regeneratedKwh: number | null;       // Regen only

  // Metadata (§67)
  coverage: {
    startTime: Date;
    endTime: Date;
    gainsMs: number;              // Time with valid power samples
    coveragePercent: number;      // (gainsMs / totalMs) * 100
  }

  // Flags (§62)
  verified: boolean;              // Sign conventions checked, no gaps
  gap_flags: string[];            // ['large_gap_12345', 'stale_voltage', ...]
}

/** Integrate power only with verified coverage (§62-63) */
export async function computeEnergyForSession(
  samples: PowerSample[]
): Promise<EnergyAccounting | null> {
  // Check sign conventions
  for (const sample of samples) {
    if (sample.voltage < 0) return null;  // Invalid
    if (sample.current < -1000) return null;  // Invalid (A)
  }

  // Check temporal coverage (§63)
  const gaps = identifyLargeGaps(samples, MAX_GAP_MS);
  if (gaps.length > 0) {
    logger.warn('Energy integration rejected due to gaps', gaps);
    return null;
  }

  // Integrate only the verified period
  let consumed = 0, regenerated = 0, charged = 0;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const deltaMs = curr.timestamp - prev.timestamp;
    const deltaHours = deltaMs / 3.6e6;

    // Power is instantaneous; multiply by time
    const power = curr.power || estimatePower(curr.voltage, curr.current);
    if (!power) continue;

    if (power > 0) charged += power * deltaHours;
    else if (power < 0) regenerated += -power * deltaHours;
  }

  return {
    consumedDrivingKwh: consumed,
    consumedParkedKwh: null,  // Would need HVAC/Sentry state
    chargedKwh: charged,
    regeneratedKwh: regenerated,
    coverage: {
      startTime: samples[0].timestamp,
      endTime: samples[samples.length - 1].timestamp,
      gainsMs: sumGainPeriods(samples),
      coveragePercent: calculateCoverage(samples)
    },
    verified: true,
    gap_flags: []
  };
}

/** Do NOT convert SOC loss to kWh (§65) */
export function energyFromSOCDelta(
  socStart: number,
  socEnd: number,
  batteryCapacity: number  // ← DO NOT USE
): number {
  // WRONG: This is forbidden (§65)
  return (socStart - socEnd) * (batteryCapacity / 100);
}

/** Do NOT attribute energy to HVAC/Sentry without data (§66) */
export function energyWhileParked(
  parkedSamples: PowerSample[]
): { hvacKwh?: number; sentryKwh?: number; totals: number } {
  let parked = 0;
  for (const sample of parkedSamples) {
    // We can measure total power draw, but we cannot split
    // HVAC vs. Sentry without explicit state data
    parked += sample.power * (sample.interval / 3.6e6);
  }

  return {
    // NOT: hvacKwh: parked * 0.6  (forbidden — no evidence)
    totals: parked
  };
}
```

**Implementation:**
- [x] Create `lib/energy/accounting.ts`
- [x] Implement verified integration (§62)
- [x] Add gap detection (§63)
- [x] Add sign convention checks (§62)
- [x] Add coverage metadata (§67)
- [x] Reject conversions from SOC (§65)
- [x] Reject HVAC/Sentry attribution (§66)
- [x] Add tests for each rule

**SQL to Track Energy Quality:**
```sql
-- Energy samples with quality indicators
CREATE VIEW energy_sample_quality AS
SELECT
  tss.vehicle_id,
  tss.session_id,
  MIN(tss.observed_at) as start_time,
  MAX(tss.observed_at) as end_time,
  COUNT(*) as sample_count,
  
  -- Sign convention verification
  COUNT(CASE WHEN tss.numeric_value < 0 AND tss.field_name LIKE 'voltage%' THEN 1 END) as invalid_voltage,
  COUNT(CASE WHEN ABS(tss.numeric_value) > 1000 AND tss.field_name LIKE 'current%' THEN 1 END) as invalid_current,
  
  -- Gap identification
  MAX(EXTRACT(EPOCH FROM (
    LAG(tss.observed_at) OVER (ORDER BY tss.observed_at) - tss.observed_at
  ))) as max_gap_seconds
  
FROM telemetry_session_samples tss
WHERE tss.field_name IN ('power_kw', 'voltage', 'current')
GROUP BY tss.vehicle_id, tss.session_id;
```

**Completion Criteria:**
- [ ] Energy values never computed from SOC delta
- [ ] All integrated energy has gap flags
- [ ] Coverage percent calculated
- [ ] Invalid sign conventions rejected
- [ ] Tests verify each rule

---

## Blockers & Dependencies

**Must Complete Phase 1 First:**
- [ ] Database backup exists
- [ ] Schema reconciliation complete
- [ ] Migration 010_* approved and staged

**Required for Task 2.2 (Ingestion):**
- [ ] Supabase connection with service role key
- [ ] Fleet telemetry credentials (partner access)
- [ ] Staging environment to test
- [ ] Monitoring/alerting setup

**Required for Task 2.4 (Energy):**
- [ ] Historical power samples available
- [ ] SOC and power coalesced into single samples
- [ ] GPS route data for trip boundaries

---

## Testing Strategy

### Unit Tests (lib/)
```bash
npm test -- lib/fleet/ingest.test.ts
npm test -- lib/energy/accounting.test.ts
npm test -- lib/fleet/sleep.test.ts
```

### Integration Tests (VM)
```bash
# Test on staging VM
docker compose -f deploy/fleet-telemetry/docker-compose.yml up -d
npm run test:fleet-ingest-staging
# Verify:
# - Checkpoints survive restart
# - No duplicate sessions
# - Field freshness updates
# - No wake_up calls in logs
```

### UI Tests
```bash
# Page loads do not wake vehicle
npm test -- app/dashboard.test.tsx
# Refresh requires confirmation
npm test -- app/refresh-button.test.tsx
# Calendar nav uses cache
npm test -- app/calendar.test.tsx
```

---

## Success Criteria

Phase 2 complete when:

1. ✅ Ingestion runs 24/7 on VM (never wakes car)
2. ✅ Restarting ingestion doesn't lose data
3. ✅ Field freshness tracked per-field (not per-vehicle)
4. ✅ Sleeping vehicles display cached data
5. ✅ Page loads and refreshes use cache only
6. ✅ Energy accounting rejects invalid data
7. ✅ All telemetry sources idempotent
8. ✅ Tests verify no wake-up calls
9. ✅ Monitoring alerts on ingestion errors
10. ✅ Documentation covers all signal semantics

---

**Phase 2 ready to begin once Phase 1 is approved.**

