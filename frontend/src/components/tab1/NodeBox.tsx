import { useState } from 'react'
import type { ETLNode, Port } from '../../types'

export const NODE_WIDTH = 195
export const NODE_HEADER_H = 44
export const NODE_PORT_H = 22

/** Click radius of a connector dot, as opposed to the 4px radius it is PAINTED
 * at. A transparent circle of this size sits on top of the painted one so the
 * wire handle is comfortably hittable without changing how it looks (ADR-0005:
 * the visual contract covers what is drawn, not what is clickable). Rendered
 * only when `onPortClick` is supplied — Tab 1 never passes it, so its nodes
 * gain no extra elements at all. */
const PORT_HIT_R = 9

export const NODE_STYLES: Record<string, { color: string; bg: string; border: string; abbr: string }> = {
  source:     { color: '#34d399', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.3)',  abbr: 'SRC' },
  sq:         { color: '#22d3ee', bg: 'rgba(34,211,238,0.08)',  border: 'rgba(34,211,238,0.3)',  abbr: 'SQ'  },
  expression: { color: '#818cf8', bg: 'rgba(129,140,248,0.08)', border: 'rgba(129,140,248,0.3)', abbr: 'EXP' },
  lookup:     { color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.3)', abbr: 'LKP' },
  joiner:     { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.3)',  abbr: 'JNR' },
  aggregator: { color: '#fb923c', bg: 'rgba(251,146,60,0.08)',  border: 'rgba(251,146,60,0.3)',  abbr: 'AGG' },
  router:     { color: '#f472b6', bg: 'rgba(244,114,182,0.08)', border: 'rgba(244,114,182,0.3)', abbr: 'RTR' },
  filter:     { color: '#67e8f9', bg: 'rgba(103,232,249,0.08)', border: 'rgba(103,232,249,0.3)', abbr: 'FLT' },
  target:     { color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.3)', abbr: 'TGT' },
}

export function getNodeHeight(node: ETLNode, compact = false) {
  return compact ? 26 : NODE_HEADER_H + node.ports.length * NODE_PORT_H + 10
}

export function getPortY(node: ETLNode, portIndex: number) {
  return node.y + NODE_HEADER_H + portIndex * NODE_PORT_H + NODE_PORT_H / 2
}

export function buildPath(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.abs(x2 - x1) * 0.5
  return `M ${x1} ${y1} C ${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`
}

export function NodeBox({
  node,
  isSelected,
  onClick,
  compact = false,
  onPortClick,
  onPortRowClick,
  hoverHighlight = false,
}: {
  node: ETLNode
  isSelected: boolean
  onClick: () => void
  compact?: boolean
  /** Task 9 (ETL Modifier click-wire) — optional, behavior-only: when provided,
   * each port's CONNECTOR DOT gains its own onClick (stopping propagation to the
   * node's own onClick above) firing `onPortClick(node.id, port)`. Tab 1
   * (ETLViewer) never passes this, so its ports stay non-interactive and
   * node.onClick is the only handler that ever fires there — zero visual or
   * behavioral change.
   *
   * (UX round 3, issue 1: this used to sit on the whole port ROW `<g>`, which
   * meant every click below the 44px header armed a wire instead of selecting
   * the node — the Inspector never opened for a click anywhere on the node's
   * body, which is most of its surface. The handler moved down onto the dots,
   * where a wire handle belongs; the row reports through `onPortRowClick`.) */
  onPortClick?: (nodeId: string, port: Port) => void
  /** UX round 3 — optional, behavior-only, Tab 2 only: a click on the port row
   * itself (its label / data type / the body behind them). Distinct from
   * `onPortClick` so the caller can select the node and focus that field rather
   * than start a wire. When absent, a row click simply bubbles to the node's own
   * `onClick`, which is Tab 1's unchanged behavior. */
  onPortRowClick?: (nodeId: string, port: Port) => void
  /** UX round 4 — optional, behavior-only, Tab 2 only: paint the body stroke
   * in the kind color while the pointer is over the node, so a box reads as
   * clickable BEFORE it is clicked ("show the boxes more clickable"). Tab 1
   * never passes this, so its nodes gain no handlers and no visual change —
   * same opt-in idiom as `onPortClick`/`onPortRowClick` above (ADR-0005: the
   * contract covers what is drawn at rest, not an explicitly-asked-for hover
   * affordance on another tab). */
  hoverHighlight?: boolean
}) {
  const style = NODE_STYLES[node.type] ?? NODE_STYLES.source
  const h = getNodeHeight(node, compact)
  const [hovered, setHovered] = useState(false)
  // Selection always wins: hover brightens an unselected node's stroke to the
  // kind color at width 1.5; a selected node keeps its 2px selection stroke.
  const highlighted = hoverHighlight && hovered
  const bodyStroke = isSelected || highlighted ? style.color : style.border
  const bodyStrokeWidth = isSelected ? 2 : highlighted ? 1.5 : 1
  const hoverHandlers = hoverHighlight
    ? { onPointerEnter: () => setHovered(true), onPointerLeave: () => setHovered(false) }
    : {}

  // Zoom-collapse pill (Task 6): below zoom 0.65 the caller passes
  // compact=true. Mirrors OperationalCard.tsx's compact pill VALUES (rx,
  // height, dot size, tail-truncated mono name) as a sanctioned SVG copy —
  // ports/connector circles/ƒ badges are dropped; edges fall back to the
  // node-center anchor already used when a port row can't be found.
  // Human-sanctioned 2026-07-30: unlike OperationalCard's compact branch
  // (which takes but never reads a `selected` prop, staying visually inert),
  // this pill DOES swap to the selected stroke so search highlight/selection
  // stays visible below the 0.65 zoom threshold — a deliberate deviation from
  // the OperationalCard parity above.
  if (compact) {
    const w = Math.min(200, Math.max(90, 24 + node.name.length * 6))
    return (
      <g onClick={onClick} style={{ cursor: 'pointer' }} {...hoverHandlers}>
        <rect
          data-testid={`node-body-${node.id}`}
          x={node.x} y={node.y}
          width={w} height={h} rx={16}
          fill={style.bg}
          stroke={bodyStroke}
          strokeWidth={bodyStrokeWidth}
        />
        <rect x={node.x + 10} y={node.y + h / 2 - 3} width={6} height={6} rx={3} fill={style.color} />
        <text x={node.x + 22} y={node.y + h / 2 + 3.5} fill="#c8d3e8"
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>
          <title>{node.name}</title>
          {node.name.length > 22 ? '…' + node.name.slice(-20) : node.name}
        </text>
      </g>
    )
  }

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }} {...hoverHandlers}>
      {/* drop shadow */}
      <rect x={node.x + 2} y={node.y + 3} width={NODE_WIDTH} height={h} rx={7} fill="rgba(0,0,0,0.45)" />
      {/* body */}
      <rect
        data-testid={`node-body-${node.id}`}
        x={node.x} y={node.y}
        width={NODE_WIDTH} height={h} rx={7}
        fill={style.bg}
        stroke={bodyStroke}
        strokeWidth={bodyStrokeWidth}
      />
      {/* header fill */}
      <rect x={node.x} y={node.y} width={NODE_WIDTH} height={NODE_HEADER_H} rx={7} fill={`${style.color}14`} />
      <rect x={node.x} y={node.y + NODE_HEADER_H - 8} width={NODE_WIDTH} height={8} fill={`${style.color}14`} />
      <rect x={node.x} y={node.y + NODE_HEADER_H - 1} width={NODE_WIDTH} height={1} fill={style.border} />

      {/* abbr chip */}
      <rect x={node.x + 8} y={node.y + 11} width={32} height={18} rx={4} fill={`${style.color}22`} stroke={style.border} strokeWidth={1} />
      <text x={node.x + 24} y={node.y + 23} textAnchor="middle" fill={style.color}
        style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8.5, fontWeight: 700 }}>
        {node.label && node.label !== style.abbr ? node.label : style.abbr}
      </text>

      {/* name */}
      <text x={node.x + 46} y={node.y + 21} fill={style.color}
        style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700 }}>
        <title>{node.name}</title>
        {node.name.length > 17 ? node.name.slice(0, 16) + '…' : node.name}
      </text>
      <text x={node.x + 46} y={node.y + 34} fill="#3a4560"
        style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8.5 }}>
        {node.file.length > 24 ? node.file.slice(0, 23) + '…' : node.file}
      </text>

      {/* ports */}
      {node.ports.map((port, i) => {
        const py = getPortY(node, i)
        const isOut = port.direction === 'OUT' || port.direction === 'IN/OUT'
        const isIn = port.direction === 'IN' || port.direction === 'IN/OUT'
        const hasExpr = Boolean(port.expression)
        const wireClick = onPortClick
          ? (e: React.MouseEvent) => { e.stopPropagation(); onPortClick(node.id, port) }
          : undefined
        const rowClick = onPortRowClick
          ? (e: React.MouseEvent) => { e.stopPropagation(); onPortRowClick(node.id, port) }
          : undefined
        return (
          <g key={i} onClick={rowClick} style={rowClick ? { cursor: 'pointer' } : undefined}>
            {isIn && (
              <circle cx={node.x} cy={py} r={4} fill={port.linked ? style.color : '#1e2438'} stroke={style.border} strokeWidth={1} />
            )}
            {isOut && (
              <circle cx={node.x + NODE_WIDTH} cy={py} r={4} fill={port.linked ? style.color : '#1e2438'} stroke={style.border} strokeWidth={1} />
            )}
            {/* expression indicator */}
            {hasExpr && (
              <rect x={node.x + NODE_WIDTH - 20} y={py - 5} width={10} height={10} rx={2}
                fill="rgba(129,140,248,0.2)" stroke="rgba(129,140,248,0.4)" strokeWidth={1} />
            )}
            {hasExpr && (
              <text x={node.x + NODE_WIDTH - 15} y={py + 4} textAnchor="middle" fill="#818cf8"
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 7, fontWeight: 700 }}>ƒ</text>
            )}
            <text x={node.x + 12} y={py + 4} fill={port.linked ? '#c8d3e8' : '#3a4560'}
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5 }}>
              {port.name}
            </text>
            <text x={node.x + (hasExpr ? NODE_WIDTH - 26 : NODE_WIDTH - 10)} y={py + 4} textAnchor="end"
              fill="#3a4560"
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8 }}>
              {port.dataType.length > 12 ? port.dataType.slice(0, 11) + '…' : port.dataType}
            </text>
            {i < node.ports.length - 1 && (
              <line x1={node.x + 8} y1={py + NODE_PORT_H / 2} x2={node.x + NODE_WIDTH - 8} y2={py + NODE_PORT_H / 2}
                stroke="#1a1f2e" strokeWidth={1} />
            )}
            {/* Wire handles — invisible, PAINTED LAST so they sit above the row's
                own children and win the click. Their `stopPropagation` (inside
                `wireClick`) is what keeps a dot click from also reaching
                `rowClick` on the enclosing row `<g>`. */}
            {wireClick && isIn && (
              <circle data-testid={`ipc-port-in-${node.id}-${port.name}`}
                cx={node.x} cy={py} r={PORT_HIT_R} fill="transparent"
                onClick={wireClick} style={{ cursor: 'crosshair' }}>
                <title>{`${port.name} — click to wire`}</title>
              </circle>
            )}
            {wireClick && isOut && (
              <circle data-testid={`ipc-port-out-${node.id}-${port.name}`}
                cx={node.x + NODE_WIDTH} cy={py} r={PORT_HIT_R} fill="transparent"
                onClick={wireClick} style={{ cursor: 'crosshair' }}>
                <title>{`${port.name} — click to wire`}</title>
              </circle>
            )}
          </g>
        )
      })}

      {/* selected glow */}
      {isSelected && (
        <rect x={node.x - 2} y={node.y - 2} width={NODE_WIDTH + 4} height={h + 4} rx={9}
          fill="none" stroke={style.color} strokeWidth={0.5} opacity={0.4} />
      )}
    </g>
  )
}
