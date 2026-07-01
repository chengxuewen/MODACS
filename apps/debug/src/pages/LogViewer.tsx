import { useEffect, useMemo, useRef } from 'react'
import { useLogStore } from '../stores/log-store'
import { LogLine } from '../components/LogLine'
import { apiGet } from '../lib/api-client'
import type { LogEntry } from '../types/api'

const LEVELS = ['ALL', 'DEBUG', 'INFO', 'WARN', 'ERROR'] as const

export function LogViewer() {
  const logs = useLogStore((s) => s.logs)
  const connected = useLogStore((s) => s.connected)
  const paused = useLogStore((s) => s.paused)
  const levelFilter = useLogStore((s) => s.levelFilter)
  const sourceFilter = useLogStore((s) => s.sourceFilter)
  const searchText = useLogStore((s) => s.searchText)
  const autoScroll = useLogStore((s) => s.autoScroll)
  const connectSSE = useLogStore((s) => s.connectSSE)
  const disconnectSSE = useLogStore((s) => s.disconnectSSE)
  const togglePause = useLogStore((s) => s.togglePause)
  const setLevelFilter = useLogStore((s) => s.setLevelFilter)
  const setSourceFilter = useLogStore((s) => s.setSourceFilter)
  const setSearchText = useLogStore((s) => s.setSearchText)
  const toggleAutoScroll = useLogStore((s) => s.toggleAutoScroll)
  const preload = useLogStore((s) => s.preload)

  const scrollRef = useRef<HTMLDivElement>(null)

  // On mount: connect SSE + preload recent logs
useEffect(() => {
connectSSE()
void apiGet<{ topic: string;
lastMessage: LogEntry | null }[]>('/logs:list')
.then((data) => {
if (data) {
const entries = data
.filter((e) => e.lastMessage !== null)
.map((e) => e.lastMessage as LogEntry)
preload(entries)
}
})
.catch(() => { /* preload failure is non-fatal */ })
return () => disconnectSSE()
}, [connectSSE, disconnectSSE, preload])

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  // Derive available sources from log names
  const sources = useMemo(() => [...new Set(logs.map((l) => l.name))].sort(), [logs])

  // Apply filters
  const filteredLogs = useMemo(() => {
    const levelUpper = levelFilter.toUpperCase()
    const searchLower = searchText.toLowerCase()
    return logs.filter((entry) => {
      if (levelUpper !== 'ALL' && entry.level?.toUpperCase() !== levelUpper) return false
      if (sourceFilter && entry.name !== sourceFilter) return false
      if (searchLower && !entry.msg.toLowerCase().includes(searchLower)) return false
      return true
    })
  }, [logs, levelFilter, sourceFilter, searchText])

  return (
    <div className="flex flex-col bg-zinc-950 rounded-lg border border-zinc-800">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2">
        {/* Connection indicator */}
        <span
          className={`h-2 w-2 rounded-full shrink-0 ${connected ? 'bg-emerald-500' : 'bg-red-500'}`}
          title={connected ? 'Connected' : 'Disconnected'}
        />

        {/* Pause/Resume */}
        <button
          onClick={togglePause}
          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
            paused
              ? 'bg-amber-950 text-amber-400 hover:bg-amber-900'
              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          }`}
        >
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>

        {/* Auto-scroll */}
        <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer select-none">
          <input type="checkbox" checked={autoScroll} onChange={toggleAutoScroll} className="accent-sky-500" />
          Auto-scroll
        </label>

        <div className="h-4 w-px bg-zinc-800" />

        {/* Level filter badges */}
        <div className="flex items-center gap-1">
          {LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => setLevelFilter(level)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                levelFilter.toUpperCase() === level
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {level}
            </button>
          ))}
        </div>

        {/* Source filter dropdown */}
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 outline-none focus:border-zinc-500"
        >
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Search */}
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search logs..."
          className="min-w-32 flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
        />

        {/* Count */}
        <span className="shrink-0 tabular-nums text-xs text-zinc-600">
          {filteredLogs.length}/{logs.length}
        </span>
      </div>

      {/* Log list */}
      <div ref={scrollRef} className="max-h-[calc(100vh-200px)] overflow-auto">
        {filteredLogs.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-zinc-600">
            {logs.length === 0 ? 'Waiting for logs...' : 'No logs match filters'}
          </div>
        ) : (
          filteredLogs.map((entry, i) => (
            <LogLine key={`${entry.time}-${entry.name}-${i}`} entry={entry} />
          ))
        )}
      </div>
    </div>
  )
}
