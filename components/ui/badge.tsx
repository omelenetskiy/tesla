'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'border-line bg-surface-muted text-ink-secondary',
        accent: 'border-accent-line bg-accent-soft text-accent',
        ok: 'border-ok-line bg-ok-soft text-ok',
        warn: 'border-warn-line bg-warn-soft text-warn',
        danger: 'border-danger-line bg-danger-soft text-danger',
        outline: 'border-line-strong bg-transparent text-ink-tertiary',
        default: 'border-line bg-surface-muted text-ink-secondary',
        success: 'border-ok-line bg-ok-soft text-ok',
        warning: 'border-warn-line bg-warn-soft text-warn',
        error: 'border-danger-line bg-danger-soft text-danger',
        info: 'border-accent-line bg-accent-soft text-accent',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { badgeVariants }
