# 🎯 COORDINATOR AGENT — MASTER CONTROL

**Role:** Cross-team coordination, blocker resolution, status tracking  
**Timeline:** Ongoing (Sept 15 - Oct 28, 2026)  
**Responsibility:** Keep all agents moving, resolve conflicts, report progress  

---

## 🎯 YOUR PRIMARY OBJECTIVE

Ensure all 4 agents execute perfectly, blockers are resolved within 4 hours, and project stays on track for Oct 28 launch.

---

## 📊 DAILY ROUTINE

### 9:30 AM — STANDUP (15 minutes)

**Collect from each agent:**
1. Database Agent (if Phase 1): What completed yesterday?
2. Telemetry Agent (if active): What's in progress?
3. Frontend Agent (if active): Any blockers?
4. Features Agent (if active): On track?

**Format:**
```
✅ Completed: [Task name]
🎯 Today: [Task name]
🚨 Blocker: [Issue or NONE]
✓ Timeline: ON TRACK / AT RISK
```

**Update:** `TELEMETRY_ROADMAP_PROGRESS.md`

---

### 12:00 PM — BLOCKER CHECK (10 minutes)

**Scan for blockers:**
- Any agent stuck?
- Any cross-team conflict?
- Any decision needed?

**Action:**
- If blocker exists → Investigate
- If needs escalation → Contact CTO
- If can resolve → Coordinate fix

**Record:** In notes

---

### 3:00 PM — PROGRESS UPDATE (10 minutes)

**Update master tracker:**
```
Phase 1: [Completed % or tasks]
Phase 2: [Completed % or tasks]
Phase 3: [Completed % or tasks]
Phase 4-7: [Waiting or started]
```

**Check timeline:**
- On track? [ ] YES / [ ] AT RISK
- Any adjustment needed? [ ] NO / [ ] YES

**Update:** `TELEMETRY_ROADMAP_PROGRESS.md`

---

### 5:00 PM — END OF DAY REPORT (15 minutes)

**Document:**
```
DATE: [Date]
PHASE 1 STATUS: [Status]
PHASE 2 STATUS: [Status]
PHASE 3 STATUS: [Status]
BLOCKERS TODAY: [0 or list]
CONFIDENCE: [ ] HIGH / [ ] MEDIUM / [ ] LOW
NEXT STEPS: [Tomorrow's focus]
```

**Send:** Slack message to #telemetry-migration

---

## 📅 WEEKLY SYNC (Friday 4 PM, 1 hour)

**All agents present:**
1. Phase progress review (15 min)
2. Milestone check-in (15 min)
3. Risk assessment (15 min)
4. Next week planning (15 min)

**Document outcomes:**
- Decisions made
- Issues resolved
- Next week priorities

---

## 🚨 BLOCKER RESOLUTION PROTOCOL

**IF Agent blocked:**

1. **Immediate**: Post in #telemetry-migration
2. **5 min**: Coordinator assesses severity
3. **15 min**: Investigate root cause
4. **30 min**: Propose solution
5. **1-2 hours**: Execute fix or escalate
6. **4 hours MAX**: Issue resolved

**Escalation:**
- Technical → CTO/Tech Lead
- Resource → Manager
- Timeline → VP Engineering

---

## 📈 PHASE GATES & MILESTONES

### Phase 1 Gate (Friday Sept 20)
**Requirement:** Database Agent reports GREEN for production

**Verification:**
- [ ] Backup created & tested
- [ ] Schema reconciliation complete
- [ ] Migration tested on staging
- [ ] All stakeholders signed off

**Action if RED:**
- Escalate to CTO
- Investigate issue
- Adjust timeline if needed

---

### Phase 2 Start Gate (Monday Sept 23)
**Requirement:** Production migration successful

**Verification:**
- [ ] All 6 new tables created
- [ ] RLS policies applied
- [ ] No data loss
- [ ] Telemetry Agent ready to begin

**Action if RED:**
- Rollback migration
- Investigate issue
- Retry on staging
- Schedule new migration date

---

### Phase 3 Start Gate (Monday Sept 23)
**Requirement:** Untitled UI MCP accessible

**Verification:**
- [ ] MCP installed
- [ ] Components accessible
- [ ] Licensing confirmed
- [ ] Frontend Agent ready

**Action if RED:**
- Fallback: Radix UI + custom styling
- Adjust timeline (+2 weeks)
- Continue with fallback

---

### Phase 2 Gate (Monday Oct 7)
**Requirement:** Telemetry Agent completes Phase 2

**Verification:**
- [ ] Ingestion running 24/7
- [ ] Zero wake-up calls
- [ ] Field freshness tracked
- [ ] All tests passing

**Action if RED:**
- Investigate failures
- Fix and re-test
- Extend timeline if critical

---

### Phase 3 Gate (Thursday Oct 31)
**Requirement:** Frontend Agent completes Phase 3

**Verification:**
- [ ] All components migrated
- [ ] Themes working
- [ ] No regressions
- [ ] Accessibility verified

**Action if RED:**
- Prioritize critical components
- Move rest to Phase 4 if needed
- Launch with what's ready

---

### Phase 4 Start (Monday Nov 4)
**Requirement:** All previous phases complete

**Verification:**
- [ ] Database: DONE
- [ ] Telemetry: DONE
- [ ] UI: DONE

**Action:** Launch Features Agent

---

### LAUNCH GATE (Friday Oct 28)
**Requirement:** All 10 completion gates met

**Verification:**
- [ ] No duplicate/replayed telemetry
- [ ] Restarting ingestion safe
- [ ] Page loads issue no wake-ups
- [ ] Every trip route drawn
- [ ] Calendar totals correct
- [ ] Light/dark themes complete
- [ ] No mock data/emoji/handwritten icons
- [ ] Correct units throughout
- [ ] All tests pass
- [ ] Features complete

**Action if RED:**
- Extend timeline
- Prioritize remaining items
- Plan Phase 2 (post-launch improvements)

---

## 📊 TRACKING SPREADSHEET

**File:** `TELEMETRY_ROADMAP_PROGRESS.md`

Update daily:
```
| Date | Phase 1 | Phase 2 | Phase 3 | Phase 4-7 | Blockers | Confidence |
|------|---------|---------|---------|-----------|----------|------------|
| 9/15 | Ready   | Waiting | Ready   | Waiting   | 0        | HIGH       |
| 9/16 | 14%     | Waiting | Ready   | Waiting   | 0        | HIGH       |
| 9/17 | 29%     | Waiting | Ready   | Waiting   | 0        | HIGH       |
| etc  |         |         |         |           |          |            |
```

---

## 🎯 SUCCESS INDICATORS

### HEALTHY PROJECT
- ✅ All agents report status on time
- ✅ Zero blockers lasting >4 hours
- ✅ Timeline on track (±3 days)
- ✅ Code quality maintained
- ✅ Tests passing
- ✅ Confidence: HIGH

### WARNING SIGNS
- 🟡 Agent missing standup
- 🟡 Blocker unresolved >4 hours
- 🟡 Timeline slipping >1 week
- 🟡 Tests failing
- 🟡 Confidence: MEDIUM

### CRITICAL ISSUES
- 🔴 Agent blocked >8 hours
- 🔴 Phase gate not met
- 🔴 Data loss suspected
- 🔴 Production blocker
- 🔴 Confidence: LOW

**Action:** Escalate to CTO immediately

---

## 📞 CONTACTS

**Database Agent Lead:** _________________ Phone: _________

**Telemetry Agent Lead:** _________________ Phone: _________

**Frontend Agent Lead:** _________________ Phone: _________

**CTO (Escalations):** _________________ Phone: _________

**VP Engineering (Timeline):** _________________ Phone: _________

---

## 🚀 YOUR TASKS TODAY (Sept 15)

### Morning
- [ ] Read this entire document
- [ ] Review all agent instruction files
- [ ] Check: All files created properly
- [ ] Verify: Master tracker ready

### Mid-Day
- [ ] Confirm Database Agent assigned
- [ ] Confirm Backend Lead briefed
- [ ] Confirm Frontend Lead on standby
- [ ] Set up #telemetry-migration Slack channel

### Afternoon
- [ ] Send team notifications
- [ ] Schedule daily standups (9:30 AM)
- [ ] Schedule weekly syncs (Friday 4 PM)
- [ ] Bookmark all key files

### End of Day
- [ ] All agents understand instructions
- [ ] All agents ready for Monday start
- [ ] Coordinator ready for launch

---

## 📋 TODAY'S CHECKLIST

- [ ] All documentation complete (14 files)
- [ ] All instruction files created (4 files)
- [ ] Master tracker prepared
- [ ] Database Agent brief & ready
- [ ] Telemetry Agent brief & ready
- [ ] Frontend Agent brief & ready
- [ ] Communication channels set up
- [ ] Schedule coordinated
- [ ] Escalation contacts identified
- [ ] Risk register reviewed
- [ ] Success criteria understood
- [ ] Launch readiness confirmed

---

## 🎉 FIRST AGENT STARTS TOMORROW

**Database Agent kicks off Phase 1: Monday Sept 16**

Your job: Keep them focused, unblocked, and on track.

**Report:** Daily to stakeholders (5 PM via Slack)

---

**YOU'RE LIVE. Let's launch this thing! 🚀**

