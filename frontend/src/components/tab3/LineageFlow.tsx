import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useLineage,
  LINEAGE_DEFAULT_LIMIT,
  LINEAGE_MAX_LIMIT,
  type LineageNodeT,
} from '../../api/clusterQueries'
import { OperationalCard } from '../shared/OperationalCard'
import { MultiFilterChips } from '../shared/MultiFilterChips'
import { layerColor, kindPalette, statusColor } from '../../theme/semanticColors'
import { layoutLineage, LINEAGE_FOOTPRINT, type PlacedNode } from './lineageLayout'
import type { ApiError } from '../../api/client'
import type { OperationalCard as CardData } from '../../types'

// ─── LineageFlow ────────────────────────────────────────────────────────────
//
// One node's upstream+downstream lineage, drawn as a banded layered DAG. The geometry all lives
// in `lineageLayout.ts` (pure, corpus-validated); this file is presentation and interaction.
//
// Three things carry the legibility, in order of how much they matter when a graph gets dense:
//   1. TIER BANDS — a vertical position means the same thing in every column.
//   2. ROUTED long edges — an edge spanning columns travels a reserved lane instead of
//      disappearing behind the cards in between (50 of 81 real lineages have one).
//   3. TRACING — hovering a node lights its whole ancestor+descendant path and dims the rest.
//      In a 26-node flow this is the actual troubleshooting tool.
//
// Dragging is an ADD-ON: offsets are applied at render only, never fed back into the layout, so
// `reset layout` returns the view to exactly what `layoutLineage` computes. The default has to
// be excellent on its own.

const BAND_TINT: Record<string, string> = {
  bronze: 'rgba(176,118,74,0.05)',
  silver: 'rgba(154,166,184,0.05)',
  gold: 'rgba(212,165,55,0.05)',
  platinum: 'rgba(207,216,230,0.05)',
  unresolved: 'rgba(74,85,112,0.05)',
}
const BAND_INK: Record<string, string> = {
  bronze: '#b0764a',
  silver: '#9aa6b8',
  gold: '#d4a537',
  platinum: '#cfd8e6',
  unresolved: '#4a5570',
}
/** Left gutter the tier rails label. Exported so tests can map layout coords to rendered ones. */
export const RAIL_W = 96

function toCard(n: LineageNodeT, status: CardData['status']): CardData {
  return {
    id: n.id,
    kind: n.kind,
    name: n.name,
    layer: n.layer,
    status,
    lastRun: '1970-01-01T00:00:00Z',
    history: [],
    stats: { avg_time_s: 0, p50: 0, p95: 0, p99: 0, avg_count: 0 },
    relations: [],
  }
}

/** A smooth path through the layout's waypoints — one cubic per column gap, so a routed edge
 *  visibly travels its lane rather than cutting the corner back through a card. */
function pathThrough(points: { x: number; y: number }[]): string {
  if (points.length < 2) return ''
  let d = `M${points[0]!.x} ${points[0]!.y}`
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!,
      b = points[i + 1]!
    const mid = (a.x + b.x) / 2
    d += ` C${mid} ${a.y} ${mid} ${b.y} ${b.x} ${b.y}`
  }
  return d
}

export function LineageFlow({
  nodeId,
  statusById = {},
  selectedClusters = [],
  onSelect,
  onReseed,
}: {
  nodeId: string
  statusById?: Record<string, CardData['status']>
  /** Clusters currently scoped in the main view — the strip marks which of the lineage's are in it. */
  selectedClusters?: string[]
  /** Single click. Also syncs the canvas behind the overlay (spec §6.3). */
  onSelect?: (nodeId: string) => void
  /** Double click, or the dock's explicit control. */
  onReseed?: (nodeId: string) => void
}) {
  const [limit, setLimit] = useState(LINEAGE_DEFAULT_LIMIT)
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [layerFilter, setLayerFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [offsets, setOffsets] = useState<Record<string, { dx: number; dy: number }>>({})
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ id: string; x: number; y: number } | null>(null)

  const lineage = useLineage(nodeId, limit)
  const layout = useMemo(
    () => (lineage.data ? layoutLineage(lineage.data.nodes, lineage.data.edges) : null),
    [lineage.data],
  )

  // Reset manual arrangement whenever the lineage itself changes — offsets are keyed by node id
  // and would otherwise land on unrelated nodes after a re-seed.
  useEffect(() => {
    setOffsets({})
    setSelected(null)
  }, [nodeId])

  const at = (p: PlacedNode) => {
    const o = offsets[p.id]
    return { x: p.x + (o?.dx ?? 0), y: p.y + (o?.dy ?? 0) }
  }

  // Ancestors + descendants of the traced node, over the ORIGINAL edges (not the routed chains,
  // whose dummies are not nodes anyone can trace to).
  //
  // Hover PREVIEWS a trace; selection PINS it. Hover alone would drop the highlight the instant
  // you moved the pointer toward the Details dock to read it — i.e. exactly when you wanted it.
  const traceRoot = hovered ?? selected
  const traced = useMemo(() => {
    if (!traceRoot || !lineage.data) return null
    const up = new Map<string, string[]>(),
      down = new Map<string, string[]>()
    for (const e of lineage.data.edges) {
      if (!down.has(e.from)) down.set(e.from, [])
      if (!up.has(e.to)) up.set(e.to, [])
      down.get(e.from)!.push(e.to)
      up.get(e.to)!.push(e.from)
    }
    const seen = new Set<string>([traceRoot])
    for (const dir of [up, down]) {
      const queue = [traceRoot]
      while (queue.length) {
        const cur = queue.pop()!
        for (const nxt of dir.get(cur) ?? []) {
          if (seen.has(nxt)) continue
          seen.add(nxt)
          queue.push(nxt)
        }
      }
    }
    return seen
  }, [traceRoot, lineage.data])

  const matchesFilter = (n: LineageNodeT) =>
    (layerFilter.length === 0 || layerFilter.includes(n.layer)) &&
    (statusFilter.length === 0 || statusFilter.includes(statusById[n.id] ?? 'PENDING'))

  const seedX = layout?.nodes.find(p => p.id === lineage.data?.seed)?.x
  useEffect(() => {
    const el = scrollRef.current
    if (!el || seedX === undefined) return
    el.scrollLeft = Math.max(0, seedX + LINEAGE_FOOTPRINT.width / 2 - el.clientWidth / 2)
  }, [seedX])

  const startDrag = (e: React.PointerEvent, id: string) => {
    e.preventDefault()
    const o = offsets[id] ?? { dx: 0, dy: 0 }
    dragRef.current = { id, x: e.clientX - o.dx, y: e.clientY - o.dy }
    const move = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      setOffsets(prev => ({ ...prev, [d.id]: { dx: ev.clientX - d.x, dy: ev.clientY - d.y } }))
    }
    const up = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  if (lineage.isLoading) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: 'var(--text-dim)' }}>
        Tracing the lineage…
      </div>
    )
  }
  if (lineage.error) {
    const e = lineage.error as ApiError
    return (
      <div style={{ padding: 16, fontSize: 12, color: 'var(--red)' }}>
        <div>{e.title}</div>
        {e.detail && <div>{e.detail}</div>}
      </div>
    )
  }

  const data = lineage.data!
  if (data.nodes.length === 0 || !layout) {
    return (
      <div
        data-testid="lineage-empty"
        style={{ padding: 16, fontSize: 12, color: 'var(--text-dim)' }}
      >
        Nothing in the relationships graph flows into or out of this node.
      </div>
    )
  }

  const byId = new Map(data.nodes.map(n => [n.id, n]))
  const upstream = data.nodes.filter(n => n.hop < 0).length
  const downstream = data.nodes.filter(n => n.hop > 0).length
  const dimmedCount = data.nodes.filter(n => !matchesFilter(n)).length

  const clusterCounts = new Map<string, number>()
  for (const n of data.nodes)
    for (const c of n.clusters) clusterCounts.set(c, (clusterCounts.get(c) ?? 0) + 1)
  const clusters = [...clusterCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )

  const layers = [...new Set(data.nodes.map(n => n.layer))]
  const selectedNode = selected ? byId.get(selected) : null

  const isDim = (n: LineageNodeT) => !matchesFilter(n) || (traced !== null && !traced.has(n.id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* ── header: counts, clusters, filters ─────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 8 }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 11 }}
        >
          <span
            data-testid="lineage-summary"
            style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}
          >
            {`${upstream} upstream · ${downstream} downstream · ${data.nodes.length} nodes`}
          </span>
          {data.truncated && (
            <span
              data-testid="lineage-truncation"
              style={{ color: 'var(--yellow)', fontFamily: 'JetBrains Mono, monospace' }}
            >
              {`⚠ showing ${data.nodes.length} of ${data.totalReachable} — nearest hops complete`}
            </span>
          )}
          {data.truncated && limit < LINEAGE_MAX_LIMIT && (
            <button
              onClick={() => setLimit(Math.min(LINEAGE_MAX_LIMIT, limit * 2))}
              style={chipBtn}
            >
              expand →
            </button>
          )}
          {dimmedCount > 0 && (
            <span
              data-testid="lineage-filter-note"
              style={{ color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}
            >
              {`${dimmedCount} dimmed`}
            </span>
          )}
          {Object.keys(offsets).length > 0 && (
            <button onClick={() => setOffsets({})} style={chipBtn}>
              reset layout
            </button>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>
            click for details · double-click to re-centre · drag to arrange
          </span>
        </div>

        {clusters.length > 0 && (
          <div
            data-testid="lineage-clusters"
            style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}
          >
            <span style={{ fontSize: 10, color: '#4a5570' }}>Clusters:</span>
            {clusters.map(([name, count]) => {
              const inScope = selectedClusters.includes(name)
              return (
                <span
                  key={name}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 10,
                    padding: '1px 7px',
                    borderRadius: 999,
                    fontFamily: 'JetBrains Mono, monospace',
                    // A cluster outside the current selection is CONTEXT — the lineage crossed into
                    // it, and saying so is the point of not scoping the fetch.
                    background: inScope ? 'var(--surface-3)' : 'transparent',
                    border: `1px solid ${inScope ? 'var(--border)' : 'var(--border-subtle)'}`,
                    color: inScope ? 'var(--text)' : 'var(--text-dim)',
                  }}
                >
                  {name}
                  <span style={{ color: 'var(--text-muted)' }}>{count}</span>
                </span>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <MultiFilterChips
            testId="lineage-layer-filter"
            label="Layer"
            options={layers}
            selected={layerFilter}
            onToggle={setLayerFilter}
            colors={Object.fromEntries(layers.map(l => [l, layerColor(l)]))}
          />
          <MultiFilterChips
            testId="lineage-status-filter"
            label="Status"
            options={['OK', 'KO', 'PENDING']}
            selected={statusFilter}
            onToggle={setStatusFilter}
            colors={{ OK: '#34d399', KO: '#f87171', PENDING: '#4a5570' }}
          />
        </div>
      </div>

      {/* ── flow + details dock ───────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, gap: 10 }}>
        <div
          ref={scrollRef}
          data-testid="lineage-scroll"
          style={{ flex: 1, overflow: 'auto', minHeight: 0, position: 'relative' }}
        >
          <div
            style={{ position: 'relative', width: layout.width + RAIL_W, height: layout.height }}
          >
            {/* tier rails — sticky so the band a node sits in stays named while scrolling */}
            {layout.bands.map(b => (
              <div
                key={b.tier}
                data-testid="lineage-band"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: b.y - 8,
                  width: layout.width + RAIL_W,
                  height: b.height + 16,
                  background: BAND_TINT[b.tier],
                  borderRadius: 8,
                  borderTop: `1px solid ${BAND_INK[b.tier]}22`,
                  pointerEvents: 'none',
                }}
              />
            ))}

            <svg
              width={layout.width + RAIL_W}
              height={layout.height}
              style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            >
              <defs>
                <marker
                  id="lin-arrow"
                  markerWidth="7"
                  markerHeight="7"
                  refX="6"
                  refY="3.5"
                  orient="auto"
                >
                  <path d="M0 1 L6 3.5 L0 6 Z" fill="var(--border)" />
                </marker>
                <marker
                  id="lin-arrow-hot"
                  markerWidth="7"
                  markerHeight="7"
                  refX="6"
                  refY="3.5"
                  orient="auto"
                >
                  <path d="M0 1 L6 3.5 L0 6 Z" fill="#4f9cf9" />
                </marker>
              </defs>
              {layout.edges.map((e, i) => {
                const hot = traced !== null && traced.has(e.from) && traced.has(e.to)
                const dim = traced !== null && !hot
                const shifted = e.points.map(p => ({
                  x: p.x + RAIL_W,
                  y: p.y,
                }))
                return (
                  <path
                    key={`${e.from}|${e.to}|${e.kind}|${i}`}
                    data-lineage-edge={e.kind}
                    data-traced={hot ? 'true' : undefined}
                    data-dimmed={dim ? 'true' : undefined}
                    d={pathThrough(shifted)}
                    fill="none"
                    stroke={hot ? '#4f9cf9' : 'var(--border)'}
                    strokeWidth={hot ? 2 : 1.2}
                    strokeOpacity={dim ? 0.18 : 1}
                    strokeDasharray={e.kind === 'lookup' ? '3 3' : undefined}
                    markerEnd={hot ? 'url(#lin-arrow-hot)' : 'url(#lin-arrow)'}
                  />
                )
              })}
            </svg>

            {layout.nodes
              .filter(p => !p.isDummy)
              .map(p => {
                const n = p.node!
                const pos = at(p)
                const isSeed = p.id === data.seed
                const dim = isDim(n)
                const hot = traced !== null && traced.has(n.id)
                return (
                  <div
                    key={p.id}
                    data-lineage-card={p.id}
                    data-testid={isSeed ? 'lineage-seed' : 'lineage-node'}
                    data-traced={hot ? 'true' : undefined}
                    data-dimmed={dim ? 'true' : undefined}
                    onPointerDown={e => startDrag(e, p.id)}
                    onMouseEnter={() => setHovered(n.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => {
                      setSelected(n.id)
                      onSelect?.(n.id)
                    }}
                    onDoubleClick={() => onReseed?.(n.id)}
                    style={{
                      position: 'absolute',
                      left: pos.x + RAIL_W,
                      top: pos.y,
                      width: LINEAGE_FOOTPRINT.width,
                      cursor: 'grab',
                      opacity: dim ? 0.28 : 1,
                      transition: 'opacity 0.12s',
                      outline: isSeed
                        ? `2px solid ${kindPalette(n.kind).accent}`
                        : selected === n.id
                          ? '2px solid var(--blue)'
                          : 'none',
                      outlineOffset: 2,
                      borderRadius: 8,
                    }}
                  >
                    <OperationalCard
                      card={toCard(n, statusById[n.id] ?? 'PENDING')}
                      density="compact"
                    />
                  </div>
                )
              })}

            {/* Tier labels, painted above the cards. They are sticky, so once the flow is
                scrolled they travel over whatever card is beneath — hence the opaque backing
                rather than bare text. */}
            {layout.bands.map(b => (
              <div
                key={`${b.tier}-label`}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: b.y - 6,
                  width: layout.width + RAIL_W,
                  height: 16,
                  pointerEvents: 'none',
                  zIndex: 5,
                }}
              >
                <span
                  data-testid="lineage-band-label"
                  style={{
                    position: 'sticky',
                    left: 6,
                    display: 'inline-block',
                    padding: '1px 7px',
                    borderRadius: 4,
                    fontSize: 9,
                    letterSpacing: '0.08em',
                    fontFamily: 'JetBrains Mono, monospace',
                    color: BAND_INK[b.tier],
                    background: 'var(--bg)',
                    border: `1px solid ${BAND_INK[b.tier]}33`,
                  }}
                >
                  {b.label}
                </span>
              </div>
            ))}

            {/* hop ruler */}
            {[...new Map(layout.nodes.filter(p => !p.isDummy).map(p => [p.node!.hop, p])).entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([hop, p]) => (
                <div
                  key={hop}
                  style={{
                    position: 'absolute',
                    left: p.x + RAIL_W,
                    top: layout.height - 4,
                    width: LINEAGE_FOOTPRINT.width,
                    textAlign: 'center',
                    fontSize: 9,
                    fontFamily: 'JetBrains Mono, monospace',
                    color: hop === 0 ? statusColor('OK') : 'var(--text-dim)',
                  }}
                >
                  {hop === 0 ? '◉ selected' : hop < 0 ? `${hop}` : `+${hop}`}
                </div>
              ))}
          </div>
        </div>

        {selectedNode && (
          <div
            data-testid="lineage-details"
            style={{
              width: 264,
              flexShrink: 0,
              overflow: 'auto',
              borderLeft: '1px solid var(--border)',
              paddingLeft: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', flex: 1 }}>
                Details
              </span>
              <button
                aria-label="Close details"
                onClick={() => setSelected(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#4a5570',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                ✕
              </button>
            </div>
            <OperationalCard
              card={toCard(selectedNode, statusById[selectedNode.id] ?? 'PENDING')}
              selected
            />
            <button
              aria-label="Center lineage here"
              onClick={() => onReseed?.(selectedNode.id)}
              style={{ ...chipBtn, width: '100%', padding: '5px 8px' }}
            >
              ⌖ center lineage here
            </button>
            {selectedNode.clusters.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 4 }}>Clusters</div>
                {selectedNode.clusters.map(c => (
                  <div
                    key={c}
                    style={{
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      fontFamily: 'JetBrains Mono, monospace',
                      padding: '2px 0',
                    }}
                  >
                    {c}
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              {`hop ${selectedNode.hop === 0 ? '0 (seed)' : selectedNode.hop > 0 ? `+${selectedNode.hop} downstream` : `${selectedNode.hop} upstream`}`}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const chipBtn: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 10,
  cursor: 'pointer',
  background: 'var(--surface-3)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontFamily: 'JetBrains Mono, monospace',
}
