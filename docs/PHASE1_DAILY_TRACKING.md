# 📋 PHASE 1 DAILY TRACKING SHEET

**Week:** September 16-20, 2026  
**Project:** Telemetry Product — Database Protection  
**Owner:** [DBA Name] & [Backend Lead Name]

---

## 🎯 MONDAY SEPTEMBER 16 — BACKUP CREATION

### Task 1.1: Create Database Backup

**Status:** [ ] NOT STARTED / [ ] IN PROGRESS / [ ] COMPLETE

**Time Spent:** _____ minutes (Target: 30 min)

**Checklist:**
- [ ] Supabase connection verified
- [ ] Backup command executed
- [ ] File size verified > 1MB
- [ ] Checksum calculated
- [ ] File stored securely

**Findings:**
```
Backup File Name: _____________________________
Backup Size: _____ MB
Checksum: _____________________________
Backup Location: _____________________________
Backup Date/Time: _____________________________
```

**Issues Encountered:**
```
None: [ ]
Issue: _____________________________
Resolution: _____________________________
```

**Sign-Off:**
- DBA: _________________________ Date: ___________

**Next Step:** Tuesday — Run diagnostic queries

---

## 📊 TUESDAY SEPTEMBER 17 — DIAGNOSTIC QUERIES

### Task 1.2: Run Database Inspection

**Status:** [ ] NOT STARTED / [ ] IN PROGRESS / [ ] COMPLETE

**Time Spent:** _____ hours (Target: 1-2 hours)

**Checklist:**
- [ ] Connection to Supabase verified
- [ ] Query 1 (table existence) executed
- [ ] Query 2 (data volume) executed
- [ ] Query 3 (migration history) executed
- [ ] Results documented
- [ ] Screenshots taken

**Query Results:**

**Query 1 — Which tables exist?**
```
trips: [ ] exists / [ ] missing
charging_sessions: [ ] exists / [ ] missing
battery_snapshots: [ ] exists / [ ] missing
vehicles: [ ] exists / [ ] missing
vehicle_states: [ ] exists / [ ] missing
```

**Query 2 — Data volume (row counts):**
```
trips: __________ rows
charging_sessions: __________ rows
battery_snapshots: __________ rows
vehicles: __________ rows
vehicle_states: __________ rows
```

**Query 3 — Migration history:**
```
Migration 001 (telemetry_schema): [ ] APPLIED / [ ] NOT APPLIED
Latest migration: version __________ date __________
Total migrations: __________
```

**Key Findings:**
```
1. ___________________________________________________
2. ___________________________________________________
3. ___________________________________________________
```

**Issues Encountered:**
```
None: [ ]
Issue: _____________________________
Resolution: _____________________________
```

**Sign-Off:**
- DBA: _________________________ Date: ___________

**Next Step:** Wednesday — Determine migration status

---

## ⚠️ WEDNESDAY SEPTEMBER 18 — MIGRATION STATUS DECISION

### Task 1.3: Determine if Migration 001 Was Executed

**Status:** [ ] NOT STARTED / [ ] IN PROGRESS / [ ] COMPLETE

**CRITICAL DECISION REQUIRED:**

**Question:** Was `001_telemetry_schema.sql` (with DROP statements) already executed?

**Evidence Review:**
```
Evidence 1: Tables exist with data?
  [ ] YES (safe, migration NOT executed)
  [ ] NO (dangerous, migration WAS executed)
  [ ] UNCERTAIN (need more investigation)

Evidence 2: Migration history shows 001?
  [ ] YES in schema_migrations table
  [ ] NO not in history
  [ ] UNCLEAR uncertain

Evidence 3: Data age?
  Oldest record date: __________
  Oldest migration date: __________
  Newer than migration: [ ] YES / [ ] NO
```

**DECISION:**
```
[ ] SAFE — Tables exist with data, migration 001 was NOT executed
[ ] AT_RISK — Migration 001 was executed, need recovery
[ ] UNKNOWN — Need more investigation before proceeding
```

**Decision Rationale:**
```
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________
```

**Escalation (if UNKNOWN):**
- Escalated to: _________________________ 
- Date: ___________
- Resolution: _____________________________

**Sign-Off:**
- DBA: _________________________ Date: ___________
- Backend Lead: _________________________ Date: ___________

**Next Step:** Thursday — Schema reconciliation & migration test

---

## 🔧 WEDNESDAY SEPTEMBER 18 — SCHEMA RECONCILIATION

### Task 1.4: Verify Application Models Match Database

**Status:** [ ] NOT STARTED / [ ] IN PROGRESS / [ ] COMPLETE

**Time Spent:** _____ hours (Target: 1-2 hours)

**Verification Checklist:**

**Vehicles Table:**
- [ ] id (UUID) ✓
- [ ] owner_id (UUID) ✓
- [ ] vehicle_tag_id (TEXT) ✓
- [ ] vehicle_id (TEXT) ✓
- [ ] vin (TEXT) ✓
- [ ] distance_unit ✓
- [ ] polling_profile ✓
- [ ] last_seen_at ✓
- [ ] last_collected_at ✓

**Vehicle States Table:**
- [ ] id (UUID/BIGINT) ✓
- [ ] vehicle_id (FK) ✓
- [ ] owner_id (FK) ✓
- [ ] state (JSONB) ✓
- [ ] battery_level ✓
- [ ] range_km ✓
- [ ] presence ✓
- [ ] odometer_km ✓
- [ ] collected_at ✓

**Activity Events Table:**
- [ ] id ✓
- [ ] vehicle_id (FK) ✓
- [ ] owner_id (FK) ✓
- [ ] type ✓
- [ ] data ✓
- [ ] occurred_at ✓

**Missing Components:**
```
Tables:
1. _________________________________
2. _________________________________

Columns:
1. _________________________________
2. _________________________________
```

**Mismatches to Address:**
```
1. _________________________________
2. _________________________________
```

**Action Items:**
```
1. _________________________________
2. _________________________________
```

**Sign-Off:**
- Backend Lead: _________________________ Date: ___________

**Next Step:** Thursday — Test migration on staging

---

## 🧪 THURSDAY SEPTEMBER 19 — MIGRATION TESTING

### Task 1.5: Test Migration 010 on Staging

**Status:** [ ] NOT STARTED / [ ] IN PROGRESS / [ ] COMPLETE

**Time Spent:** _____ hours (Target: 1 hour)

**Pre-Test Checklist:**
- [ ] Staging database backup created
- [ ] Migration file reviewed
- [ ] RLS policies understood
- [ ] Expected output documented

**Test Execution:**
```bash
psql -d staging_db -f supabase/migrations/010_telemetry_data_enrichment.sql
```

**Result:** [ ] SUCCESS / [ ] FAILED

**Tables Created (if successful):**
- [ ] telemetry_session_samples
- [ ] telemetry_daily_aggregates
- [ ] telemetry_field_freshness
- [ ] telemetry_ingest_checkpoints
- [ ] telemetry_open_sessions
- [ ] telemetry_coverage_stats

**Verification Queries Results:**
```
Total new tables: __________ (expected: 6)
Total RLS policies: __________
Total server functions: __________
```

**Issues Encountered:**
```
None: [ ]
Error: _____________________________
Error Details: _____________________________
Fix Applied: _____________________________
Re-test Result: [ ] SUCCESS / [ ] FAILED
```

**Performance Notes:**
```
Migration execution time: __________ seconds
Index creation time: __________ seconds
RLS policy application time: __________ seconds
Total time: __________ seconds
```

**Sign-Off:**
- DBA: _________________________ Date: ___________
- Backend Lead: _________________________ Date: ___________

**Next Step:** Thursday — Prepare rollback procedure

---

## 🔄 THURSDAY SEPTEMBER 19 — ROLLBACK PROCEDURE

### Task 1.6: Document Rollback Procedure

**Status:** [ ] NOT STARTED / [ ] IN PROGRESS / [ ] COMPLETE

**Time Spent:** _____ minutes (Target: 30 min)

**Rollback SQL Documented:**
```sql
-- Tested and verified on staging
DROP TABLE IF EXISTS public.telemetry_coverage_stats CASCADE;
DROP TABLE IF EXISTS public.telemetry_open_sessions CASCADE;
DROP TABLE IF EXISTS public.telemetry_ingest_checkpoints CASCADE;
DROP TABLE IF EXISTS public.telemetry_field_freshness CASCADE;
DROP TABLE IF EXISTS public.telemetry_daily_aggregates CASCADE;
DROP TABLE IF EXISTS public.telemetry_session_samples CASCADE;

-- Verification query
SELECT COUNT(*) as remaining_tables FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name LIKE 'telemetry_%';
-- Should return 0
```

**Rollback Testing:**
- [ ] Tested on staging: SUCCESS / FAILED
- [ ] Rollback time: __________ seconds
- [ ] Verification successful: [ ] YES / [ ] NO

**Rollback Decision Tree:**
```
IF migration fails in production:
  1. Execute rollback procedure above
  2. Verify all telemetry_* tables dropped
  3. Contact Backend Lead
  4. Investigate root cause
  5. Plan retry after fix

IF data corruption detected:
  1. Stop immediately
  2. Execute rollback
  3. Restore from backup
  4. Escalate to CTO
  5. Investigate incident

IF RLS policy issues:
  1. Rollback telemetry_* tables only
  2. Fix RLS policies
  3. Re-apply migration
  4. Test on staging again
```

**Escalation Contacts:**
```
DBA Lead: _________________________ Phone: ___________
Backend Lead: _________________________ Phone: ___________
CTO: _________________________ Phone: ___________
```

**Sign-Off:**
- DBA: _________________________ Date: ___________

**Next Step:** Friday — Get stakeholder sign-offs

---

## ✅ FRIDAY SEPTEMBER 20 — STAKEHOLDER SIGN-OFF

### Task 1.7: Obtain Approvals & Final Go/No-Go Decision

**Status:** [ ] NOT STARTED / [ ] IN PROGRESS / [ ] COMPLETE

**Time Spent:** _____ hours (Target: 1 hour)

**Sign-Off Document Preparation:**

**Database Safety Confirmation:**
```
[ ] Backup created and tested
[ ] Backup size: __________ MB
[ ] Checksum verified: ________________________
[ ] Backup location: _____________________________
[ ] Restoration tested: [ ] YES / [ ] NO

[ ] Current schema documented and reconciled
[ ] Migration 001 status determined: [ ] SAFE / [ ] AT_RISK
[ ] Schema mismatches: [ ] NONE / [ ] [LIST ABOVE]

[ ] Migration 010 tested on staging: [ ] PASS / [ ] FAIL
[ ] All 6 tables created successfully
[ ] RLS policies working: [ ] YES / [ ] NO
[ ] Performance acceptable: [ ] YES / [ ] NO

[ ] Rollback procedure documented and tested
[ ] Rollback time: __________ seconds
[ ] Escalation contacts documented
```

**Final Sign-Offs:**

**Database Administrator:**
```
Name: _____________________________
Email: _____________________________
Signature: _____________________________
Date: ___________
Statement: "Database is safe for production migration"
```

**Backend Lead:**
```
Name: _____________________________
Email: _____________________________
Signature: _____________________________
Date: ___________
Statement: "Schema reconciliation complete, no app issues expected"
```

**Product Manager:**
```
Name: _____________________________
Email: _____________________________
Signature: _____________________________
Date: ___________
Statement: "Risk mitigation acceptable, approved to proceed to production"
```

**Final Decision:**

**GO/NO-GO:** [ ] GO TO PRODUCTION SEPT 23 / [ ] NO-GO, ESCALATE

**If NO-GO, Reason:**
```
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________
```

**Production Migration Date (if GO):** September 23, 2026

**Migration Window:** __________ UTC (30 min window)

**Monitoring Plan:**
```
1. Monitoring during migration: _____________________________
2. Post-migration verification: _____________________________
3. Alerts enabled: [ ] YES / [ ] NO
4. Support team notified: [ ] YES / [ ] NO
```

**All-Clear Confirmation (Friday EOD):**
- Phase 1 Complete: [ ] YES
- Production Migration Ready: [ ] YES
- Team Confident: [ ] YES
- All Documentation Complete: [ ] YES

**Next Steps:**
- [ ] Schedule production migration for Sept 23
- [ ] Brief operations team
- [ ] Prepare communication for users (if needed)
- [ ] Begin Phase 2 planning

---

## 📈 WEEK SUMMARY (Fill in Friday)

**Phase 1 Completion Status:**

| Task | Owner | Status | Time | Sign-Off |
|------|-------|--------|------|----------|
| 1.1 Backup | DBA | ✅/❌ | | |
| 1.2 Queries | DBA | ✅/❌ | | |
| 1.3 Decision | DBA | ✅/❌ | | |
| 1.4 Schema | Backend | ✅/❌ | | |
| 1.5 Test | DBA+Backend | ✅/❌ | | |
| 1.6 Rollback | DBA | ✅/❌ | | |
| 1.7 Sign-Off | All | ✅/❌ | | |

**Total Time Spent:** _____ hours (Budget: 8 hours)

**Issues Encountered:** [ ] NONE / [ ] [See above]

**Production Ready:** [ ] YES / [ ] NO

**Comments:**
```
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________
```

**Prepared by:** _________________________ Date: ___________
**Reviewed by:** _________________________ Date: ___________
**Approved by:** _________________________ Date: ___________

---

## 🎯 NEXT WEEK (September 23+)

**If APPROVED:**
- Monday: Apply migration to production
- Tuesday: Start Phase 2 Telemetry work
- Tuesday: Start Phase 3 UI Design work

**If NOT APPROVED:**
- Escalate to CTO
- Schedule recovery meeting
- Adjust timeline

---

**Print this sheet and use it daily to track Phase 1 progress.**

