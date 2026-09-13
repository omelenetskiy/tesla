'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Shared rows for the detail pages (Charging, Alerts, Battery).
 *
 * The dashboard used to live here too, as a floating card over the map plus a
 * four-figure summary strip. It is now its own set of read-only cards in
 * `status-cards.tsx`, and nothing on this screen is an overlay any more.
 */

export function MetricRow({ icon: Icon, children, muted }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; muted?: boolean }) {
  return (
    <li className={cn('flex items-start gap-2.5 text-[13.5px] leading-5', muted ? 'text-ink-tertiary' : 'text-ink')}>
      <Icon className="mt-[1px] size-4 shrink-0 text-ink-tertiary" aria-hidden />
      <span className="min-w-0">{children}</span>
    </li>
  )
}

export function PanelSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2.5', className)} aria-busy="true">
      {Array.from({ length: rows }, (_, index) => index).map((index) => (
        <div key={index} className="h-4 animate-pulse rounded-md bg-surface-muted" style={{ width: `${88 - index * 12}%` }} />
      ))}
    </div>
  )
}
