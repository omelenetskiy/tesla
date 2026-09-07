'use client'

import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

/**
 * Radix Select rather than a native `<select>`: the vehicle selector and the debug
 * console's environment picker both need a 44px+ touch target with a rendered icon,
 * which a native control cannot give consistently across the Tesla browser.
 */
export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentProps<typeof SelectPrimitive.Trigger> & { size?: 'sm' | 'md' | 'lg' }
>(({ className, children, size = 'md', ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-md border border-line bg-surface text-ink shadow-xs transition-colors',
      'hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50',
      size === 'sm' && 'h-8 px-2.5 text-[13px]',
      size === 'md' && 'h-10 px-3 text-sm',
      size === 'lg' && 'h-12 px-4 text-[15px]',
      className,
    )}
    {...props}
  >
    <span className="truncate">{children}</span>
    <SelectPrimitive.Icon asChild>
      <ChevronDown className={cn('shrink-0 text-ink-tertiary', size === 'sm' ? 'size-3.5' : 'size-4')} />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = 'SelectTrigger'

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentProps<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      className={cn(
        'z-50 max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[8rem] overflow-hidden rounded-lg border border-line bg-surface shadow-lg',
        position === 'popper' && 'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport
        className={cn('p-1', position === 'popper' && 'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]')}
      >
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = 'SelectContent'

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentProps<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex min-h-10 w-full cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm text-ink outline-none',
      'data-[highlighted]:bg-surface-muted focus-visible:bg-surface-muted data-[state=checked]:font-medium',
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText className="truncate">{children}</SelectPrimitive.ItemText>
    <span className="ml-auto flex size-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="size-4 text-accent" />
      </SelectPrimitive.ItemIndicator>
    </span>
  </SelectPrimitive.Item>
))
SelectItem.displayName = 'SelectItem'

export const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentProps<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label ref={ref} className={cn('px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-tertiary', className)} {...props} />
))
SelectLabel.displayName = 'SelectLabel'
