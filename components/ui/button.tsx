import * as React from 'react'
import {Button as UntitledButton} from '@/components/base/buttons/button'
import {cn} from '@/lib/utils'

const colorByVariant = {
    primary: 'primary',
    default: 'secondary',
    secondary: 'secondary',
    ghost: 'tertiary',
    danger: 'primary-destructive',
    outline: 'secondary',
} as const

const compatibilityClasses = {
    primary: 'bg-accent text-white hover:bg-accent-hover',
    default: 'bg-surface text-ink ring-1 ring-line hover:bg-surface-muted',
    secondary: 'bg-surface text-ink ring-1 ring-line hover:bg-surface-muted',
    ghost: 'text-ink-secondary hover:bg-surface-muted',
    danger: 'bg-danger text-white hover:bg-danger-strong',
    outline: 'bg-surface text-ink ring-1 ring-line hover:bg-surface-muted',
} as const

type UntitledButtonProps = React.ComponentProps<typeof UntitledButton>

export type ButtonProps = Omit<UntitledButtonProps, 'color' | 'size' | 'isDisabled' | 'isLoading'> & {
    variant?: keyof typeof colorByVariant
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'icon' | 'icon-sm'
    asChild?: boolean
    isLoading?: boolean
    disabled?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    {
        variant = 'primary',
        size = 'sm',
        asChild = false,
        isLoading = false,
        disabled,
        className,
        children,
        ...props
    },
    _ref,
) {
    if (asChild && React.isValidElement(children)) {
        const childProps = children.props as { className?: string }
        return React.cloneElement(children, {
            ...props,
            className: cn(compatibilityClasses[variant], className, childProps.className),
            'aria-disabled': disabled || isLoading || undefined,
        } as React.Attributes)
    }

    const normalizedSize = size === 'icon' || size === 'icon-sm' ? 'sm' : size

    return (
        <UntitledButton
            {...props}
            color={colorByVariant[variant]}
            size={normalizedSize}
            isDisabled={disabled}
            isLoading={isLoading}
            className={cn(compatibilityClasses[variant], className)}
        >
            {children}
        </UntitledButton>
    )
})

Button.displayName = 'Button'
