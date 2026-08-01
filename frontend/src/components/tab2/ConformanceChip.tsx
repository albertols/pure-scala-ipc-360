// ─── IPC conformance chip + drawer (Task 13) ───────────────────────────────
//
// Purely presentational over `useValidation`'s output (ipcRules.ts) — this
// component makes no network call of its own. Colors are the three tokens
// the brief pins: `--green` (zero errors AND zero warnings), `#fbbf24` (the
// existing SaveBar warning amber — warnings but no errors, a distinct
// non-alarming state), `--red` (any errors).

import { useState } from 'react'
import type { RecipeValidationError, IpcCheck, IpcRuleMeta } from '../../api/queries'
import type { CanvasGraph } from '../../api/mappingAdapter'
import { nodeIdFromPath } from '../../api/ipcRules'

function s(n: number): string {
  return n === 1 ? '' : 's'
}

export function ConformanceChip({
  errors,
  warnings,
  checks,
  rules,
  isValidating,
  graph,
  onSelectNode,
}: {
  errors: RecipeValidationError[]
  warnings: RecipeValidationError[]
  checks: IpcCheck[]
  rules: IpcRuleMeta[]
  isValidating?: boolean
  graph: CanvasGraph | null
  onSelectNode: (id: string) => void
}) {
  const [open, setOpen] = useState(false)

  const color = errors.length > 0 ? 'var(--red)' : warnings.length > 0 ? '#fbbf24' : 'var(--green)'
  const bg = errors.length > 0
    ? 'rgba(248,113,113,0.15)'
    : warnings.length > 0 ? 'rgba(251,191,36,0.15)' : 'rgba(52,211,153,0.15)'

  const failing = checks.filter(c => c.status === 'fail')
  const ruleById = new Map(rules.map(r => [r.id, r]))

  const handleRowClick = (check: IpcCheck) => {
    const nodeId = nodeIdFromPath(check.path, graph)
    // Degrade gracefully: a path that doesn't resolve to a canvas node
    // (e.g. `$.table.targetTableNames`) selects nothing rather than passing
    // an undefined/garbage id up to the caller.
    if (nodeId) onSelectNode(nodeId)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        padding: '5px 12px', borderRadius: 5,
        background: bg, border: `1px solid ${color}`,
        color, fontSize: 11, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
        {`${errors.length} error${s(errors.length)}`}
        {warnings.length > 0 && ` · ${warnings.length} warning${s(warnings.length)}`}
        {isValidating && ' …'}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 20,
          width: 320, maxHeight: 360, overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 6, padding: 10,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {failing.length === 0 ? (
            <div style={{ fontSize: 11, color: '#4a5570' }}>No conformance issues.</div>
          ) : (
            failing.map((check, i) => {
              const rule = ruleById.get(check.ruleId ?? '')
              const rowColor = check.severity === 'error' ? 'var(--red)' : '#fbbf24'
              return (
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
                <div key={i} onClick={() => handleRowClick(check)} style={{
                  border: '1px solid var(--border-subtle)', borderRadius: 5, padding: '6px 8px',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 3,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: rowColor, fontWeight: 600 }}>
                      {check.ruleId}
                    </span>
                    <span style={{
                      fontSize: 9, color: '#4a5570', fontFamily: 'JetBrains Mono, monospace',
                      flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{check.path}</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#c8d3e8' }}>{check.message}</div>
                  {rule?.statement && (
                    <div style={{ fontSize: 9, color: '#4a5570' }}>{rule.statement}</div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
