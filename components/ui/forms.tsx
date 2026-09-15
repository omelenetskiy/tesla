'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// Form components
interface FormProps extends React.FormHTMLAttributes<HTMLFormElement> {
  title?: string
  subtitle?: string
  children: React.ReactNode
  onSubmit: (e: React.FormEvent) => void | Promise<void>
}

export const Form = React.forwardRef<HTMLFormElement, FormProps>(
  ({ title, subtitle, children, onSubmit, ...props }, ref) => {
    return (
      <Card className="p-6 max-w-2xl">
        {title && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {title}
            </h2>
            {subtitle && (
              <p className="text-gray-600 dark:text-gray-400 mb-6">{subtitle}</p>
            )}
          </>
        )}
        <form ref={ref} onSubmit={onSubmit} className="space-y-6" {...props}>
          {children}
        </form>
      </Card>
    )
  }
)

Form.displayName = 'Form'

// Form field group
interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  ({ children, ...props }, ref) => {
    return (
      <div ref={ref} {...props}>
        {children}
      </div>
    )
  }
)

FormField.displayName = 'FormField'

// Dialog/Modal component
interface DialogProps {
  isOpen: boolean
  title: string
  description?: string
  actions?: {
    label: string
    onClick: () => void
    variant?: 'primary' | 'secondary' | 'danger'
  }[]
  children?: React.ReactNode
  onClose: () => void
}

export function Dialog({
  isOpen,
  title,
  description,
  actions,
  children,
  onClose,
}: DialogProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          {title}
        </h2>

        {description && (
          <p className="text-gray-600 dark:text-gray-400 mb-4">{description}</p>
        )}

        {children && <div className="mb-6">{children}</div>}

        {/* Actions */}
        {actions && (
          <div className="flex gap-3 justify-end">
            {actions.map((action, idx) => (
              <Button
                key={idx}
                variant={action.variant === 'danger' ? 'outline' : action.variant || 'secondary'}
                size="sm"
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// Alert/Notification component
interface AlertProps {
  variant: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
  onClose?: () => void
}

export function Alert({ variant, title, message, onClose }: AlertProps) {
  const styles = {
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    success:
      'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    warning:
      'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  }

  const textStyles = {
    info: 'text-blue-900 dark:text-blue-200',
    success: 'text-green-900 dark:text-green-200',
    warning: 'text-yellow-900 dark:text-yellow-200',
    error: 'text-red-900 dark:text-red-200',
  }

  const iconEmoji = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  }

  return (
    <div
      className={`border rounded-lg p-4 ${styles[variant]} flex gap-3 items-start`}
    >
      <span className="text-xl flex-shrink-0">{iconEmoji[variant]}</span>
      <div className="flex-1">
        <h3 className={`font-semibold ${textStyles[variant]}`}>{title}</h3>
        {message && <p className={`text-sm mt-1 ${textStyles[variant]}`}>{message}</p>}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className={`flex-shrink-0 ${textStyles[variant]} hover:opacity-75`}
        >
          ✕
        </button>
      )}
    </div>
  )
}

// Loading skeleton
export function Skeleton({
  height = 'h-4',
  width = 'w-full',
  className = '',
}: {
  height?: string
  width?: string
  className?: string
}) {
  return (
    <div
      className={`
        ${height} ${width} 
        rounded bg-gray-200 dark:bg-gray-800
        animate-pulse
        ${className}
      `}
    />
  )
}

// Loading state
export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <div className="w-8 h-8 border-4 border-gray-300 dark:border-gray-600 border-t-red-500 dark:border-t-red-400 rounded-full animate-spin" />
        </div>
        <p className="text-gray-600 dark:text-gray-400">{message}</p>
      </div>
    </div>
  )
}

// Empty state
export function EmptyState({
  icon = '📭',
  title = 'Nothing here',
  description = 'No data to display',
  action,
}: {
  icon?: string
  title?: string
  description?: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <span className="text-6xl mb-4">{icon}</span>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {title}
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-6">{description}</p>
      {action && (
        <Button variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

