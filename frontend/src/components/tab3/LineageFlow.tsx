import { useMemo, useState } from 'react'
import {
  useLineage, LINEAGE_DEFAULT_LIMIT, LINEAGE_MAX_LIMIT,
  type LineageNodeT, type LineageT,
} from '../../api/clusterQueries'
import { OperationalCard } from '../shared/OperationalCard'
import { statusColor, kindPalette } from '../../theme/semanticColors'
import type { ApiError } from '../../api/client'
import type { OperationalCard as CardData } from '../../types'

// ─── LineageFlow ────────────────────────────────────────────────────────────
//
// "Show all related" used to be a one-hop neighbour LIST. The question an operator has in front
// of a failed table is "where did this come from, and what breaks next" — a path, not a set — so
// a list made you re-open the overlay at every step and reassemble the chain in your head.
//
// The x-axis is HOP DISTANCE, not layer: the seed sits in the middle, everything feeding it to
// the left, everything it feeds to the right. Upstream-vs-downstream is what troubleshooting
// asks first, so it gets the primary reading. (Layer is still visible — it is the chip colour on
// every card, from the same palette the main canvas uses.)

/** The box each node occupies. Same discipline as the canvas: a footprint, and a pitch derived from it. */
export const LINEAGE_FOOTPRINT = { width: 220, height: 56 }
const LINEAGE_GUTTER = { col: 90, row: 26 }
const LINEAGE_ORIGIN = { x: 24, y: 24 }

export interface PlacedNode extends LineageNodeT {
  x: number
  y: number
}

/**
 * Positions every node in hop-distance columns, stacking within a column by average predecessor y
 * then name — the same ordering `layoutCards` uses in `relationshipsAdapter.ts`, so the two views
 * read alike rather than each inventing a stacking rule.
 *
 * Pure, so the geometry is unit-testable: jsdom cannot measure, but it can check that no two
 * boxes intersect.
 */
export function layoutLineage(nodes: LineageNodeT[], edges: LineageT['edges']): PlacedNode[] {
  if (nodes.length === 0) return []

  const hops = [...new Set(nodes.map(n => n.hop))].sort((a, b) => a - b)
  const columnOf = new Map(hops.map((h, i) => [h, i]))

  const preds = new Map<string, string[]>()
  for (const n of nodes) preds.set(n.id, [])
  for (const e of edges) preds.get(e.to)?.push(e.from)

  const yById = new Map<string, number>()
  const placed: PlacedNode[] = []

  for (const hop of hops) {
    const column = nodes.filter(n => n.hop === hop)
    const avgPredY = (n: LineageNodeT): number => {
      const ys = (preds.get(n.id) ?? []).map(p => yById.get(p)).filter((y): y is number => y !== undefined)
      return ys.length === 0 ? 0 : ys.reduce((a, b) => a + b, 0) / ys.length
    }
    column.sort((a, b) => avgPredY(a) - avgPredY(b) || a.name.localeCompare(b.name))
    column.forEach((n, i) => {
      const x = LINEAGE_ORIGIN.x + columnOf.get(hop)! * (LINEAGE_FOOTPRINT.width + LINEAGE_GUTTER.col)
      const y = LINEAGE_ORIGIN.y + i * (LINEAGE_FOOTPRINT.height + LINEAGE_GUTTER.row)
      yById.set(n.id, y)
      placed.push({ ...n, x, y })
    })
  }
  return placed
}

/** The adapter's card shape, from a lineage node. Status is resolved by the seed's own graph, so
 * a lineage node carries no history of its own — it renders as the structural node it is. */
function toCard(n: LineageNodeT, status: CardData['status']): CardData {
  return {
    id: n.id, kind: n.kind, name: n.name, layer: n.layer, status,
    lastRun: '1970-01-01T00:00:00Z', history: [],
    stats: { avg_time_s: 0, p50: 0, p95: 0, p99: 0, avg_count: 0 },
    relations: [],
  }
}

export function LineageFlow({
  nodeId,
  statusById = {},
  onFocus,
}: {
  nodeId: string
  /** Status per node id, from the caller's already-loaded graph. Absent ids render PENDING. */
  statusById?: Record<string, CardData['status']>
  onFocus?: (nodeId: string) => void
}) {
  const [limit, setLimit] = useState(LINEAGE_DEFAULT_LIMIT)
  const lineage = useLineage(nodeId, limit)

  const placed = useMemo(
    () => (lineage.data ? layoutLineage(lineage.data.nodes, lineage.data.edges) : []),
    [lineage.data],
  )
  const posById = useMemo(() => new Map(placed.map(p => [p.id, p])), [placed])

  if (lineage.isLoading) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--text-dim)' }}>Tracing the lineage…</div>
  }
  if (lineage.error) {
    const e = lineage.error as ApiError
    return (
      <div style={{ padding: 16, fontSize: 12, color: 'var(--red)' }}>
        <div>{e.title}</div>{e.detail && <div>{e.detail}</div>}
      </div>
    )
  }

  const data = lineage.data!
  if (data.nodes.length === 0) {
    return (
      <div data-testid="lineage-empty" style={{ padding: 16, fontSize: 12, color: 'var(--text-dim)' }}>
        Nothing in the relationships graph flows into or out of this node.
      </div>
    )
  }

  const upstream = data.nodes.filter(n => n.hop < 0).length
  const downstream = data.nodes.filter(n => n.hop > 0).length
  const width = Math.max(...placed.map(p => p.x + LINEAGE_FOOTPRINT.width)) + LINEAGE_ORIGIN.x
  const height = Math.max(...placed.map(p => p.y + LINEAGE_FOOTPRINT.height)) + LINEAGE_ORIGIN.y + 22

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '6px 2px 10px', fontSize: 11,
      }}>
        <span data-testid="lineage-summary" style={{
          color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace',
        }}>
          {`${upstream} upstream · ${downstream} downstream · ${data.nodes.length} nodes`}
        </span>
        {data.truncated && (
          // Never let a capped flow read as a complete one.
          <span data-testid="lineage-truncation" style={{
            color: 'var(--yellow)', fontFamily: 'JetBrains Mono, monospace',
          }}>
            {`⚠ showing ${data.nodes.length} of ${data.totalReachable} — nearest hops complete`}
          </span>
        )}
        {data.truncated && limit < LINEAGE_MAX_LIMIT && (
          <button
            onClick={() => setLimit(Math.min(LINEAGE_MAX_LIMIT, limit * 2))}
            style={{
              padding: '2px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
              background: 'var(--surface-3)', border: '1px solid var(--border)',
              color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace',
            }}
          >expand →</button>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>upstream ◀── seed ──▶ downstream</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <div style={{ position: 'relative', width, height }}>
          <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
            <defs>
              <marker id="lin-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M0 1 L6 3.5 L0 6 Z" fill="var(--border)" />
              </marker>
            </defs>
            {data.edges.map((e, i) => {
              const a = posById.get(e.from), b = posById.get(e.to)
              if (!a || !b) return null
              const x1 = a.x + LINEAGE_FOOTPRINT.width, y1 = a.y + LINEAGE_FOOTPRINT.height / 2
              const x2 = b.x, y2 = b.y + LINEAGE_FOOTPRINT.height / 2
              const mid = (x1 + x2) / 2
              return (
                <path
                  key={`${e.from}|${e.to}|${e.kind}|${i}`}
                  data-lineage-edge={e.kind}
                  d={`M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth={1.2}
                  // A lookup is a reference, not a data write — dashed, as elsewhere in the app.
                  strokeDasharray={e.kind === 'lookup' ? '3 3' : undefined}
                  markerEnd="url(#lin-arrow)"
                />
              )
            })}
          </svg>

          {placed.map(n => {
            const isSeed = n.id === data.seed
            return (
              <div
                key={n.id}
                data-testid={isSeed ? 'lineage-seed' : 'lineage-node'}
                onClick={() => onFocus?.(n.id)}
                style={{
                  position: 'absolute', left: n.x, top: n.y,
                  width: LINEAGE_FOOTPRINT.width,
                  cursor: onFocus ? 'pointer' : 'default',
                  // The seed is ringed in its own kind's accent so it stays findable in a wide flow.
                  outline: isSeed ? `2px solid ${kindPalette(n.kind).accent}` : 'none',
                  outlineOffset: 2, borderRadius: 8,
                }}
              >
                <OperationalCard card={toCard(n, statusById[n.id] ?? 'PENDING')} density="compact" />
              </div>
            )
          })}

          {/* Hop ruler: the axis is the whole point of this view, so it is labelled. */}
          {[...new Set(placed.map(p => p.hop))].sort((a, b) => a - b).map(hop => {
            const x = placed.find(p => p.hop === hop)!.x
            return (
              <div key={hop} style={{
                position: 'absolute', left: x, top: height - 20, width: LINEAGE_FOOTPRINT.width,
                fontSize: 9, color: hop === 0 ? statusColor('OK') : 'var(--text-dim)',
                fontFamily: 'JetBrains Mono, monospace', textAlign: 'center',
              }}>
                {hop === 0 ? '◉ selected' : hop < 0 ? `${hop}` : `+${hop}`}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
