import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { Activity, Disc, Radio, Share2 } from 'lucide-react'
import { Card } from '../components/ui/card'
import { apiGet } from '../lib/api-client'
import type { BridgeStatus, ProcessInfo, RecordingInfo, TopicStat } from '../types/api'

interface OverviewStats {
  topics: number
  plugins: number
  bridgeActive: boolean
  bridgeClients: number
  recordings: number
  error: string | null
}

const INITIAL_STATS: OverviewStats = {
  topics: 0,
  plugins: 0,
  bridgeActive: false,
  bridgeClients: 0,
  recordings: 0,
  error: null,
}

const REFRESH_MS = 5000

interface SafeResult<T> {
  ok: boolean
  value: T | null
}

async function safeFetch<T>(fn: () => Promise<T>): Promise<SafeResult<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch {
    return { ok: false, value: null }
  }
}

export function Overview(): JSX.Element {
  const [stats, setStats] = useState<OverviewStats>(INITIAL_STATS)

  useEffect(() => {
    let active = true

    async function fetchStats(): Promise<void> {
      const [topicsR, processesR, bridgeR, recordingsR] = await Promise.all([
        safeFetch(() => apiGet<TopicStat[]>('/topics:stats')),
        safeFetch(() => apiGet<ProcessInfo[]>('/processes:list')),
        safeFetch(() => apiGet<BridgeStatus>('/bridge:status')),
        safeFetch(() => apiGet<RecordingInfo[]>('/recordings:list')),
      ])

      if (!active) return

      let failed = 0
      const next: OverviewStats = { ...INITIAL_STATS }

      if (topicsR.ok && topicsR.value) {
        next.topics = topicsR.value.length
      } else {
        failed++
      }

      if (processesR.ok && processesR.value) {
        next.plugins = processesR.value.length
      } else {
        failed++
      }

      if (bridgeR.ok && bridgeR.value) {
        next.bridgeActive = bridgeR.value.active
        next.bridgeClients = bridgeR.value.clients
      } else {
        failed++
      }

      if (recordingsR.ok && recordingsR.value) {
        next.recordings = recordingsR.value.length
      } else {
        failed++
      }

      next.error = failed > 0 ? `${failed} API call(s) failed` : null
      setStats(next)
    }

    fetchStats()
    const interval = setInterval(fetchStats, REFRESH_MS)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold">System Overview</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Real-time platform statistics — refreshes every 5s
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Topics */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Total Topics
              </p>
              <p className="text-2xl font-bold mt-1">{stats.topics}</p>
            </div>
            <Share2 className="w-8 h-8 text-zinc-400 dark:text-zinc-600" />
          </div>
        </Card>

        {/* Active Plugins */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Active Plugins
              </p>
              <p className="text-2xl font-bold mt-1">{stats.plugins}</p>
            </div>
            <Activity className="w-8 h-8 text-zinc-400 dark:text-zinc-600" />
          </div>
        </Card>

        {/* Bridge Status */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Bridge Status
              </p>
              <p className="text-2xl font-bold mt-1">
                {stats.bridgeActive ? 'Active' : 'Inactive'}
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                {stats.bridgeClients} client(s)
              </p>
            </div>
            <Radio className="w-8 h-8 text-zinc-400 dark:text-zinc-600" />
          </div>
        </Card>

        {/* Recording Status */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Recordings
              </p>
              <p className="text-2xl font-bold mt-1">{stats.recordings}</p>
            </div>
            <Disc className="w-8 h-8 text-zinc-400 dark:text-zinc-600" />
          </div>
        </Card>
      </div>

      {stats.error && (
        <p className="text-sm text-amber-500">{stats.error}</p>
      )}
    </div>
  )
}
