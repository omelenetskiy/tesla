'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

export const Tabs = TabsPrimitive.Root

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentProps<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn('inline-flex items-center gap-1 rounded-lg border border-line bg-surface-muted p-1', className)}
    {...props}
  />
))
TabsList.displayName = 'TabsList'

/**
 * Segmented control (§7's compact controls, §8's Battery/Speed/Power switch).
 * Active state is carried by surface + shadow rather than colour alone, so it stays
 * legible in the car's high-ambient-light conditions and for colour-blind users.
 */
export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentProps<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex h-8 min-w-[44px] items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-ink-secondary transition-colors',
      'hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
      'data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-xs',
      className,
    )}
    {...props}
  />
))
TabsTrigger.displayName = 'TabsTrigger'

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentProps<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('mt-3 focus-visible:outline-none data-[state=active]:animate-none', className)}
    {...props}
  />
))
TabsContent.displayName = 'TabsContent'
