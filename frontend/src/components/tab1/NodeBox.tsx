import type { ETLNode } from '../../types'

export const NODE_WIDTH = 195
export const NODE_HEADER_H = 44
export const NODE_PORT_H = 22

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
}: {
  node: ETLNode
  isSelected: boolean
  onClick: () => void
  compact?: boolean
}) {
  const style = NODE_STYLES[node.type] ?? NODE_STYLES.source
  const h = getNodeHeight(node, compact)

  // Zoom-collapse pill (Task 6): below zoom 0.65 the caller passes
  // compact=true. Mirrors OperationalCard.tsx's compact pill VALUES (rx,
  // height, dot size, tail-truncated mono name) as a sanctioned SVG copy —
  // ports/connector circles/ƒ badges are dropped; edges fall back to the
  // node-center anchor already used when a port row can't be found.
  // Per the brief's exhaustive element list, the pill is visually inert to
  // selection (mirrors OperationalCard's compact branch, which takes but
  // never reads a `selected` prop) — no isSelected stroke swap here.
  if (compact) {
    const w = Math.min(200, Math.max(90, 24 + node.name.length * 6))
    return (
      <g onClick={onClick} style={{ cursor: 'pointer' }}>
        <rect
          x={node.x} y={node.y}
          width={w} height={h} rx={16}
          fill={style.bg}
          stroke={style.border}
          strokeWidth={1}
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
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* drop shadow */}
      <rect x={node.x + 2} y={node.y + 3} width={NODE_WIDTH} height={h} rx={7} fill="rgba(0,0,0,0.45)" />
      {/* body */}
      <rect
        x={node.x} y={node.y}
        width={NODE_WIDTH} height={h} rx={7}
        fill={style.bg}
        stroke={isSelected ? style.color : style.border}
        strokeWidth={isSelected ? 2 : 1}
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
        return (
          <g key={i}>
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
