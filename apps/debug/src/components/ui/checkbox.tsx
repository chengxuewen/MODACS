import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import type { ReactElement } from 'react'

interface CheckboxProps {
  id?: string
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  className?: string
}

export function Checkbox({ id, checked, onCheckedChange, className = '' }: CheckboxProps): ReactElement {
  return (
    <CheckboxPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      className={`peer h-4 w-4 shrink-0 rounded-sm border border-zinc-600 bg-zinc-800 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 ${className}`}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-white text-xs">
        ✓
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}