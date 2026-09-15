'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

const fieldClasses =
  'w-full rounded-md border border-line bg-surface px-3 text-sm text-ink shadow-xs transition-[border-color,box-shadow,background-color] placeholder:text-ink-tertiary hover:border-line-strong focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-50'

export type InputProps = Omit<React.ComponentProps<'input'>, 'size'> & {
  size?: 'sm' | 'md'
  label?: string
  error?: string
  helpText?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, id, label, error, helpText, size = 'md', ...props }, ref) => {
    const reactId = React.useId()
    const inputId = id ?? reactId
    const helpId = helpText ? `${inputId}-help` : undefined
    const errorId = error ? `${inputId}-error` : undefined
    const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined

    return (
      <div className="flex flex-col gap-2">
        {label ? <label htmlFor={inputId} className="text-[12px] font-medium text-ink-secondary">{label}</label> : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn(fieldClasses, size === 'sm' ? 'h-8' : 'h-10', error && 'border-danger-line focus-visible:ring-danger/15', className)}
          {...props}
        />
        {error ? <span id={errorId} className="text-[12px] text-danger">{error}</span> : null}
        {!error && helpText ? <span id={helpId} className="text-[12px] text-ink-tertiary">{helpText}</span> : null}
      </div>
    )
  },
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} spellCheck={false} className={cn(fieldClasses, 'min-h-30 resize-y py-2 font-mono text-[12.5px] leading-5', className)} {...props} />
  ),
)
Textarea.displayName = 'Textarea'

export const Label = React.forwardRef<HTMLLabelElement, React.ComponentProps<'label'>>(
  ({ className, ...props }, ref) => <label ref={ref} className={cn('text-[12px] font-medium text-ink-secondary', className)} {...props} />,
)
Label.displayName = 'Label'
