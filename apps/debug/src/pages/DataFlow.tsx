import { useState, useEffect, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useTopicStore } from '../stores/topic-store'
import { RateTracker, type TopicRate } from '../lib/rate-tracker'
import { Card } from '../components/ui/card'
import { Checkbox } from '../components/ui/checkbox'
import { Label } from '../components/ui/label'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export function DataFlow(): React.ReactElement {
  const { topics, fetchTopics } = useTopicStore()
  const [tracker] = useState(() => new RateTracker(30))
  const [rates, setRates] = useState<TopicRate[]>([])
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set())
  const [chartData, setChartData] = useState<Record<string, number | string>[]>([])

  const topicsRef = useRef(topics)

  useEffect(() => { topicsRef.current = topics }, [topics])

  useEffect(() => {
    const interval = setInterval(() => {
      fetchTopics()
      const currentTopics = topicsRef.current
      if (!currentTopics || currentTopics.length === 0) return

      tracker.update(currentTopics)
      const newRates = tracker.getRates()
      setRates(newRates)

      if (newRates.length > 0) {
        const allTimes = new Set<number>()
        newRates.forEach(r => r.rates.forEach(p => allTimes.add(p.time)))
        const sortedTimes = [...allTimes].sort((a, b) => a - b)
        const data = sortedTimes.map(time => {
          const row: Record<string, number | string> = { time: formatTime(time) }
          newRates.forEach(r => {
            const point = r.rates.find(p => p.time === time)
            if (point) row[r.topic] = point.rate
          })
          return row
        })
        setChartData(data)
      }

    }, 2000)

    return () => clearInterval(interval)
  }, [fetchTopics, tracker])

  // Auto-select top topics when none selected
  useEffect(() => {
    if (rates.length === 0) return
    if (selectedTopics.size > 0) return

    const topTopics = rates
      .sort((a, b) => {
        const aLast = a.rates[a.rates.length - 1]?.rate ?? 0
        const bLast = b.rates[b.rates.length - 1]?.rate ?? 0
        return bLast - aLast
      })
      .slice(0, 8)
      .map(r => r.topic)
    setSelectedTopics(new Set(topTopics))
  }, [rates])

  const toggleTopic = (topic: string): void => {
    setSelectedTopics(prev => {
      const next = new Set(prev)
      if (next.has(topic)) {
        next.delete(topic)
      } else {
        next.add(topic)
      }
      return next
    })
  }

  const visibleRates = rates.filter(r => selectedTopics.has(r.topic))

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-semibold text-zinc-100">Data Flow</h2>

      <Card className="p-4 bg-zinc-900 border-zinc-800">
        <div className="mb-4 flex flex-wrap gap-3">
          {rates.map((r, i) => (
            <div key={r.topic} className="flex items-center gap-2">
              <Checkbox
                id={`topic-${r.topic}`}
                checked={selectedTopics.has(r.topic)}
                onCheckedChange={() => toggleTopic(r.topic)}
              />
              <Label htmlFor={`topic-${r.topic}`} className="text-sm text-zinc-300 cursor-pointer">
                <span
                  className="inline-block w-3 h-3 rounded-full mr-1.5"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                {r.topic}
              </Label>
            </div>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="time"
              stroke="#71717a"
              fontSize={11}
            />
            <YAxis
              stroke="#71717a"
              fontSize={11}
              allowDecimals={false}
              label={{ value: 'msg/s', angle: -90, position: 'insideLeft', fill: '#71717a' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '6px',
                color: '#e4e4e7',
              }}
            />
            <Legend wrapperStyle={{ color: '#a1a1aa' }} />
            {visibleRates.map((r) => {
              const colorIdx = rates.findIndex(rr => rr.topic === r.topic)
              return (
                <Line
                  key={r.topic}
                  type="monotone"
                  dataKey={r.topic}
                  stroke={COLORS[colorIdx % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {rates.length === 0 && (
        <p className="text-zinc-500 text-center py-8">Waiting for topic data...</p>
      )}
    </div>
  )
}