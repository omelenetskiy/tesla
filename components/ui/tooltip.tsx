'use client'

import * as React from 'react'
import { Tooltip as UntitledTooltip, TooltipTrigger as UntitledTooltipTrigger } from '@/components/base/tooltip/tooltip'

/** Untitled UI tooltip compatibility exports for existing consumers. */
export const TooltipProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>
export const Tooltip = UntitledTooltip
export const TooltipTrigger = UntitledTooltipTrigger
export const TooltipContent = ({ children }: { children?: React.ReactNode }) => <>{children}</>
