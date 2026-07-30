import { useState, useRef, useCallback, useEffect } from 'react'
import type { ETLNode, Connection } from '../../types'
import { NodeBox, getNodeHeight, getPortY, buildPath, NODE_WIDTH } from '../tab1/NodeBox'

export function EtlCanvas({
  nodes,
  connections,
  selectedNode,
  onSelectNode,
  highlightIds,
}: {
  nodes: ETLNode[]
  connections: Connection[]
  selectedNode: string | null
  onSelectNode: (id: string) => void
  highlightIds: string[]
}) {
  const [pan, setPan] = useState({ x: 30, y: 30 })
  const [zoom, setZoom] = useState(1)
  const dragging = useRef(false)
  const lastPan = useRef({ x: 0, y: 0 })

  // Search jump (Task 5): pan to the first highlighted node whenever the
  // match set changes (and is non-empty).
  useEffect(() => {
    if (highlightIds.length === 0) return
    const f = nodes.find(n => n.id === highlightIds[0])
    if (f) setPan({ x: 30 - f.x * zoom + 100, y: 30 - f.y * zoom + 100 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightIds.join(',')])

  // Zoom-collapse pills (Task 6): below 0.65, nodes render as compact pills
  // (getNodeHeight(n, true) === 26) instead of full detail boxes.
  const compact = zoom < 0.65

  const canvasW = Math.max(...nodes.map(n => n.x + NODE_WIDTH), 400) + 100
  const canvasH = Math.max(...nodes.map(n => n.y + getNodeHeight(n, compact)), 300) + 100

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
          // Port rows aren't rendered compact — fall back to the node-center
          // anchor (same fallback already used when a port row isn't found).
          const y1 = fi >= 0 && !compact ? getPortY(fn, fi) : fn.y + getNodeHeight(fn, compact) / 2
          const x2 = tn.x
          const y2 = ti >= 0 && !compact ? getPortY(tn, ti) : tn.y + getNodeHeight(tn, compact) / 2
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
            isSelected={selectedNode === n.id || highlightIds.includes(n.id)}
            onClick={() => onSelectNode(n.id)}
            compact={compact}
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
