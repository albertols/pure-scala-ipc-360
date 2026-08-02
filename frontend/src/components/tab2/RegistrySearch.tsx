import { useState } from 'react'
import type { ApiError } from '../../api/client'
import { useRegistry } from '../../api/registryQueries'
import type { RegistryTable } from '../../api/registryQueries'
import { RENDER_CAP } from './ExpressionDock'
import { LoadingState } from '../shared/Spinner'

// ─── Registry search (Task 13) ──────────────────────────────────────────────
//
// Filter UI over `GET /api/registry` (Task 12), backing `NodeConfigDialog`'s
// name field: an operator picks an existing table instead of typing one from
// memory, without being FORCED to (free text stays allowed there — a target
// that doesn't exist yet is the point of "from scratch", Task 15).
//
// `columns` on a `ddlTables` entry can be a union across genuinely divergent
// DDL files sharing one name (Task 12's doc comment, Task 16 owns surfacing
// the divergence) — this component's job is only not to make that worse: a
// row never renders the full column list as if it were one file's schema,
// only a count, and `usedByRecipes` (the actual provenance — which recipes
// reference this name) is surfaced on every row via its native `title`
// tooltip, the one affordance available without inventing new UI.
//
// Caps its rendered list with `ExpressionDock`'s exported `RENDER_CAP` — one
// constant shared by both capped lists, not two that can drift.

const registryFilterInputStyle: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 5, color: '#c8d3e8', fontSize: 11, padding: '4px 9px',
  outline: 'none', width: '100%', fontFamily: 'Inter, sans-serif',
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '5px 8px', borderRadius: 4,
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: '#c8d3e8', fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
  cursor: 'pointer', textAlign: 'left', width: '100%',
}

function tablesForKind(
  registry: { sourceTables?: RegistryTable[]; targetTables?: RegistryTable[]; ddlTables?: RegistryTable[] } | undefined,
  kind: 'source' | 'target' | 'ddl',
): RegistryTable[] {
  if (!registry) return []
  switch (kind) {
    case 'source': return registry.sourceTables ?? []
    case 'target': return registry.targetTables ?? []
    case 'ddl': return registry.ddlTables ?? []
  }
}

function matches(table: RegistryTable, q: string): boolean {
  if (q === '') return true
  if ((table.name ?? '').toLowerCase().includes(q)) return true
  return (table.columns ?? []).some(c => c.toLowerCase().includes(q))
}

export function RegistrySearch({
  kind,
  onPick,
}: {
  kind: 'source' | 'target' | 'ddl'
  onPick: (table: RegistryTable) => void
}) {
  const { data, isLoading, error } = useRegistry()
  const [filter, setFilter] = useState('')

  const q = filter.trim().toLowerCase()
  const tables = tablesForKind(data, kind)
  const filtered = tables.filter(t => matches(t, q))
  const shown = filtered.slice(0, RENDER_CAP)
  const apiError = error as ApiError | null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Filter tables or columns…"
        style={registryFilterInputStyle}
      />
      <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {isLoading ? (
          <LoadingState label="Loading registry…" />
        ) : apiError ? (
          <div style={{ color: 'var(--red)', fontSize: 11 }}>{apiError.title}</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: '#4a5570', fontSize: 11 }}>No tables match.</div>
        ) : (
          <>
            {shown.map(t => (
              <button key={t.name} type="button" onClick={() => onPick(t)} style={rowStyle}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                {(t.columns?.length ?? 0) > 0 && (
                  <span style={{ fontSize: 9, color: '#4a5570', flexShrink: 0 }}>{`${t.columns!.length} cols`}</span>
                )}
                <span
                  title={(t.usedByRecipes ?? []).join('\n')}
                  style={{ fontSize: 9, color: '#4a5570', flexShrink: 0 }}
                >{`used by ${t.usedByRecipes?.length ?? 0}`}</span>
              </button>
            ))}
            {filtered.length > shown.length && (
              <div style={{ fontSize: 9, color: '#4a5570', padding: '4px 2px', fontFamily: 'JetBrains Mono, monospace' }}>
                {`showing ${shown.length} of ${filtered.length} · refine the filter`}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
