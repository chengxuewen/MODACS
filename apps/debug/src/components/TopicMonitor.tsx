import { useMemo, type ReactNode, useEffect, useState } from 'react'
import { useTopicStore } from '../stores/topic-store'
import type { TopicStat } from '../types/api'

interface TopicMonitorProps {
  onSelectTopic: (topic: string, data: unknown) => void
}

type SortKey = 'topic' | 'subscribers' | 'lastMessage'
type SortDir = 'asc' | 'desc'

export function TopicMonitor({ onSelectTopic }: TopicMonitorProps): ReactNode {
  const { topics, loading, error, fetchTopics } = useTopicStore()
  const [sortKey, setSortKey] = useState<SortKey>('topic')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  useEffect(() => {
    void fetchTopics()
    const interval = setInterval(() => void fetchTopics(), 2000)
    return () => clearInterval(interval)
  }, [fetchTopics])

  const handleSort = (key: SortKey): void => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(
    () => [...topics].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'topic') {
        cmp = a.topic.localeCompare(b.topic)
      } else if (sortKey === 'subscribers') {
        cmp = (a.subscribers?.length ?? 0) - (b.subscribers?.length ?? 0)
      } else {
        cmp = JSON.stringify(a.lastMessage ?? '').localeCompare(
          JSON.stringify(b.lastMessage ?? ''),
        )
      }
      return sortDir === 'asc' ? cmp : -cmp
    }),
    [topics, sortKey, sortDir]
  )

  const arrow = (key: SortKey): string =>
    sortKey === key ? (sortDir === 'asc' ? ' \u2191' : ' \u2193') : ''

  if (loading && topics.length === 0) {
    return <div className="text-zinc-500 text-sm p-4">Loading topics...</div>
  }
  if (error) {
    return <div className="text-red-400 text-sm p-4">Error: {error}</div>
  }
  if (topics.length === 0) {
    return <div className="text-zinc-500 text-sm p-4">No topics found</div>
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm text-zinc-300">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-400">
            <th
              className="text-left px-3 py-2 cursor-pointer hover:text-zinc-100 whitespace-nowrap"
              onClick={() => handleSort('topic')}
            >
              Topic{arrow('topic')}
            </th>
            <th
              className="text-left px-3 py-2 cursor-pointer hover:text-zinc-100 whitespace-nowrap"
              onClick={() => handleSort('subscribers')}
            >
              Subscribers{arrow('subscribers')}
            </th>
            <th
              className="text-left px-3 py-2 cursor-pointer hover:text-zinc-100 whitespace-nowrap"
              onClick={() => handleSort('lastMessage')}
            >
              Last Message{arrow('lastMessage')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t: TopicStat) => (
            <tr
              key={t.topic}
              className="border-b border-zinc-900 hover:bg-zinc-900 cursor-pointer"
              onClick={() => onSelectTopic(t.topic, t.lastMessage)}
            >
              <td className="px-3 py-2 font-mono text-xs">{t.topic}</td>
              <td className="px-3 py-2 text-xs">{t.subscribers?.length ?? 0}</td>
              <td className="px-3 py-2 font-mono text-xs truncate max-w-xs">
                {JSON.stringify(t.lastMessage ?? '')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
