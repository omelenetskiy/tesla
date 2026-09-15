import React from 'react'
import { render, screen } from '@testing-library/react'
import { Card, Button, Badge, Input } from '@/components/ui/primitives'

describe('UI Primitives', () => {
  describe('Button Component', () => {
    it('should render button with text', () => {
      render(<Button>Click Me</Button>)
      expect(screen.getByText('Click Me')).toBeInTheDocument()
    })

    it('should handle click events', () => {
      const onClick = jest.fn()
      render(<Button onClick={onClick}>Click</Button>)
      screen.getByText('Click').click()
      expect(onClick).toHaveBeenCalled()
    })

    it('should render different variants', () => {
      const { rerender } = render(<Button variant="primary">Primary</Button>)
      expect(screen.getByRole('button', { name: 'Primary' })).toHaveClass('bg-accent')

      rerender(<Button variant="secondary">Secondary</Button>)
      expect(screen.getByRole('button', { name: 'Secondary' })).toHaveClass('bg-surface')
    })

    it('should be disabled when specified', () => {
      render(<Button disabled>Disabled</Button>)
      expect(screen.getByRole('button', { name: 'Disabled' })).toBeDisabled()
    })
  })

  describe('Card Component', () => {
    it('should render children', () => {
      render(
        <Card>
          <div>Content</div>
        </Card>
      )
      expect(screen.getByText('Content')).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      const { container } = render(
        <Card className="custom-class">
          <div>Content</div>
        </Card>
      )
      expect(container.firstChild).toHaveClass('custom-class')
    })
  })

  describe('Badge Component', () => {
    it('should render badge', () => {
      render(<Badge>Success</Badge>)
      expect(screen.getByText('Success')).toBeInTheDocument()
    })

    it('should apply variant styles', () => {
      render(<Badge variant="success">Success</Badge>)
      expect(screen.getByText('Success')).toHaveClass('bg-ok-soft')
    })
  })

  describe('Input Component', () => {
    it('should render input with label', () => {
      render(<Input label="Email" />)
      expect(screen.getByText('Email')).toBeInTheDocument()
    })

    it('should show error message', () => {
      render(<Input error="This is required" />)
      expect(screen.getByText('This is required')).toBeInTheDocument()
    })

    it('should accept input value', () => {
      render(<Input />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.value).toBe('')
    })
  })
})

