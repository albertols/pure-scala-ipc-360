import { useEffect, useRef, useState } from 'react'
import type { ApiError } from '../../api/client'
import { useClusterDetail, useClusterIndex } from '../../api/clusterQueries'
import { setOperationalView, useOperationalView } from '../../state/operationalView'

// ─── ClusterPane (Task 13) ──────────────────────────────────────────────────
//
// The pane is how a b15 cluster selection gets made — at real scale (~1,300
// clusters) that means the list itself must scale, not just the graph it
// eventually feeds. Rows are windowed by hand (spacer div + absolutely
// positioned rows) rather than pulling in a virtualization dependency: the
// repo's dependency list stays exactly `@tanstack/react-query`/`react`/
// `react-dom`. A cluster's own recipes/dates are fetched only once its row is
// expanded (`useClusterDetail`'s `enabled: !!name`, Task 8) — the index
// payload already carries everything the collapsed row needs
// (`recipeCount`/`rows`/`ok`/`ko`/`lastDate`/`lastStatus`).

export const ROW_H = 30
const OVERSCAN = 5
/** jsdom has no layout — ResizeObserver never fires there, so this is also the
 * effective viewport height under test. */
const DEFAULT_VIEWPORT_H = 300
const MIN_PANE_W = 200
const MAX_PANE_W = 420

const nf = new Intl.NumberFormat('en-US')

/** Rows to render for a scroll position: the visible window plus an overscan, clamped to [0, count]. */
export function visibleRange(scrollTop: number, viewportH: number, count: number, rowH: number) {
  const first = Math.floor(Math.max(0, scrollTop) / rowH)
  const visible = Math.ceil(viewportH / rowH)
  return {
    start: Math.max(0, Math.min(count, first - OVERSCAN)),
    end: Math.max(0, Math.min(count, first + visible + OVERSCAN)),
  }
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flex: 1,
  minWidth: 0,
  cursor: 'pointer',
}
const nameStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 11,
  color: 'var(--text)',
  fontFamily: 'JetBrains Mono, monospace',
}
const countStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-dim)',
  fontFamily: 'JetBrains Mono, monospace',
}
const chevronButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 2,
  color: 'var(--text-muted)',
  fontSize: 10,
  fontFamily: 'JetBrains Mono, monospace',
}

function ClusterRow({
  name,
  recipeCount,
  ok,
  ko,
  top,
  checked,
  expanded,
  onToggle,
  onExpand,
}: {
  name: string
  recipeCount: number
  ok: number
  ko: number
  top: number
  checked: boolean
  expanded: boolean
  onToggle: () => void
  onExpand: () => void
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 0,
        right: 0,
        height: ROW_H,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 8px',
        background: expanded ? 'var(--surface-3)' : 'transparent',
      }}
    >
      <label style={labelStyle}>
        <input type="checkbox" aria-label={name} checked={checked} onChange={onToggle} />
        <span style={nameStyle}>{name}</span>
        <span style={countStyle}>{`×${recipeCount}`}</span>
        <span style={{ ...countStyle, color: 'var(--green)' }}>{ok}</span>
        <span style={{ ...countStyle, color: 'var(--red)' }}>{ko}</span>
      </label>
      <button aria-label={`Expand ${name}`} onClick={onExpand} style={chevronButtonStyle}>
        {expanded ? '▾' : '▸'}
      </button>
    </div>
  )
}

export function ClusterPane() {
  const {
    paneWidth,
    paneCollapsed,
    selectedClusters,
    expandedCluster,
    deselectedRecipes,
    selectedDates,
  } = useOperationalView()
  const { data: index } = useClusterIndex()
  // `error`/`isLoading` are read, not discarded: rendering `(detail?.recipes ?? [])` alone made a
  // 500 or a dropped connection look exactly like a cluster with no recipes.
  const {
    data: detail,
    error: detailError,
    isLoading: detailLoading,
  } = useClusterDetail(expandedCluster)

  const [search, setSearch] = useState('')
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(DEFAULT_VIEWPORT_H)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)
  // The currently-attached window listeners for an in-progress drag, if any —
  // lets the unmount effect below detach them even when the gesture never
  // reaches its own mouseup (e.g. a tab switch unmounts ClusterPane while the
  // resize handle is still held). Mirrors EditorLayout.tsx's `activeDragListeners`.
  const activeDragListeners = useRef<{ onMove: (e: MouseEvent) => void; onUp: () => void } | null>(
    null,
  )

  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      const h = entries[0]?.contentRect.height
      if (h) setViewportH(h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    return () => {
      const listeners = activeDragListeners.current
      if (!listeners) return
      window.removeEventListener('mousemove', listeners.onMove)
      window.removeEventListener('mouseup', listeners.onUp)
      activeDragListeners.current = null
    }
  }, [])

  const clusters = index?.clusters ?? []
  const q = search.trim().toLowerCase()
  const filtered =
    q === '' ? clusters : clusters.filter(c => (c.name ?? '').toLowerCase().includes(q))

  const { start, end } = visibleRange(scrollTop, viewportH, filtered.length, ROW_H)
  const visible = filtered.slice(start, end)

  const toggleClusterSelection = (name: string) => {
    const next = selectedClusters.includes(name)
      ? selectedClusters.filter(c => c !== name)
      : [...selectedClusters, name]
    setOperationalView({ selectedClusters: next })
  }

  const toggleExpand = (name: string) => {
    setOperationalView({ expandedCluster: expandedCluster === name ? null : name })
  }

  const toggleRecipe = (filename: string) => {
    const next = deselectedRecipes.includes(filename)
      ? deselectedRecipes.filter(r => r !== filename)
      : [...deselectedRecipes, filename]
    setOperationalView({ deselectedRecipes: next })
  }

  const toggleDate = (date: string, allDates: string[]) => {
    const currentlySelected = selectedDates.length === 0 || selectedDates.includes(date)
    const base = selectedDates.length === 0 ? allDates : selectedDates
    const next = currentlySelected ? base.filter(d => d !== date) : [...base, date]
    // "No filter" has exactly one representation. Re-checking a date back to the
    // full known set must collapse to the empty sentinel rather than sit as a
    // second, functionally-identical-but-different-looking spelling of "all
    // selected" — otherwise a round-trip toggle (uncheck, recheck) would leave
    // `selectedDates` non-empty forever.
    const isFullSet =
      allDates.length > 0 &&
      next.length === allDates.length &&
      allDates.every(d => next.includes(d))
    setOperationalView({ selectedDates: isFullSet ? [] : next })
  }

  /** Search box changes must invalidate any scroll position computed against the
   * PREVIOUS (unfiltered or differently-filtered) list — otherwise a stale
   * `scrollTop` can point past the narrower list's own height, `visibleRange`
   * clamps both ends to the new (smaller) count, and the pane renders zero rows,
   * indistinguishable from "no results". Reset state AND the DOM node together so
   * they can never disagree about where the list is scrolled. */
  const onSearchChange = (value: string) => {
    setSearch(value)
    setScrollTop(0)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  const startDrag = () => {
    draggingRef.current = true
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      setOperationalView({ paneWidth: Math.max(MIN_PANE_W, Math.min(MAX_PANE_W, e.clientX)) })
    }
    const onUp = () => {
      draggingRef.current = false
      activeDragListeners.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    activeDragListeners.current = { onMove, onUp }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  if (paneCollapsed) {
    return (
      <div
        data-testid="cluster-pane"
        style={{
          width: 36,
          flexShrink: 0,
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 8,
          gap: 8,
        }}
      >
        <button
          aria-label="Expand cluster pane"
          title="Expand cluster pane"
          onClick={() => setOperationalView({ paneCollapsed: false })}
          style={chevronButtonStyle}
        >
          {'»'}
        </button>
      </div>
    )
  }

  return (
    <div
      data-testid="cluster-pane"
      style={{
        width: paneWidth,
        flexShrink: 0,
        position: 'relative',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: 8,
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Clusters
          </span>
          <div style={{ flex: 1 }} />
          <button
            aria-label="Collapse cluster pane"
            title="Collapse cluster pane"
            onClick={() => setOperationalView({ paneCollapsed: true })}
            style={chevronButtonStyle}
          >
            {'«'}
          </button>
        </div>
        {index?.totals && (
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            {`${nf.format(index.totals.clusters ?? 0)} clusters · ${nf.format(index.totals.recipes ?? 0)} recipes · ${nf.format(index.totals.dates ?? 0)} days indexed`}
          </div>
        )}
        <input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search clusters…"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 5,
            color: 'var(--text)',
            fontSize: 11,
            padding: '4px 9px',
            outline: 'none',
            width: '100%',
            fontFamily: 'Inter, sans-serif',
          }}
        />
      </div>

      <div
        ref={scrollRef}
        data-testid="cluster-scroll"
        onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
        style={{ flex: 1, overflowY: 'auto', position: 'relative', minHeight: 0 }}
      >
        <div style={{ position: 'relative', height: filtered.length * ROW_H }}>
          {visible.map((c, i) => {
            const idx = start + i
            const name = c.name ?? ''
            return (
              <ClusterRow
                key={name || idx}
                name={name}
                recipeCount={c.recipeCount ?? 0}
                ok={c.ok ?? 0}
                ko={c.ko ?? 0}
                top={idx * ROW_H}
                checked={selectedClusters.includes(name)}
                expanded={expandedCluster === name}
                onToggle={() => toggleClusterSelection(name)}
                onExpand={() => toggleExpand(name)}
              />
            )
          })}
        </div>
      </div>

      {expandedCluster && (
        <div
          style={{
            borderTop: '1px solid var(--border-subtle)',
            padding: 8,
            maxHeight: 200,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: 'var(--text-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {expandedCluster}
          </div>
          {/* Three distinct outcomes, three distinct renderings. Only the third is "empty". */}
          {detailError && (
            <div data-testid="cluster-detail-error" style={{ fontSize: 10, color: 'var(--red)' }}>
              {`Could not load this cluster: ${(detailError as ApiError).title}`}
            </div>
          )}
          {!detailError && detailLoading && (
            <div
              data-testid="cluster-detail-loading"
              style={{ fontSize: 10, color: 'var(--text-muted)' }}
            >
              Loading recipes and dates…
            </div>
          )}
          {!detailError &&
            !detailLoading &&
            (detail?.recipes ?? []).length === 0 &&
            (detail?.dates ?? []).length === 0 && (
              <div
                data-testid="cluster-detail-empty"
                style={{ fontSize: 10, color: 'var(--text-muted)' }}
              >
                No recipes recorded for this cluster.
              </div>
            )}
          {(detail?.recipes ?? []).map(r => {
            const filename = r.recipeFilename ?? ''
            return (
              <label
                key={filename}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  aria-label={filename}
                  checked={!deselectedRecipes.includes(filename)}
                  onChange={() => toggleRecipe(filename)}
                />
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {filename}
                </span>
              </label>
            )
          })}
          {(detail?.dates ?? []).map(d => (
            <label
              key={d}
              style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                aria-label={d}
                checked={selectedDates.length === 0 || selectedDates.includes(d)}
                onChange={() => toggleDate(d, detail?.dates ?? [])}
              />
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                {d}
              </span>
            </label>
          ))}
        </div>
      )}

      <div
        data-testid="cluster-pane-resize-handle"
        onMouseDown={startDrag}
        style={{
          position: 'absolute',
          top: 0,
          right: -2,
          bottom: 0,
          width: 4,
          cursor: 'col-resize',
        }}
      />
    </div>
  )
}
