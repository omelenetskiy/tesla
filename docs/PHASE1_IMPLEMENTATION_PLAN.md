# Phase 1 Implementation Plan — Database Protection & Reconciliation

**Status:** Ready to Execute  
**Target Completion:** This Week  
**Owner Approval Required:** YES

---

## Overview

This phase ensures that the deployed database schema is:
1. **Safe** - No destructive operations without backup
2. **Compatible** - Matches application expectations
3. **Recoverable** - Data can be restored if needed
4. **Documented** - All changes are tracked and reversible

---

## Task Breakdown

### Task 1.1: Emergency Backup
**Status:** [ ] TODO  
**Owner:** DevOps  
**Priority:** CRITICAL  

**Steps:**
1. Connect to production Supabase project
2. Create full PostgreSQL dump:
   ```bash
   pg_dump --verbose --no-privileges --no-owner \
     postgres://[USER]:[PASS]@db.supabase.co:5432/postgres > \
     backup_2026-09-14_prod.sql
   ```
3. Verify backup integrity:
   ```bash
   wc -l backup_2026-09-14_prod.sql
   grep -c "CREATE TABLE" backup_2026-09-14_prod.sql
   ```
4. Store in secure location (not Git)
5. Document backup metadata:
   - Timestamp: _______________
   - Size: _______________
   - Table count: _______________
   - Latest trip ID: _______________
   - Checksum: _______________

**Completion Criteria:**
- [ ] Backup file exists and is not zero bytes
- [ ] Backup contains all application tables
- [ ] Checksum recorded
- [ ] Location documented

---

### Task 1.2: Database Schema Inspection
**Status:** [ ] TODO  
**Owner:** Database Admin  
**Priority:** CRITICAL  

**Query Suite (execute in Supabase SQL editor):**

```sql
-- 1. Verify table existence and row counts
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM information_schema.tables t
WHERE table_schema = 'public'
AND table_name IN (
  'trips', 'charging_sessions', 'battery_snapshots',
  'vehicles', 'vehicle_states', 'activity_events',
  'fleet_telemetry_events', 'daily_summaries'
)
ORDER BY table_name;

-- 2. Check for data in each telemetry table
SELECT 'trips' as table_name, COUNT(*) as row_count FROM trips
UNION ALL
SELECT 'charging_sessions', COUNT(*) FROM charging_sessions
UNION ALL
SELECT 'battery_snapshots', COUNT(*) FROM battery_snapshots
UNION ALL
SELECT 'charging_data_points', COUNT(*) FROM charging_data_points
UNION ALL
SELECT 'vehicles', COUNT(*) FROM vehicles
UNION ALL
SELECT 'vehicle_states', COUNT(*) FROM vehicle_states
UNION ALL
SELECT 'fleet_telemetry_events', COUNT(*) FROM fleet_telemetry_events
ORDER BY row_count DESC;

-- 3. Check migration history
SELECT version, description, installed_on 
FROM schema_migrations 
ORDER BY version DESC 
LIMIT 10;

-- 4. List all indexes and estimate their size
SELECT 
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelname::regclass)) as index_size
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelname::regclass) DESC;

-- 5. Check for RLS policies
SELECT tablename, policyname, permissive, cmd 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 6. Identify any foreign key constraints at risk
SELECT 
  constraint_name,
  table_name,
  column_name,
  foreign_table_name,
  foreign_column_name
FROM information_schema.referential_constraints rc
INNER JOIN information_schema.key_column_usage kcu
  ON rc.constraint_name = kcu.constraint_name
WHERE table_schema = 'public'
ORDER BY table_name;
```

**Findings to Record:**

| Question | Answer |
|----------|--------|
| Do `trips` and `charging_sessions` tables exist? | [ ] YES / [ ] NO |
| If YES, how many rows? | trips: _____ | charging: _____ |
| Do `vehicles` and `vehicle_states` tables exist? | [ ] YES / [ ] NO |
| If YES, how many vehicles? | _____ |
| What is total database size? | _____ |
| Which migrations have been applied? | (list all) |
| Are RLS policies active? | [ ] YES / [ ] NO |
| Any orphaned indexes or tables? | (list any) |

**Completion Criteria:**
- [ ] Inspection queries executed without errors
- [ ] All findings recorded in table above
- [ ] Schema structure documented
- [ ] Data volume assessed

---

### Task 1.3: Determine Destructive Migration Status
**Status:** [ ] TODO  
**Owner:** Database Admin  
**Priority:** CRITICAL  

**Investigation:**

The file `001_telemetry_schema.sql` begins with:
```sql
DROP TABLE IF EXISTS charging_data_points CASCADE;
DROP TABLE IF EXISTS realtime_telemetry CASCADE;
DROP TABLE IF EXISTS battery_snapshots CASCADE;
DROP TABLE IF EXISTS charging_sessions CASCADE;
DROP TABLE IF EXISTS trips CASCADE;
DROP TABLE IF EXISTS monthly_summaries CASCADE;
DROP TABLE IF EXISTS daily_summaries CASCADE;
```

**Decision Tree:**

```
Question: Which tables exist NOW in production?
├─ If trips, charging_sessions, battery_snapshots exist with data
│  └─ Migration 001 was NOT executed (safe to proceed)
│
├─ If tables exist but empty
│  └─ Migration 001 may have been executed then repopulated
│  └─ Action: Query oldest created_at timestamp to assess data age
│
└─ If tables do NOT exist at all
   └─ Migration 001 WAS executed and dropped data
   └─ Action: Check backup for recovery
```

**Query to determine table creation date:**
```sql
-- Find the oldest record in each table
SELECT 
  'trips' as table_name, 
  MIN(created_at) as oldest_record,
  MAX(created_at) as newest_record,
  COUNT(*) as total_records
FROM trips
UNION ALL
SELECT 'charging_sessions', MIN(created_at), MAX(created_at), COUNT(*) FROM charging_sessions
UNION ALL
SELECT 'battery_snapshots', MIN(created_at), MAX(created_at), COUNT(*) FROM battery_snapshots;
```

**Decision:**

After executing investigation queries, circle one:

[ ] **Option A: Data Intact** → Schema was never destroyed, migration 001 was never applied
- Action: Skip to Task 1.4 (reconciliation)
- Keep 001_telemetry_schema.sql as historical reference only
- Create 010_telemetry_data_enrichment.sql instead

[ ] **Option B: Data Partially Lost** → Tables exist but with gaps or suspiciously young creation dates
- Action: Estimate data loss, decide recovery strategy
- Possible: Partial recovery from backup + replay recent events
- Decide: Accept loss or restore from backup?

[ ] **Option C: Complete Data Loss** → Tables do not exist (migration was executed and deleted data)
- Action: Restore from backup immediately
- Timeline: How far back is the backup? (hours? days? weeks?)
- Decision: Restore to backup, then apply safe migrations

**Completion Criteria:**
- [ ] Investigation queries executed
- [ ] Decision made and recorded
- [ ] Recovery strategy identified (if needed)

---

### Task 1.4: Schema Reconciliation
**Status:** [ ] TODO  
**Owner:** Application Developer  
**Priority:** HIGH  

**Objective:** Ensure actual schema matches application expectations.

**Application Model Requirements** (from `lib/tesla/models.ts`):

The app expects these entities:

1. **vehicles** table
   - `id`: UUID (primary key)
   - `owner_id`: UUID (reference to auth.users)
   - `vehicle_tag_id`: TEXT (short Fleet API ID)
   - `vehicle_id`: TEXT (long streaming ID)
   - `vin`: TEXT
   - `distance_unit`: TEXT ('km' or 'mi')
   - `polling_profile`: TEXT ('default', 'relaxed', 'passive')
   - `last_seen_at`: TIMESTAMPTZ
   - `last_collected_at`: TIMESTAMPTZ

2. **vehicle_states** table
   - `id`: UUID or BIGINT (primary key)
   - `vehicle_id`: UUID (FK to vehicles)
   - `owner_id`: UUID (FK to auth.users)
   - `state`: JSONB (full snapshot)
   - `battery_level`: INTEGER (0-100)
   - `range_km`: NUMERIC
   - `presence`: TEXT ('driving', 'parked', 'charging', 'sleeping', 'offline')
   - `odometer_km`: NUMERIC
   - `latitude`, `longitude`: DOUBLE PRECISION
   - `speed_kmh`, `power_kw`: NUMERIC
   - `collected_at`: TIMESTAMPTZ

3. **activity_events** table
   - `id`: BIGINT
   - `vehicle_id`: UUID (FK)
   - `owner_id`: UUID (FK)
   - `type`: TEXT (predefined enum)
   - `data`: JSONB
   - `occurred_at`, `created_at`: TIMESTAMPTZ

**Reconciliation Checklist:**

For each table, verify:
```sql
-- Template query (modify table name)
SELECT 
  table_name,
  string_agg(column_name || ':' || data_type, ', ' ORDER BY ordinal_position)
FROM information_schema.columns
WHERE table_name = 'vehicles'
GROUP BY table_name;
```

| Table | Exists? | Columns Match? | RLS Enabled? | Indexes OK? | Notes |
|-------|---------|----------------|--------------|------------|-------|
| vehicles | [ ] | [ ] | [ ] | [ ] | |
| vehicle_states | [ ] | [ ] | [ ] | [ ] | |
| vehicle_credentials | [ ] | [ ] | [ ] | [ ] | |
| activity_events | [ ] | [ ] | [ ] | [ ] | |
| api_request_logs | [ ] | [ ] | [ ] | [ ] | |
| fleet_telemetry_events | [ ] | [ ] | [ ] | [ ] | |
| user_settings | [ ] | [ ] | [ ] | [ ] | |

**Missing Components:**

List any tables the app needs that don't exist:
```
1. _______________
2. _______________
3. _______________
```

List any columns a table should have but doesn't:
```
1. _______________
2. _______________
3. _______________
```

**Completion Criteria:**
- [ ] All reconciliation queries executed
- [ ] All findings documented in tables above
- [ ] Missing components identified
- [ ] Schema mismatch report created

---

### Task 1.5: Create Safe Forward-Only Migration
**Status:** [ ] TODO  
**Owner:** Application Developer  
**Priority:** HIGH  

**Migration File:** `supabase/migrations/010_telemetry_data_enrichment.sql`

**Principles:**
- Use `CREATE TABLE IF NOT EXISTS` (never DROP)
- Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (never DROP COLUMN)
- Preserve all existing data
- Add indexes only if they don't duplicate existing ones
- Document every change with comments

**Template Structure:**

```sql
-- 010_telemetry_data_enrichment.sql
-- Forward-only migration to support Phase 2 (reliable telemetry)
-- Plan §2, §28: Add session samples, daily aggregates, field freshness, checkpoints

-- ──────────────────────────────────────────────────────────────────
-- Session samples: raw per-field measurements during active sessions
-- ──────────────────────────────────────────────────────────────────
create table if not exists public.telemetry_session_samples (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,  -- trip_id or charging_session_id
  session_type text not null check (session_type in ('trip', 'charging', 'parked')),
  field_name text not null,  -- 'battery_level', 'speed_kmh', 'power_kw', etc.
  numeric_value numeric,
  text_value text,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (vehicle_id, session_id, field_name, observed_at)
);

create index if not exists telemetry_session_samples_vehicle_time_idx
  on public.telemetry_session_samples (vehicle_id, observed_at desc);

-- ──────────────────────────────────────────────────────────────────
-- Daily aggregates: fast query source for dashboard/calendar
-- ──────────────────────────────────────────────────────────────────
create table if not exists public.telemetry_daily_aggregates (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  
  -- Distance
  total_distance_km numeric(10,1),
  trip_count int default 0,
  
  -- Energy
  energy_consumed_kwh numeric(8,2),
  energy_charged_kwh numeric(8,2),
  energy_regenerated_kwh numeric(8,2),
  
  -- Battery
  lowest_soc_percent numeric(5,1),
  highest_soc_percent numeric(5,1),
  
  -- Charging
  charging_session_count int default 0,
  total_charging_duration_minutes int,
  
  -- Activity
  longest_trip_km numeric(10,1),
  max_speed_kmh numeric(6,1),
  avg_efficiency_wh_per_km numeric(5,1),
  
  -- Metadata
  processing_status text check (processing_status in ('pending', 'processed', 'partial', 'error')),
  last_updated_at timestamptz default now(),
  created_at timestamptz not null default now(),
  
  unique (vehicle_id, date)
);

create index if not exists telemetry_daily_aggregates_vehicle_date_idx
  on public.telemetry_daily_aggregates (vehicle_id, date desc);

-- ──────────────────────────────────────────────────────────────────
-- Field freshness: timestamp for each measured field
-- ──────────────────────────────────────────────────────────────────
create table if not exists public.telemetry_field_freshness (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  field_name text not null,
  last_observed_at timestamptz,
  last_update_at timestamptz default now(),
  reception_count int default 1,
  unique (vehicle_id, field_name)
);

create index if not exists telemetry_field_freshness_vehicle_idx
  on public.telemetry_field_freshness (vehicle_id);

-- ──────────────────────────────────────────────────────────────────
-- Processing checkpoints: resume ingestion from last known good state
-- ──────────────────────────────────────────────────────────────────
create table if not exists public.telemetry_ingest_checkpoints (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  checkpoint_type text not null check (checkpoint_type in ('fleet_event', 'session', 'aggregation')),
  checkpoint_key text not null,  -- e.g., 'txid_12345' or 'session_charging_2026-09-14'
  checkpoint_state jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  unique (vehicle_id, checkpoint_type, checkpoint_key)
);

create index if not exists telemetry_ingest_checkpoints_vehicle_idx
  on public.telemetry_ingest_checkpoints (vehicle_id, processed_at desc);

-- ──────────────────────────────────────────────────────────────────
-- Enable RLS if not already enabled
-- ──────────────────────────────────────────────────────────────────
alter table public.telemetry_session_samples enable row level security;
alter table public.telemetry_daily_aggregates enable row level security;
alter table public.telemetry_field_freshness enable row level security;
alter table public.telemetry_ingest_checkpoints enable row level security;

-- ──────────────────────────────────────────────────────────────────
-- RLS Policies: owners can read their own vehicle data
-- ──────────────────────────────────────────────────────────────────
drop policy if exists "owners read telemetry samples" on public.telemetry_session_samples;
create policy "owners read telemetry samples"
  on public.telemetry_session_samples
  for select to authenticated
  using (owner_id = auth.uid() or exists (
    select 1 from public.vehicles v where v.id = telemetry_session_samples.vehicle_id and v.owner_id = auth.uid()
  ));

drop policy if exists "owners read daily aggregates" on public.telemetry_daily_aggregates;
create policy "owners read daily aggregates"
  on public.telemetry_daily_aggregates
  for select to authenticated
  using (owner_id = auth.uid() or exists (
    select 1 from public.vehicles v where v.id = telemetry_daily_aggregates.vehicle_id and v.owner_id = auth.uid()
  ));

drop policy if exists "owners read field freshness" on public.telemetry_field_freshness;
create policy "owners read field freshness"
  on public.telemetry_field_freshness
  for select to authenticated
  using (exists (
    select 1 from public.vehicles v where v.id = telemetry_field_freshness.vehicle_id and v.owner_id = auth.uid()
  ));

drop policy if exists "owners read checkpoints" on public.telemetry_ingest_checkpoints;
create policy "owners read checkpoints"
  on public.telemetry_ingest_checkpoints
  for select to authenticated
  using (exists (
    select 1 from public.vehicles v where v.id = telemetry_ingest_checkpoints.vehicle_id and v.owner_id = auth.uid()
  ));

-- ──────────────────────────────────────────────────────────────────
-- Server-side functions for inserting data securely
-- ──────────────────────────────────────────────────────────────────
create or replace function public.record_telemetry_sample(
  vehicle_id_param uuid,
  owner_id_param uuid,
  session_id text,
  session_type text,
  field_name text,
  numeric_value numeric default null,
  text_value text default null,
  observed_at_param timestamptz default now()
)
returns bigint
language sql
security definer
set search_path = public
as $$
  insert into public.telemetry_session_samples (
    vehicle_id, owner_id, session_id, session_type, field_name, numeric_value, text_value, observed_at
  ) values (vehicle_id_param, owner_id_param, session_id, session_type, field_name, numeric_value, text_value, observed_at_param)
  on conflict (vehicle_id, session_id, field_name, observed_at)
  do update set numeric_value = excluded.numeric_value, text_value = excluded.text_value
  returning id;
$$;

grant execute on function public.record_telemetry_sample(uuid, uuid, text, text, text, numeric, text, timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';
```

**Completion Criteria:**
- [ ] Migration file created: `supabase/migrations/010_telemetry_data_enrichment.sql`
- [ ] All tables use `IF NOT EXISTS`
- [ ] All columns use `IF NOT EXISTS`
- [ ] RLS policies defined for all new tables
- [ ] Service functions defined for secure inserts
- [ ] Migration reviewed for data safety

---

### Task 1.6: Backup Validation & Restore Rehearsal
**Status:** [ ] TODO  
**Owner:** DevOps  
**Priority:** HIGH  

**Objective:** Ensure we can restore from backup if needed.

**Steps:**

1. **Restore to staging database (dry-run)**
   ```bash
   # Create staging database
   # psql create database tesla_staging
   
   # Restore from backup
   psql -f backup_2026-09-14_prod.sql tesla_staging
   ```

2. **Verify restore integrity**
   ```sql
   -- Count tables and rows
   SELECT COUNT(*) FROM information_schema.tables 
   WHERE table_schema = 'public';
   
   -- Verify key tables
   SELECT 'vehicles', COUNT(*) FROM vehicles
   UNION ALL
   SELECT 'trips', COUNT(*) FROM trips
   UNION ALL
   SELECT 'charging_sessions', COUNT(*) FROM charging_sessions;
   ```

3. **Test application queries**
   - Application can connect to restored database
   - No validation errors from application models
   - All expected indexes exist
   - RLS policies function correctly

**Completion Criteria:**
- [ ] Backup restore tested successfully
- [ ] Restore takes less than X minutes
- [ ] All data verified intact
- [ ] Rollback procedure documented

---

### Task 1.7: Sign-off & Documentation
**Status:** [ ] TODO  
**Owner:** Product Manager  
**Priority:** HIGH  

**Required Approvals:**

- [ ] Database Administrator signs off on schema changes
- [ ] DevOps confirms backup strategy
- [ ] Product Manager approves data retention policy
- [ ] Security/Compliance (if applicable) reviews RLS policies

**Documentation to Complete:**

1. **Phase 1 Completion Report**
   - [ ] Actual schema state documented
   - [ ] Migration decisions explained
   - [ ] Data safety measures confirmed
   - [ ] Rollback procedure in place

2. **Operational Handoff**
   - [ ] How to apply new migration (010_*)
   - [ ] How to monitor for data consistency
   - [ ] Alert thresholds for ingestion health
   - [ ] Support runbook for common issues

3. **Next Phase (Phase 2) Prerequisites**
   - [ ] Database is safe and ready for telemetry collector
   - [ ] All required tables exist
   - [ ] RLS policies are functional
   - [ ] Backup and recovery procedures verified

**Completion Criteria:**
- [ ] All sign-offs collected
- [ ] Documentation complete and stored
- [ ] Team understands Phase 1 outcomes

---

## Timeline & Dependencies

```
Week 1:
  ├─ Task 1.1 (Backup) — 1 hour
  ├─ Task 1.2 (Inspection) — 2 hours
  ├─ Task 1.3 (Destructive migration status) — 1 hour
  ├─ Task 1.4 (Schema reconciliation) — 2 hours
  └─ Task 1.5 (Create 010_* migration) — 3 hours

Week 2:
  ├─ Task 1.6 (Backup validation) — 2 hours
  ├─ Task 1.7 (Sign-off) — 2 hours
  └─ Ready for Phase 2 → Launch telemetry collector
```

---

## Success Criteria

Phase 1 is complete when:

1. ✅ Database backup exists and is verified
2. ✅ Current schema state is documented
3. ✅ Decision made on data retention (keep vs. restore)
4. ✅ New forward-only migration (010_*) is prepared
5. ✅ Migration tested on staging without data loss
6. ✅ All stakeholders have signed off
7. ✅ Team understands rollback procedure

**Phase 2 can begin only after all criteria are met.**

---

## Contingency Plans

### If destructive migration was already executed and data is lost:

1. **Assess recoverable data:**
   - Check Supabase backup/recovery features
   - Check fleet-telemetry archive
   - Estimate how much data can be recovered

2. **Recovery strategy:**
   - Option A: Restore from backup (if available)
   - Option B: Replay raw telemetry (if logs preserved)
   - Option C: Start fresh with current date forward

3. **Communication:**
   - Inform users of historical data gap
   - Set clear expectation on available history

### If migration 010_* fails on production:

1. **Immediate response:**
   - Rollback to pre-010 database snapshot
   - Diagnose error in migration SQL
   - Fix migration and test on staging again

2. **Re-apply:**
   - Create 011_telemetry_data_enrichment_v2.sql (new version)
   - Re-test on staging
   - Apply with additional caution

---

**Phase 1 is now ready for execution.**  
**Assign tasks and begin immediately.**

