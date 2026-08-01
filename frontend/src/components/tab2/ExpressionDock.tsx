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

const exprFilterInputStyle: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 5, color: '#c8d3e8', fontSize: 11, padding: '4px 9px',
  outline: 'none', width: '100%', fontFamily: 'Inter, sans-serif',
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
  const filtered = q === '' ? recipeEntries : recipeEntries.filter(e =>
    [e.mappingPath, e.layer, e.transformation, e.port, e.formula]
      .some(v => (v ?? '').toLowerCase().includes(q)))

  return (
    <div style={{
      width: 260, flexShrink: 0,
      background: 'var(--surface)',
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{ padding: 8, borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#a78bfa', fontFamily: 'JetBrains Mono, monospace' }}>ƒ</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#4a5570', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Expressions
          </span>
        </div>
        <input
          value={filter}
          onChange={e => onFilterChange(e.target.value)}
          placeholder="Filter expressions…"
          style={exprFilterInputStyle}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {isLoading ? (
          <LoadingState label="Loading expressions…" />
        ) : error ? (
          <div style={{ color: 'var(--red)', fontSize: 11 }}>{error.title}</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: '#4a5570', fontSize: 11 }}>No expressions match.</div>
        ) : (
          filtered.map((e, i) => (
            <div
              key={i}
              draggable
              onDragStart={ev => ev.dataTransfer.setData('text/etl-formula', e.formula ?? '')}
              style={{ border: '1px solid rgba(167,139,250,0.2)', borderRadius: 5, overflow: 'hidden', cursor: 'grab' }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 8px', background: 'rgba(167,139,250,0.05)',
                borderBottom: '1px solid rgba(167,139,250,0.15)',
              }}>
                <span style={{ fontSize: 9, color: '#4a5570', fontFamily: 'JetBrains Mono, monospace' }}>{e.layer}</span>
                <span style={{
                  fontSize: 10, color: '#c8d3e8', fontFamily: 'JetBrains Mono, monospace', flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{e.transformation}.{e.port}</span>
                <CopyButton value={e.formula ?? ''} size={11} />
                {canInsert && (
                  <button onClick={() => onInsert(e.formula ?? '')} style={{
                    padding: '2px 8px', borderRadius: 4,
                    background: 'rgba(79,156,249,0.15)', border: '1px solid #4f9cf9',
                    color: '#4f9cf9', fontSize: 9, cursor: 'pointer', fontWeight: 600,
                  }}>Insert</button>
                )}
              </div>
              <div style={{
                fontSize: 9, color: '#4a5570', padding: '3px 8px 0',
                fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{e.mappingPath}</div>
              <pre style={{
                margin: 0, padding: '6px 8px',
                fontSize: 10, color: '#a78bfa',
                fontFamily: 'JetBrains Mono, monospace',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6,
              }}>{e.formula}</pre>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
