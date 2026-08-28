import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import type { OperationalCard as CardData } from '../../types'
import type { ApiError } from '../../api/client'
import { useRelationships, useOperationalSummary, useOperationalDates, useOperational, useAppConfig, useDiagnostics } from '../../api/queries'
import type { RelationshipGraph } from '../../api/queries'
import { toOperationalGraph, summarizeSnapshot, type OperationalEdge } from '../../api/relationshipsAdapter'
import { OperationalCard } from '../shared/OperationalCard'
import { CorpusSummary, type SummaryItem } from '../shared/CorpusSummary'
import { TimePicker, type TimeSelection, type Precision } from '../shared/TimePicker'
import { GCPIcon } from '../shared/GCPIcon'
import { InfoTooltip } from '../shared/InfoTooltip'
import { LoadingState } from '../shared/Spinner'
import { PreviewOverlay } from './PreviewOverlay'
import { DataRootsPanel, DataRootsChip } from './DataRootsPanel'

type NodeDto = NonNullable<RelationshipGraph['nodes']>[number]

/**
 * Task 9: resolve the recipe/mapping path a card's "Open preview" affordance
 * should open. Recipe card -> its own node (`mappingPath` = recipe directory,
 * `name` = recipe filename). Table card -> the FIRST `writes` edge into it
 * (adapter edge order, i.e. graph order) -> that recipe's node. Both fields
 * null when unresolvable (e.g. a source-only table, or a recipe absent from
 * the corpus) — the caller disables the affordance in that case.
 */
function resolvePreview(
  card: CardData,
  edges: OperationalEdge[],
  nodeById: Map<string, NodeDto>,
): { recipePath: string | null; mappingPath: string | null } {
  const recipeId = card.kind === 'recipe'
    ? card.id
    : edges.find(e => e.kind === 'writes' && e.toId === card.id)?.fromId
  const node = recipeId ? nodeById.get(recipeId) : undefined
  const mappingPath = node?.mappingPath ?? null
  const name = node?.name ?? null
  if (!mappingPath || !name) return { recipePath: null, mappingPath }
  return { recipePath: `${mappingPath}/${name}`, mappingPath }
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000
}

/**
 * Client-side mirror of the backend's nearest-available-date rule
 * (`OperationalService#nearestAvailable`): smallest day-distance to `target`.
 * Ties favor the earlier date — falls out naturally here because `avail` is
 * ascending (as served by `/api/operational/dates`) and we only replace
 * `best` on a STRICTLY smaller distance, so the first (earliest) date at the
 * minimum distance wins, same as the backend's `isBefore` tie-break.
 */
function nearestAvailableDate(target: string, avail: string[]): string {
  if (avail.length === 0) return target
  let best = avail[0]!
  let bestDist = daysBetween(target, best)
  for (const iso of avail) {
    const dist = daysBetween(target, iso)
    if (dist < bestDist) {
      bestDist = dist
      best = iso
    }
  }
  return best
}

function StatusSummary({ cards }: { cards: CardData[] }) {
  const counts = { OK: 0, KO: 0, RUNNING: 0, PENDING: 0 }
  cards.forEach(c => { counts[c.status]++ })
  const color: Record<string, string> = { OK: '#34d399', KO: '#f87171', RUNNING: '#fbbf24', PENDING: '#4a5570' }
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      {Object.entries(counts).map(([s, n]) => n > 0 && (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: color[s] }} />
          <span style={{ fontSize: 11, color: '#c8d3e8', fontFamily: 'JetBrains Mono, monospace' }}>{n}</span>
          <span style={{ fontSize: 11, color: '#4a5570' }}>{s}</span>
        </div>
      ))}
    </div>
  )
}

function RelationshipGraph({
  cards,
  edges,
  selected,
  onSelect,
  zoom,
  summaryItems,
}: {
  cards: CardData[]
  edges: OperationalEdge[]
  selected: string | null
  onSelect: (id: string | null) => void
  zoom: number
  /** Task 16: view-aware corpus summary — Tab 3 has no left rail (its 300px
   * side panel is the RIGHT-hand detail panel), so it gets a floating
   * bottom-left chip over the graph body instead of a Sidebar/DagExplorer
   * footer (spec §7.1's Tab 3 row). Empty when there's no selected-date
   * snapshot loaded yet. */
  summaryItems: SummaryItem[]
}) {
  const [pan, setPan] = useState({ x: 40, y: 40 })
  const dragging = useRef(false)
  const lastPan = useRef({ x: 0, y: 0 })

  const byId = Object.fromEntries(cards.map(c => [c.id, c]))
  const visibleEdges = edges.filter(e => byId[e.fromId] && byId[e.toId])

  // Computed maxima from card coordinates + margins (was a static 1200x700;
  // real layouts can exceed that, and floor stays for small/empty graphs).
  const CANVAS_W = Math.max(1200, ...cards.map(c => (c.x ?? 0) + 280))
  const CANVAS_H = Math.max(700, ...cards.map(c => (c.y ?? 0) + 220))

  const compact = zoom < 0.65

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest('[data-card]')) return
    dragging.current = true
    lastPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }, [pan])
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    setPan({ x: e.clientX - lastPan.current.x, y: e.clientY - lastPan.current.y })
  }, [])
  const onMouseUp = useCallback(() => { dragging.current = false }, [])
  const onWheel = useCallback((e: React.WheelEvent) => { e.stopPropagation() }, [])

  return (
    <div
      style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--bg)', cursor: 'grab' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
    >
      {/* dot grid */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs>
          <pattern id="odot" x={pan.x % 24} y={pan.y % 24} width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="12" cy="12" r="0.7" fill="rgba(42,48,80,0.7)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#odot)" />
      </svg>

      <div style={{
        transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
        transformOrigin: '0 0',
        position: 'absolute',
        width: CANVAS_W,
        height: CANVAS_H,
      }}>
        {/* SVG edges */}
        <svg
          width={CANVAS_W} height={CANVAS_H}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        >
          <defs>
            <marker id="oa" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
              <path d="M0 1 L6 3.5 L0 6 Z" fill="rgba(42,48,80,1)" />
            </marker>
            <marker id="oa-hi" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
              <path d="M0 1 L6 3.5 L0 6 Z" fill="#4f9cf9" />
            </marker>
          </defs>
          {visibleEdges.map((e, i) => {
            const from = byId[e.fromId]!
            const to = byId[e.toId]!
            const fx = (from.x ?? 0) + 120
            const fy = (from.y ?? 0) + 50
            const tx = (to.x ?? 0)
            const ty = (to.y ?? 0) + 50
            const hi = selected === e.fromId || selected === e.toId
            const dx = Math.abs(tx - fx) * 0.45
            return (
              <path key={i}
                d={`M ${fx} ${fy} C ${fx + dx} ${fy} ${tx - dx} ${ty} ${tx} ${ty}`}
                fill="none"
                stroke={hi ? '#4f9cf9' : '#1e2438'}
                strokeWidth={hi ? 2 : 1.5}
                strokeDasharray={e.kind === 'lookup' ? '5 4' : undefined}
                markerEnd={hi ? 'url(#oa-hi)' : 'url(#oa)'}
              />
            )
          })}
        </svg>

        {/* Cards */}
        {cards.map(card => (
          <div
            key={card.id}
            data-card="1"
            style={{
              position: 'absolute',
              left: card.x ?? 0,
              top: card.y ?? 0,
              width: compact ? 'auto' : 252,
              zIndex: selected === card.id ? 10 : 1,
            }}
            onClick={e => { e.stopPropagation(); onSelect(selected === card.id ? null : card.id) }}
          >
            <OperationalCard card={card} density={compact ? 'compact' : 'detailed'} selected={selected === card.id} onClick={undefined} />
          </div>
        ))}
      </div>

      {/* click to deselect */}
      {selected && (
        <button
          onClick={() => onSelect(null)}
          style={{
            position: 'absolute', top: 12, right: 12,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 5, color: '#7b88aa', fontSize: 11, cursor: 'pointer',
            padding: '4px 10px',
          }}
        >Clear selection</button>
      )}

      {/* Task 16: view-aware corpus summary — floating bottom-left chip (no
          left rail to dock into, unlike Tabs 1/2/4). */}
      {summaryItems.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 14, left: 14,
          padding: '5px 10px', background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 5,
        }}>
          <CorpusSummary items={summaryItems} />
        </div>
      )}
    </div>
  )
}

export function ETLOperational() {
  const [selected, setSelected] = useState<string | null>(null)
  const [zoom, setZoom] = useState(0.85)
  // Date is real state (this task); "Now"/hour/precision stay locally tracked
  // and are re-merged with `selectedDate` into the TimeSelection the
  // (unmodified) TimePicker expects.
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [timeMeta, setTimeMeta] = useState<{ hour: number; precision: Precision; isNow: boolean }>({
    hour: new Date().getUTCHours(),
    precision: 'hour',
    isNow: true,
  })
  const [layerFilter, setLayerFilter] = useState<string>('ALL')
  const [kindFilter, setKindFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  // Task 9: snapshot the resolved path when "Open preview" is clicked, rather
  // than re-deriving from `selected` on every render — so the overlay keeps
  // showing the recipe it was opened for even if the selection changes or
  // clears underneath it while it's open.
  const [preview, setPreview] = useState<{ recipePath: string | null; mappingPath: string | null } | null>(null)

  const rel = useRelationships()
  const summary = useOperationalSummary()
  const dates = useOperationalDates()
  const cfg = useAppConfig()
  // Data-root self-diagnosis: rendered as a toolbar chip always, and expanded into the
  // full report in the empty state — where it is the only thing standing between the
  // operator and a blank canvas with no stated cause.
  const diagnostics = useDiagnostics()
  // Task 16: the raw b15 rows for `selectedDate` — distinct from `summary`
  // above (the all-time per-recipe aggregate `useOperationalSummary()`
  // already loads), needed for the floating chip's exact row count/OK-KO
  // split (spec §7.1's Tab 3 row: "for the selected date or range").
  const snapshot = useOperational(selectedDate ?? '')

  // Raw graph nodes carry `mappingPath` (the recipe directory) — the adapter's
  // OperationalCard doesn't, so the preview resolver reads it here.
  const nodeById = useMemo(() => {
    const m = new Map<string, NodeDto>()
    for (const n of rel.data?.nodes ?? []) if (n.id) m.set(n.id, n)
    return m
  }, [rel.data])

  // On first data, default selectedDate to the latest snapshot ("Now").
  // Guarded on selectedDate === null so a later user pick is never clobbered.
  useEffect(() => {
    if (selectedDate === null && dates.data?.dates && dates.data.dates.length > 0) {
      setSelectedDate(dates.data.dates.at(-1)!)
    }
  }, [dates.data, selectedDate])

  const availableDates = dates.data?.dates ?? []

  const timeVal: TimeSelection = {
    date: selectedDate ?? new Date().toISOString().slice(0, 10),
    hour: timeMeta.hour,
    precision: timeMeta.precision,
    isNow: timeMeta.isNow,
  }
  const handleTimeChange = (v: TimeSelection) => {
    setSelectedDate(availableDates.length > 0 ? nearestAvailableDate(v.date, availableDates) : v.date)
    setTimeMeta({ hour: v.hour, precision: v.precision, isNow: v.isNow })
  }

  const view = useMemo(
    () => (rel.data ? toOperationalGraph(rel.data, summary.data, selectedDate) : null),
    [rel.data, summary.data, selectedDate],
  )

  // Task 16: date-scoped chip counts, derived client-side from `view` (graph)
  // + `snapshot` (the selected date's raw b15 rows) — no new endpoint.
  const snapshotSummary = useMemo(
    () => (view && snapshot.data ? summarizeSnapshot(snapshot.data.rows ?? [], view.cards, view.edges) : null),
    [view, snapshot.data],
  )
  const summaryItems: SummaryItem[] = snapshotSummary ? [
    { label: 'b15 rows', value: snapshotSummary.rows },
    { label: 'recipes', value: snapshotSummary.recipes },
    { label: 'tables', value: snapshotSummary.tables },
    { label: 'OK', value: snapshotSummary.ok },
    { label: 'KO', value: snapshotSummary.ko },
  ] : []

  if (rel.isLoading || summary.isLoading) {
    return <div style={{ padding: 16 }}><LoadingState label="Loading relationships…" /></div>
  }

  const apiError = (rel.error ?? summary.error) as ApiError | null
  if (apiError) {
    return (
      <div style={{ color: 'var(--red)', fontSize: 12, padding: 16 }}>
        <div>{apiError.title}</div>
        {apiError.detail && <div>{apiError.detail}</div>}
      </div>
    )
  }

  // An empty graph is never self-explanatory: a mis-pointed data root, an unreadable control
  // schema and a genuinely empty corpus all land here. The report says which one it is.
  if (!view || view.cards.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No relationship entries</div>
        <DataRootsPanel diagnostics={diagnostics.data} />
      </div>
    )
  }

  const cards = view.cards.filter(c => {
    if (layerFilter !== 'ALL' && c.layer !== layerFilter) return false
    if (kindFilter !== 'ALL' && c.kind !== kindFilter) return false
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false
    if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const selectedCard = selected ? view.cards.find(c => c.id === selected) : null

  const previewTarget = selectedCard
    ? resolvePreview(selectedCard, view.edges, nodeById)
    : { recipePath: null, mappingPath: null }

  // GCP quick links: templated from the served config + (for the cluster
  // name) the raw summary entry looked up by name — `lastClusterName` isn't
  // on OperationalCard (keeps that type stable), so it's read here.
  const projectId = cfg.data?.gcpProjectId ?? 'mock-project'
  const clusterName = selectedCard
    ? (summary.data?.recipes?.find(r => r.recipeFilename === selectedCard.name)?.lastClusterName ?? '')
    : ''
  const loggingHref = (cfg.data?.loggingUrl ?? '')
    .replace('{jobId}', selectedCard?.jobId ?? '')
    .replace('{project}', projectId)
  const monitoringHref = (cfg.data?.dataprocClusterUrl ?? '')
    .replace('{clusterName}', clusterName)
    .replace('{project}', projectId)
    .replace('{region}', cfg.data?.region ?? '')
  const bigQueryHref = `https://console.cloud.google.com/bigquery?project=${projectId}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* toolbar */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
      }}>
        {/* search */}
        <div style={{ position: 'relative' }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
            style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="5.5" cy="5.5" r="4" stroke="#4a5570" strokeWidth="1.4" />
            <line x1="8.5" y1="8.5" x2="11.5" y2="11.5" stroke="#4a5570" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search tables / recipes…"
            style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 5, color: '#c8d3e8', fontSize: 11, padding: '5px 10px 5px 26px',
              outline: 'none', width: 200, fontFamily: 'Inter, sans-serif',
            }}
          />
        </div>

        {/* filters — options are data-driven from the real graph */}
        <FilterChips label="Layer" options={['ALL', ...view.layers]} value={layerFilter} onChange={setLayerFilter} />
        <FilterChips label="Kind" options={['ALL', 'recipe', 'table']} value={kindFilter} onChange={setKindFilter} />
        {/* RUNNING isn't a real operational state (mock/real history only ever
            resolves OK/KO/PENDING) — swapped for PENDING per the plan's ledger note. */}
        <FilterChips label="Status" options={['ALL', 'OK', 'KO', 'PENDING']} value={statusFilter} onChange={setStatusFilter}
          colors={{ OK: '#34d399', KO: '#f87171', PENDING: '#4a5570' }} />

        <div style={{ flex: 1 }} />
        <DataRootsChip diagnostics={diagnostics.data} />
        <StatusSummary cards={view.cards} />

        {/* zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setZoom(z => Math.max(0.3, z - 0.15))} style={zoomBtn}>−</button>
          <span style={{ fontSize: 10, color: '#4a5570', fontFamily: 'JetBrains Mono, monospace', width: 34, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.15))} style={zoomBtn}>+</button>
        </div>
      </div>

      {/* time picker */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <TimePicker value={timeVal} onChange={handleTimeChange} />
      </div>

      {/* main area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <RelationshipGraph
          cards={cards}
          edges={view.edges}
          selected={selected}
          onSelect={setSelected}
          zoom={zoom}
          summaryItems={summaryItems}
        />

        {/* detail side panel */}
        {selectedCard && (
          <div style={{
            width: 300, flexShrink: 0,
            background: 'var(--surface)', borderLeft: '1px solid var(--border)',
            overflow: 'auto', padding: '16px',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f8', flex: 1 }}>Details</span>
              <button onClick={() => setSelected(null)}
                style={{ background: 'none', border: 'none', color: '#4a5570', cursor: 'pointer' }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2 2l9 9M11 2L2 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <OperationalCard card={selectedCard} selected />

            {/* related cards */}
            <div>
              <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                Related ({selectedCard.relations.length})
                <InfoTooltip text="Tables and recipes that directly exchange data with this node." placement="right" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selectedCard.relations.map(rid => {
                  const relCard = view.cards.find(c => c.id === rid)
                  if (!relCard) return null
                  return (
                    <div key={rid} onClick={() => setSelected(rid)} style={{ cursor: 'pointer' }}>
                      <OperationalCard card={relCard} density="compact" />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* preview overlay affordance (Task 9) */}
            <div>
              <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 8 }}>Preview</div>
              <PreviewButton
                enabled={!!previewTarget.recipePath}
                onClick={() => setPreview(previewTarget)}
              />
            </div>

            {/* GCP quick links */}
            <div>
              <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 8 }}>GCP Quick Links</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <GCPLink icon="bigquery" label="Open in BigQuery" href={bigQueryHref} />
                <GCPLink icon="monitoring" label="Monitoring Dashboard" href={monitoringHref} />
                <GCPLink icon="logging" label="Cloud Logging" href={loggingHref} />
              </div>
            </div>
          </div>
        )}
      </div>

      {preview && (
        <PreviewOverlay
          recipePath={preview.recipePath}
          mappingPath={preview.mappingPath}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  )
}

/** Task 9's "Open preview" affordance — same row markup as `GCPLink` below
 * (no new tokens), a `<button>` in place of an `<a>` since it opens the
 * overlay rather than navigating. Disabled (dim, non-interactive) when the
 * selected card's recipe/mapping path can't be resolved. */
function PreviewButton({ enabled, onClick }: { enabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, width: '100%',
        padding: '6px 10px', borderRadius: 5, textAlign: 'left',
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        color: enabled ? '#7b88aa' : '#3a4160', fontSize: 11,
        cursor: enabled ? 'pointer' : 'default',
        fontFamily: 'inherit',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      Open preview
      <span style={{ marginLeft: 'auto', fontSize: 10 }}>↗</span>
    </button>
  )
}

function GCPLink({ icon, label, href }: { icon: Parameters<typeof GCPIcon>[0]['service']; label: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '6px 10px', borderRadius: 5, textDecoration: 'none',
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        color: '#7b88aa', fontSize: 11,
        transition: 'border-color 0.1s',
      }}
    >
      <GCPIcon service={icon} size={14} />
      {label}
      <span style={{ marginLeft: 'auto', fontSize: 10 }}>↗</span>
    </a>
  )
}

function FilterChips({
  label, options, value, onChange, colors,
}: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
  colors?: Record<string, string>
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 10, color: '#4a5570', marginRight: 2 }}>{label}:</span>
      {options.map(o => {
        const c = colors?.[o]
        return (
          <button key={o} onClick={() => onChange(o)} style={{
            padding: '2px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace',
            background: value === o ? (c ? `${c}22` : 'var(--surface-3)') : 'transparent',
            border: `1px solid ${value === o ? (c ?? 'var(--border)') : 'transparent'}`,
            color: value === o ? (c ?? '#e2e8f8') : '#4a5570',
          }}>{o}</button>
        )
      })}
    </div>
  )
}

const zoomBtn: React.CSSProperties = {
  width: 24, height: 24, background: 'var(--surface-2)',
  border: '1px solid var(--border)', borderRadius: 4,
  color: '#7b88aa', cursor: 'pointer', fontSize: 14,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'monospace',
}
