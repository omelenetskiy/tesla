# Phase 3 — Complete Untitled UI Migration

**Status:** Blockers — Requires Phase 1 & 2  
**Target:** Full visual consistency across all components  
**Timeline:** 4 weeks

---

## Overview

This phase replaces all bespoke UI components with Untitled UI design system.

**Scope Change:**
- Before: Mixed sources (Radix, custom CSS, inline styles)
- After: Unified Untitled UI primitives + custom Recharts/MapLibre wrappers

**Key Constraint:** Never introduce visual regressions. Every page must look equivalent or better after migration.

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Untitled UI Design System              │
│  ├─ Primitives (Buttons, Inputs, etc)  │
│  ├─ Tokens (Colors, Spacing, Type)     │
│  ├─ Icons (Feather set)                │
│  └─ Theme (Light/Dark/System)          │
└────────────────┬────────────────────────┘
                 │
    ┌────────────┼────────────┐
    ▼            ▼            ▼
Navigation   Components    Pages
├─ App Shell  ├─ Cards      ├─ Dashboard
├─ Sidebar    ├─ Tables     ├─ Battery
└─ Breadcrumb └─ Modals     ├─ Trips
                             ├─ Charging
                             └─ Calendar

Specialized Rendering (not design system):
├─ MapLibre (vehicle map, routes)
├─ Recharts (battery curves, energy)
└─ D3 (custom calculations)
```

---

## Prerequisites

### Task 3.0: Untitled UI MCP Setup
**Priority:** BLOCKING  
**Owner:** DevOps  

**Steps:**

1. **Review official Untitled UI MCP documentation**
   - URL: (provided by your team)
   - Confirm supported React version
   - Confirm icon set availability
   - Confirm component list

2. **Verify JetBrains Copilot compatibility**
   - MCP transport (stdio/SSE)
   - Authentication (API key)
   - Local vs. remote server

3. **Install locally**
   ```bash
   npm install untitled-ui  # or equivalent
   # Store API key in .env.local (NOT git)
   UNTITLED_UI_API_KEY=sk_...
   ```

4. **Test component import**
   ```tsx
   import { Button, Input } from 'untitled-ui/react'
   
   export default function Test() {
     return <Button>Test</Button>
   }
   ```

5. **Verify documentation access**
   - Can you browse component props?
   - Can you see live examples?
   - Can you access the calendar component? (critical for Phase 4)

**Completion Criteria:**
- [ ] Untitled UI installed
- [ ] One component renders without error
- [ ] Documentation accessible
- [ ] API key stored securely
- [ ] No Tesla/private data exposed to MCP

---

## Task Breakdown

### Task 3.1: Design System Definition
**Priority:** CRITICAL  
**Owner:** Design Lead  
**Dependencies:** Task 3.0

**Objective:** Define tokens, typography, themes once, use everywhere.

**File:** `lib/design/tokens.ts`

```typescript
// Design system tokens (single source of truth)
export const tokens = {
  // Color palette (semantic)
  colors: {
    background: {
      primary: 'hsl(0 0% 100%)',      // Light mode
      secondary: 'hsl(0 0% 96%)',
      tertiary: 'hsl(0 0% 92%)',
      inverse: 'hsl(0 0% 0%)',        // Dark mode
    },
    
    text: {
      primary: 'hsl(0 0% 10%)',
      secondary: 'hsl(0 0% 40%)',
      tertiary: 'hsl(0 0% 60%)',
      inverse: 'hsl(0 0% 100%)',      // Dark mode
    },
    
    status: {
      success: 'hsl(120 70% 50%)',    // Green
      warning: 'hsl(40 95% 50%)',     // Amber
      error: 'hsl(0 84% 60%)',        // Red
      info: 'hsl(200 85% 50%)',       // Blue
    },

    semantic: {
      charging: 'hsl(120 70% 50%)',   // Green
      driving: 'hsl(200 85% 50%)',    // Blue
      parked: 'hsl(40 95% 50%)',      // Amber
      sleeping: 'hsl(0 0% 60%)',      // Gray
      offline: 'hsl(0 0% 40%)',       // Dark Gray
    }
  },

  // Spacing (8px base unit)
  spacing: {
    xs: '0.25rem',  // 4px
    sm: '0.5rem',   // 8px
    md: '1rem',     // 16px
    lg: '1.5rem',   // 24px
    xl: '2rem',     // 32px
    '2xl': '3rem',  // 48px
  },

  // Typography scale
  typography: {
    // Display (page hero, dashboard title)
    display: {
      fontSize: '2rem',      // 32px
      lineHeight: 1.25,
      fontWeight: 600,
      letterSpacing: '-0.02em',
    },

    // Heading 1 (section titles)
    h1: {
      fontSize: '1.5rem',    // 24px
      lineHeight: 1.33,
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },

    // Heading 2
    h2: {
      fontSize: '1.25rem',   // 20px
      lineHeight: 1.4,
      fontWeight: 600,
    },

    // Body (default text)
    body: {
      fontSize: '1rem',      // 16px
      lineHeight: 1.5,
      fontWeight: 400,
    },

    // Label (form labels, badges)
    label: {
      fontSize: '0.875rem',  // 14px
      lineHeight: 1.42,
      fontWeight: 500,
      letterSpacing: '0.01em',
    },

    // Metric (dashboard cards, numbers)
    metric: {
      fontSize: '0.75rem',   // 12px
      lineHeight: 1.33,
      fontWeight: 500,
      letterSpacing: '0.02em',
      fontVariantNumeric: 'tabular-nums',  // Align numbers
    },

    // Caption (hints, timestamps)
    caption: {
      fontSize: '0.75rem',   // 12px
      lineHeight: 1.33,
      fontWeight: 400,
      opacity: 0.7,
    },
  },

  // Radius
  radius: {
    sm: '0.25rem',  // 4px
    md: '0.5rem',   // 8px
    lg: '0.75rem',  // 12px
    full: '999px',
  },

  // Shadows (elevation)
  shadow: {
    sm: '0 1px 2px 0 rgba(0,0,0,0.05)',
    md: '0 4px 6px -1px rgba(0,0,0,0.1)',
    lg: '0 10px 15px -3px rgba(0,0,0,0.1)',
    xl: '0 20px 25px -5px rgba(0,0,0,0.1)',
  },

  // Z-index scale
  zIndex: {
    base: 0,
    dropdown: 10,
    sticky: 20,
    fixed: 30,
    modal: 100,
    popover: 110,
    tooltip: 120,
  }
};

// Dark mode overrides
export const darkTokens = {
  colors: {
    background: {
      primary: 'hsl(0 0% 8%)',
      secondary: 'hsl(0 0% 14%)',
      tertiary: 'hsl(0 0% 20%)',
    },
    text: {
      primary: 'hsl(0 0% 95%)',
      secondary: 'hsl(0 0% 75%)',
      tertiary: 'hsl(0 0% 55%)',
    },
  }
};
```

**Global CSS Setup:**

```css
/* globals.css */
@import '@/lib/design/theme.css';

:root {
  /* Light mode (default) */
  --color-bg-primary: hsl(0 0% 100%);
  --color-bg-secondary: hsl(0 0% 96%);
  --color-text-primary: hsl(0 0% 10%);
  /* ... all tokens ... */
}

@media (prefers-color-scheme: dark) {
  :root {
    /* Dark mode */
    --color-bg-primary: hsl(0 0% 8%);
    --color-bg-secondary: hsl(0 0% 14%);
    --color-text-primary: hsl(0 0% 95%);
    /* ... */
  }
}

/* Light/Dark/System theme persistence */
html[data-theme='light'] {
  /* override to light */
}

html[data-theme='dark'] {
  /* override to dark */
}

html[data-theme='system'] {
  /* respect prefers-color-scheme */
}
```

**Font Setup (Latin + Cyrillic):**

```css
/* Inter for UI, Noto Serif for body content */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Serif:wght@400;500&display=swap');

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

/* Ensure tabular numerals for dashboard cards */
.metric {
  font-feature-settings: 'tnum';
  font-variant-numeric: tabular-nums;
}
```

**Completion Criteria:**
- [ ] Design tokens defined in TypeScript
- [ ] CSS custom properties set up
- [ ] Light/Dark/System theme working
- [ ] Font stack supports Cyrillic
- [ ] Tabular numerals working for metrics
- [ ] All colors verified for AA+ contrast

---

### Task 3.2: Component Wrapper Layer
**Priority:** HIGH  
**Owner:** Frontend Engineer  
**Dependencies:** Task 3.1

**Objective:** Create shared component interfaces so Untitled UI can be swapped.

**File Structure:**
```
components/
├─ ui/
│  ├─ button.tsx       (Untitled UI wrapper)
│  ├─ input.tsx
│  ├─ select.tsx
│  ├─ tabs.tsx
│  ├─ badge.tsx
│  ├─ card.tsx
│  ├─ modal.tsx
│  ├─ table.tsx
│  ├─ calendar.tsx
│  ├─ tooltip.tsx
│  └─ skeleton.tsx
└─ ...
```

**Example: Button Wrapper**

```tsx
// components/ui/button.tsx
import { Button as UIButton, type ButtonProps as UIButtonProps } from 'untitled-ui/react'
import { ReactNode } from 'react'

// Extended props with our semantic variants
export interface ButtonProps extends UIButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  ...props
}: ButtonProps) {
  const variantMap = {
    primary: 'solid',
    secondary: 'outline',
    ghost: 'ghost',
    danger: 'solid',    // Red color
    success: 'solid',   // Green color
  }

  const sizeMap = {
    sm: 'sm',
    md: 'md',
    lg: 'lg',
  }

  return (
    <UIButton
      {...props}
      disabled={loading || disabled}
      variant={variantMap[variant]}
      size={sizeMap[size]}
      className={`
        ${variant === 'danger' ? 'bg-red-600' : ''}
        ${variant === 'success' ? 'bg-green-600' : ''}
        ${loading ? 'opacity-60' : ''}
      `}
    >
      {loading && <Spinner className="mr-2" size="sm" />}
      {icon && <span className="mr-2">{icon}</span>}
      {props.children}
    </UIButton>
  )
}
```

**All Components Must:**
- [ ] Re-export from Untitled UI (not reimplemented)
- [ ] Add semantic color variants (charging, driving, etc.)
- [ ] Support loading states
- [ ] Respect design tokens
- [ ] Have TypeScript props documentation
- [ ] Include examples in Storybook

**Completion Criteria:**
- [ ] All primitives wrapped (Button, Input, Select, etc.)
- [ ] No duplicate implementations
- [ ] All variants documented
- [ ] Theme tokens wired through
- [ ] Storybook updated

---

### Task 3.3: Navigation & Shell Migration
**Priority:** HIGH  
**Owner:** Frontend Engineer  
**Dependencies:** Task 3.2

**Files to Update:**
- `components/shell/app-shell.tsx`
- `app/layout.tsx`
- Navigation menus

**Requirements:**
- [ ] App shell uses Untitled UI layout components
- [ ] Sidebar uses Untitled UI menu
- [ ] Breadcrumb with Untitled UI
- [ ] Active states match design system
- [ ] Dark mode sidebar variant
- [ ] Collapsible sidebar animation (smooth, respects reduced-motion)

**Example Structure:**
```tsx
// components/shell/app-shell.tsx
import { useState } from 'react'
import { useTheme } from '@/lib/design/theme'
import { NavigationMenu, Sidebar, Breadcrumb } from '@/components/ui'

export function AppShell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { theme } = useTheme()

  return (
    <div className="flex h-screen bg-background-primary">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        items={[
          { label: 'Dashboard', href: '/', icon: Home },
          { label: 'Battery', href: '/battery', icon: Battery },
          { label: 'Trips', href: '/trips', icon: Route },
          // ...
        ]}
      />
      
      <div className="flex-1 flex flex-col">
        <header className="border-b border-gray-200 dark:border-gray-800">
          <Breadcrumb />
        </header>
        
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
```

**Completion Criteria:**
- [ ] Navigation responsive (mobile + desktop)
- [ ] All nav items use Untitled UI
- [ ] Theme color changes work
- [ ] No visual regression vs. current
- [ ] Accessibility: ARIA labels, keyboard nav

---

### Task 3.4: Form Components & Validation
**Priority:** MEDIUM  
**Owner:** Frontend Engineer  
**Dependencies:** Task 3.2

**Files to Update:**
- `components/ui/input.tsx`
- `components/ui/select.tsx`
- `components/ui/form-field.tsx`
- Settings pages

**Requirements:**
- [ ] Input with validation status (error, warning, success)
- [ ] Select dropdown with searchable items
- [ ] Checkbox and radio buttons
- [ ] Form layout (label, input, error message)
- [ ] Disabled/readonly states
- [ ] Focus/hover visual feedback
- [ ] Error messages in form color (red)

**Example:**
```tsx
// components/ui/form-field.tsx
interface FormFieldProps {
  label: string
  error?: string
  warning?: string
  required?: boolean
  hint?: string
  children: ReactNode
}

export function FormField({
  label,
  error,
  warning,
  required,
  hint,
  children,
}: FormFieldProps) {
  return (
    <div className="space-y-2">
      <label className="block text-label font-medium">
        {label}
        {required && <span className="text-error ml-1">*</span>}
      </label>
      
      {children}
      
      {error && <p className="text-sm text-error">{error}</p>}
      {warning && <p className="text-sm text-warning">{warning}</p>}
      {hint && <p className="text-sm text-gray-500">{hint}</p>}
    </div>
  )
}
```

**Completion Criteria:**
- [ ] All form controls migrated to Untitled UI
- [ ] Validation UI consistent
- [ ] Error/warning colors accessible
- [ ] Disabled states visually distinct

---

### Task 3.5: Card & Table Components
**Priority:** MEDIUM  
**Owner:** Frontend Engineer  
**Dependencies:** Task 3.2

**Files:**
- `components/dashboard/cards.tsx`
- `components/dashboard/dashboard-grid.tsx`

**Card Requirements:**
- [ ] Dashboard card with title, metric, sparkline
- [ ] Elevation shadows consistent
- [ ] Dark mode card background
- [ ] Hover state (subtle lift)

**Table Requirements:**
- [ ] Sortable columns
- [ ] Pagination with Untitled UI
- [ ] Striped rows (subtle alternating)
- [ ] Hoverable rows
- [ ] Mobile responsive (scroll or collapse)

**Example:**
```tsx
// components/ui/card.tsx
export function Card({
  title,
  subtitle,
  metric,
  trend,
  children,
  ...props
}: CardProps) {
  return (
    <div className="p-6 rounded-lg bg-white dark:bg-gray-900 shadow-md border border-gray-200 dark:border-gray-800">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-label text-gray-600 dark:text-gray-400">{title}</p>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
        {trend && <Badge variant="success">{trend}</Badge>}
      </div>
      
      {metric && <p className="text-display font-bold mb-4">{metric}</p>}
      
      {children}
    </div>
  )
}
```

**Completion Criteria:**
- [ ] All cards use Untitled UI base
- [ ] Tables use Untitled UI components
- [ ] Responsive behavior on mobile
- [ ] Accessibility: proper table headers, aria-labels

---

### Task 3.6: Charts & Visualizations
**Priority:** MEDIUM  
**Owner:** Frontend Engineer  
**Dependencies:** Task 3.1, Task 3.2

**Files:**
- `components/charts/telemetry-charts.tsx`
- `lib/design/recharts-theme.ts`

**Goal:** Wrap Recharts/MapLibre with design system styling.

**Recharts Theme:**
```typescript
// lib/design/recharts-theme.ts
export const rechartsTheme = {
  colors: [
    '#3b82f6',  // Blue (default)
    '#10b981',  // Green (success)
    '#f59e0b',  // Amber (warning)
    '#ef4444',  // Red (error)
  ],
  
  cartesianAxis: {
    stroke: 'hsl(0 0% 90%)',
    tick: { fill: 'hsl(0 0% 40%)' },
    label: { fill: 'hsl(0 0% 60%)' },
  },
  
  tooltip: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderColor: 'hsl(0 0% 30%)',
    textFill: '#fff',
  },
}
```

**Chart Components:**
```tsx
// components/charts/energy-chart.tsx
export function EnergyChart({ data, theme }: Props) {
  const isDark = theme === 'dark'
  
  return (
    <div className="p-4 bg-background-primary rounded-lg">
      <h3 className="text-label font-semibold mb-4">Energy Usage</h3>
      
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} theme={rechartsTheme}>
          <XAxis dataKey="date" />
          <YAxis label={{ value: 'kWh', angle: -90, position: 'insideLeft' }} />
          <Tooltip formatter={(val) => `${val.toFixed(2)} kWh`} />
          <Legend />
          <Bar dataKey="consumed" fill={isDark ? '#60a5fa' : '#3b82f6'} />
          <Bar dataKey="charged" fill={isDark ? '#34d399' : '#10b981'} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

**Requirements:**
- [ ] Recharts respects theme colors
- [ ] Axes match typography scale
- [ ] Tooltips styled with design system
- [ ] Legends use Untitled UI badge style
- [ ] Dark mode variant works
- [ ] Mobile responsive

**MapLibre Styling:**
```typescript
// lib/design/maplibre-style.ts
export const mapStyle = {
  light: 'https://tiles.openstreetmap.org/styles/osm-bright/style.json',
  dark: 'https://tiles.openstreetmap.org/styles/osm-dark/style.json',
  // Customize colors to match design system
  layers: [
    {
      id: 'water',
      paint: { 'fill-color': 'hsl(200 50% 70%)' },
    },
  ]
}
```

**Completion Criteria:**
- [ ] Recharts uses design tokens
- [ ] MapLibre colors match theme
- [ ] Legend and tooltip styled
- [ ] Dark mode verified
- [ ] No visual jarring on theme switch

---

### Task 3.7: Modal & Dialog Components
**Priority:** MEDIUM  
**Owner:** Frontend Engineer  
**Dependencies:** Task 3.2

**Files:**
- `components/ui/modal.tsx`
- `components/ui/dialog.tsx`

**Requirements:**
- [ ] Modal backdrop with correct blur/opacity
- [ ] Modal card with shadow elevation
- [ ] Dismiss button (X) in top right
- [ ] Action buttons (OK, Cancel) at bottom
- [ ] Keyboard support (Escape to close)
- [ ] Focus trap (keyboard navigation)

**Example:**
```tsx
// components/ui/modal.tsx
export function Modal({
  open,
  title,
  onClose,
  children,
  actions,
}: ModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-modal bg-black/40 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-h2 font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
            <X size={24} />
          </button>
        </div>
        
        <div className="p-6">{children}</div>
        
        {actions && (
          <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-800">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
```

**Completion Criteria:**
- [ ] Modals use Untitled UI card base
- [ ] Keyboard navigation works
- [ ] Focus visible on buttons
- [ ] Dark mode background correct
- [ ] Animations respect reduced-motion

---

### Task 3.8: Badge & Status Components
**Priority:** MEDIUM  
**Owner:** Frontend Engineer  
**Dependencies:** Task 3.2

**Semantic Badges (§16, §18 marker states):**
```tsx
export type BadgeVariant = 'driving' | 'parked' | 'charging' | 'sleeping' | 'offline' | 'default'

export function Badge({ variant, children }: BadgeProps) {
  const colorMap = {
    driving: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    parked: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    charging: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    sleeping: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    offline: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    default: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  }

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colorMap[variant]}`}>
      {children}
    </span>
  )
}
```

**Requirements:**
- [ ] Badge colors match semantic colors
- [ ] Dark mode variants tested
- [ ] Size variants (sm, md, lg)
- [ ] Icon support (optional badge icon)

**Completion Criteria:**
- [ ] All status badges use Untitled UI
- [ ] Colors match presence states
- [ ] Dark mode accessible

---

### Task 3.9: Loading States & Skeletons
**Priority:** MEDIUM  
**Owner:** Frontend Engineer  
**Dependencies:** Task 3.2

**Requirements (§5, Loading rules):**
```tsx
// components/ui/skeleton.tsx
export function Skeleton({ width = 'w-full', height = 'h-4', rounded = 'rounded' }: SkeletonProps) {
  return (
    <div
      className={`
        ${width} ${height} ${rounded}
        bg-gray-200 dark:bg-gray-700
        animate-pulse
      `}
    />
  )
}

// Layout-matched skeletons for different components
export function CardSkeleton() {
  return (
    <div className="p-6 rounded-lg border border-gray-200 dark:border-gray-800">
      <Skeleton className="w-24 h-4 mb-4" />
      <Skeleton className="w-32 h-8 mb-6" />
      <Skeleton className="w-full h-6" />
    </div>
  )
}

export function TableSkeleton() {
  return (
    <table className="w-full">
      <thead>
        <tr>
          <th><Skeleton className="h-4" /></th>
          <th><Skeleton className="h-4" /></th>
          <th><Skeleton className="h-4" /></th>
        </tr>
      </thead>
      <tbody>
        {[...Array(3)].map((_, i) => (
          <tr key={i}>
            <td><Skeleton className="h-4" /></td>
            <td><Skeleton className="h-4" /></td>
            <td><Skeleton className="h-4" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function MapSkeleton() {
  return (
    <div className="w-full h-96 rounded-lg bg-gray-300 dark:bg-gray-700 animate-pulse" />
  )
}

export function ChartSkeleton() {
  return (
    <div className="p-6 rounded-lg border border-gray-200">
      <Skeleton className="w-40 h-4 mb-4" />
      <Skeleton className="w-full h-64 mt-6" />
    </div>
  )
}
```

**Requirements (§5, §172-177):**
- [ ] Skeletons match layout of real component
- [ ] Preserve existing data during refresh (never replace with skeleton)
- [ ] Respect `prefers-reduced-motion`
- [ ] No layout shift (placeholder uses same size as content)

**Completion Criteria:**
- [ ] All page types have skeleton variants
- [ ] Initial loads show skeletons
- [ ] Background refresh preserves visible content
- [ ] Animations smooth and accessible

---

## Migration Order

**Phase 3 Tasks in Sequence:**

```
Week 1:
├─ Task 3.0: Untitled UI MCP setup ✅
├─ Task 3.1: Design tokens ✅
└─ Task 3.2: Component wrappers ✅

Week 2:
├─ Task 3.3: Navigation & shell
├─ Task 3.4: Forms & inputs
└─ Task 3.5: Cards & tables

Week 3:
├─ Task 3.6: Charts & visualizations
├─ Task 3.7: Modals & dialogs
└─ Task 3.8: Badges & status

Week 4:
├─ Task 3.9: Skeletons & loading
└─ Polish & testing
```

---

## Completion Gates

Phase 3 is done when:

1. ✅ No legacy visual component family remains
2. ✅ All primitive components from Untitled UI
3. ✅ Design tokens enforced across app
4. ✅ Light/Dark/System theme working everywhere
5. ✅ Typography consistent (Latin + Cyrillic)
6. ✅ No visual regression vs. current
7. ✅ Accessibility tests pass (WCAG AA+)
8. ✅ Charts use design tokens
9. ✅ Maps styles updated
10. ✅ All tests passing

---

**Phase 3 begins after Phase 1 & 2 are complete.**

