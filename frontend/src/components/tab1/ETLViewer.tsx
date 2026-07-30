import { useState, useRef, useCallback } from 'react'
import type { ETLNode, Connection, FSFile, FSDir } from '../../types'
import { MAPPINGS } from '../../mockData'
import { Sidebar } from '../shared/Sidebar'
import { useFilesystem } from '../shared/useFilesystem'
import { NodeBox, getNodeHeight, getPortY, buildPath, NODE_WIDTH, NODE_STYLES } from './NodeBox'
import { DetailPanel } from './DetailPanel'

const EMPTY_FS: FSDir = { name: 'xmltobq', layer: 'root', children: [] }

const LEGEND = [
  { type: 'source', label: 'Source' },
  { type: 'sq', label: 'Src Qualifier' },
  { type: 'expression', label: 'Expression' },
  { type: 'lookup', label: 'Lookup' },
  { type: 'joiner', label: 'Joiner' },
  { type: 'aggregator', label: 'Aggregator' },
  { type: 'router', label: 'Router' },
  { type: 'filter', label: 'Filter' },
  { type: 'target', label: 'Target' },
] as const

function Canvas({
  nodes,
  connections,
  selectedNode,
  onSelectNode,
}: {
  nodes: ETLNode[]
  connections: Connection[]
  selectedNode: string | null
  onSelectNode: (id: string) => void
}) {
  const [pan, setPan] = useState({ x: 30, y: 30 })
  const [zoom, setZoom] = useState(1)
  const dragging = useRef(false)
  const lastPan = useRef({ x: 0, y: 0 })

  const canvasW = Math.max(...nodes.map(n => n.x + NODE_WIDTH), 400) + 100
  const canvasH = Math.max(...nodes.map(n => n.y + getNodeHeight(n)), 300) + 100

  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]))

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.max(0.3, Math.min(2.5, z - e.deltaY * 0.001)))
  }, [])
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest('g[style*="pointer"]')) return
    dragging.current = true
    lastPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }, [pan])
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    setPan({ x: e.clientX - lastPan.current.x, y: e.clientY - lastPan.current.y })
  }, [])
  const onMouseUp = useCallback(() => { dragging.current = false }, [])

  return (
    <div
      style={{ flex: 1, background: 'var(--bg)', position: 'relative', overflow: 'hidden', cursor: 'grab' }}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* dot grid */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs>
          <pattern id="vdot" x={pan.x % 22} y={pan.y % 22} width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="11" cy="11" r="0.7" fill="rgba(42,48,80,0.8)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#vdot)" />
      </svg>

      <svg
        width={canvasW * zoom}
        height={canvasH * zoom}
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        style={{ transform: `translate(${pan.x}px,${pan.y}px)`, position: 'absolute', overflow: 'visible' }}
      >
        <defs>
          <marker id="va" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
            <path d="M0 1 L6 3.5 L0 6 Z" fill="rgba(79,156,249,0.5)" />
          </marker>
          <marker id="va-hi" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
            <path d="M0 1 L6 3.5 L0 6 Z" fill="#4f9cf9" />
          </marker>
        </defs>

        {/* connections */}
        {connections.map((conn, i) => {
          const fn = nodeMap[conn.fromNode]
          const tn = nodeMap[conn.toNode]
          if (!fn || !tn) return null
          const fi = fn.ports.findIndex(p => p.name === conn.fromPort && (p.direction === 'OUT' || p.direction === 'IN/OUT'))
          const ti = tn.ports.findIndex(p => p.name === conn.toPort && (p.direction === 'IN' || p.direction === 'IN/OUT'))
          const x1 = fn.x + NODE_WIDTH
          const y1 = fi >= 0 ? getPortY(fn, fi) : fn.y + getNodeHeight(fn) / 2
          const x2 = tn.x
          const y2 = ti >= 0 ? getPortY(tn, ti) : tn.y + getNodeHeight(tn) / 2
          const hi = selectedNode === conn.fromNode || selectedNode === conn.toNode
          return (
            <path key={i}
              d={buildPath(x1, y1, x2, y2)}
              fill="none"
              stroke={hi ? '#4f9cf9' : '#2a3050'}
              strokeWidth={hi ? 1.5 : 1}
              markerEnd={hi ? 'url(#va-hi)' : 'url(#va)'}
            />
          )
        })}

        {/* nodes */}
        {nodes.map(n => (
          <NodeBox
            key={n.id}
            node={n}
            isSelected={selectedNode === n.id}
            onClick={() => onSelectNode(n.id)}
          />
        ))}
      </svg>

      {/* zoom controls */}
      <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[
          { icon: '+', fn: () => setZoom(z => Math.min(2.5, z + 0.2)) },
          { icon: '−', fn: () => setZoom(z => Math.max(0.3, z - 0.2)) },
          { icon: '⊡', fn: () => { setZoom(1); setPan({ x: 30, y: 30 }) } },
        ].map(({ icon, fn }) => (
          <button key={icon} onClick={fn} style={{
            width: 28, height: 28, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 5, color: '#7b88aa', cursor: 'pointer', fontSize: icon === '⊡' ? 12 : 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace',
          }}>{icon}</button>
        ))}
      </div>
      <div style={{
        position: 'absolute', bottom: 16, left: 16,
        padding: '2px 7px', background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 4, fontSize: 10, color: '#4a5570', fontFamily: 'JetBrains Mono, monospace',
      }}>{Math.round(zoom * 100)}%</div>
    </div>
  )
}

export function ETLViewer({ searchQuery }: { searchQuery: string }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [activeMapping, setActiveMapping] = useState('m_DM_DWHES_TABLA_COUNT_REPORT')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const { fs, loading, error } = useFilesystem()

  const mapping = MAPPINGS[activeMapping] ?? Object.values(MAPPINGS)[0]
  const selectedNode = mapping.nodes.find(n => n.id === selectedNodeId) ?? null

  const handleSelectFile = (f: FSFile) => {
    setSelectedPath(f.path)
    setSelectedNodeId(null)
    if (f.mapping && MAPPINGS[f.mapping]) setActiveMapping(f.mapping)
  }

  const sidebarExtra = loading ? (
    <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: 12 }}>Loading corpus…</div>
  ) : error ? (
    <div style={{ color: 'var(--red)', fontSize: 12, padding: 12 }}>
      <div>{error.title}</div>
      {error.detail && <div>{error.detail}</div>}
    </div>
  ) : (
    <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', background: 'var(--surface-2)' }}>
      <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 6 }}>Active Mapping</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {Object.keys(MAPPINGS).map(key => (
          <button key={key} onClick={() => { setActiveMapping(key); setSelectedNodeId(null) }}
            style={{
              padding: '4px 8px', borderRadius: 4, textAlign: 'left',
              background: activeMapping === key ? 'var(--surface-3)' : 'transparent',
              border: `1px solid ${activeMapping === key ? 'var(--border)' : 'transparent'}`,
              color: activeMapping === key ? '#e2e8f8' : '#4a5570',
              fontSize: 10, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >{key}</button>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <Sidebar
        searchQuery={searchQuery}
        selectedPath={selectedPath}
        onSelectFile={handleSelectFile}
        filesystem={fs ?? EMPTY_FS}
        extraContent={sidebarExtra}
      />

      <Canvas
        nodes={mapping.nodes}
        connections={mapping.connections}
        selectedNode={selectedNodeId}
        onSelectNode={id => setSelectedNodeId(id === selectedNodeId ? null : id)}
      />

      {selectedNode && (
        <DetailPanel node={selectedNode} onClose={() => setSelectedNodeId(null)} />
      )}

      {/* status bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 240, right: selectedNode ? 310 : 0,
        height: 24, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px',
        background: 'var(--surface)', borderTop: '1px solid var(--border)', pointerEvents: 'none',
      }}>
        {LEGEND.map(({ type, label }) => {
          const s = NODE_STYLES[type]
          return (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
              <span style={{ fontSize: 9, color: '#4a5570' }}>{label}</span>
            </div>
          )
        })}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: '#2a3050', fontFamily: 'JetBrains Mono, monospace' }}>
          {mapping.nodes.length} nodes · {mapping.connections.length} connections · Informatica PowerCenter
        </span>
      </div>
    </div>
  )
}
