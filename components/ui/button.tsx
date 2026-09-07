'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Sizing is driven by §36: the default control is 40px tall and `lg` is 48px, so the
 * same component works on a laptop and on a Model Y screen without a mouse. `sm`
 * exists only for dense developer surfaces (the debug console), never for product
 * navigation.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border font-medium transition-[background-color,border-color,color,box-shadow] duration-[var(--transition-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'border-accent bg-accent text-ink-inverse shadow-xs hover:brightness-95 active:brightness-90',
        default: 'border-line bg-surface text-ink shadow-xs hover:bg-surface-muted hover:border-line-strong',
        secondary: 'border-transparent bg-surface-muted text-ink-secondary hover:bg-canvas hover:text-ink',
        ghost: 'border-transparent bg-transparent text-ink-secondary hover:bg-surface-muted hover:text-ink',
        danger: 'border-danger-line bg-danger-soft text-danger hover:bg-danger hover:text-ink-inverse',
        outline: 'border-line-strong bg-transparent text-ink hover:bg-surface-muted',
      },
      size: {
        sm: 'h-8 rounded-xs px-3 text-[13px] [&_svg]:size-3.5',
        md: 'h-10 px-4 text-sm [&_svg]:size-4',
        lg: 'h-12 px-5 text-[15px] [&_svg]:size-[18px]',
        icon: 'h-10 w-10 [&_svg]:size-4',
        'icon-sm': 'h-8 w-8 rounded-xs [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
)

export type ButtonProps = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Component = asChild ? Slot : 'button'
    // Defaulting type prevents an implicit submit inside the console's forms.
    return asChild ? (
      <Component ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    ) : (
      <Component
        ref={ref}
        type={type ?? 'button'}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { buttonVariants }
