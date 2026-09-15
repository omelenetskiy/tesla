# 🗄️ DATABASE AGENT — PHASE 1 EXECUTION INSTRUCTIONS

**Agent Role:** Database Protection & Schema Reconciliation  
**Timeline:** Week 1 (September 16-20, 2026)  
**Status:** READY TO EXECUTE  

---

## 🎯 YOUR PRIMARY OBJECTIVE

Ensure database is safe, backed up, and ready for production migration by Friday Sept 20.

**Success = Friday EOD with green light for Sept 23 production.**

---

## 📋 YOUR TASKS (5 Days, 8 Hours Total)

### MONDAY SEPT 16 — TASK 1.1: CREATE BACKUP (30 minutes)

**What to do:**
1. Connect to production Supabase using credentials
2. Create full PostgreSQL dump
3. Verify backup file > 1MB
4. Calculate checksum
5. Store securely

**Exact command:**
```bash
pg_dump --verbose --no-privileges --no-owner \
  postgres://[USER]:[PASS]@db.supabase.co:5432/postgres > \
  backup_2026-09-16_prod.sql

# Verify size
ls -lh backup_2026-09-16_prod.sql

# Record checksum
shasum backup_2026-09-16_prod.sql > backup.checksum
```

**Report to Coordinator Agent:**
- Backup file name: _______
- File size: _______ MB
- Checksum: _______
- Status: [ ] COMPLETE / [ ] BLOCKED

---

### TUESDAY SEPT 17 — TASK 1.2 & 1.3: DIAGNOSIS (2 hours)

**What to do:**
Run these queries in Supabase SQL editor:

```sql
-- Query 1: Which tables exist?
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('trips','charging_sessions','battery_snapshots','vehicles','vehicle_states')
ORDER BY table_name;

-- Query 2: How much data?
SELECT 'trips', COUNT(*) FROM trips
UNION ALL SELECT 'charging_sessions', COUNT(*) FROM charging_sessions
UNION ALL SELECT 'battery_snapshots', COUNT(*) FROM battery_snapshots
UNION ALL SELECT 'vehicles', COUNT(*) FROM vehicles
UNION ALL SELECT 'vehicle_states', COUNT(*) FROM vehicle_states;

-- Query 3: Was migration 001 executed?
SELECT version FROM schema_migrations WHERE version = '001' LIMIT 1;
```

**Critical Decision:**

Based on results, determine:
- [ ] **SAFE** — Tables exist with data → Migration 001 NOT executed
- [ ] **AT_RISK** — Tables don't exist or data is gone → Migration WAS executed
- [ ] **UNKNOWN** — Unclear, need investigation

**Report to Coordinator Agent:**
- Migration 001 status: [ ] SAFE / [ ] AT_RISK / [ ] UNKNOWN
- Data volume (row counts): ______________
- Decision rationale: ______________

---

### WEDNESDAY SEPT 18 — TASK 1.4 & 1.5: SCHEMA REVIEW & TEST (3 hours)

**What to do:**

1. **Review current schema** (1 hour)
   - Verify `vehicles` table has required columns (from lib/tesla/models.ts)
   - Verify `vehicle_states` table has required columns
   - Check for missing components
   - Compare with app expectations

2. **Test migration 010 on staging** (1 hour)
   ```bash
   psql -d staging_db -f supabase/migrations/010_telemetry_data_enrichment.sql
   
   # Verify
   SELECT COUNT(*) FROM information_schema.tables 
   WHERE table_name LIKE 'telemetry_%';
   # Should return: 6
   ```

3. **Document any issues** (1 hour)
   - Record schema mismatches
   - Note migration errors
   - Plan fixes if needed

**Report to Coordinator Agent:**
- Schema status: [ ] RECONCILED / [ ] ISSUES FOUND
- Migration test: [ ] PASS / [ ] FAIL
- Issues: ______________

---

### THURSDAY SEPT 19 — TASK 1.6: ROLLBACK PROCEDURE (30 minutes)

**What to do:**

1. Document rollback SQL:
```sql
DROP TABLE IF EXISTS public.telemetry_coverage_stats CASCADE;
DROP TABLE IF EXISTS public.telemetry_open_sessions CASCADE;
DROP TABLE IF EXISTS public.telemetry_ingest_checkpoints CASCADE;
DROP TABLE IF EXISTS public.telemetry_field_freshness CASCADE;
DROP TABLE IF EXISTS public.telemetry_daily_aggregates CASCADE;
DROP TABLE IF EXISTS public.telemetry_session_samples CASCADE;

-- Verify
SELECT COUNT(*) as remaining_tables FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name LIKE 'telemetry_%';
```

2. Test rollback on staging (verify it works)

3. Record rollback time

**Report to Coordinator Agent:**
- Rollback tested: [ ] YES / [ ] NO
- Rollback time: _____ seconds
- Status: [ ] READY / [ ] ISSUES

---

### FRIDAY SEPT 20 — TASK 1.7: FINAL SIGN-OFF (1 hour)

**What to do:**

1. Prepare sign-off document with:
   - Backup: Created ✓, Size, Checksum
   - Diagnosis: Complete ✓, Status
   - Schema: Reconciled ✓
   - Migration: Tested ✓
   - Rollback: Ready ✓

2. Get sign-offs:
   - [ ] DBA: "Database safe for production"
   - [ ] Backend Lead: "No app issues expected"
   - [ ] Product Manager: "Risk acceptable"

3. Final decision:
   - [ ] GO TO PRODUCTION SEPT 23
   - [ ] NO-GO (explain why)

**Report to Coordinator Agent:**
- Status: [ ] APPROVED / [ ] BLOCKED
- Production migration date: Sept 23 or ______
- Issues if any: ______________

---

## 🔑 KEY FILES YOU NEED

- `PHASE1_IMPLEMENTATION_PLAN.md` — Full Phase 1 details
- `PHASE1_DAILY_TRACKING.md` — Track your progress
- `TELEMETRY_ROADMAP_PROGRESS.md` — Master tracker
- `supabase/migrations/010_telemetry_data_enrichment.sql` — New migration
- `lib/tesla/models.ts` — App expectations

---

## 📞 COMMUNICATION

**Daily:** Report status at 9:30 AM to Coordinator Agent

**Blockers:** Post in #telemetry-migration and tag Coordinator

**Questions:** Ask Coordinator Agent for clarification

**Updates:** Use TELEMETRY_ROADMAP_PROGRESS.md tracker

---

## ✅ SUCCESS CRITERIA

By Friday EOD, you will have:
- ✅ Backup created and verified
- ✅ Database schema documented
- ✅ Migration status determined (SAFE/AT_RISK/UNKNOWN)
- ✅ Migration 010 tested on staging
- ✅ Rollback procedure prepared
- ✅ All stakeholders signed off
- **✅ GREEN LIGHT for Sept 23 production**

---

## 🚀 START NOW

1. Read: `PHASE1_IMPLEMENTATION_PLAN.md`
2. Do: Task 1.1 TODAY (Monday Sept 16)
3. Report: Status daily to Coordinator Agent
4. Complete: All tasks by Friday Sept 20

**Effort:** 8 hours this week  
**Deadline:** Friday 5 PM UTC  
**Next:** Production migration Sept 23  

---

**You've got this. Questions? Ask Coordinator Agent.**

