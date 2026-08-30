import { useOperationalSearch, SEARCH_MIN_Q, type SearchHitT } from '../../api/clusterQueries'
import { layerColor, kindPalette } from '../../theme/semanticColors'
import type { ApiError } from '../../api/client'

/**
 * Results for the TOP BAR's query, over the whole b15 history and relationships graph.
 *
 * Tab 3's own toolbar input filters the cards already on the canvas, which requires a cluster to
 * be selected first — so on a real export there was no way to answer "which cluster runs
 * `DWH.DWH_F_CONTR_LTV_RC_D`?" without guessing one and looking. This panel answers it from any
 * state, including the no-cluster-selected one, which is the state an operator is actually in
 * when they need it.
 *
 * Picking a hit selects the clusters that reach it; the caller then selects the node itself once
 * the scoped graph resolves.
 */
export function OperationalSearch({
  query,
  onPick,
}: {
  query: string
  onPick: (hit: SearchHitT) => void
}) {
  const needle = query.trim()
  const search = useOperationalSearch(needle)
  if (needle.length === 0) return null

  const hits = search.data?.hits ?? []
  const recipes = hits.filter(h => h.kind === 'recipe')
  const tables = hits.filter(h => h.kind === 'table')

  return (
    <div
      data-testid="operational-search"
      style={{
        position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
        zIndex: 50, width: 'min(620px, 92vw)', maxHeight: '60vh', overflow: 'auto',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
        boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
      }}
    >
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)',
        fontSize: 10, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span>{`Search across the whole history · "${needle}"`}</span>
        <div style={{ flex: 1 }} />
        {search.data?.truncated && (
          // Never let a capped list read as a complete one.
          <span style={{ color: 'var(--yellow)', fontFamily: 'JetBrains Mono, monospace' }}>
            showing the first {hits.length}
          </span>
        )}
      </div>

      {needle.length < SEARCH_MIN_Q
        ? <Message text={`Type at least ${SEARCH_MIN_Q} characters.`} />
        : search.isLoading
          ? <Message text="Searching…" />
          : search.error
            ? <Message text={(search.error as ApiError).title ?? 'Search failed'} tone="var(--red)" />
            : hits.length === 0
              ? <Message text="Nothing in the b15 history or the relationships graph matches." />
              : (
                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Group label="Recipes" hits={recipes} onPick={onPick} />
                  <Group label="Tables" hits={tables} onPick={onPick} />
                </div>
              )}
    </div>
  )
}

function Message({ text, tone = 'var(--text-dim)' }: { text: string; tone?: string }) {
  return <div style={{ padding: '14px 12px', fontSize: 11, color: tone }}>{text}</div>
}

function Group({ label, hits, onPick }: { label: string; hits: SearchHitT[]; onPick: (h: SearchHitT) => void }) {
  if (hits.length === 0) return null
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase',
                    letterSpacing: '0.08em', marginBottom: 4, paddingLeft: 4 }}>
        {label} ({hits.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {hits.map(h => (
          <button
            key={`${h.kind}:${h.name}`}
            data-testid={`search-hit-${h.kind}`}
            onClick={() => onPick(h)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
              padding: '6px 8px', borderRadius: 5, cursor: 'pointer',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${kindPalette(h.kind).accent}`,
            }}
          >
            <span style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 3, flexShrink: 0,
              background: `${layerColor(h.layer)}26`, color: layerColor(h.layer),
              border: `1px solid ${layerColor(h.layer)}44`,
              fontFamily: 'JetBrains Mono, monospace',
            }}>{h.layer}</span>
            <span style={{
              fontSize: 11, color: 'var(--text)', flex: 1, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{h.name}</span>
            <span style={{
              fontSize: 9, color: 'var(--text-muted)', flexShrink: 0,
              fontFamily: 'JetBrains Mono, monospace',
            }}>
              {/* A hit nothing in b15 touches is real and worth showing — it just cannot be
                  navigated to, and says so rather than looking like a broken row. */}
              {h.clusters.length === 0
                ? 'no runs'
                : h.clusters.length === 1 ? h.clusters[0] : `${h.clusters.length} clusters`}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
