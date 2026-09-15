'use client'

import React, { ReactNode } from 'react'
import { Card, Button } from '@/components/ui/primitives'

interface Props {
  children: ReactNode
  fallback?: (error: Error, retry: () => void) => ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
    // Could send to error tracking service here
  }

  retry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error || new Error('Unknown error'), this.retry)
      }

      return (
        <div className="p-6">
          <Card className="p-6 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-red-900 dark:text-red-100 mb-2">
                Something went wrong
              </h2>
              <p className="text-red-800 dark:text-red-200 mb-4">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
              <Button onClick={this.retry} variant="primary">
                Try again
              </Button>
            </div>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Async error handler for promise rejections
 */
export function handleAsyncError(error: Error) {
  console.error('Async error:', error)
  // Could send to error tracking service
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('asyncError', {
        detail: { error: error.message, stack: error.stack },
      })
    )
  }
}

// Setup global error handlers
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error)
  })

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled rejection:', event.reason)
    handleAsyncError(event.reason)
  })
}

