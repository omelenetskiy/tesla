'use client'

import * as React from 'react'
import Link from 'next/link'
import {usePathname, useRouter} from 'next/navigation'
import {
    Battery,
    CalendarDays,
    LayoutDashboard,
    LogOut,
    Menu,
    RefreshCw,
    Route,
    Settings,
    Siren,
    Zap
} from 'lucide-react'
import {useVehicleData, type VehicleFeed} from '@/lib/hooks/use-vehicle'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {createSupabaseBrowserClient} from '@/lib/supabase-browser'
import {formatAge} from '@/lib/format'
import { ageSecondsSince, useNow } from '@/lib/hooks/use-now'
import {cn} from '@/lib/utils'

/**
 * Application shell.
 *
 * Built to fit one screen in the car: the header is a single compact row, navigation
 * is icon-only (labels survive as `title`/`aria-label` for screen readers and desktop
 * hover), and the whole thing is height-capped so the map never pushes the state
 * summary below the fold.
 *
 * There is no vehicle switcher — this is a single-owner companion.
 */

const FeedContext = React.createContext<VehicleFeed | null>(null)

export function useFeed(): VehicleFeed {
    const feed = React.useContext(FeedContext)
    if (!feed) throw new Error('useFeed must be used inside <AppShell>')
    return feed
}

const NAV = [
    {href: '/', label: 'Dashboard', icon: LayoutDashboard},
    {href: '/battery', label: 'Battery', icon: Battery},
    {href: '/charging', label: 'Charging', icon: Zap},
    {href: '/trips', label: 'Trips', icon: Route},
    {href: '/calendar', label: 'Calendar', icon: CalendarDays},
    {href: '/alerts', label: 'Alerts', icon: Siren},
]

const SECONDARY = [
    {href: '/settings', label: 'Settings', icon: Settings},
]


/** Section name shown top-left on desktop; derived from the route, so it always matches. */
function sectionTitle(pathname: string): string {
    const match = [...NAV, ...SECONDARY].find((item) => (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)))
    return match?.label ?? 'DriveScope'
}

function isActive(href: string, pathname: string) {
    return href === '/' ? pathname === '/' : pathname.startsWith(href)
}

export function AppShell({children}: { children: React.ReactNode }) {
    const feed = useVehicleData()
    const pathname = usePathname()
    const status = feed.snapshot?.status ?? null

    return (
        <FeedContext.Provider value={feed}>
            {/*
        Fixed-height column: the page itself never scrolls. <main> owns the scroll,
        and every list inside a page scrolls within its own card, so a header or a
        dock never drifts out of reach on the car screen.

        The top padding carries the status bar. In the installed iPhone app the page runs
        edge to edge (viewport-fit=cover), so without this the screen title is drawn under
        the clock. It is `px`/`pb`/`pt` rather than `p` plus `pt` because the two set the
        same longhand and the winner would be whichever rule Tailwind emitted last.
      */}
            <div className="flex h-dvh flex-col overflow-hidden bg-canvas px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:px-4 sm:pb-4 sm:pt-[calc(1rem+env(safe-area-inset-top))]">
                <div
                    className="mx-auto flex h-full w-full max-w-[1500px] flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                    {/*
            Three-zone header on desktop: title left, tab strip centred, status right.
            `1fr auto 1fr` keeps the strip on the true centre line regardless of how
            wide the title or the status cluster are; on narrow screens the nav lives in
            the bottom dock and the grid collapses to two columns.
          */}
                    <header className="shrink-0 border-b border-line px-3 py-2.5 sm:px-5">
                        <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 md:grid-cols-[1fr_auto_1fr]">
                            <h1 className="min-w-0 truncate text-[24px] font-semibold leading-8 tracking-[-0.02em] text-ink sm:text-[28px] sm:leading-9">
                                {sectionTitle(pathname)}
                            </h1>

                            <nav aria-label="Primary"
                                 className="hidden items-center gap-1 rounded-full border border-line bg-surface-muted p-1 md:flex">
                                {NAV.map((item) => {
                                    const active = isActive(item.href, pathname)
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            aria-current={active ? 'page' : undefined}
                                            title={item.label}
                                            className={cn(
                                                'flex size-12 cursor-pointer items-center justify-center rounded-full border transition-colors',
                                                active ? 'border-line bg-surface text-accent shadow-sm' : 'border-transparent text-ink-secondary hover:bg-surface/70 hover:text-ink',
                                            )}
                                        >
                                            <item.icon className="size-[22px]" aria-hidden/>
                                        </Link>
                                    )
                                })}
                            </nav>

                            <div className="flex items-center justify-end gap-2">
                                {/* One status control. Two were contradictory: the presence chip said
                  "Offline" while the other said "Live", because "Live" was derived
                  from where the row was written (source === 'tesla_api') rather than
                  from how old it is. Age now comes from a ticking clock. */}
                                {status && feed.snapshot ? (
                                    <StatusPill presence={status.presence} collectedAt={feed.snapshot.collectedAt}/>
                                ) : (
                                    <span
                                        className="hidden h-9 items-center gap-2 rounded-full border border-line bg-surface-muted px-3 text-[12.5px] text-ink-tertiary sm:flex">
                  <span className="size-2 rounded-full bg-ink-tertiary" aria-hidden/>
                                        {feed.needsConnection ? 'Not connected' : 'No data yet'}
                </span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => void feed.refresh()}
                                    aria-label="Refresh"
                                    title="Refresh"
                                    disabled={feed.refreshing}
                                    className="flex size-11 cursor-pointer items-center justify-center rounded-full text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-60"
                                >
                                    <RefreshCw className={cn('size-5', feed.refreshing && 'animate-spin')} aria-hidden/>
                                </button>
                                <UserMenu/>
                            </div>
                        </div>
                    </header>

                    <main
                        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-5 sm:pb-5">{children}</main>
                </div>
            </div>

            {/*
        Mobile / in-car: the tabs move to a floating dock at the bottom of the
        screen, in the iOS translucent style — a frosted pill that the page shows
        through, with a hairline outer ring and an inner highlight so it reads as
        glass rather than a grey bar. Thumb-reachable, and never covering content
        because the page above reserves padding for it.
      */}
            <nav
                aria-label="Primary navigation"
                className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden"
            >
                <div
                    className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-white/60 bg-surface/70 p-1.5 shadow-[0_8px_32px_rgba(16,24,40,0.18)] ring-1 ring-black/5 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/15 dark:bg-surface/60 dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] dark:ring-white/10">
                    {NAV.map((item) => {
                        const active = isActive(item.href, pathname)
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={active ? 'page' : undefined}
                                title={item.label}
                                className={cn(
                                    'flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors',
                                    active ? 'bg-surface text-accent shadow-sm ring-1 ring-black/5 dark:ring-white/10' : 'text-ink-secondary hover:text-ink',
                                )}
                            >
                                <item.icon className="size-[21px]" aria-hidden/>
                            </Link>
                        )
                    })}
                </div>
            </nav>
        </FeedContext.Provider>
    )
}

/**
 * The single status control.
 *
 * Replaces two separate indicators that contradicted each other: the presence chip
 * said "Offline" while a second one said "Live", because "Live" was derived from
 * `source === 'tesla_api'` — which records where the row was written, not how old it
 * is.
 *
 * The dot colour is the vehicle's state and nothing else: awake is green, sleeping is
 * amber, offline is grey. Age is carried by the number next to it, because letting age
 * colour the dot produced an "Offline · just now" pill that lit up green.
 *
 * The age is computed against `useNow`, not the server-supplied `ageSeconds`. That
 * field is frozen at fetch time, so on a parked or sleeping vehicle — where nothing
 * re-fetches — "just now" sat there forever.
 */
const PRESENCE_PILL: Record<string, { label: string; dot: string; pill: string }> = {
  driving: { label: 'Driving', dot: 'bg-ok', pill: 'text-ink bg-surface-muted border-line' },
  charging: { label: 'Charging', dot: 'bg-ok', pill: 'text-ink bg-surface-muted border-line' },
  parked: { label: 'Parked', dot: 'bg-ok', pill: 'text-ink bg-surface-muted border-line' },
  sleeping: { label: 'Sleeping', dot: 'bg-warn', pill: 'text-warn bg-warn-soft border-warn-line' },
  offline: { label: 'Offline', dot: 'bg-ink-tertiary', pill: 'text-ink-secondary bg-surface-muted border-line' },
}

export function StatusPill({presence, collectedAt, className}: {
    presence: string;
    collectedAt: string;
    className?: string
}) {
    const now = useNow(1_000)
    const age = ageSecondsSince(collectedAt, now)
    const view = PRESENCE_PILL[presence] ?? PRESENCE_PILL.offline
    const stale = Number.isFinite(age) && age > 900
    return (
        <span
            className={cn('inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[12.5px] font-medium', view.pill, className)}
            title={`Collected ${new Date(collectedAt).toLocaleString()}`}
        >
      <span className={cn('size-2 shrink-0 rounded-full', view.dot)} aria-hidden/>
            {view.label}
            <span
                className={cn('hidden font-mono text-[11.5px] font-normal opacity-70 sm:inline', stale && 'text-warn opacity-100')}>{Number.isFinite(age) ? formatAge(age) : '—'}</span>
    </span>
    )
}

/**
 * Account menu: navigation to the two secondary destinations and sign-out.
 *
 * Everything is inside the dropdown — the header carries one plain hamburger control
 * rather than a loose row of one-off buttons, so the bar stays free on a screen where
 * space is precious. Appearance is not here: it is a setting, and Settings is where a
 * user looks for it.
 *
 * Signing out clears the app's own Supabase session AND disconnects Fleet API tokens
 * (via DELETE /api/fleet/credentials). Fleet tokens are app-controlled secrets that
 * must be cleared on logout to enforce the auth gate.
 */
function UserMenu() {
    const router = useRouter()
    const [signingOut, setSigningOut] = React.useState(false)

    const signOut = async () => {
        setSigningOut(true)
        try {
            // Delete Fleet credentials first (forces deauth)
            await fetch('/api/fleet/credentials', { method: 'DELETE' }).catch(() => {
                // Silent fail — app can sign out even if credential delete fails
              })

            // Then sign out of app
            await createSupabaseBrowserClient().auth.signOut()
            router.replace('/login')
            router.refresh()
        } finally {
            setSigningOut(false)
        }
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                aria-label="Menu"
                className="flex size-11 cursor-pointer items-center justify-center rounded-full text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink data-[state=open]:bg-surface-muted data-[state=open]:text-ink"
            >
                <Menu className="size-5" aria-hidden/>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[236px]">
                <DropdownMenuItem onSelect={() => router.push('/settings')}>
                    <Settings className="size-4 text-ink-tertiary" aria-hidden/>
                    Settings
                </DropdownMenuItem>

                <DropdownMenuSeparator/>
                <DropdownMenuItem tone="danger" onSelect={() => void signOut()} disabled={signingOut}>
                    <LogOut className="size-4" aria-hidden/>
                    {signingOut ? 'Signing out…' : 'Sign out'}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
