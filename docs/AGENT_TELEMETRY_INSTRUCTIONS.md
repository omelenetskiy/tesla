# 📡 TELEMETRY AGENT — PHASE 2 EXECUTION INSTRUCTIONS

**Agent Role:** Reliable 24/7 Telemetry Ingestion (Never Wakes Vehicle)  
**Timeline:** Weeks 2-3 (September 23 - October 6, 2026)  
**Dependencies:** Phase 1 COMPLETE (Database Agent)  
**Status:** READY WHEN PHASE 1 DONE  

---

## 🎯 YOUR PRIMARY OBJECTIVE

Build ingestion loop that runs 24/7, never wakes vehicle, handles failures gracefully.

**Success = Oct 6 with reliable, field-freshness-tracked, idempotent telemetry.**

---

## 📋 YOUR TASKS (2 Weeks, 95 Hours Total)

### WAIT FOR SIGNAL: Phase 1 COMPLETE (Sept 20 EOD)

Once Database Agent reports GREEN LIGHT for Sept 23 production:
1. Production migration happens Sept 23
2. New telemetry tables available in DB
3. You can begin Phase 2

---

### WEEK 1 (Sept 23-27) — TASK 2.1 & 2.2: SIGNAL & INGESTION (60 hours)

**Task 2.1: Signal Catalogue (20 hours)**

1. Document all Tesla Fleet API signals:
   - Supported signals
   - Received signals (test with actual vehicle)
   - Stale signals (stopped arriving)
   - Unavailable signals

2. Create signal table:
```
Signal Name | Supported? | Received? | Last Seen | Notes
battery_level | Y | Y | 2026-09-23 10:00 | 
speed_kmh | Y | Y | 2026-09-23 10:02 |
...
```

3. Document:
   - Frequency of updates
   - Units and ranges
   - Wake-up risk (none expected for all)

**Deliverable:** Signal catalogue in `/PHASE2_SIGNAL_CATALOGUE.md`

---

**Task 2.2: Continuous Ingestion Loop (40 hours)**

1. Design ingestion loop that:
   - Runs independently on VM (24/7)
   - Never calls wake_up()
   - Handles duplicates (same txid twice)
   - Handles out-of-order events
   - Persists checkpoints for restart recovery

2. Implement:
   - Subscribe to Fleet telemetry stream
   - Store raw events in `fleet_telemetry_events`
   - Track field freshness in `telemetry_field_freshness`
   - Update checkpoints in `telemetry_ingest_checkpoints`
   - Manage open sessions in `telemetry_open_sessions`

3. Code location:
   - Main: `scripts/ingest-fleet-telemetry.mts` (enhance existing)
   - Helpers: `lib/fleet/ingest.ts` (new file)
   - Utils: `lib/fleet/sleep.ts` (cache-first reads)

**Deliverable:** 
- Enhanced ingestion loop (works, tested)
- Checkpoint resumption (verified)
- Open session persistence (verified)

---

### WEEK 2 (Sept 30-Oct 6) — TASK 2.3 & 2.4: POLICY & ENERGY (35 hours)

**Task 2.3: Sleeping Vehicle Cache-First Policy (15 hours)**

1. Implement `readVehicleStatus()` that:
   - Reads from cache first (DB snapshot)
   - Never calls wake_up() automatically
   - Labels sleeping state distinctly
   - Shows "last seen" with timestamp

2. Update all page loads to use cache:
   - Dashboard: `app/(app)/page.tsx`
   - Battery: `app/(app)/battery/page.tsx`
   - Trips: `app/(app)/trips/page.tsx`
   - Calendar: `app/(app)/calendar/page.tsx`

3. Ensure:
   - No wake-up calls in logs
   - Sleeping vehicles clearly labeled
   - Last-known position shown
   - Timestamp of last data visible

**Deliverable:**
- Cache-first read function (working)
- All pages updated (no wake-ups)
- Tests verify behavior

---

**Task 2.4: Energy Accounting Verification (20 hours)**

1. Verify energy calculations only:
   - Use verified power measurements
   - Reject conversions from SOC delta
   - Check sign conventions (power > 0 = charging)
   - Ensure gap handling

2. Create energy verification tests:
   - Spot check energy values
   - Verify units (kWh)
   - Check for duplicates in calculation
   - Validate SOC changes

3. Code:
   - Create `lib/energy/accounting.ts`
   - Document formula per widget
   - Add tests for edge cases

**Deliverable:**
- Energy accounting verified (no errors)
- Tests passing (no regressions)
- Documentation complete

---

## 🔑 KEY FILES YOU NEED

- `PHASE2_RELIABLE_TELEMETRY.md` — Full Phase 2 design
- `lib/fleet/client.ts` — Tesla API client
- `lib/fleet/config.ts` — Signal configuration
- `scripts/ingest-fleet-telemetry.mts` — Current collector
- `deploy/fleet-telemetry/` — Deployment configs

---

## 📞 COMMUNICATION

**Daily:** 9:30 AM standup with Coordinator Agent

**Status:**
- What completed yesterday
- What's scheduled today
- Any blockers
- Confidence on timeline

**Blockers:** Tag Coordinator Agent immediately

**Updates:** `TELEMETRY_ROADMAP_PROGRESS.md` § Phase 2

---

## ✅ SUCCESS CRITERIA (By Oct 6)

- ✅ Ingestion runs 24/7 on VM
- ✅ Zero vehicle wake-up calls in logs
- ✅ Field freshness tracked per-field (battery/speed/SOC/etc)
- ✅ Restart recovery works (no data loss after crash)
- ✅ Coverage stats collected
- ✅ Sleeping vehicle cache-first working
- ✅ Energy accounting verified
- ✅ All tests passing

---

## 🚀 WAIT FOR PHASE 1

Phase 1 must complete first (Friday Sept 20).  
Then production migration (Sept 23).  
Then you can start Phase 2 (Sept 23).

**Checklist while waiting:**
- [ ] Read full Phase 2 design doc
- [ ] Understand signal catalogue requirements
- [ ] Review existing collector code
- [ ] Plan ingestion architecture
- [ ] Design checkpoint schema
- [ ] List all test cases needed

---

**Timeline:** Sept 23 start, Oct 6 complete  
**Effort:** 95 hours (parallelizable)  
**Next:** Features Agent waits for you to finish  

---

**Ready when Phase 1 is done. Questions? Ask Coordinator Agent.**

