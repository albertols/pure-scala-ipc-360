import { useEffect, useMemo } from 'react'
import { useOperationalSummary } from '../../api/queries'
import { useScopedRelationships } from '../../api/clusterQueries'
import { toOperationalGraph } from '../../api/relationshipsAdapter'
import { OperationalCard } from '../shared/OperationalCard'
import { kindPalette, statusColor } from '../../theme/semanticColors'
import type { OperationalCard as CardData } from '../../types'

/**
 * One node's direct neighbourhood, focused.
 *
 * Clicking a Related card in the detail panel replaces the selection, which is fine once but
 * loses the shape of a lineage the moment you follow two of them. This shows the whole immediate
 * neighbourhood at once — the focused node centred, everything that exchanges data with it
 * around it — so a hop is a choice made with the map in view rather than a jump into the dark.
 *
 * Rendered in TWO places from this one component (spec §6.2.3): as an in-app hovering window,
 * and standalone at `?related=<nodeId>&clusters=<names>` in a real browser tab. They cannot
 * drift because they are the same component.
 *
 * Scope is deliberately ONE hop. Multi-hop expansion is a graph explorer, which is Tab 4's job.
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

  const rel = useScopedRelationships(clusters)
  // Same scoping as the tab itself: never the whole-corpus summary, which is the request
  // ADR-0014 exists to avoid making.
  const summary = useOperationalSummary(clusters.length > 0, clusters)

  const graph = useMemo(
    () => (rel.data ? toOperationalGraph(rel.data, summary.data, selectedDate, 'compact') : null),
    [rel.data, summary.data, selectedDate],
  )

  const focused = graph?.cards.find(c => c.id === nodeId) ?? null
  const neighbours: CardData[] = focused
    ? focused.relations.map(id => graph!.cards.find(c => c.id === id)).filter((c): c is CardData => !!c)
    : []

  const body = (
    <div
      data-testid="related-overlay"
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: standalone ? 0 : 10,
        width: standalone ? '100%' : 'min(860px, 92vw)',
        height: standalone ? '100%' : 'min(72vh, 620px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: standalone ? 'none' : '0 18px 60px rgba(0,0,0,0.55)',
      }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Related</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
          {focused ? `${focused.name} · ${neighbours.length} connected` : nodeId}
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

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {rel.isLoading || summary.isLoading
          ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading the neighbourhood…</div>
          : !focused
            ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {`No node "${nodeId}" in the selected clusters.`}
              </div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div data-testid="overlay-focus">
                  <OperationalCard card={focused} density="detailed" selected />
                </div>

                {neighbours.length === 0
                  ? <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      Nothing exchanges data with this node in the selected clusters.
                    </div>
                  : (
                    <div style={{
                      display: 'grid', gap: 10,
                      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                    }}>
                      {neighbours.map(n => (
                        <div
                          key={n.id}
                          data-testid="overlay-node"
                          onClick={() => onFocus?.(n.id)}
                          style={{
                            cursor: onFocus ? 'pointer' : 'default',
                            // The connection to the centre, stated on the card that has it:
                            // an edge line would need a layout pass this view deliberately avoids.
                            borderLeft: `2px solid ${kindPalette(n.kind).accent}`,
                            paddingLeft: 6,
                          }}
                        >
                          <OperationalCard card={n} density="compact" />
                          <div style={{
                            fontSize: 9, color: statusColor(n.status), marginTop: 3,
                            fontFamily: 'JetBrains Mono, monospace',
                          }}>{n.status}</div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            )}
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
