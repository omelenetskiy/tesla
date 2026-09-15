'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export type CardProps = React.HTMLAttributes<HTMLDivElement>

export const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'relative overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-xs',
      'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-line before:opacity-60',
      className,
    )}
    {...props}
  />
))

Card.displayName = 'Card'

