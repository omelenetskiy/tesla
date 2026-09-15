/**
 * Compatibility exports for older consumers.
 *
 * New code should import primitives from their individual modules. Keeping this
 * facade avoids a flag-day rewrite while ensuring there is only one implementation
 * for each Untitled UI-style primitive.
 */
export { Badge, type BadgeProps } from '@/components/ui/badge'
export { Button, type ButtonProps } from '@/components/ui/button'
export { Card, type CardProps } from '@/components/ui/card'
export { Input, type InputProps } from '@/components/ui/input'
