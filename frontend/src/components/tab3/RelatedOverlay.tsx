import { useEffect, useMemo, useState } from 'react'
import { useAppConfig, useOperationalSummary } from '../../api/queries'
import { useScopedRelationships } from '../../api/clusterQueries'
import { toOperationalGraph } from '../../api/relationshipsAdapter'
import { LineageFlow } from './LineageFlow'
import type { OperationalCard as CardData } from '../../types'
import type { RelationshipGraph } from '../../api/queries'

type NodeDto = NonNullable<RelationshipGraph['nodes']>[number]

/**
 * One node's full lineage, focused.
 *
 * The frame; `LineageFlow` is the content. This shipped first as a one-hop neighbour LIST, which
 * still made you re-open it at every step and reassemble the chain in your head — so the body is
 * now the transitive upstream + downstream flow (spec §13).
 *
 * Rendered in TWO places from this one component (spec §6.2.3): as an in-app hovering window,
 * and standalone at `?related=<nodeId>&clusters=<names>` in a real browser tab. They cannot
 * drift because they are the same component.
 *
 * `clusters` no longer scopes the lineage itself — that is unscoped by design (ADR-0020). Since
 * ADR-0021 it is only the PREFERENCE fed to the lineage's `auto` cluster resolution (spec §3.6);
 * once that fetch reports back an ACTIVE cluster, THIS component re-scopes the status overlay,
 * edges and preview to follow it instead, so a card's OK/KO describes the graph actually drawn
 * rather than the left rail's original selection or an all-time aggregate.
 */
export function RelatedOverlay({
  nodeId,
  clusters,
  selectedDate = null,
  onFocus,
  onReseed,
  onPreview,
  onClose,
  standalone = false,
}: {
  nodeId: string
  clusters: string[]
  selectedDate?: string | null
  /** Single click on a node: selects it, and syncs the canvas behind the overlay. */
  onFocus?: (nodeId: string) => void
  /** Double click, or the dock's centre control: re-seeds the lineage. */
  onReseed?: (nodeId: string) => void
  /** The dock's "Open preview" affordance, threaded through from the host. */
  onPreview?: (nodeId: string) => void
  onClose?: () => void
  standalone?: boolean
}) {
  useEffect(() => {
    if (!onClose) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // `auto` on open: the server picks the operator's selected cluster when the seed belongs to one
  // of them, else the seed's largest (spec §3.5). It cannot be resolved here — a table's cluster
  // membership lives only in the L2L graph joined against the b15 index, which ADR-0014 exists to
  // stop this client fetching unscoped.
  const [cluster, setCluster] = useState<string | null>('auto')
  const [active, setActive] = useState<string | null>(null)

  // Re-seeding on another node starts the resolution over.
  useEffect(() => {
    setCluster('auto')
    setActive(null)
  }, [nodeId])

  // Status, edges and preview all describe the nodes actually on screen. Before ADR-0021 this
  // read the left-rail selection, which after a gateway walk described a different cluster
  // entirely.
  const scope = active ? [active] : clusters
  const rel = useScopedRelationships(scope)
  const summary = useOperationalSummary(scope.length > 0, scope)
  // Deviation (brief's one-liner `new Map(nodes.map(n => [n.id, n]))` doesn't type-check: the
  // served node's `id` is `string | undefined`, so `.map()` alone can't narrow it for `Map<string,
  // …>`) — guarded the same way `ETLOperational.tsx`'s own `nodeById` already does.
  const nodeById = useMemo(() => {
    const m = new Map<string, NodeDto>()
    for (const n of rel.data?.nodes ?? []) if (n.id) m.set(n.id, n)
    return m
  }, [rel.data])
  const cfg = useAppConfig()
  // Sourced the same way `ETLOperational.tsx`'s own panel resolves a Dataproc fallback: each
  // recipe's last-known cluster, from the same scoped summary this overlay already fetches for
  // status. The dock has no summary of its own — this is how it gets a fallback at all.
  const lastClusterByRecipe = useMemo(() => {
    const m: Record<string, string> = {}
    for (const r of summary.data?.recipes ?? [])
      if (r.recipeFilename && r.lastClusterName) m[r.recipeFilename] = r.lastClusterName
    return m
  }, [summary.data])

  const graph = useMemo(
    () => (rel.data ? toOperationalGraph(rel.data, summary.data, selectedDate, 'compact') : null),
    [rel.data, summary.data, selectedDate],
  )
  const statusById = useMemo(() => {
    const m: Record<string, CardData['status']> = {}
    for (const c of graph?.cards ?? []) m[c.id] = c.status
    return m
  }, [graph])

  const focusedName = graph?.cards.find(c => c.id === nodeId)?.name ?? nodeId

  const body = (
    <div
      data-testid="related-overlay"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: standalone ? 0 : 10,
        width: standalone ? '100%' : 'min(1180px, 94vw)',
        height: standalone ? '100%' : 'min(80vh, 720px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: standalone ? 'none' : '0 18px 60px rgba(0,0,0,0.55)',
      }}
      onClick={e => e.stopPropagation()}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Lineage</span>
        <span
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          {focusedName}
        </span>
        <div style={{ flex: 1 }} />
        {onClose && (
          <button
            aria-label="Close related overlay"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {'✕'}
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', padding: 16, minHeight: 0 }}>
        <LineageFlow
          nodeId={nodeId}
          statusById={statusById}
          selectedClusters={clusters}
          cluster={cluster}
          onClusterChange={setCluster}
          onActiveCluster={setActive}
          extras={{ edges: graph?.edges ?? [], nodeById, config: cfg.data, lastClusterByRecipe }}
          onPreview={onPreview}
          // Single click selects — it opens the dock AND syncs the canvas behind (spec §6.3).
          onSelect={onFocus}
          // Double click (or the dock's ⌖) re-seeds. Splitting the two is what lets a card be
          // inspectable without every inspection also moving the whole view.
          onReseed={onReseed ?? onFocus}
        />
      </div>
    </div>
  )

  if (standalone) return body

  return (
    <div
      data-testid="related-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(4,6,12,0.62)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {body}
    </div>
  )
}

/** `?related=<nodeId>&clusters=<comma-separated>` — the standalone-tab entry point. */
export function readRelatedParam(): { nodeId: string; clusters: string[] } | null {
  const params = new URLSearchParams(window.location.search)
  const nodeId = params.get('related')
  if (!nodeId) return null
  const raw = params.get('clusters') ?? ''
  return {
    nodeId,
    clusters: raw
      .split(',')
      .map(c => c.trim())
      .filter(Boolean),
  }
}
