'use client'

import * as React from 'react'
import { Dropdown } from '@/components/base/dropdown/dropdown'
import { Button as AriaButton, MenuItem as AriaMenuItem, MenuTrigger as AriaMenuTrigger, Popover as AriaPopover, Separator as AriaSeparator } from 'react-aria-components'
import { cx } from '@/utils/cx'

export const DropdownMenu = AriaMenuTrigger
export const DropdownMenuTrigger = AriaButton
export const DropdownMenuGroup = React.Fragment

export function DropdownMenuContent({ className, children, align: _align, ...props }: React.ComponentProps<typeof AriaPopover> & { align?: string }) {
  return (
    <AriaPopover
      placement="bottom right"
      {...props}
      className={cx('z-50 min-w-[13rem] overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-lg', className as string)}
    >
      <Dropdown.Menu>{children}</Dropdown.Menu>
    </AriaPopover>
  )
}

export function DropdownMenuItem({ className, tone = 'default', onSelect, disabled, ...props }: React.ComponentProps<typeof AriaMenuItem> & { tone?: 'default' | 'danger'; onSelect?: () => void; disabled?: boolean }) {
  return (
    <AriaMenuItem
      {...props}
      onAction={onSelect}
      isDisabled={disabled}
      className={cx(
        'flex min-h-11 cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] outline-none transition-colors',
        tone === 'danger' ? 'text-danger' : 'text-ink',
        className as string,
      )}
    />
  )
}

export const DropdownMenuSeparator = (props: React.ComponentProps<typeof AriaSeparator>) => (
  <AriaSeparator {...props} className={cx('my-1 h-px bg-line', props.className as string)} />
)

export const DropdownMenuLabel = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cx('px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-tertiary', className)} {...props} />
)

export const DropdownMenuRadioGroup = Dropdown.Menu
export const DropdownMenuRadioItem = DropdownMenuItem
