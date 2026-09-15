'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-full border font-medium transition-[background-color,border-color,color,transform,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]'

const buttonVariants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'border-accent bg-accent text-ink-inverse shadow-sm hover:brightness-95',
  secondary: 'border-line bg-surface text-ink shadow-sm hover:border-line-strong hover:bg-surface-muted',
  outline: 'border-line-strong bg-transparent text-ink-secondary hover:bg-surface-muted hover:text-ink',
  ghost: 'border-transparent bg-transparent text-ink-secondary hover:bg-surface-muted hover:text-ink',
}

const buttonSizes: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-9 px-3.5 text-[13px]',
  md: 'h-11 px-4.5 text-sm',
  lg: 'h-12 px-5 text-[15px]',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', isLoading = false, className, children, type, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        aria-busy={isLoading}
        disabled={isLoading || disabled}
        className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
        {...props}
      >
        {isLoading ? (
          <span
            aria-hidden
            className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
        ) : null}
        <span>{children}</span>
      </button>
    )
  },
)

Button.displayName = 'Button'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helpText?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ id, label, error, helpText, className, ...props }, ref) => {
    const reactId = React.useId()
    const inputId = id ?? reactId
    const helpId = helpText ? `${inputId}-help` : undefined
    const errorId = error ? `${inputId}-error` : undefined
    const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined

    return (
      <div className="flex flex-col gap-2">
        {label ? (
          <label htmlFor={inputId} className="text-[13px] font-medium tracking-[0.01em] text-ink-secondary">
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn(
            'h-11 w-full rounded-2xl border border-line bg-surface px-4 text-sm text-ink shadow-xs transition-[border-color,box-shadow,background-color] placeholder:text-ink-tertiary hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-danger-line focus-visible:ring-danger/15' : 'focus-visible:border-accent',
            className,
          )}
          {...props}
        />
        {error ? (
          <span id={errorId} className="text-[13px] text-danger">
            {error}
          </span>
        ) : null}
        {!error && helpText ? (
          <span id={helpId} className="text-[13px] text-ink-tertiary">
            {helpText}
          </span>
        ) : null}
      </div>
    )
  },
)

Input.displayName = 'Input'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'relative overflow-hidden rounded-3xl border border-line bg-surface p-4 shadow-sm before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-line before:opacity-60',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    )
  },
)

Card.displayName = 'Card'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info'
  children: React.ReactNode
}

const badgeVariants: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'border-line bg-surface-muted text-ink-secondary',
  success: 'border-ok-line bg-ok-soft text-ok',
  error: 'border-danger-line bg-danger-soft text-danger',
  warning: 'border-warn-line bg-warn-soft text-warn',
  info: 'border-accent-line bg-accent-soft text-accent',
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'default', children, className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em]',
          badgeVariants[variant],
          className,
        )}
        {...props}
      >
        {children}
      </span>
    )
  },
)

Badge.displayName = 'Badge'
