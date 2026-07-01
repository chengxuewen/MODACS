import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, useNodesState, useEdgesState, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { buildGraph, type GraphNodeData } from '../lib/graph-builder'
import { apiGet } from '../lib/api-client'
import { useTopicStore } from '../stores/topic-store'
import type { ProcessInfo } from '../types/api'
import { RawMessageInspector } from '../components/RawMessageInspector'
import { TopicMonitor } from '../components/TopicMonitor'

interface InspectorState {
  topic: string
  data: unknown
}

function TopicGraphInner(): ReactNode {
  const { topics, fetchTopics } = useTopicStore()
  const [plugins, setPlugins] = useState<ProcessInfo[]>([])
  const [tab, setTab] = useState<'graph' | 'table'>('graph')
  const [inspector, setInspector] = useState<InspectorState | null>(null)

  useEffect(() => {
    void fetchTopics()
    const interval = setInterval(() => void fetchTopics(), 3000)
    return () => clearInterval(interval)
  }, [fetchTopics])

  useEffect(() => {
    let cancelled = false
    const fetchPlugins = async (): Promise<void> => {
      try {
        const data = await apiGet<ProcessInfo[]>('/processes:list')
        if (!cancelled) setPlugins(data)
      } catch {
        // ignore — server may be down
      }
    }
    void fetchPlugins()
    const interval = setInterval(() => void fetchPlugins(), 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const { nodes, edges } = useMemo(
    () => buildGraph(topics, plugins),
    [topics, plugins]
  )

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(nodes)
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(edges)

  const { fitView } = useReactFlow()

  // Sync buildGraph results into ReactFlow state when data changes
  useEffect(() => {
    setRfNodes(nodes)
    setRfEdges(edges)
  }, [nodes, edges, setRfNodes, setRfEdges])

  // Auto-fit view when graph data changes or tab switches back
  useEffect(() => {
    if (tab === 'graph' && rfNodes.length > 0) {
      const timer = setTimeout(() => fitView({ duration: 300, padding: 0.2 }), 500)
      return () => clearTimeout(timer)
    }
  }, [tab, rfNodes.length, rfEdges.length, fitView])

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node<GraphNodeData>) => {
      const d = node.data
      if (d.kind === 'topic') {
        setInspector({
          topic: typeof d.label === 'string' ? d.label : node.id,
          data: d.lastMessage ?? null,
        })
      }
    },
    []
  )
  const handleSelectTopic = useCallback((topic: string, data: unknown) => {
    setInspector({ topic, data })
  }, [])

  return (
    <div className="h-full flex flex-col">
      <div className="flex gap-2 border-b border-zinc-800 px-4 py-2 shrink-0">
        <button
          className={
            'px-3 py-1 rounded text-sm ' +
            (tab === 'graph'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-100')
          }
          onClick={() => setTab('graph')}
        >
          Graph View
        </button>
        <button
          className={
            'px-3 py-1 rounded text-sm ' +
            (tab === 'table'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-100')
          }
          onClick={() => setTab('table')}
        >
          Table View
        </button>
      </div>

      <div className={tab === 'graph' ? 'flex-1 bg-zinc-950' : 'hidden'}>
        <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            minZoom={0.1}
            maxZoom={4}
            nodesDraggable={true}
            nodesConnectable={false}
            elementsSelectable={true}
          >
          <Background />
          <Controls showInteractive={false} />
          <MiniMap />
        </ReactFlow>
      </div>
      {tab === 'table' && (
        <div className="flex-1 overflow-auto bg-zinc-950">
          <TopicMonitor onSelectTopic={handleSelectTopic} />
        </div>
      )}

      {inspector && (
        <RawMessageInspector
          topic={inspector.topic}
          data={inspector.data}
          onClose={() => setInspector(null)}
        />
      )}
    </div>
  )
}

export function TopicGraph(): ReactNode {
  return (
    <ReactFlowProvider>
      <TopicGraphInner />
    </ReactFlowProvider>
  )
}
