import type { LogEntry } from '../types/api'

const COLORS: Record<string, string> = {
  DEBUG: 'text-zinc-500',
  INFO: 'text-blue-400',
  WARN: 'text-amber-400',
  ERROR: 'text-red-400',
  FATAL: 'text-red-500 font-bold',
}

export function LogLine({ entry }: { entry: LogEntry }) {
  const time = new Date(entry.time).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  })
  return (
    <div className="flex gap-2 py-0.5 px-2 hover:bg-zinc-900 font-mono text-xs">
      <span className="text-zinc-600 shrink-0">{time}</span>
      <span className={`shrink-0 w-12 ${COLORS[entry.level?.toUpperCase()] || 'text-zinc-400'}`}>{entry.level}</span>
      <span className="text-zinc-500 shrink-0">[{entry.name}]</span>
      <span className="text-zinc-300">{entry.msg}</span>
    </div>
  )
}
