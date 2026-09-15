'use client'

/**
 * Select exports backed by React Aria, the accessibility layer used by Untitled UI.
 * This keeps the legacy names available while removing the former Radix dependency.
 */
export {
  Select,
  SelectValue,
  Button as SelectTrigger,
  ListBox as SelectContent,
  ListBoxItem as SelectItem,
  Label as SelectLabel,
  Section as SelectGroup,
} from 'react-aria-components'
