import type { ReactElement, ReactNode } from 'react'

interface LabelProps {
  htmlFor?: string
  className?: string
  children?: ReactNode
}

export function Label({ htmlFor, className = '', children }: LabelProps): ReactElement {
  return (
    <label htmlFor={htmlFor} className={`text-sm ${className}`}>
      {children}
    </label>
  )
}