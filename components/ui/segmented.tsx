'use client'

import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * Segmented control in the Tesla idiom: one filled pill as the track, and the active
 * item expressed as a raised white chip. Items carry no border of their own —
 * bordered items inside a bordered track is what made the previous version look
 * unstyled, because those were the browser's default button borders showing through.
 */
export type SegmentedOption<T extends string> = {
  value: T
  label: string
  icon?: React.ComponentType<{ className?: string }>
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  iconOnly = false,
  ariaLabel,
  className,
}: {
  options: Array<SegmentedOption<T>>
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  iconOnly?: boolean
  ariaLabel: string
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('inline-flex items-center gap-0.5 rounded-full bg-surface-muted p-1', className)}
    >
      {options.map((option) => {
        const active = option.value === value
        const Icon = option.icon
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            title={option.label}
            className={cn(
              'flex items-center justify-center rounded-full border-0 bg-transparent font-medium transition-colors',
              size === 'sm' ? 'h-7 gap-1.5 px-2.5 text-[12px]' : 'h-9 gap-2 px-3.5 text-[13px]',
              iconOnly && (size === 'sm' ? 'w-7 px-0' : 'w-10 px-0'),
              active
                ? 'bg-surface text-ink shadow-xs'
                : 'text-ink-secondary hover:text-ink',
            )}
          >
            {Icon && <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} aria-hidden />}
            {!iconOnly && option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Icon-only control button (recenter, expand, refresh). Square, 40px, hairline border. */
export function IconButton({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'flex size-10 items-center justify-center rounded-lg border bg-surface text-ink-secondary shadow-xs transition-colors',
        active ? 'border-accent-line bg-accent-soft text-accent' : 'border-line hover:bg-surface-muted hover:text-ink',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  )
}

/** Text link styled as a control, used where navigation leaves the current surface. */
export function LinkButton({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-[13.5px] font-medium text-ink shadow-xs transition-colors hover:bg-surface-muted',
        className,
      )}
    >
      {children}
    </Link>
  )
}
