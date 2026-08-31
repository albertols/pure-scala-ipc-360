import { useState } from 'react'
import type { ApiError } from '../../api/client'
import type { ExpressionEntry } from '../../api/queries'
import { CopyButton } from '../shared/CopyButton'
import { LoadingState } from '../shared/Spinner'

// ─── Expression dock (Task 14) ──────────────────────────────────────────────
//
// Was `ExpressionRegistry`, inline below the canvas and merging xml- and
// recipe-origin entries (`ETLModifier.tsx:465-543`, Task 11). Relocated into a
// right-side dock beside the `Palette` and filtered to **recipe-origin only**
// (`origin === 'recipe'`) — the Modifier's whole premise is the post-parse
// agnostic model, so XML-origin formulas belong to Tab 1 (spec §6.6). Because
// only one origin renders now, the old `OriginBadge` no longer discriminates
// anything and is dropped; the layer chip stays.
//
// Rows are drag sources (`text/etl-formula` payload) in addition to the
// existing click-to-Insert path — both ultimately land through the same
// `parseFormulaText` -> `setFieldTransformation` mutator
// (`ETLModifier.tsx`'s `handleInsertExpression`, which the drop targets on
// the Inspector's formula fields and the canvas also route through).

/** Rendered-row cap. The archive is 1909 recipe-origin entries corpus-wide; mounting
 * them all is both unreadable and a real DOM cost. The filter above remains the way to
 * reach any entry, so this caps what is PAINTED, never what is reachable.
 * EXPORTED because Task 13's `RegistrySearch` caps its list the same way — one constant,
 * not two that can drift. */
export const RENDER_CAP = 150
/** Clamp height for a collapsed formula: 3 lines at fontSize 10 / lineHeight 1.6. */
const CLAMP_PX = 10 * 1.6 * 3

const exprFilterInputStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 5,
  color: '#c8d3e8',
  fontSize: 11,
  padding: '4px 9px',
  outline: 'none',
  width: '100%',
  fontFamily: 'Inter, sans-serif',
}

export function ExpressionDock({
  entries,
  isLoading,
  error,
  filter,
  onFilterChange,
  canInsert,
  onInsert,
}: {
  /** Corpus-wide, both origins — filtered down to `origin === 'recipe'` here,
   * not by the caller, so this component is the single source of truth for
   * the recipe-only scoping (per its own test suite). */
  entries: ExpressionEntry[]
  isLoading: boolean
  error: ApiError | null
  filter: string
  onFilterChange: (v: string) => void
  canInsert: boolean
  onInsert: (formula: string) => void
}) {
  const recipeEntries = entries.filter(e => e.origin === 'recipe')
  const q = filter.trim().toLowerCase()
  const filtered =
    q === ''
      ? recipeEntries
      : recipeEntries.filter(e =>
          [e.mappingPath, e.layer, e.transformation, e.port, e.formula].some(v =>
            (v ?? '').toLowerCase().includes(q),
          ),
        )

  const shown = filtered.slice(0, RENDER_CAP)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const toggle = (i: number) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (!next.delete(i)) next.add(i)
      return next
    })

  // Pane-level collapse (UX round 4) — distinct from the per-formula clamp
  // toggle above. The dock is a fixed 260px column the canvas can never
  // reclaim; collapsed it becomes a slim strip whose single affordance
  // expands it back. Local state on purpose: the dock always mounts expanded,
  // and (like the Explorer's own collapse) the preference is per-session.
  const [collapsed, setCollapsed] = useState(false)

  if (collapsed) {
    return (
      <div
        style={{
          width: 36,
          flexShrink: 0,
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 8,
          gap: 8,
        }}
      >
        <button
          aria-label="Expand expressions"
          title="Expand expressions"
          onClick={() => setCollapsed(false)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
            color: '#7b88aa',
            fontSize: 12,
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          «
        </button>
        <span style={{ fontSize: 12, color: '#a78bfa', fontFamily: 'JetBrains Mono, monospace' }}>
          ƒ
        </span>
      </div>
    )
  }

  return (
    <div
      style={{
        width: 260,
        flexShrink: 0,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
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
          <span style={{ fontSize: 12, color: '#a78bfa', fontFamily: 'JetBrains Mono, monospace' }}>
            ƒ
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#4a5570',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Expressions
          </span>
          <div style={{ flex: 1 }} />
          <button
            aria-label="Collapse expressions"
            title="Collapse expressions"
            onClick={() => setCollapsed(true)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 2,
              color: '#7b88aa',
              fontSize: 12,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            »
          </button>
        </div>
        <input
          value={filter}
          onChange={e => onFilterChange(e.target.value)}
          placeholder="Filter expressions…"
          style={exprFilterInputStyle}
        />
      </div>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {isLoading ? (
          <LoadingState label="Loading expressions…" />
        ) : error ? (
          <div style={{ color: 'var(--red)', fontSize: 11 }}>{error.title}</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: '#4a5570', fontSize: 11 }}>No expressions match.</div>
        ) : (
          <>
            {shown.map((e, i) => (
              <div
                key={i}
                draggable
                onDragStart={ev => ev.dataTransfer.setData('text/etl-formula', e.formula ?? '')}
                // `flexShrink: 0` is load-bearing, not cosmetic. This list is a
                // `flexDirection: 'column'` container inside the FIXED-height
                // editor shell, and `overflow: 'hidden'` here (the rounded-corner
                // clip) zeroes this item's automatic minimum size — so the default
                // `flex-shrink: 1` squeezed all 150 rows to their 2px border box
                // rather than overflowing into the container's own
                // `overflowY: 'auto'`. The dock painted as a stack of hairlines
                // with every formula present in the DOM but invisible.
                // (`Palette`/`RegistrySearch` rows survive the same layout only
                // because they keep `overflow: visible`, which leaves
                // `min-height: auto` intact.)
                style={{
                  border: '1px solid rgba(167,139,250,0.2)',
                  borderRadius: 5,
                  overflow: 'hidden',
                  cursor: 'grab',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 8px',
                    background: 'rgba(167,139,250,0.05)',
                    borderBottom: '1px solid rgba(167,139,250,0.15)',
                  }}
                >
                  <button
                    aria-label={expanded.has(i) ? 'Collapse formula' : 'Expand formula'}
                    onClick={() => toggle(i)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      color: '#4a5570',
                      fontSize: 9,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  >
                    {expanded.has(i) ? '▾' : '▸'}
                  </button>
                  <span
                    style={{
                      fontSize: 9,
                      color: '#4a5570',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  >
                    {e.layer}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: '#c8d3e8',
                      fontFamily: 'JetBrains Mono, monospace',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {e.transformation}.{e.port}
                  </span>
                  <CopyButton value={e.formula ?? ''} size={11} />
                  {canInsert && (
                    <button
                      onClick={() => onInsert(e.formula ?? '')}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'rgba(79,156,249,0.15)',
                        border: '1px solid #4f9cf9',
                        color: '#4f9cf9',
                        fontSize: 9,
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Insert
                    </button>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: '#4a5570',
                    padding: '3px 8px 0',
                    fontFamily: 'JetBrains Mono, monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {e.mappingPath}
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: '6px 8px',
                    fontSize: 10,
                    color: '#a78bfa',
                    fontFamily: 'JetBrains Mono, monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    lineHeight: 1.6,
                    ...(expanded.has(i)
                      ? { maxHeight: 260, overflowY: 'auto' as const }
                      : { maxHeight: CLAMP_PX, overflow: 'hidden' as const }),
                  }}
                >
                  {e.formula}
                </pre>
              </div>
            ))}
            {filtered.length > shown.length && (
              <div
                style={{
                  fontSize: 9,
                  color: '#4a5570',
                  padding: '4px 2px',
                  fontFamily: 'JetBrains Mono, monospace',
                  flexShrink: 0,
                }}
              >
                {`showing ${shown.length} of ${filtered.length} · refine the filter`}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
