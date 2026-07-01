import type { ReactElement, ReactNode } from 'react'

interface CardProps {
  className?: string
  children?: ReactNode
}

export function Card({ className = '', children }: CardProps): ReactElement {
  return (
    <div className={`rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 ${className}`}>
      {children}
    </div>
  )
}