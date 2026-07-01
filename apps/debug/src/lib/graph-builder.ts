import dagre from 'dagre'
import type { Edge, Node } from '@xyflow/react'
import type { ProcessInfo, TopicStat } from '../types/api'

export interface GraphNodeData {
  [key: string]: unknown
  kind: 'topic' | 'component' | 'plugin'
  label: string
  lastMessage?: unknown
}

export function buildGraph(
  topics: TopicStat[],
  plugins: ProcessInfo[],
): { nodes: Node<GraphNodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 40 })
  g.setDefaultEdgeLabel(() => ({}))

  const nodes: Node<GraphNodeData>[] = []
  const edges: Edge[] = []

  for (const p of plugins) {
    const id = `plugin-${p.name}`
    g.setNode(id, { width: 120, height: 40 })
    nodes.push({
      id,
      type: 'default',
      position: { x: 0, y: 0 },
      data: { label: p.name, kind: 'plugin' },
      style: { background: '#3b82f6', color: '#fff', borderRadius: '4px', width: 120, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', padding: '0 8px' },
    })
  }

  for (const t of topics) {
    const id = `topic-${t.topic}`
    const color = t.topic.startsWith('/log/')
      ? '#f59e0b'
      : t.topic.startsWith('/rpc/')
        ? '#10b981'
        : '#71717a'
    g.setNode(id, { width: 140, height: 40 })
    nodes.push({
      id,
      type: 'default',
      position: { x: 0, y: 0 },
      data: { label: t.topic, kind: 'topic', lastMessage: t.lastMessage },
      style: { background: color, color: '#fff', borderRadius: '50%', width: 140, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', padding: '0 8px' },
    })
  }

  // Collect all unique component names from publishers and subscribers
  const componentNames = new Set<string>()
  for (const t of topics) {
    for (const pub of t.publishers ?? []) {
      // Strip topic suffix if present (e.g., "recorder:/log/modacs-server" → "recorder")
      const name = pub.includes(':') ? pub.split(':')[0] : pub
      componentNames.add(name)
    }
    for (const sub of t.subscribers ?? []) {
      const name = sub.includes(':') ? sub.split(':')[0] : sub
      componentNames.add(name)
    }
  }

  // Create component nodes (if not already a plugin node)
  const existingPluginNames = new Set(plugins.map(p => p.name))
  for (const name of componentNames) {
    if (!existingPluginNames.has(name)) {
      const id = `component-${name}`
      g.setNode(id, { width: 120, height: 40 })
      nodes.push({
        id,
        type: 'default',
        position: { x: 0, y: 0 },
        data: { label: name, kind: 'component' },
        style: { background: '#a855f7', color: '#fff', borderRadius: '4px', width: 120, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', padding: '0 8px' },
      })
    }
  }

  // Publisher edges: publisher → topic (solid blue arrow)
  for (const t of topics) {
    for (const pub of t.publishers ?? []) {
      const name = pub.includes(':') ? pub.split(':')[0] : pub
      const sourceId = existingPluginNames.has(name) ? `plugin-${name}` : `component-${name}`
      g.setEdge(sourceId, `topic-${t.topic}`)
      edges.push({
        id: `pub-${name}-${t.topic}`,
        source: sourceId,
        target: `topic-${t.topic}`,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
        markerEnd: { type: 'arrowclosed', color: '#3b82f6' },
      })
    }
  }

  // Subscriber edges: topic → subscriber (dashed gray)
  for (const t of topics) {
    for (const sub of t.subscribers ?? []) {
      const name = sub.includes(':') ? sub.split(':')[0] : sub
      const targetId = existingPluginNames.has(name) ? `plugin-${name}` : `component-${name}`
      g.setEdge(`topic-${t.topic}`, targetId)
      edges.push({
        id: `sub-${name}-${t.topic}`,
        source: `topic-${t.topic}`,
        target: targetId,
        style: { stroke: '#71717a', strokeWidth: 1, strokeDasharray: '5,5' },
        animated: false,
      })
    }
  }

  dagre.layout(g)

  const layoutMap = new Map<string, { x: number; y: number }>()
  for (const nid of g.nodes()) {
    const dn = g.node(nid)
    if (dn) {
      layoutMap.set(nid, { x: dn.x - dn.width / 2, y: dn.y - dn.height / 2 })
    }
  }
  const positionedNodes = nodes.map((n) => {
    const pos = layoutMap.get(n.id)
    return pos ? { ...n, position: pos } : n
  })

  return { nodes: positionedNodes, edges }
}
