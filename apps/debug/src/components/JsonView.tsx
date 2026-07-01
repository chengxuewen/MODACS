import { type ReactElement } from 'react'

interface JsonViewProps {
  data: unknown
}

export function JsonView({ data }: JsonViewProps): ReactElement {
  const json =
    typeof data === 'string' ? data : (JSON.stringify(data ?? null, null, 2) ?? 'null')
  return (
    <pre className="text-xs font-mono text-zinc-300 bg-zinc-900 p-3 rounded overflow-auto max-h-96">
      {json}
    </pre>
  )
}
