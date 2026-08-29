import { useEffect, useMemo } from 'react'
import { useOperationalSummary } from '../../api/queries'
import { useScopedRelationships } from '../../api/clusterQueries'
import { toOperationalGraph } from '../../api/relationshipsAdapter'
import { LineageFlow } from './LineageFlow'
import type { OperationalCard as CardData } from '../../types'

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
 * `clusters` no longer scopes the lineage itself — that is unscoped by design (ADR-0020) — but
 * it still scopes the STATUS overlay below, so a card's OK/KO reflects the snapshot the operator
 * is looking at rather than an all-time aggregate.
 */
export function RelatedOverlay({
  nodeId,
  clusters,
  selectedDate = null,
  onFocus,
  onClose,
  standalone = false,
}: {
  nodeId: string
  clusters: string[]
  selectedDate?: string | null
  /** Re-centre on a neighbour. Absent in standalone mode, where there is no canvas to sync. */
  onFocus?: (nodeId: string) => void
  onClose?: () => void
  standalone?: boolean
}) {
  useEffect(() => {
    if (!onClose) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Status only. The lineage itself comes from `LineageFlow`'s own unscoped fetch; this scoped
  // graph is what colours the cards that happen to be in the current selection, so the flow
  // agrees with the canvas behind it. Nodes outside the selection simply have no status here and
  // render PENDING, which is honest — this snapshot says nothing about them.
  const rel = useScopedRelationships(clusters)
  const summary = useOperationalSummary(clusters.length > 0, clusters)

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
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: standalone ? 0 : 10,
        width: standalone ? '100%' : 'min(1180px, 94vw)',
        height: standalone ? '100%' : 'min(80vh, 720px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: standalone ? 'none' : '0 18px 60px rgba(0,0,0,0.55)',
      }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Lineage</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
          {focusedName}
        </span>
        <div style={{ flex: 1 }} />
        {onClose && (
          <button
            aria-label="Close related overlay"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 13 }}
          >{'✕'}</button>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', padding: 16, minHeight: 0 }}>
        <LineageFlow nodeId={nodeId} statusById={statusById} onFocus={onFocus} />
      </div>
    </div>
  )

  if (standalone) return body

  return (
    <div
      data-testid="related-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(4,6,12,0.62)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
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
  return { nodeId, clusters: raw.split(',').map(c => c.trim()).filter(Boolean) }
}
