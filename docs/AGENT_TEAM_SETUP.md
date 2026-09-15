# 🤖 LLM AGENT TEAM SETUP — Telemetry Product Development

**Project:** Tesla App — Telemetry & UI Upgrade  
**Execution Model:** Distributed LLM Agents  
**Start Date:** September 15, 2026  
**Go-Live Target:** October 28, 2026 (12 weeks)

---

## 🎯 AGENT ARCHITECTURE

```
┌─────────────────────────────────────────────────────────┐
│          COORDINATOR AGENT                              │
│  ├─ Track overall progress                              │
│  ├─ Resolve cross-team blockers                        │
│  ├─ Update master tracker                              │
│  └─ Report status to stakeholders                      │
└──────┬──────────────┬──────────────┬────────────────────┘
       │              │              │
       ▼              ▼              ▼
   DATABASE      TELEMETRY        FRONTEND
   AGENT         AGENT            AGENT
   ┌─────────┐   ┌─────────┐     ┌─────────┐
   │Phase 1  │   │Phase 2  │     │Phase 3  │
   │Database │   │Ingestion│     │UI Design│
   │Protection   │24/7     │     │Tokens   │
   └─────────┘   │No Wake  │     │Comps    │
                 └─────────┘     └─────────┘
```

---

## 📋 AGENT SPECIFICATIONS

### 1️⃣ DATABASE AGENT (Phase 1)
**Role:** Database Protection & Migration  
**Timeline:** Week 1 (Sept 16-20)  
**Owner Responsibility:** Data safety, schema reconciliation  
**Deliverables:**
- Backup created & verified
- Schema state documented
- Migration tested on staging
- Rollback procedure ready
- Sign-off obtained

**Key File:** `PHASE1_IMPLEMENTATION_PLAN.md`  
**Status Tracker:** `TELEMETRY_ROADMAP_PROGRESS.md` § Phase 1

**Daily Tasks:**
- Mon: Create backup (Task 1.1)
- Tue: Run diagnostic queries (Task 1.2)
- Wed: Determine migration status (Task 1.3)
- Thu: Test migration (Task 1.5)
- Thu: Document rollback (Task 1.6)

**Success Criteria:**
- ✅ Backup exists and is tested
- ✅ Schema reconciliation complete
- ✅ Migration decision documented
- ✅ Migration tested on staging
- ✅ All stakeholders signed off
- ✅ **Green light for Sept 23 production**

---

### 2️⃣ TELEMETRY AGENT (Phase 2)
**Role:** Reliable 24/7 Telemetry Ingestion  
**Timeline:** Weeks 2-3 (Sept 23 - Oct 6)  
**Dependencies:** Phase 1 complete  
**Deliverables:**
- Signal catalogue documented
- Ingestion loop designed & implemented
- Idempotency verified
- Field freshness tracking implemented
- Energy accounting verified
- Sleeping vehicle cache-first policy

**Key File:** `PHASE2_RELIABLE_TELEMETRY.md`  
**Status Tracker:** `TELEMETRY_ROADMAP_PROGRESS.md` § Phase 2

**Tasks:**
- Task 2.1: Signal Catalogue (20 hours)
- Task 2.2: Continuous Ingestion Loop (40 hours)
- Task 2.3: Sleeping Vehicle Policy (15 hours)
- Task 2.4: Energy Accounting (20 hours)

**Success Criteria:**
- ✅ Ingestion runs 24/7
- ✅ Zero vehicle wake-up calls
- ✅ Field freshness tracked per-field
- ✅ Restart recovery works (no data loss)
- ✅ Coverage stats collected
- ✅ All tests passing

---

### 3️⃣ FRONTEND AGENT (Phase 3)
**Role:** UI Design System & Component Migration  
**Timeline:** Weeks 4-8 (Oct 7-Nov 3)  
**Dependencies:** Phase 1 complete, Phase 2 starting  
**Deliverables:**
- Design tokens defined
- Untitled UI MCP configured
- All components wrapped
- Navigation redesigned
- Forms migrated
- Charts styled
- Modals & dialogs implemented
- Skeletons & loading states
- Light/Dark/System themes

**Key File:** `PHASE3_UNTITLED_UI_MIGRATION.md`  
**Status Tracker:** `TELEMETRY_ROADMAP_PROGRESS.md` § Phase 3

**Tasks (9 Sub-tasks):**
- Task 3.0: Untitled UI MCP (4 hours)
- Task 3.1: Design Tokens (8 hours)
- Task 3.2-3.9: Component Migration (80 hours)

**Success Criteria:**
- ✅ All components from Untitled UI
- ✅ Design system enforced
- ✅ Themes working everywhere
- ✅ No visual regressions
- ✅ Accessibility verified (WCAG AA+)
- ✅ Responsive on all devices

---

### 4️⃣ FEATURES AGENT (Phase 4-7)
**Role:** Pages, Widgets, Charts, Completion  
**Timeline:** Weeks 9-12 (Nov 4-Nov 30)  
**Dependencies:** Phase 3 complete  
**Deliverables:**
- Dashboard implementation (all cards)
- Battery page with metrics
- Trips list & detail views with maps
- Charging history & curves
- Calendar integration with daily reports
- Alerts page
- Settings & diagnostics
- Charts & visualizations
- Error pages & handling

**Key File:** `TELEMETRY_ROADMAP_PROGRESS.md` § Phase 4-7  
**Status Tracker:** `TELEMETRY_ROADMAP_PROGRESS.md`

**Success Criteria:**
- ✅ All 10 completion gates met
- ✅ Feature complete
- ✅ Tests passing
- ✅ Performance acceptable
- ✅ Ready for production

---

### 5️⃣ COORDINATOR AGENT (All Phases)
**Role:** Cross-Team Coordination & Status Tracking  
**Timeline:** Ongoing (Sept 15 - Oct 28)  
**Responsibilities:**
- Update master tracker daily
- Resolve inter-team blockers
- Manage dependencies
- Report status to stakeholders
- Escalate issues

**Status Dashboard:** `TELEMETRY_ROADMAP_PROGRESS.md`  
**Issue Log:** Issues tracked in comments

**Daily Tasks:**
- 9:30 AM: Collect status from all agents
- 12:00 PM: Check for blockers
- 3:00 PM: Update tracker
- 5:00 PM: Report summary

---

## 🔄 AGENT COMMUNICATION PROTOCOL

### Daily Standup (9:30 AM UTC)
```
Each agent reports:
1. ✅ Tasks completed yesterday
2. 🎯 Tasks scheduled for today
3. 🚨 Blockers or issues
4. ✓ Confidence on timeline
```

### Weekly Sync (Friday 4 PM UTC)
```
All agents + Coordinator:
1. Phase progress review
2. Milestone check-in
3. Risk assessment
4. Next week planning
```

### Blocker Resolution
```
IF agent blocked:
1. Post in #telemetry-migration
2. Tag Coordinator Agent
3. Coordinator escalates if needed
4. Resolution documented
```

### Dependencies
```
Database Agent → DONE (Week 1)
            ↓
    Telemetry Agent START (Week 2)
    UI Agent START (Week 2)
            ↓
    Features Agent START (Week 9)
```

---

## 📊 SUCCESS METRICS

### Database Agent (Phase 1)
- Backup size verified
- 7/7 tasks completed on time
- 0 production issues during migration

### Telemetry Agent (Phase 2)
- Ingestion uptime > 99.9%
- Zero missed events
- Field freshness <5 min average

### Frontend Agent (Phase 3)
- 100% component coverage
- Lighthouse score >90
- Accessibility score = AA+

### Features Agent (Phase 4-7)
- All 10 completion gates met
- Test coverage >85%
- Performance: dashboard <2s load

### Coordinator Agent
- Status reports 100% on-time
- Blocker resolution <4 hours average
- Zero communication gaps

---

## 🎯 AGENT INSTRUCTIONS

Each agent should follow this template:

```
ROLE: [Your specific role]

PRIMARY OBJECTIVE:
[Single clear goal]

TIMELINE:
[Specific weeks/dates]

DELIVERABLES:
- [ ] Item 1
- [ ] Item 2
- [ ] Item 3

DEPENDENCIES:
[What must be done first]

REFERENCE DOCUMENTS:
- [Key file 1]
- [Key file 2]

DAILY ROUTINE:
9:30 AM: Report status
12 PM: Check progress
3 PM: Flag blockers
5 PM: Update tracker

COMMUNICATION:
- Blocker → Coordinator Agent
- Questions → Coordinator Agent
- Status → #telemetry-migration Slack
- Updates → Master tracker

SUCCESS CRITERIA:
- All deliverables complete ✓
- Timeline on-track ✓
- Quality gates met ✓
- Zero production issues ✓
```

---

## 🚀 AGENT ASSIGNMENT

### Database Agent
**First Task:** Execute Phase 1 (Week 1)
- Reference: `PHASE1_IMPLEMENTATION_PLAN.md`
- Daily Tracker: `PHASE1_DAILY_TRACKING.md`
- Master Tracker: `TELEMETRY_ROADMAP_PROGRESS.md`

**What to do:**
1. Read Phase 1 plan
2. Create backup (Task 1.1)
3. Run diagnostics (Task 1.2-1.3)
4. Test & sign-off (Tasks 1.4-1.7)
5. Report: Ready for Sept 23 production

---

### Telemetry Agent
**First Task:** Begin Phase 2 planning (Week 2)
- Reference: `PHASE2_RELIABLE_TELEMETRY.md`
- Master Tracker: `TELEMETRY_ROADMAP_PROGRESS.md`

**What to do:**
1. Wait for Phase 1 sign-off
2. Read Phase 2 design
3. Task 2.1: Document signals
4. Task 2.2: Design ingestion loop
5. Task 2.3: Implement sleeping policy
6. Task 2.4: Verify energy accounting

---

### Frontend Agent
**First Task:** Begin Phase 3 planning (Week 2)
- Reference: `PHASE3_UNTITLED_UI_MIGRATION.md`
- Master Tracker: `TELEMETRY_ROADMAP_PROGRESS.md`

**What to do:**
1. Read Phase 3 design
2. Task 3.0: Set up Untitled UI MCP
3. Task 3.1: Define design tokens
4. Tasks 3.2-3.9: Migrate components
5. Parallel: Can start while Phase 2 runs

---

### Features Agent
**First Task:** Wait for Phase 3 completion (Week 9)
- Reference: `TELEMETRY_ROADMAP_PROGRESS.md` § Phase 4-7
- Master Tracker: `TELEMETRY_ROADMAP_PROGRESS.md`

**What to do:**
1. Wait for Phase 3 sign-off
2. Implement all pages
3. Verify all completion gates
4. Test entire product
5. Prepare for launch

---

### Coordinator Agent
**First Task:** START IMMEDIATELY
- Track: `TELEMETRY_ROADMAP_PROGRESS.md`
- Standup: 9:30 AM daily
- Report: Daily summary
- Role: Keep everything moving, resolve blockers

**What to do:**
1. Monitor all agents
2. Collect daily status
3. Update master tracker
4. Escalate blockers
5. Communicate progress

---

## 📝 AGENT WORKFLOW

### Phase 1 (Database Agent Only)
```
Week 1:
  Mon: Task 1.1 (Backup) → Report
  Tue: Task 1.2 (Queries) → Report
  Wed: Task 1.3 (Decision) → Report
  Thu: Tasks 1.5+1.6 (Test+Rollback) → Report
  Fri: Task 1.7 (Sign-off) → Final Report

Output: GREEN LIGHT for production Sept 23
```

### Phases 2+3 (Parallel)
```
Week 2-3:
  Telemetry Agent: Phase 2 work
  Frontend Agent: Phase 3 work
  Coordinator: Track both, resolve conflicts

Week 4-8:
  Frontend: Continue Phase 3
  Coordinator: Monitor, report

Week 9-12:
  Features Agent: Phase 4-7
  Coordinator: Final push to launch
```

---

## ✅ READY TO BEGIN

Each agent now has:
- ✅ Clear role & responsibilities
- ✅ Specific timeline & deliverables
- ✅ Reference documents
- ✅ Success criteria
- ✅ Communication protocol
- ✅ Daily routine

**Next Step:** Agents begin work on assigned phases.

---

**All agents ready to execute. Starting immediately.**

