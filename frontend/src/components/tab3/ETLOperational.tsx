import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import type { OperationalCard as CardData, CardDensity } from '../../types'
import type { ApiError } from '../../api/client'
import { useOperationalSummary, useOperationalDates, useOperational, useAppConfig, useDiagnostics } from '../../api/queries'
import type { AppConfig, RelationshipGraph } from '../../api/queries'
import { useClusterIndex, useScopedRelationships, useRuns, type RunT } from '../../api/clusterQueries'
import { setOperationalView, useOperationalView } from '../../state/operationalView'
import { toOperationalGraph, summarizeSnapshot, fitToViewport, type OperationalEdge } from '../../api/relationshipsAdapter'
import { buildLoggingUrl, buildDataprocClusterUrl } from '../../api/gcpLinks'
import { OperationalCard } from '../shared/OperationalCard'
import { pickDefaultRun } from '../shared/RunPicker'
import { CorpusSummary, type SummaryItem } from '../shared/CorpusSummary'
import { TimePicker, type TimeSelection, type Precision } from '../shared/TimePicker'
import { GCPIcon } from '../shared/GCPIcon'
import { InfoTooltip } from '../shared/InfoTooltip'
import { PreviewOverlay } from './PreviewOverlay'
import { ClusterPane } from './ClusterPane'
import { SelectionStrip, type SelectionSummary } from './SelectionStrip'
import { OperationalProgress, type ProgressStage } from './OperationalProgress'
import { DataRootsPanel, DataRootsChip } from './DataRootsPanel'

const nf = new Intl.NumberFormat('en-US')

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
  pan,
  onPan,
  summaryItems,
  runsByRecipe,
  selectedRunDate,
  onSelectRun,
  config,
  density,
  containerRef,
}: {
  cards: CardData[]
  edges: OperationalEdge[]
  selected: string | null
  onSelect: (id: string | null) => void
  zoom: number
  /** Task 14: pan lives in the operational view store so it survives a tab switch (spec §7.7). */
  pan: { x: number; y: number }
  onPan: (pan: { x: number; y: number }) => void
  /** Task 16: view-aware corpus summary — Tab 3 has no left rail (its 300px
   * side panel is the RIGHT-hand detail panel), so it gets a floating
   * bottom-left chip over the graph body instead of a Sidebar/DagExplorer
   * footer (spec §7.1's Tab 3 row). Empty when there's no selected-date
   * snapshot loaded yet. */
  summaryItems: SummaryItem[]
  /** Task 14: chunked `/api/operational/runs` result, keyed by recipe filename. */
  runsByRecipe: Record<string, RunT[]>
  selectedRunDate: string | null
  onSelectRun: (run: RunT) => void
  config: AppConfig | undefined
  /** Task 15: explicit silhouette from `useOperationalView().density` — replaces the old
   * `compact = zoom < 0.65` implicit rule (Global Constraints: Tab 1's `EtlCanvas` keeps its own
   * zoom-collapse untouched; this is Tab 3 only). */
  density: CardDensity
  /** Task 15: the graph body's own DOM node, measured by a `ResizeObserver` in the parent so
   * `fitToViewport` refits against the ACTUAL viewport rather than a guess. */
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const dragging = useRef(false)
  const lastPan = useRef({ x: 0, y: 0 })

  const byId = Object.fromEntries(cards.map(c => [c.id, c]))
  const visibleEdges = edges.filter(e => byId[e.fromId] && byId[e.toId])

  // Computed maxima from card coordinates + margins (was a static 1200x700;
  // real layouts can exceed that, and floor stays for small/empty graphs).
  const CANVAS_W = Math.max(1200, ...cards.map(c => (c.x ?? 0) + 280))
  const CANVAS_H = Math.max(700, ...cards.map(c => (c.y ?? 0) + 220))

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest('[data-card]')) return
    dragging.current = true
    lastPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }, [pan])
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    onPan({ x: e.clientX - lastPan.current.x, y: e.clientY - lastPan.current.y })
  }, [onPan])
  const onMouseUp = useCallback(() => { dragging.current = false }, [])
  const onWheel = useCallback((e: React.WheelEvent) => { e.stopPropagation() }, [])

  return (
    <div
      ref={containerRef}
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
            data-testid={`node-${card.id}`}
            style={{
              position: 'absolute',
              left: card.x ?? 0,
              top: card.y ?? 0,
              width: density === 'detailed' ? 252 : 'auto',
              zIndex: selected === card.id ? 10 : 1,
              // A 1-hop neighbour is context, not scope: readable, visibly not what you asked for.
              opacity: card.neighbor ? 0.45 : 1,
            }}
            onClick={e => { e.stopPropagation(); onSelect(selected === card.id ? null : card.id) }}
          >
            <OperationalCard
              card={card}
              density={density}
              selected={selected === card.id}
              onClick={undefined}
              runs={runsByRecipe[card.name] ?? []}
              selectedRunDate={selectedRunDate}
              onSelectRun={onSelectRun}
              config={config}
            />
          </div>
        ))}
      </div>

      {/* click to deselect */}
      {selected && (
        <button
          aria-label="Clear node selection"
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

/**
 * Tab 3 — cluster-scoped operational graph (Task 14).
 *
 * The tab used to open by fetching the ENTIRE corpus: `/api/relationships` (every recipe and
 * table the control schema knows about) plus `/api/operational/summary` (the all-time aggregate
 * for every recipe). On the sample corpus that is ~90 recipes and nobody notices. On a real
 * export it is ~7 000 recipes and ~5 000 tables, and the tab is unusable before it renders a
 * single card — which is the problem this whole sub-project exists to solve.
 *
 * So: with nothing selected the tab fetches ONLY the b15 cluster index (spec §11 criterion 1),
 * which is a few hundred rows regardless of corpus size, and shows a prompt naming the scale it
 * found. Selecting clusters fetches exactly their subgraph plus the flagged 1-hop neighbours.
 * Everything else — the summary, the date list, the selected date's snapshot, the per-recipe run
 * history — hangs off that selection and costs nothing until one exists.
 */
export function ETLOperational() {
  const view = useOperationalView()
  const hasSelection = view.selectedClusters.length > 0

  const index = useClusterIndex()
  // `enabled: key.length > 0` lives inside the hook: `GET /api/relationships?clusters=` with an
  // EMPTY value is not "scope to nothing", it is the entire graph, byte-identical to unscoped.
  const rel = useScopedRelationships(view.selectedClusters)
  const summary = useOperationalSummary(hasSelection)
  const dates = useOperationalDates(hasSelection)
  const cfg = useAppConfig()
  // Data-root self-diagnosis: rendered as a toolbar chip always, and expanded into the
  // full report in the empty state — where it is the only thing standing between the
  // operator and a blank canvas with no stated cause.
  const diagnostics = useDiagnostics()

  // "Now"/hour/precision stay locally tracked and are re-merged with the store's `selectedDate`
  // into the TimeSelection the (unmodified) TimePicker expects.
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

  // Task 16: the raw b15 rows for the selected date — distinct from `summary` above (the all-time
  // per-recipe aggregate), needed for the floating chip's exact row count/OK-KO split. Gated on
  // the selection for the same reason as the summary: with no clusters chosen there is no canvas
  // for it to describe, so it must not fire.
  const snapshot = useOperational(hasSelection ? (view.selectedDate ?? '') : '')

  // Task 15: the graph body's measured size, refreshed by a ResizeObserver — jsdom never fires
  // one (no layout engine), so the default below is also the effective viewport under test,
  // mirroring ClusterPane.tsx's DEFAULT_VIEWPORT_H idiom. A ref (not state) because it only
  // needs to be read at the moment a density change asks `fitToViewport` for it — it should not
  // itself trigger a re-render.
  const viewportRef = useRef<{ width: number; height: number }>({ width: 1200, height: 700 })
  const graphContainerRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = graphContainerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (rect && rect.width > 0 && rect.height > 0) viewportRef.current = { width: rect.width, height: rect.height }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
    if (view.selectedDate === null && dates.data?.dates && dates.data.dates.length > 0) {
      setOperationalView({ selectedDate: dates.data.dates.at(-1)! })
    }
  }, [dates.data, view.selectedDate])

  const availableDates = dates.data?.dates ?? []

  const timeVal: TimeSelection = {
    date: view.selectedDate ?? new Date().toISOString().slice(0, 10),
    hour: timeMeta.hour,
    precision: timeMeta.precision,
    isNow: timeMeta.isNow,
  }
  const handleTimeChange = (v: TimeSelection) => {
    setOperationalView({
      selectedDate: availableDates.length > 0 ? nearestAvailableDate(v.date, availableDates) : v.date,
    })
    setTimeMeta({ hour: v.hour, precision: v.precision, isNow: v.isNow })
  }

  const graph = useMemo(
    () => (rel.data ? toOperationalGraph(rel.data, summary.data, view.selectedDate, view.density) : null),
    [rel.data, summary.data, view.selectedDate, view.density],
  )

  // Task 15: cycling density re-lays out at the new pitch AND refits the viewport in one store
  // update — otherwise a Compact re-layout could leave the view panned/zoomed for the OLD
  // (wider) Detailed extent, defeating the point of "fitting more flow on screen".
  const onCycleDensity = () => {
    const next: CardDensity = view.density === 'detailed' ? 'compact'
      : view.density === 'compact' ? 'minimal' : 'detailed'
    const relaid = toOperationalGraph(rel.data!, summary.data, view.selectedDate, next)
    setOperationalView({ density: next, ...fitToViewport(relaid.cards, viewportRef.current, next) })
  }

  // Filtered BEFORE the early returns: `useRuns` below is a hook and its input is this list.
  const cards = useMemo(() => (graph?.cards ?? []).filter(c => {
    if (layerFilter !== 'ALL' && c.layer !== layerFilter) return false
    if (kindFilter !== 'ALL' && c.kind !== kindFilter) return false
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false
    if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  }), [graph, layerFilter, kindFilter, statusFilter, searchQuery])

  const recipeNames = useMemo(
    () => cards.filter(c => c.kind === 'recipe').map(c => c.name),
    [cards],
  )
  // `/api/operational/runs` is bounded at 200 recipes per request; `useRuns` chunks and merges,
  // so a 400-recipe cluster costs two requests rather than a 400.
  const runs = useRuns(recipeNames, 10)

  // Task 16: date-scoped chip counts, derived client-side from `graph` + `snapshot` (the selected
  // date's raw b15 rows) — no new endpoint.
  const snapshotSummary = useMemo(
    () => (graph && snapshot.data ? summarizeSnapshot(snapshot.data.rows ?? [], graph.cards, graph.edges) : null),
    [graph, snapshot.data],
  )
  const summaryItems: SummaryItem[] = snapshotSummary ? [
    { label: 'b15 rows', value: snapshotSummary.rows },
    { label: 'recipes', value: snapshotSummary.recipes },
    { label: 'tables', value: snapshotSummary.tables },
    { label: 'OK', value: snapshotSummary.ok },
    { label: 'KO', value: snapshotSummary.ko },
  ] : []

  const totals = index.data?.totals
  const totalsLine = totals
    ? `${nf.format(totals.dates ?? 0)} days · ${nf.format(totals.clusters ?? 0)} clusters · ${nf.format(totals.rows ?? 0)} rows`
    : null
  const neighborCount = rel.data?.meta?.neighborCount ?? 0
  const nodeCount = graph?.cards.length ?? 0

  // Named stages with RESOLVED totals — never a percentage and never "day N of M". The backend
  // indexes the whole history inside one request; without a streaming endpoint (SSE is a
  // non-goal, spec §2/§7.6) any bar here would be animating a guess.
  const stages: ProgressStage[] = [
    {
      label: 'Indexing b15 history…',
      detail: totalsLine,
      done: !!index.data,
      active: index.isLoading,
    },
    {
      label: hasSelection
        ? `Building graph for ${nf.format(view.selectedClusters.length)} ${view.selectedClusters.length === 1 ? 'cluster' : 'clusters'}…`
        : 'Waiting for a cluster selection',
      detail: graph ? `${nf.format(nodeCount)} nodes · ${nf.format(neighborCount)} from neighbours` : null,
      done: !!graph,
      active: hasSelection && rel.isLoading,
    },
    {
      label: 'Loading run history…',
      // Only once there IS a graph — before that "0 recipes" is not a resolved total, it is the
      // absence of one, and the whole point of this panel is that it never states a number it
      // has not actually resolved.
      detail: graph && !runs.isLoading ? `${nf.format(recipeNames.length)} recipes · up to 10 runs each` : null,
      done: !!graph && !runs.isLoading,
      active: runs.isLoading,
    },
  ]

  // Each number comes from the source that actually knows it: OK/KO and the date span are b15
  // aggregates the index already resolved (summing per-cluster totals cannot double-count, since
  // a b15 row belongs to exactly one cluster), while the recipe/node/neighbour counts come from
  // the fetch that actually happened. `recipes` counts CORE recipe cards, deduped by the graph
  // itself — a recipe shared by two selected clusters is one recipe, which summing the index's
  // per-cluster `recipeCount` would get wrong.
  const selectedClusterRows = useMemo(
    () => (index.data?.clusters ?? []).filter(c => view.selectedClusters.includes(c.name ?? '')),
    [index.data, view.selectedClusters],
  )
  const selectionDateCount = useMemo(() => {
    const days = new Set<number>()
    for (const c of selectedClusterRows) for (const i of c.dateIdx ?? []) days.add(i)
    return days.size
  }, [selectedClusterRows])

  const selectionSummary: SelectionSummary | null = graph ? {
    recipes: graph.cards.filter(c => c.kind === 'recipe' && !c.neighbor).length,
    dates: selectionDateCount,
    ok: selectedClusterRows.reduce((n, c) => n + (c.ok ?? 0), 0),
    ko: selectedClusterRows.reduce((n, c) => n + (c.ko ?? 0), 0),
    nodes: graph.cards.length,
    neighbors: neighborCount,
  } : null

  // 1. The index itself is the only thing every path needs.
  if (index.isLoading) {
    return <OperationalProgress stages={stages} />
  }

  // 2. An INDEX failure is full-bleed: there is nothing for the pane to list, so nothing it
  // could let the operator do. A SCOPED failure is handled after the selection gate below,
  // where the pane still has data and is the only way out.
  if (index.error) return <ApiErrorBlock error={index.error as ApiError} />

  // 3. Nothing indexed at all. An empty Tab 3 is never self-explanatory: a mis-pointed data root,
  // an unreadable control schema and a genuinely empty history all land here. The report says
  // which one it is (ADR-0013) — and it is the reason this branch is reached from the INDEX
  // rather than from an empty graph, which is no longer even requested in this state.
  if ((totals?.rows ?? 0) === 0) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No b15 history</div>
        <DataRootsPanel diagnostics={diagnostics.data} />
      </div>
    )
  }

  // 4. Indexed, nothing selected: the pane plus a prompt naming what was found. No graph request
  // has been made and none will be until a cluster is checked.
  if (!hasSelection) {
    return (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ClusterPane />
        <div
          data-testid="cluster-prompt"
          style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 10,
            background: 'var(--bg)', padding: 24, textAlign: 'center',
          }}
        >
          <div aria-hidden="true" style={{ fontSize: 26, color: 'var(--text-dim)', lineHeight: 1 }}>{'◇'}</div>
          <div style={{ fontSize: 13, color: 'var(--text)' }}>Select a cluster to load its graph</div>
          {totalsLine && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              {totalsLine}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-dim)', maxWidth: 380, lineHeight: 1.5 }}>
            Nothing is fetched until you choose one — the whole corpus is never loaded at once.
          </div>
          <DataRootsChip diagnostics={diagnostics.data} />
        </div>
      </div>
    )
  }

  // 5a. The scoped fetch failed. Unlike an index failure this was caused by a USER ACTION —
  // selecting a cluster — so the control that undoes it has to stay on screen. `selectedClusters`
  // is session-lived and unpersisted, so without the pane the only recovery is a page reload.
  const scopeError = (rel.error ?? summary.error) as ApiError | null
  if (scopeError) {
    return (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ClusterPane />
        <div style={{ flex: 1, background: 'var(--bg)' }}>
          <ApiErrorBlock error={scopeError} />
        </div>
      </div>
    )
  }

  // 5b. Selected, but the scoped graph is still resolving. `summary.isLoading` is part of the
  // gate because a graph built without it renders every card PENDING — a wrong status is worse
  // than a named stage.
  if (!graph || summary.isLoading) {
    return (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ClusterPane />
        <div style={{ flex: 1, background: 'var(--bg)' }}>
          <OperationalProgress stages={stages} />
        </div>
      </div>
    )
  }

  // 5c. The scoped graph resolved to NOTHING. This is a different data root from the zero-rows
  // guard above and must not be folded into it: `/api/operational/clusters` reads the b15 export
  // under the composer root, while `/api/relationships` is built from the control schema under
  // the dwhControl root (LayerToLayerService). A healthy b15 history with a control schema whose
  // anchor table does not match — the exact ADR-0013 case whose hint reads "set layerToLayerTable
  // in config.json" — yields rows > 0, a selectable cluster, and zero cards. Gating only on the
  // index rows would drop the operator on a normal-looking toolbar over a blank canvas with no
  // stated cause, which is precisely the silent failure ADR-0013 exists to eliminate.
  // The pane stays mounted: changing the selection must not require a reload.
  if (graph.cards.length === 0) {
    return (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ClusterPane />
        <div style={{ flex: 1, overflow: 'auto', padding: 16, background: 'var(--bg)' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No relationship entries</div>
          <DataRootsPanel diagnostics={diagnostics.data} />
        </div>
      </div>
    )
  }

  const selectedCard = view.selectedNode ? graph.cards.find(c => c.id === view.selectedNode) : null

  const previewTarget = selectedCard
    ? resolvePreview(selectedCard, graph.edges, nodeById)
    : { recipePath: null, mappingPath: null }

  // GCP quick links: every URL comes from `gcpLinks.ts`'s builders over the served templates —
  // anchored on the SELECTED run (its job id and its `app_start_iso` cursor) when one exists,
  // degrading to the card's own last job id when the run history is unavailable.
  const projectId = cfg.data?.gcpProjectId ?? 'mock-project'
  const selectedRuns = selectedCard ? (runs.byRecipe[selectedCard.name] ?? []) : []
  const selectedRun = pickDefaultRun(selectedRuns, view.selectedRunDate)
  const linkJobId = selectedRun?.jobId || selectedCard?.jobId || ''
  const clusterName = selectedRun?.clusterName
    || (selectedCard
      ? (summary.data?.recipes?.find(r => r.recipeFilename === selectedCard.name)?.lastClusterName ?? '')
      : '')
  const loggingHref = buildLoggingUrl(cfg.data, {
    jobId: linkJobId,
    cursorTimestamp: selectedRun?.appStartIso ?? '',
  })
  const monitoringHref = buildDataprocClusterUrl(cfg.data, { clusterName })
  const bigQueryHref = `https://console.cloud.google.com/bigquery?project=${projectId}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      <SelectionStrip summary={selectionSummary} />

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
        <FilterChips label="Layer" options={['ALL', ...graph.layers]} value={layerFilter} onChange={setLayerFilter} />
        <FilterChips label="Kind" options={['ALL', 'recipe', 'table']} value={kindFilter} onChange={setKindFilter} />
        {/* RUNNING isn't a real operational state (mock/real history only ever
            resolves OK/KO/PENDING) — swapped for PENDING per the plan's ledger note. */}
        <FilterChips label="Status" options={['ALL', 'OK', 'KO', 'PENDING']} value={statusFilter} onChange={setStatusFilter}
          colors={{ OK: '#34d399', KO: '#f87171', PENDING: '#4a5570' }} />

        <div style={{ flex: 1 }} />
        {/* A failed runs chunk leaves its recipes ABSENT from `byRecipe`, which renders exactly
            like "never ran". Say so instead. */}
        {runs.isError && (
          <span style={{ fontSize: 11, color: 'var(--red)', fontFamily: 'JetBrains Mono, monospace' }}>
            Run history unavailable
          </span>
        )}
        <DataRootsChip diagnostics={diagnostics.data} />
        <StatusSummary cards={graph.cards} />

        {/* density — Task 15: an explicit control, not something zoom implies. Cycling re-lays
            out at the new pitch AND refits the viewport (onCycleDensity), so "fitting more flow
            on screen" is a real re-pack rather than a re-scale of the same layout. */}
        <button
          aria-label={`Density: ${view.density}`}
          onClick={onCycleDensity}
          style={{ ...zoomBtn, width: 'auto', padding: '0 10px', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
        >
          {view.density}
        </button>

        {/* zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setOperationalView({ zoom: Math.max(0.3, view.zoom - 0.15) })} style={zoomBtn}>−</button>
          <span style={{ fontSize: 10, color: '#4a5570', fontFamily: 'JetBrains Mono, monospace', width: 34, textAlign: 'center' }}>
            {Math.round(view.zoom * 100)}%
          </span>
          <button onClick={() => setOperationalView({ zoom: Math.min(2, view.zoom + 0.15) })} style={zoomBtn}>+</button>
        </div>
      </div>

      {/* time picker */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <TimePicker value={timeVal} onChange={handleTimeChange} />
      </div>

      {/* main area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ClusterPane />

        <RelationshipGraph
          cards={cards}
          edges={graph.edges}
          selected={view.selectedNode}
          onSelect={id => setOperationalView({ selectedNode: id })}
          zoom={view.zoom}
          pan={view.pan}
          onPan={pan => setOperationalView({ pan })}
          summaryItems={summaryItems}
          runsByRecipe={runs.byRecipe}
          density={view.density}
          containerRef={graphContainerRef}
          selectedRunDate={view.selectedRunDate}
          onSelectRun={run => setOperationalView({ selectedRunDate: run.date ?? null })}
          config={cfg.data}
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
              <button aria-label="Close details" onClick={() => setOperationalView({ selectedNode: null })}
                style={{ background: 'none', border: 'none', color: '#4a5570', cursor: 'pointer' }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2 2l9 9M11 2L2 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <OperationalCard
              card={selectedCard}
              selected
              runs={selectedRuns}
              selectedRunDate={view.selectedRunDate}
              onSelectRun={run => setOperationalView({ selectedRunDate: run.date ?? null })}
              config={cfg.data}
            />

            {/* related cards */}
            <div>
              <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                Related ({selectedCard.relations.length})
                <InfoTooltip text="Tables and recipes that directly exchange data with this node." placement="right" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selectedCard.relations.map(rid => {
                  const relCard = graph.cards.find(c => c.id === rid)
                  if (!relCard) return null
                  return (
                    <div key={rid} onClick={() => setOperationalView({ selectedNode: rid })} style={{ cursor: 'pointer' }}>
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

/** The unchanged error shape both failure states render — hoisted only so the scoped-failure
 * state can wrap it in the cluster pane without duplicating it. */
function ApiErrorBlock({ error }: { error: ApiError }) {
  return (
    <div style={{ color: 'var(--red)', fontSize: 12, padding: 16 }}>
      <div>{error.title}</div>
      {error.detail && <div>{error.detail}</div>}
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
