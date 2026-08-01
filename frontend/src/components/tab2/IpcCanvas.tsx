import { useState, useRef, useCallback } from 'react'
import type { ETLNode, Connection, Port } from '../../types'
import { NodeBox, getNodeHeight, getPortY, buildPath, NODE_WIDTH } from '../tab1/NodeBox'

/** True when two connections refer to the same edge (all four endpoints equal). */
function sameConnection(a: Connection | null | undefined, b: Connection): boolean {
  return !!a && a.fromNode === b.fromNode && a.fromPort === b.fromPort && a.toNode === b.toNode && a.toPort === b.toPort
}

export type Band = 'sources' | 'transformations' | 'target'

/** Membership follows the data (node.type), never where a node was dragged —
 * spec §6.2: a source dragged into the transformations area is still a
 * "source" band member, and its own band's rect grows/shrinks to follow it. */
export function bandOf(node: ETLNode): Band {
  if (node.type === 'source') return 'sources'
  if (node.type === 'target') return 'target'
  return 'transformations'
}

const BAND_ORDER: Band[] = ['sources', 'transformations', 'target']
const BAND_LABEL: Record<Band, string> = { sources: 'Sources', transformations: 'Transformations', target: 'Target' }

/** Task 13's three fixed status colors — no new tokens (ADR-0005): `--red`
 * (error) / `#fbbf24` (the existing SaveBar warning amber) / `--green` (ok). */
const STATUS_DOT_COLOR: Record<'ok' | 'warn' | 'error', string> = {
  ok: 'var(--green)',
  warn: '#fbbf24',
  error: 'var(--red)',
}

const zoomButtonStyle: React.CSSProperties = {
  width: 28, height: 28, background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 5, color: '#7b88aa', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace',
}

/** Grab-state for an in-progress node drag. `startOffset*` is the node's
 * offset (offsets[id]) at pointer-down time, not its absolute position — each
 * pointermove recomputes the new OFFSET (client delta / zoom, added to the
 * start offset) so `onMoveNode`'s (x, y) compose correctly with the render
 * formula `n.x + offsets[n.id].x` (never an absolute canvas position). */
interface NodeDrag {
  id: string
  startClientX: number
  startClientY: number
  startOffsetX: number
  startOffsetY: number
}

export function IpcCanvas(props: {
  nodes: ETLNode[]
  connections: Connection[]
  selectedNode: string | null
  onSelectNode: (id: string) => void
  offsets: Record<string, { x: number; y: number }>
  onMoveNode?: (id: string, x: number, y: number) => void
  onAutoLayout?: () => void
  onPortClick?: (nodeId: string, port: Port) => void
  onSelectEdge?: (conn: Connection) => void
  selectedEdge?: Connection | null
  onDropType?: (type: string) => void
  /** Per-node conformance status (Task 13): renders a 6px dot in the node's
   * header, colored by severity — `--red` (error) beats `#fbbf24` (warn)
   * beats `--green` (ok); a node absent from the map gets no dot at all. */
  nodeStatus?: Record<string, 'ok' | 'warn' | 'error'>
}) {
  const {
    nodes, connections, selectedNode, onSelectNode, offsets,
    onMoveNode, onAutoLayout, onPortClick, onSelectEdge, selectedEdge, onDropType, nodeStatus,
  } = props

  const [pan, setPan] = useState({ x: 30, y: 30 })
  const [zoom, setZoom] = useState(1)
  const panDragging = useRef(false)
  const lastPan = useRef({ x: 0, y: 0 })
  const nodeDrag = useRef<NodeDrag | null>(null)

  const compact = zoom < 0.65

  // Offsets: a single `positioned` array computed once and reused for bands,
  // node placement AND edge endpoints below, so the three can never disagree
  // about where a node currently sits.
  const positioned = nodes.map(n => {
    const off = offsets[n.id]
    return { ...n, x: n.x + (off?.x ?? 0), y: n.y + (off?.y ?? 0) }
  })
  const nodeMap = Object.fromEntries(positioned.map(n => [n.id, n]))

  const canvasW = Math.max(...positioned.map(n => n.x + NODE_WIDTH), 400) + 100
  const canvasH = Math.max(...positioned.map(n => n.y + getNodeHeight(n, compact)), 300) + 100

  // Bands: membership is bandOf(node.type) only — never drop position.
  const bandMembers: Record<Band, typeof positioned> = { sources: [], transformations: [], target: [] }
  for (const n of positioned) bandMembers[bandOf(n)].push(n)

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.max(0.3, Math.min(2.5, z - e.deltaY * 0.001)))
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Guard: a node drag already claimed this gesture (its own onPointerDown
    // ran first, during the same bubble phase) — pan must not also start.
    if (nodeDrag.current) return
    if ((e.target as Element).closest('g[style*="pointer"]')) return
    panDragging.current = true
    lastPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }, [pan])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (nodeDrag.current) {
      const d = nodeDrag.current
      const dx = (e.clientX - d.startClientX) / zoom
      const dy = (e.clientY - d.startClientY) / zoom
      const x = Math.round((d.startOffsetX + dx) / 10) * 10
      const y = Math.round((d.startOffsetY + dy) / 10) * 10
      onMoveNode?.(d.id, x, y)
      return
    }
    if (!panDragging.current) return
    setPan({ x: e.clientX - lastPan.current.x, y: e.clientY - lastPan.current.y })
  }, [zoom, onMoveNode])

  const onPointerUp = useCallback(() => {
    nodeDrag.current = null
    panDragging.current = false
  }, [])

  const startNodeDrag = (id: string) => (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    const off = offsets[id]
    nodeDrag.current = {
      id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOffsetX: off?.x ?? 0,
      startOffsetY: off?.y ?? 0,
    }
  }

  return (
    <div
      data-testid="ipc-canvas-root"
      style={{ flex: 1, background: 'var(--bg)', position: 'relative', overflow: 'hidden', cursor: 'grab' }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onDragOver={onDropType ? (e: React.DragEvent) => e.preventDefault() : undefined}
      onDrop={onDropType ? (e: React.DragEvent) => {
        e.preventDefault()
        const type = e.dataTransfer.getData('text/etl-type')
        if (type) onDropType(type)
      } : undefined}
    >
      {/* dot grid */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs>
          <pattern id="ipcdot" x={pan.x % 22} y={pan.y % 22} width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="11" cy="11" r="0.7" fill="rgba(42,48,80,0.8)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ipcdot)" />
      </svg>

      <svg
        width={canvasW * zoom}
        height={canvasH * zoom}
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        style={{ transform: `translate(${pan.x}px,${pan.y}px)`, position: 'absolute', overflow: 'visible' }}
      >
        <defs>
          <marker id="ipca" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
            <path d="M0 1 L6 3.5 L0 6 Z" fill="rgba(79,156,249,0.5)" />
          </marker>
          <marker id="ipca-hi" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
            <path d="M0 1 L6 3.5 L0 6 Z" fill="#4f9cf9" />
          </marker>
        </defs>

        {/* bands — skip entirely when a band has no members */}
        {BAND_ORDER.map(band => {
          const members = bandMembers[band]
          if (members.length === 0) return null
          const minX = Math.min(...members.map(n => n.x)) - 24
          const maxX = Math.max(...members.map(n => n.x + NODE_WIDTH)) + 24
          return (
            <g key={band}>
              <rect x={minX} y={0} width={maxX - minX} height={canvasH}
                fill="rgba(42,48,80,0.18)" stroke="var(--border-subtle)" strokeWidth={1} />
              <text x={minX + 8} y={16} fill="#4a5570"
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {BAND_LABEL[band]}
              </text>
            </g>
          )
        })}

        {/* connections — a transparent 12px hit path under each visible 1px
            path; the visible path alone is effectively unclickable. */}
        {connections.flatMap((conn, i) => {
          const fn = nodeMap[conn.fromNode]
          const tn = nodeMap[conn.toNode]
          if (!fn || !tn) return []
          const fi = fn.ports.findIndex(p => p.name === conn.fromPort && (p.direction === 'OUT' || p.direction === 'IN/OUT'))
          const ti = tn.ports.findIndex(p => p.name === conn.toPort && (p.direction === 'IN' || p.direction === 'IN/OUT'))
          const x1 = fn.x + NODE_WIDTH
          const y1 = fi >= 0 && !compact ? getPortY(fn, fi) : fn.y + getNodeHeight(fn, compact) / 2
          const x2 = tn.x
          const y2 = ti >= 0 && !compact ? getPortY(tn, ti) : tn.y + getNodeHeight(tn, compact) / 2
          const hi = selectedNode === conn.fromNode || selectedNode === conn.toNode || sameConnection(selectedEdge, conn)
          const d = buildPath(x1, y1, x2, y2)
          const handleClick = onSelectEdge ? (e: React.MouseEvent) => { e.stopPropagation(); onSelectEdge(conn) } : undefined
          return [
            <path key={`${i}-hit`} d={d} fill="none" stroke="transparent" strokeWidth={12}
              onClick={handleClick} style={onSelectEdge ? { cursor: 'pointer' } : undefined} />,
            <path key={i} d={d} fill="none"
              stroke={hi ? '#4f9cf9' : '#2a3050'} strokeWidth={hi ? 1.5 : 1}
              markerEnd={hi ? 'url(#ipca-hi)' : 'url(#ipca)'}
              onClick={handleClick} style={onSelectEdge ? { cursor: 'pointer' } : undefined} />,
          ]
        })}

        {/* nodes — every position derives from `positioned`, computed once above */}
        {positioned.map(n => {
          const status = nodeStatus?.[n.id]
          return (
            <g key={n.id} data-testid={`ipc-node-${n.id}`} onPointerDown={startNodeDrag(n.id)} style={{ touchAction: 'none' }}>
              <NodeBox
                node={n}
                isSelected={selectedNode === n.id}
                onClick={() => onSelectNode(n.id)}
                compact={compact}
                onPortClick={onPortClick}
              />
              {status && (
                <circle
                  data-testid={`ipc-node-status-${n.id}`}
                  cx={n.x + NODE_WIDTH - 10} cy={n.y + 10} r={3}
                  fill={STATUS_DOT_COLOR[status]}
                  stroke="rgba(0,0,0,0.4)" strokeWidth={0.5}
                />
              )}
            </g>
          )
        })}
      </svg>

      {/* zoom controls + auto-layout */}
      <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[
          { icon: '+', fn: () => setZoom(z => Math.min(2.5, z + 0.2)) },
          { icon: '−', fn: () => setZoom(z => Math.max(0.3, z - 0.2)) },
          { icon: '⊡', fn: () => { setZoom(1); setPan({ x: 30, y: 30 }) } },
        ].map(({ icon, fn }) => (
          <button key={icon} onClick={fn} style={{ ...zoomButtonStyle, fontSize: icon === '⊡' ? 12 : 16 }}>{icon}</button>
        ))}
        <button onClick={() => onAutoLayout?.()} title="auto-layout" aria-label="auto-layout"
          style={{ ...zoomButtonStyle, fontSize: 14 }}>⌗</button>
      </div>
      <div style={{
        position: 'absolute', bottom: 16, left: 16,
        padding: '2px 7px', background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 4, fontSize: 10, color: '#4a5570', fontFamily: 'JetBrains Mono, monospace',
      }}>{Math.round(zoom * 100)}%</div>
    </div>
  )
}
