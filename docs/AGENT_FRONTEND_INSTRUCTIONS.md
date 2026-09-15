# 🎨 FRONTEND AGENT — PHASE 3 EXECUTION INSTRUCTIONS

**Agent Role:** UI Design System & Component Migration to Untitled UI  
**Timeline:** Weeks 4-8 (October 7-31, 2026)  
**Dependencies:** Phase 1 COMPLETE (Database ready for Phase 3 to begin)  
**Parallel with:** Phase 2 (Telemetry) — Can start Week 2  
**Status:** READY WHEN PHASE 1 DONE  

---

## 🎯 YOUR PRIMARY OBJECTIVE

Migrate entire UI to Untitled UI design system with consistent Light/Dark/System themes.

**Success = Oct 31 with unified, accessible, theme-aware UI.**

---

## 📋 YOUR TASKS (5 Weeks, 92 Hours Total)

### WAIT FOR SIGNAL: Phase 1 COMPLETE (Sept 20 EOD)

Once Database Agent reports ready:
- You can start Phase 3 planning immediately
- Don't wait for Phase 2 (can run in parallel)
- Begin Week 2 (Sept 23)

---

### WEEKS 1-2 (SEPT 23 - OCT 6) — TASK 3.0 & 3.1: SETUP & TOKENS (12 hours)

**Task 3.0: Untitled UI MCP Setup (4 hours)**

1. Review Untitled UI MCP documentation
2. Confirm licensing and component access
3. Install locally:
   ```bash
   npm install untitled-ui
   # Store API key in .env.local (NOT git)
   UNTITLED_UI_API_KEY=sk_...
   ```
4. Test one component imports
5. Verify documentation accessible

**Deliverable:**
- Untitled UI installed
- MCP working
- Component library accessible

---

**Task 3.1: Design System Tokens (8 hours)**

1. Define design tokens in `lib/design/tokens.ts`:
   - Colors (semantic: success, error, warning, info)
   - Typography (display, h1-h2, body, label, metric, caption)
   - Spacing (xs, sm, md, lg, xl, 2xl)
   - Radius (sm, md, lg, full)
   - Shadows (sm, md, lg, xl)
   - Z-index scale

2. Set up CSS custom properties in `globals.css`:
   - Light mode colors
   - Dark mode overrides
   - System mode (prefers-color-scheme)

3. Font setup:
   - Inter for UI
   - Support Latin + Cyrillic
   - Tabular numerals for metrics

4. Theme switching logic:
   - Light/Dark/System options
   - Persistent storage
   - No flash on load

**Deliverable:**
- `lib/design/tokens.ts` (complete)
- `globals.css` (complete)
- Theme switching working
- All 3 modes tested

---

### WEEKS 2-3 (SEPT 30 - OCT 13) — TASKS 3.2-3.4: PRIMITIVES (36 hours)

**Task 3.2: Component Wrappers (8 hours)**
- `components/ui/button.tsx` (wrap Untitled UI)
- `components/ui/input.tsx`
- `components/ui/select.tsx`
- `components/ui/tabs.tsx`
- `components/ui/badge.tsx` (add semantic colors)

**Task 3.3: Navigation & Shell (8 hours)**
- `components/shell/app-shell.tsx` (redesigned)
- Sidebar with Untitled UI
- Breadcrumb navigation
- Active states, responsive behavior

**Task 3.4: Forms & Validation (8 hours)**
- `components/ui/form-field.tsx` (label + error)
- Input validation states
- Error message colors
- Disabled/readonly states

---

### WEEKS 3-4 (OCT 7-20) — TASKS 3.5-3.7: COMPLEX (32 hours)

**Task 3.5: Cards & Tables (8 hours)**
- Dashboard card with metric + sparkline
- Elevation shadows
- Hover effects
- Dark mode variant

- Sortable tables with pagination
- Striped rows
- Hoverable rows
- Mobile responsive

**Task 3.6: Charts & Visualizations (8 hours)**
- Wrap Recharts with design tokens
- Define chart colors per semantic
- Style axes, legends, tooltips
- Dark mode variant
- Ensure responsive

**Task 3.7: Modals & Dialogs (8 hours)**
- Modal with backdrop blur
- Dialog with focus trap
- Dismiss button (X)
- Action buttons (OK, Cancel)
- Keyboard support (Escape)

---

### WEEKS 4-5 (OCT 21-NOV 3) — TASKS 3.8-3.9: POLISH (12 hours)

**Task 3.8: Badges & Status (4 hours)**
- Presence badges (driving, parked, charging, sleeping, offline)
- Color mapping to semantic
- Size variants
- Icon support

**Task 3.9: Loading & Skeletons (8 hours)**
- Card skeleton (matches real card)
- Table skeleton (rows)
- Chart skeleton
- Map skeleton
- No layout shift
- Respect reduced-motion

---

## 🔑 KEY FILES YOU NEED

- `PHASE3_UNTITLED_UI_MIGRATION.md` — Full Phase 3 design
- `lib/design/tokens.ts` — Where to define tokens
- `globals.css` — Where to set CSS properties
- `components/ui/` — Component location
- `components/shell/app-shell.tsx` — Navigation

---

## 📞 COMMUNICATION

**Daily:** 9:30 AM standup with Coordinator Agent

**Parallel Work:**
- You can start simultaneously with Telemetry Agent
- No dependency conflict
- Coordinate any shared concerns via Coordinator

**Blockers:** Tag Coordinator Agent

**Updates:** `TELEMETRY_ROADMAP_PROGRESS.md` § Phase 3

---

## ✅ SUCCESS CRITERIA (By Oct 31)

- ✅ All components from Untitled UI (no custom implementations)
- ✅ Design tokens enforced across app
- ✅ Light/Dark/System themes working everywhere
- ✅ Typography consistent (Latin + Cyrillic)
- ✅ No visual regression vs. current
- ✅ Accessibility tested (WCAG AA+)
- ✅ Responsive on mobile/desktop/tablet
- ✅ No console errors/warnings
- ✅ Bundle size acceptable
- ✅ All tests passing

---

## 🚀 CAN START THIS WEEK

Unlike Telemetry Agent, you don't need to wait.  
Phase 2 and 3 are independent.

**Checklist while waiting for Phase 1:**
- [ ] Read full Phase 3 design doc
- [ ] Install Untitled UI locally
- [ ] Review component library
- [ ] Plan token structure
- [ ] Design CSS custom properties
- [ ] List all components to wrap
- [ ] Set up Storybook (optional)

---

## 🎯 WEEKLY PACE

```
Week 1 (Sept 23-27): Setup + Tokens (12h)
Week 2 (Sept 30-Oct 6): Primitives (36h)
Week 3 (Oct 7-13): Complex Components (32h)
Week 4 (Oct 14-20): Polish (12h)
Week 5 (Oct 21-27): Final testing + fixes

Oct 31 EOD: PHASE 3 COMPLETE ✅
```

---

**Timeline:** Can start Week 1 (Sept 23)  
**Finish:** Oct 31  
**Effort:** 92 hours  
**Next:** Features Agent waits for you  

---

**Ready to start. Questions? Ask Coordinator Agent.**

