# Phase 1 — Database Audit & Safety Report

**Generated:** 2026-09-14  
**Status:** In Progress  
**Scope:** Telemetry schema, migration analysis, data recovery strategy

---

## 🚨 Critical Finding: Destructive Migration

### Migration 001_telemetry_schema.sql Analysis

**File:** `supabase/migrations/001_telemetry_schema.sql`

**Lines 1-9 (CRITICAL):**
```sql
DROP TABLE IF EXISTS charging_data_points CASCADE;
DROP TABLE IF EXISTS realtime_telemetry CASCADE;
DROP TABLE IF EXISTS battery_snapshots CASCADE;
DROP TABLE IF EXISTS charging_sessions CASCADE;
DROP TABLE IF EXISTS trips CASCADE;
DROP TABLE IF EXISTS monthly_summaries CASCADE;
DROP TABLE IF EXISTS daily_summaries CASCADE;
DROP FUNCTION IF EXISTS cleanup_realtime_telemetry CASCADE;
```

### ⚠️ Risk Assessment

| Table | Risk Level | Impact | Recovery |
|-------|-----------|--------|----------|
| `trips` | **CRITICAL** | Complete loss of historical trip data | Requires backup or raw telemetry replay |
| `charging_sessions` | **CRITICAL** | Complete loss of charging history | Requires backup or raw telemetry replay |
| `battery_snapshots` | **CRITICAL** | Complete loss of battery timeline | Requires backup or raw telemetry replay |
| `charging_data_points` | **CRITICAL** | Complete loss of detailed charging curves | Requires backup or raw telemetry replay |
| `daily_summaries` | **HIGH** | Complete loss of aggregated statistics | Recalculable from raw data |
| `monthly_summaries` | **HIGH** | Complete loss of trend data | Recalculable from raw data |
| `realtime_telemetry` | **LOW** | Transient data (24h TTL) | No permanent loss expected |

---

## 📊 Dual Schema Architecture Detected

The codebase contains **two different telemetry schemas**:

### Schema A: 001_telemetry_schema.sql (Destructive)
- **Tables:** `trips`, `charging_sessions`, `battery_snapshots`, `charging_data_points`, `daily_summaries`, `monthly_summaries`, `realtime_telemetry`
- **Vehicle ID type:** `TEXT`
- **Structure:** Flat, optimized for specific metrics
- **Status:** Contains DROP CASCADE statements; unsafe to apply without verification

### Schema B: 004_core_models.sql (Evolved)
- **Root tables:** `vehicles` (UUID), `vehicle_states`, `vehicle_credentials`
- **Activity tracking:** `activity_events`, `api_request_logs`
- **Vehicle ID type:** `UUID` (database primary key)
- **Structure:** Proper foreign key relationships, RLS policies, audit trails

### Application Model Truth Source
**File:** `lib/tesla/models.ts` and `lib/tesla/history.ts`

The application expects:
- **Vehicle identity:** `VehicleIdentity` with `databaseId` (UUID), `vehicleTagId`, `vehicleId`, `ownerIdString`, `vin`
- **State storage:** `vehicle_states` table with typed columns (`battery_level`, `range_km`, `presence`, etc.)
- **Historical derivation:** Functions `deriveTrips()` and `deriveChargingSessions()` that reconstruct from `vehicle_snapshots`
- **No direct dependencies** on tables in Schema A

---

## ✅ Pre-Migration Checklist — Phase 1

### Step 1: Backup & Assessment
- [ ] **Establish baseline backup**
  - [ ] PostgreSQL dump (full, not schema-only)
  - [ ] Timestamp: 2026-09-14 T[TIME] UTC
  - [ ] Location: Secure, off-database storage
  - [ ] Verify backup integrity

- [ ] **Inspect actual deployed schema**
  - [ ] Connect to Supabase project
  - [ ] Query `information_schema.tables` for actual tables
  - [ ] Check if `trips`, `charging_sessions` exist and have rows
  - [ ] Estimate data volume: `SELECT COUNT(*) FROM trips;`
  - [ ] Check RLS policies on all tables
  - [ ] List all indexes and their sizes

- [ ] **Verify migration execution history**
  - [ ] Query `supabase_migrations` table (if tracking enabled)
  - [ ] Confirm which migrations have been applied
  - [ ] Determine if 001_telemetry_schema.sql was already executed

### Step 2: Data Preservation Strategy
- [ ] **If 001_telemetry_schema.sql was NOT executed:**
  - [ ] Keep the file as documentation only
  - [ ] Create new forward-only migration 010_* instead
  - [ ] Preserve existing schema
  - [ ] Reconcile application models

- [ ] **If 001_telemetry_schema.sql WAS executed:**
  - [ ] Assess data loss:
    - [ ] Are there any rows in current `trips` table?
    - [ ] Are there any rows in current `charging_sessions` table?
  - [ ] If data exists: **DO NOT RE-RUN this migration**
  - [ ] If data is gone: Recovery path below

### Step 3: Recovery Path (If Data Lost)
- [ ] **Raw telemetry source check**
  - [ ] Supabase backup files (if available)
  - [ ] Fleet telemetry archive at `deploy/fleet-telemetry/`
  - [ ] Database transaction logs (if WAL archival enabled)

- [ ] **Reconstruction options**
  - [ ] Option A: Restore from backup + reapply safe migrations
  - [ ] Option B: Replay raw telemetry through collector
  - [ ] Option C: Document data loss and start fresh

### Step 4: Schema Reconciliation
- [ ] **Map actual schema to application expectations**
  - [ ] Confirm `vehicles` table exists with columns: `id`, `owner_id`, `vehicle_tag_id`, `vehicle_id`, `vin`
  - [ ] Confirm `vehicle_states` table with required typed columns
  - [ ] Confirm `activity_events` table for dashboard timeline
  - [ ] Confirm `api_request_logs` table for diagnostics
  - [ ] Verify all RLS policies are in place and correct

- [ ] **Identify missing components**
  - [ ] Are there any application-required tables missing?
  - [ ] Are there any indexes missing that affect query performance?
  - [ ] Are there stale functions or triggers that should be removed?

### Step 5: Safe Migration Design
- [ ] **Create new forward-only migration `010_telemetry_data_enrichment.sql`**
  - [ ] Add session samples table (if missing)
  - [ ] Add daily aggregates table (if missing)
  - [ ] Add field freshness tracking (if missing)
  - [ ] Add processing checkpoints (if missing)
  - [ ] Use `IF NOT EXISTS` for all table creations
  - [ ] Preserve all existing data
  - [ ] Preserve UUID relationships
  - [ ] Preserve ownership and RLS policies

- [ ] **Include data migration logic (if needed)**
  - [ ] Backfill `vehicle_id` into `vehicles` table if not present
  - [ ] Backfill ownership relationships
  - [ ] Create initial daily summaries from existing data (if needed)
  - [ ] Validate data integrity after migration

### Step 6: Pre-Production Validation
- [ ] **Dry-run migration on staging**
  - [ ] Apply new migration to staging database
  - [ ] Verify no data loss
  - [ ] Verify all queries still work
  - [ ] Verify application models still validate
  - [ ] Measure query performance (before/after)

- [ ] **Documentation**
  - [ ] List all changes made
  - [ ] Document rollback procedure (if needed)
  - [ ] Document new retention policy
  - [ ] Document data freshness guarantees
  - [ ] Get explicit sign-off before production

---

## 📋 Questions Requiring Immediate Answers

1. **Was migration 001_telemetry_schema.sql already applied to production?**
   - If YES: Do any of the dropped tables still have data?
   - If NO: Has the old schema been running? How long?

2. **What is the current data retention requirement?**
   - How many months of trip/charging history need to be preserved?
   - What is the current database size?

3. **Is there a backup of the database before any destructive migrations?**
   - Where is it stored?
   - When was it taken?
   - Can we restore from it?

4. **What is the vehicle ownership model?**
   - Is each vehicle owned by exactly one user?
   - Can vehicles be shared between users?
   - How are cross-account access scenarios handled?

---

## 🔄 Next Actions

1. **Immediate (Today):**
   - [ ] Connect to Supabase with read-only role
   - [ ] Execute diagnostic queries (see below)
   - [ ] Document actual schema state

2. **This Week:**
   - [ ] Make data preservation decision
   - [ ] Design safe migration if needed
   - [ ] Create backup if not already done

3. **Next Week:**
   - [ ] Review migration with stakeholders
   - [ ] Test on staging
   - [ ] Execute on production with rollback plan

---

## 🔍 Diagnostic SQL Queries

```sql
-- Check if telemetry tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('trips', 'charging_sessions', 'battery_snapshots', 
                   'vehicles', 'vehicle_states', 'activity_events');

-- Check data volume
SELECT 'trips' as table_name, COUNT(*) as row_count FROM trips
UNION ALL
SELECT 'charging_sessions', COUNT(*) FROM charging_sessions
UNION ALL
SELECT 'battery_snapshots', COUNT(*) FROM battery_snapshots
UNION ALL
SELECT 'vehicles', COUNT(*) FROM vehicles
UNION ALL
SELECT 'vehicle_states', COUNT(*) FROM vehicle_states;

-- Check migration history
SELECT * FROM supabase_migrations_list ORDER BY version DESC;

-- Check RLS policies
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';

-- Check indexes and their size
SELECT schemaname, tablename, indexname, pg_size_pretty(pg_relation_size(indexrelname::regclass)) as size
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelname::regclass) DESC;
```

---

## 📝 Migration Version Numbering

**Proposed new migration version:** `010_telemetry_data_enrichment.sql`

- Maintains version sequence
- Clearly indicates it is additive, not destructive
- Descriptive name for change log
- Safe to apply multiple times if needed

---

**Status:** Awaiting database inspection and stakeholder decision on data preservation

