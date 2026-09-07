'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

const fieldClasses =
  'w-full rounded-md border border-line bg-surface px-3 text-sm text-ink shadow-xs transition-colors placeholder:text-ink-tertiary hover:border-line-strong focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 disabled:opacity-50'

// `size` is omitted from the native props: HTMLInputElement's legacy numeric `size`
// attribute would otherwise collide with the control-height variant below.
export type InputProps = Omit<React.ComponentProps<'input'>, 'size'> & { size?: 'sm' | 'md' }

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, size = 'md', ...props }, ref) => (
    <input ref={ref} className={cn(fieldClasses, size === 'sm' ? 'h-8' : 'h-10', className)} {...props} />
  ),
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} spellCheck={false} className={cn(fieldClasses, 'min-h-[120px] resize-y py-2 font-mono text-[12.5px] leading-5', className)} {...props} />
  ),
)
Textarea.displayName = 'Textarea'

export const Label = React.forwardRef<HTMLLabelElement, React.ComponentProps<'label'>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn('text-[12px] font-medium text-ink-secondary', className)} {...props} />
  ),
)
Label.displayName = 'Label'
