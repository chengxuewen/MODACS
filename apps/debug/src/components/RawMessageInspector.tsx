import { type ReactElement, useState } from 'react'
import { JsonView } from './JsonView'

interface RawMessageInspectorProps {
  topic: string
  data: unknown
  onClose: () => void
}

export function RawMessageInspector({
  topic,
  data,
  onClose,
}: RawMessageInspectorProps): ReactElement {
  const [copied, setCopied] = useState(false)

  const json =
    typeof data === 'string' ? data : (JSON.stringify(data ?? null, null, 2) ?? 'null')
  const byteSize = new TextEncoder().encode(json).length

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        role="presentation"
        tabIndex={0}
        aria-label="Close inspector"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      />
      <div className="relative w-96 max-w-full bg-zinc-950 border-l border-zinc-800 h-full overflow-y-auto p-4 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-100 truncate">{topic}</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 transition-colors shrink-0 ml-2"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="flex items-center gap-3 mb-3 text-xs text-zinc-500">
          <span>{byteSize} bytes</span>
          <button
            onClick={handleCopy}
            className="px-2 py-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <JsonView data={data ?? null} />
      </div>
    </div>
  )
}
