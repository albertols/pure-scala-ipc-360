import { useState, useRef, useCallback, useEffect } from 'react'
import type { ETLNode, Connection, Port } from '../../types'
import { NodeBox, getNodeHeight, getPortY, buildPath, NODE_WIDTH } from '../tab1/NodeBox'

/** Movement budget (px, client space) separating a click from a pan: the
 * click event a pan gesture emits on release carries the release coordinates,
 * so anything that travelled further than a hand tremor is not a "click on
 * the background" and must not deselect. */
const CLICK_SLOP_PX = 4

/** Pan margin (px) kept between a revealed node and the viewport edge. */
const REVEAL_MARGIN_PX = 16

/** UX round 4: the pan that brings a node's screen rect fully inside `view`,
 * or `null` when it already is. Screen rect = `pan + rect * zoom` (the content
 * svg is translated by pan and its viewBox scales by zoom). When a node is
 * larger than the view itself, its LEFT/TOP edge wins — that's where the
 * header (the natural click target) sits. Pure so the geometry is unit-tested
 * directly; the component applies it in an effect whenever selection lands on
 * a node the docked Inspector would otherwise have swallowed. */
export function revealPan(
  view: { w: number; h: number },
  pan: { x: number; y: number },
  zoom: number,
  rect: { x: number; y: number; w: number; h: number },
  margin = REVEAL_MARGIN_PX,
): { x: number; y: number } | null {
  const x1 = pan.x + rect.x * zoom
  const x2 = x1 + rect.w * zoom
  const y1 = pan.y + rect.y * zoom
  const y2 = y1 + rect.h * zoom
  let dx = 0
  let dy = 0
  if (x2 > view.w - margin) dx = view.w - margin - x2
  if (x1 + dx < margin) dx = margin - x1
  if (y2 > view.h - margin) dy = view.h - margin - y2
  if (y1 + dy < margin) dy = margin - y1
  if (dx === 0 && dy === 0) return null
  return { x: pan.x + dx, y: pan.y + dy }
}

/** True when two connections refer to the same edge (all four endpoints equal). */
function sameConnection(a: Connection | null | undefined, b: Connection): boolean {
  return (
    !!a &&
    a.fromNode === b.fromNode &&
    a.fromPort === b.fromPort &&
    a.toNode === b.toNode &&
    a.toPort === b.toPort
  )
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
const BAND_LABEL: Record<Band, string> = {
  sources: 'Sources',
  transformations: 'Transformations',
  target: 'Target',
}

/** Task 13's three fixed status colors — no new tokens (ADR-0005): `--red`
 * (error) / `#fbbf24` (the existing SaveBar warning amber) / `--green` (ok). */
const STATUS_DOT_COLOR: Record<'ok' | 'warn' | 'error', string> = {
  ok: 'var(--green)',
  warn: '#fbbf24',
  error: 'var(--red)',
}

const zoomButtonStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 5,
  color: '#7b88aa',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'monospace',
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
  /** UX round 3 (issue 1): a click on a port ROW rather than its connector dot.
   * The caller selects the node and focuses that field; wiring stays on the
   * dots. Without this the row click bubbles to `onSelectNode` instead, which
   * is still a select — just with no field to focus. */
  onPortRowClick?: (nodeId: string, port: Port) => void
  onSelectEdge?: (conn: Connection) => void
  selectedEdge?: Connection | null
  /** UX round 4: a clean click (pointer travelled ≤ CLICK_SLOP_PX) on the
   * canvas BACKGROUND — not on a node, edge, port or control. The caller
   * deselects, which is what closes the docked Inspector without hunting for
   * the (possibly now-covered) node that opened it. */
  onBackgroundClick?: () => void
  onDropType?: (type: string) => void
  /** Expression-dock drop target (Task 14): a `text/etl-formula` payload
   * dropped anywhere on the canvas routes through the SAME handler the
   * Inspector's "Insert" button uses (`ETLModifier.handleInsertExpression`)
   * — it writes into whichever field last focused a formula textarea. Node
   * boxes themselves stay untouched (`NodeBox.tsx` is never modified — see
   * task-14-report.md), so this is canvas-wide rather than per-field. */
  onDropFormula?: (formula: string) => void
  /** Per-node conformance status (Task 13): renders a 6px dot in the node's
   * header, colored by severity — `--red` (error) beats `#fbbf24` (warn)
   * beats `--green` (ok); a node absent from the map gets no dot at all. */
  nodeStatus?: Record<string, 'ok' | 'warn' | 'error'>
}) {
  const {
    nodes,
    connections,
    selectedNode,
    onSelectNode,
    offsets,
    onMoveNode,
    onAutoLayout,
    onPortClick,
    onPortRowClick,
    onSelectEdge,
    selectedEdge,
    onDropType,
    onDropFormula,
    nodeStatus,
    onBackgroundClick,
  } = props

  const [pan, setPan] = useState({ x: 30, y: 30 })
  const [zoom, setZoom] = useState(1)
  const panDragging = useRef(false)
  const lastPan = useRef({ x: 0, y: 0 })
  const nodeDrag = useRef<NodeDrag | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  // Where the current gesture pressed down (client space) — lets the click
  // handler below tell a background CLICK from the click event a pan emits.
  const downPos = useRef<{ x: number; y: number } | null>(null)

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
  const bandMembers: Record<Band, typeof positioned> = {
    sources: [],
    transformations: [],
    target: [],
  }
  for (const n of positioned) bandMembers[bandOf(n)].push(n)

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.max(0.3, Math.min(2.5, z - e.deltaY * 0.001)))
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Recorded for EVERY press (before any guard): the click-vs-pan test in
      // handleBackgroundClick below needs the press position even when this
      // handler goes on to bail out of starting a pan.
      downPos.current = { x: e.clientX, y: e.clientY }
      // Guard: a node drag already claimed this gesture (its own onPointerDown
      // ran first, during the same bubble phase) — pan must not also start.
      if (nodeDrag.current) return
      if ((e.target as Element).closest('g[style*="pointer"]')) return
      panDragging.current = true
      lastPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
    },
    [pan],
  )

  // UX round 4: a clean background click deselects (the caller closes the
  // Inspector). Exclusions, in order: anything inside a node's WRAPPER `<g>`
  // (structural, by data-testid — live-browser finding: the second click of a
  // double-click retargets to that wrapper, whose only inline style is
  // `touch-action: none`, so a cursor-substring check missed it and the
  // handler closed the panel the first click had just opened), anything
  // interactive by its own inline cursor (edge hit `<path>`s — their handlers
  // stopPropagation anyway, this is belt-and-braces), the HTML controls
  // overlaying the canvas (zoom/auto-layout buttons), and any gesture that
  // travelled beyond the click slop (a pan's release click).
  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onBackgroundClick) return
      const target = e.target as Element
      if (
        target.closest(
          '[data-testid^="ipc-node-"], g[style*="pointer"], path[style*="pointer"], button',
        )
      )
        return
      const d = downPos.current
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_SLOP_PX) return
      onBackgroundClick()
    },
    [onBackgroundClick],
  )

  // Reveal-on-select (UX round 4): when selection lands on a node that sits
  // (partly) outside the visible viewport — typically because the docked
  // Inspector just claimed the right third of it — pan the minimal distance
  // that brings the node back inside. Keyed on the selected id ONLY: pans and
  // zooms the operator makes while a node stays selected are their own.
  useEffect(() => {
    if (!selectedNode) return
    const el = rootRef.current
    if (!el || el.clientWidth === 0) return // jsdom / not laid out yet
    const n = nodes.find(node => node.id === selectedNode)
    if (!n) return
    const off = offsets[n.id]
    const rect = {
      x: n.x + (off?.x ?? 0),
      y: n.y + (off?.y ?? 0),
      w: NODE_WIDTH,
      h: getNodeHeight(n, zoom < 0.65),
    }
    const next = revealPan({ w: el.clientWidth, h: el.clientHeight }, pan, zoom, rect)
    if (next) setPan(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
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
    },
    [zoom, onMoveNode],
  )

  const onPointerUp = useCallback(() => {
    nodeDrag.current = null
    panDragging.current = false
  }, [])

  const startNodeDrag = (id: string) => (e: React.PointerEvent) => {
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
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
      ref={rootRef}
      data-testid="ipc-canvas-root"
      style={{
        flex: 1,
        background: 'var(--bg)',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'grab',
      }}
      onWheel={onWheel}
      onClick={handleBackgroundClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onDragOver={
        onDropType || onDropFormula ? (e: React.DragEvent) => e.preventDefault() : undefined
      }
      onDrop={
        onDropType || onDropFormula
          ? (e: React.DragEvent) => {
              e.preventDefault()
              const type = e.dataTransfer.getData('text/etl-type')
              if (type && onDropType) {
                onDropType(type)
                return
              }
              const formula = e.dataTransfer.getData('text/etl-formula')
              if (formula && onDropFormula) onDropFormula(formula)
            }
          : undefined
      }
    >
      {/* dot grid */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        <defs>
          <pattern
            id="ipcdot"
            x={pan.x % 22}
            y={pan.y % 22}
            width="22"
            height="22"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="11" cy="11" r="0.7" fill="rgba(42,48,80,0.8)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ipcdot)" />
      </svg>

      <svg
        width={canvasW * zoom}
        height={canvasH * zoom}
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        style={{
          transform: `translate(${pan.x}px,${pan.y}px)`,
          position: 'absolute',
          overflow: 'visible',
        }}
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
              <rect
                x={minX}
                y={0}
                width={maxX - minX}
                height={canvasH}
                fill="rgba(42,48,80,0.18)"
                stroke="var(--border-subtle)"
                strokeWidth={1}
              />
              <text
                x={minX + 8}
                y={16}
                fill="#4a5570"
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
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
          const fi = fn.ports.findIndex(
            p => p.name === conn.fromPort && (p.direction === 'OUT' || p.direction === 'IN/OUT'),
          )
          const ti = tn.ports.findIndex(
            p => p.name === conn.toPort && (p.direction === 'IN' || p.direction === 'IN/OUT'),
          )
          const x1 = fn.x + NODE_WIDTH
          const y1 = fi >= 0 && !compact ? getPortY(fn, fi) : fn.y + getNodeHeight(fn, compact) / 2
          const x2 = tn.x
          const y2 = ti >= 0 && !compact ? getPortY(tn, ti) : tn.y + getNodeHeight(tn, compact) / 2
          const hi =
            selectedNode === conn.fromNode ||
            selectedNode === conn.toNode ||
            sameConnection(selectedEdge, conn)
          const d = buildPath(x1, y1, x2, y2)
          const handleClick = onSelectEdge
            ? (e: React.MouseEvent) => {
                e.stopPropagation()
                onSelectEdge(conn)
              }
            : undefined
          return [
            <path
              key={`${i}-hit`}
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              onClick={handleClick}
              style={onSelectEdge ? { cursor: 'pointer' } : undefined}
            />,
            <path
              key={i}
              d={d}
              fill="none"
              stroke={hi ? '#4f9cf9' : '#2a3050'}
              strokeWidth={hi ? 1.5 : 1}
              markerEnd={hi ? 'url(#ipca-hi)' : 'url(#ipca)'}
              onClick={handleClick}
              style={onSelectEdge ? { cursor: 'pointer' } : undefined}
            />,
          ]
        })}

        {/* nodes — every position derives from `positioned`, computed once above */}
        {positioned.map(n => {
          const status = nodeStatus?.[n.id]
          return (
            <g
              key={n.id}
              data-testid={`ipc-node-${n.id}`}
              onPointerDown={startNodeDrag(n.id)}
              style={{ touchAction: 'none' }}
            >
              <NodeBox
                node={n}
                isSelected={selectedNode === n.id}
                onClick={() => onSelectNode(n.id)}
                compact={compact}
                onPortClick={onPortClick}
                onPortRowClick={onPortRowClick}
                hoverHighlight
              />
              {status && (
                <circle
                  data-testid={`ipc-node-status-${n.id}`}
                  cx={n.x + NODE_WIDTH - 10}
                  cy={n.y + 10}
                  r={3}
                  fill={STATUS_DOT_COLOR[status]}
                  stroke="rgba(0,0,0,0.4)"
                  strokeWidth={0.5}
                />
              )}
            </g>
          )
        })}
      </svg>

      {/* zoom controls + auto-layout */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {[
          { icon: '+', fn: () => setZoom(z => Math.min(2.5, z + 0.2)) },
          { icon: '−', fn: () => setZoom(z => Math.max(0.3, z - 0.2)) },
          {
            icon: '⊡',
            fn: () => {
              setZoom(1)
              setPan({ x: 30, y: 30 })
            },
          },
        ].map(({ icon, fn }) => (
          <button
            key={icon}
            onClick={fn}
            style={{ ...zoomButtonStyle, fontSize: icon === '⊡' ? 12 : 16 }}
          >
            {icon}
          </button>
        ))}
        <button
          onClick={() => onAutoLayout?.()}
          title="auto-layout"
          aria-label="auto-layout"
          style={{ ...zoomButtonStyle, fontSize: 14 }}
        >
          ⌗
        </button>
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          padding: '2px 7px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          fontSize: 10,
          color: '#4a5570',
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        {Math.round(zoom * 100)}%
      </div>
    </div>
  )
}
