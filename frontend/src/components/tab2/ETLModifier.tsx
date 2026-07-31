import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ETLNode, Connection, Port } from '../../types'
import type { FSFile, FSDir } from '../../types'
import type { ApiError } from '../../api/client'
import { apiGet, apiSend } from '../../api/client'
import { useRecipe, useDdl, useExpressions } from '../../api/queries'
import type { RecipeFile, RecipeValidation, RecipeValidationError, ExpressionEntry } from '../../api/queries'
import { recipeToCanvas, renderFormula, fieldsOf } from '../../api/recipeAdapter'
import type { RecipeJson, RecipeFieldJson } from '../../api/recipeAdapter'
import {
  addSourceTable,
  addStep,
  deleteEdge,
  deleteNode,
  editFieldDataType,
  parseFormulaText,
  refsInto,
  renameNode,
  setFieldTransformation,
} from '../../api/recipeEdits'
import { Sidebar } from '../shared/Sidebar'
import { useFilesystem } from '../shared/useFilesystem'
import { EtlCanvas } from '../shared/EtlCanvas'
import { CopyButton } from '../shared/CopyButton'
import { GCPIcon } from '../shared/GCPIcon'
import { Palette, SOURCE_TABLE_TYPE } from './Palette'
import { HistoryDrawer } from './HistoryDrawer'

const EMPTY_FS: FSDir = { name: 'xmltobq', layer: 'root', children: [] }

/** Real DDL JSON shape (parser `<TABLE>.json` output) — BigQuery field list. */
interface DdlColumnJson {
  name?: string
  type?: string
  mode?: string
  description?: string
}

// ─── Save Bar ─────────────────────────────────────────────────────────────────

/** Delete idiom (Task 9): the SaveBar's existing "Save Changes"/"Discard" button
 * pair, recomposed with the `--red` token in place of the blue one — no new
 * tokens introduced. */
const dangerButtonStyle: React.CSSProperties = {
  padding: '5px 14px', borderRadius: 5,
  background: 'rgba(248,113,113,0.15)', border: '1px solid var(--red)',
  color: 'var(--red)', fontSize: 12, cursor: 'pointer', fontWeight: 600,
}
const ghostButtonStyle: React.CSSProperties = {
  padding: '5px 14px', borderRadius: 5,
  background: 'transparent', border: '1px solid var(--border)',
  color: '#7b88aa', fontSize: 12, cursor: 'pointer',
}

/** Task 9: the wire-mode indicator lives in the same sticky row as the dirty
 * indicator/Save/Discard controls — the bar now also mounts while a wire is
 * in progress (dirty count 0), not only while there are unsaved changes. */
function SaveBar({
  changes,
  wireFrom,
  onCancelWire,
  onSave,
  onDiscard,
}: {
  changes: number
  wireFrom: { nodeId: string; portName: string } | null
  onCancelWire: () => void
  onSave: () => void
  onDiscard: () => void
}) {
  if (changes === 0 && !wireFrom) return null
  return (
    <div style={{
      position: 'sticky', bottom: 0,
      background: 'var(--surface)',
      borderTop: '1px solid #fbbf2444',
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      zIndex: 10,
    }}>
      {wireFrom && (
        <div
          onClick={onCancelWire}
          title="Click to cancel"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 10px', borderRadius: 5,
            background: 'rgba(79,156,249,0.15)', border: '1px solid #4f9cf9',
            color: '#4f9cf9', fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
            cursor: 'pointer',
          }}
        >{`wire: ${wireFrom.nodeId}.${wireFrom.portName} → click an IN port`}</div>
      )}
      {changes > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: '#fbbf24',
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" stroke="#fbbf24" strokeWidth="1.2" />
            <line x1="6" y1="3.5" x2="6" y2="6.5" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="6" cy="8.5" r="0.8" fill="#fbbf24" />
          </svg>
          {changes} unsaved change{changes !== 1 ? 's' : ''}
        </div>
      )}
      <div style={{ flex: 1 }} />
      {changes > 0 && (
        <>
          <button onClick={onDiscard} style={ghostButtonStyle}>Discard</button>
          <button onClick={onSave} style={{
            padding: '5px 16px', borderRadius: 5,
            background: 'rgba(79,156,249,0.15)', border: '1px solid #4f9cf9',
            color: '#4f9cf9', fontSize: 12, cursor: 'pointer', fontWeight: 600,
          }}>Save Changes</button>
        </>
      )}
    </div>
  )
}

// ─── Editable Field ───────────────────────────────────────────────────────────

function EditableField({
  label,
  value,
  onChange,
  mono = false,
  onCommit,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  mono?: boolean
  /** Fired on blur, after the style reset — Task 8's edit panel commits draft
   * mutations here rather than per-keystroke. */
  onCommit?: () => void
}) {
  const sharedStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: '#c8d3e8',
    fontSize: mono ? 11 : 12,
    padding: '5px 8px',
    fontFamily: mono ? 'JetBrains Mono, monospace' : 'Inter, sans-serif',
    outline: 'none',
  }

  return (
    <div>
      <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
        <input value={value} onChange={e => onChange(e.target.value)}
          style={sharedStyle}
          onFocus={e => { e.target.style.borderColor = '#4f9cf9' }}
          onBlur={e => { e.target.style.borderColor = 'var(--border)'; onCommit?.() }}
        />
        <CopyButton value={value} />
      </div>
    </div>
  )
}

// ─── DDL Viewer ───────────────────────────────────────────────────────────────

function DDLViewer({ cols }: { cols: DdlColumnJson[] }) {
  if (cols.length === 0) return null

  const modeColor: Record<string, string> = { REQUIRED: '#34d399', NULLABLE: '#4a5570', REPEATED: '#818cf8' }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto auto 2fr',
        background: 'var(--surface-2)', padding: '6px 10px',
        borderBottom: '1px solid var(--border)',
        fontSize: 9, color: '#4a5570', textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        <span>Column</span>
        <span style={{ textAlign: 'right', paddingRight: 12 }}>BQ Type</span>
        <span style={{ textAlign: 'right', paddingRight: 12 }}>Mode</span>
        <span>Description</span>
      </div>
      {cols.map((col, i) => (
        <div key={i} className="port-row" style={{
          display: 'grid', gridTemplateColumns: '1fr auto auto 2fr',
          padding: '6px 10px', borderBottom: i < cols.length - 1 ? '1px solid var(--border-subtle)' : 'none',
          alignItems: 'center', gap: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#c8d3e8' }}>{col.name}</span>
            <CopyButton value={col.name ?? ''} size={11} />
          </div>
          <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#4f9cf9', textAlign: 'right', paddingRight: 12 }}>{col.type}</span>
          <span style={{
            fontSize: 8, fontFamily: 'JetBrains Mono, monospace', textAlign: 'right', paddingRight: 12,
            color: modeColor[col.mode ?? ''] ?? '#4a5570',
          }}>{col.mode}</span>
          <span style={{ fontSize: 10, color: '#4a5570', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.description || '—'}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ icon, label, color, extra }: { icon: string; label: string; color: string; extra?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 14, color, fontFamily: 'JetBrains Mono, monospace' }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f8' }}>{label}</span>
      {extra}
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

// ─── Table name list (Source / Target cards) ───────────────────────────────────

function TableNameList({ names, emptyLabel }: { names: string[]; emptyLabel: string }) {
  if (names.length === 0) {
    return <div style={{ color: '#4a5570', fontSize: 11 }}>{emptyLabel}</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {names.map(name => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#c8d3e8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </span>
          <CopyButton value={name} size={11} />
        </div>
      ))}
    </div>
  )
}

// ─── Edit panel (Task 8) ────────────────────────────────────────────────────────

/** One field's editors: dataType + a formula textarea seeded with `renderFormula`
 * and parsed back via `parseFormulaText` on blur. Local state so keystrokes stay
 * responsive; commits (draft mutation + dirty count) fire on blur only. */
function FieldEditor({
  stepName,
  field,
  onDataType,
  onFormula,
  onFocusFormula,
}: {
  stepName: string
  field: RecipeFieldJson
  onDataType: (stepName: string, fieldName: string, dataType: string) => void
  onFormula: (stepName: string, fieldName: string, text: string) => void
  /** Task 11: reports focus-in on this field's formula textarea so the "All
   * Expressions" registry can offer an Insert action targeting it. */
  onFocusFormula: (stepName: string, fieldName: string) => void
}) {
  const fieldName = field.name ?? ''
  const originalFormula = renderFormula(field.transformation)
  const [dataType, setDataType] = useState(field.dataType ?? '')
  const [formula, setFormula] = useState(originalFormula)

  useEffect(() => {
    setDataType(field.dataType ?? '')
    setFormula(originalFormula)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldName, field.dataType, originalFormula])

  return (
    <div style={{
      border: '1px solid var(--border-subtle)', borderRadius: 5, padding: 10,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ fontSize: 10, color: '#4a5570', fontFamily: 'JetBrains Mono, monospace' }}>{fieldName}</div>
      <EditableField label="Data type" value={dataType} onChange={setDataType} mono
        onCommit={() => { if (dataType !== (field.dataType ?? '')) onDataType(stepName, fieldName, dataType) }} />
      <div>
        <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 3 }}>Formula</div>
        <textarea
          value={formula}
          onChange={e => setFormula(e.target.value)}
          onFocus={() => onFocusFormula(stepName, fieldName)}
          onBlur={() => { if (formula !== originalFormula) onFormula(stepName, fieldName, formula) }}
          rows={2}
          style={{
            width: '100%', resize: 'vertical',
            background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
            color: '#c8d3e8', fontSize: 11, padding: '5px 8px',
            fontFamily: 'JetBrains Mono, monospace', outline: 'none',
          }}
        />
      </div>
    </div>
  )
}

/** Delete affordance for the selected node (Task 9): a `--red`-bordered Delete
 * button which, on first click, arms a confirm hint quoting the exact field
 * count `refsInto` would clear (the same helper `deleteNode` itself uses to
 * decide what to clear, so the hint can never drift from the actual effect) —
 * a second click (Confirm delete) or Cancel resolves it. Re-arms to the
 * unconfirmed state whenever the selected node changes. */
function DeleteNodeControl({ draft, nodeId, onDelete }: { draft: RecipeJson; nodeId: string; onDelete: (name: string) => void }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => { setArmed(false) }, [nodeId])
  const refCount = refsInto(draft, nodeId)

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
      {!armed ? (
        <button onClick={() => setArmed(true)} style={dangerButtonStyle}>Delete</button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--red)' }}>
            {`Removes ${nodeId} and clears ${refCount} incoming reference(s)`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setArmed(false)} style={ghostButtonStyle}>Cancel</button>
            <button onClick={() => onDelete(nodeId)} style={dangerButtonStyle}>Confirm delete</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Edit panel for the selected canvas node: rename (any node) plus, for step
 * nodes (not sources — those have no `step.target.fields` to edit), a
 * per-field dataType + formula editor, plus the delete control (any node). */
function EditPanel({
  draft,
  node,
  onRename,
  onFieldDataType,
  onFieldFormula,
  onFocusFormula,
  onDelete,
}: {
  draft: RecipeJson
  node: ETLNode
  onRename: (oldName: string, newName: string) => void
  onFieldDataType: (stepName: string, fieldName: string, dataType: string) => void
  onFieldFormula: (stepName: string, fieldName: string, text: string) => void
  onFocusFormula: (stepName: string, fieldName: string) => void
  onDelete: (name: string) => void
}) {
  const [name, setName] = useState(node.id)
  useEffect(() => { setName(node.id) }, [node.id])

  const step = draft.steps?.find(s => s.target?.name === node.id)
  const fields = step ? fieldsOf(step.target) : []

  return (
    <section>
      <SectionHeader icon="✎" label={`Edit — ${node.id}`} color="#4f9cf9" />
      <div style={{
        padding: 16, background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 7,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <EditableField label="Node name" value={name} onChange={setName}
          onCommit={() => { if (name.trim() !== '' && name !== node.id) onRename(node.id, name) }} />

        {fields.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {fields.map(f => (
              <FieldEditor key={f.name} stepName={node.id} field={f}
                onDataType={onFieldDataType} onFormula={onFieldFormula} onFocusFormula={onFocusFormula} />
            ))}
          </div>
        )}

        <DeleteNodeControl draft={draft} nodeId={node.id} onDelete={onDelete} />
      </div>
    </section>
  )
}

// ─── Expression registry (Task 11) ─────────────────────────────────────────────

/** Origin chip — reuses the header layer-badge idiom (mono, small, tinted
 * background/border in the origin's own token color): `xml` -> `--cyan`
 * (#67e8f9), `recipe` -> `--green` (#34d399), same rgba-tint pattern as the
 * layer badge above (tokens duplicated as rgb() triples, matching the rest
 * of this file's inline styles — see `dangerButtonStyle`). */
const ORIGIN_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  xml: { color: 'var(--cyan)', bg: 'rgba(103,232,249,0.15)', border: 'rgba(103,232,249,0.35)' },
  recipe: { color: 'var(--green)', bg: 'rgba(52,211,153,0.15)', border: 'rgba(52,211,153,0.35)' },
}
const DEFAULT_ORIGIN_STYLE = { color: '#7b88aa', bg: 'rgba(123,136,170,0.15)', border: 'rgba(123,136,170,0.35)' }

function OriginBadge({ origin }: { origin: string }) {
  const s = ORIGIN_STYLE[origin] ?? DEFAULT_ORIGIN_STYLE
  return (
    <span style={{
      fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 600,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>{origin}</span>
  )
}

const exprFilterInputStyle: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 5, color: '#c8d3e8', fontSize: 11, padding: '4px 9px',
  outline: 'none', width: 200, fontFamily: 'Inter, sans-serif',
}

/** Corpus-wide expression archive (Task 11): merges xml- and recipe-origin
 * entries from `useExpressions()` (was: only the currently open recipe's own
 * `port.expression`s, Task 6-10's interim collector). A substring filter
 * narrows the list across every field; when a formula textarea in the edit
 * panel has focus (`canInsert`), each row grows an Insert button that writes
 * that entry's formula into the focused field via `onInsert`. */
function ExpressionRegistry({
  entries,
  isLoading,
  error,
  filter,
  onFilterChange,
  canInsert,
  onInsert,
}: {
  entries: ExpressionEntry[]
  isLoading: boolean
  error: ApiError | null
  filter: string
  onFilterChange: (v: string) => void
  canInsert: boolean
  onInsert: (formula: string) => void
}) {
  const q = filter.trim().toLowerCase()
  const filtered = q === '' ? entries : entries.filter(e =>
    [e.mappingPath, e.layer, e.transformation, e.port, e.formula, e.origin]
      .some(v => (v ?? '').toLowerCase().includes(q)))

  return (
    <section>
      <SectionHeader icon="ƒ" label="All Expressions" color="#a78bfa" extra={
        <input
          value={filter}
          onChange={e => onFilterChange(e.target.value)}
          placeholder="Filter expressions…"
          style={exprFilterInputStyle}
        />
      } />
      {isLoading ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>Loading expressions…</div>
      ) : error ? (
        <div style={{ color: 'var(--red)', fontSize: 11 }}>{error.title}</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#4a5570', fontSize: 11 }}>No expressions match.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map((e, i) => (
            <div key={i} style={{ border: '1px solid rgba(167,139,250,0.2)', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 10px', background: 'rgba(167,139,250,0.05)',
                borderBottom: '1px solid rgba(167,139,250,0.15)',
              }}>
                <OriginBadge origin={e.origin ?? ''} />
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
                fontSize: 9, color: '#4a5570', padding: '3px 10px 0',
                fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{e.mappingPath}</div>
              <pre style={{
                margin: 0, padding: '6px 10px',
                fontSize: 10, color: '#a78bfa',
                fontFamily: 'JetBrains Mono, monospace',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6,
              }}>{e.formula}</pre>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ETLModifier({ searchQuery }: { searchQuery: string }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [recipePath, setRecipePath] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<Connection | null>(null)
  const [wireFrom, setWireFrom] = useState<{ nodeId: string; portName: string } | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const { fs, loading, error } = useFilesystem()
  const queryClient = useQueryClient()

  // Expression registry (Task 11): corpus-wide, independent of the currently
  // open recipe. `focusedFormula` tracks which field's formula textarea last
  // gained focus in the edit panel below — set via `FieldEditor.onFocusFormula`
  // — so a registry row can offer "Insert" only while there's somewhere for it
  // to write.
  const expr = useExpressions()
  const [exprFilter, setExprFilter] = useState('')
  const [focusedFormula, setFocusedFormula] = useState<{ stepName: string; fieldName: string } | null>(null)

  // History drawer + view mode (Task 10): `viewingVersion`/`viewedRecipe` are
  // set together (handleViewVersion awaits the archived GET, then sets both in
  // the same render) — `viewingVersion !== null` is the single "isViewing"
  // source of truth used to swap the canvas/panels/header onto the archived
  // recipe and to blanket-disable every editing affordance below. `viewedRecipe`
  // keeps the FULL archived RecipeDto (not just `.content`) so the header card
  // can show the archive's own fileName/sizeBytes/modifiedAt instead of the
  // live recipe's (review finding: showing the read-only banner next to the
  // LIVE modifiedAt was misleading).
  const [historyOpen, setHistoryOpen] = useState(false)
  const [viewingVersion, setViewingVersion] = useState<string | null>(null)
  const [viewedRecipe, setViewedRecipe] = useState<RecipeFile | null>(null)
  const isViewing = viewingVersion !== null

  const rec = useRecipe(recipePath ?? '')
  const recError = rec.error as ApiError | null

  // Draft editing state (Task 8): deep-cloned from the loaded recipe whenever a
  // *different* recipe or a fresh save lands (recipePath + modifiedAt) — not on
  // every rec.data reference change, so in-progress edits survive re-renders.
  const [draft, setDraft] = useState<RecipeJson | null>(null)
  const [dirtyOps, setDirtyOps] = useState(0)
  const [validationErrors, setValidationErrors] = useState<RecipeValidationError[]>([])
  const [saveError, setSaveError] = useState<{ title: string; detail?: string } | null>(null)

  useEffect(() => {
    if (rec.data) {
      setDraft(structuredClone(rec.data.content as RecipeJson))
      setDirtyOps(0)
      setValidationErrors([])
      setSaveError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipePath, rec.data?.modifiedAt])

  // Canvas + panels derive from whichever content is "current" — the live
  // draft normally, or the archived version while viewing (spec §6: "canvas +
  // panels derive from the archived content"). Header metadata follows the
  // same swap (see `headerRecipe` below).
  const content = isViewing ? ((viewedRecipe?.content ?? null) as RecipeJson | null) : draft
  // Header card metadata (fileName/path/sizeBytes/modifiedAt) follows the same
  // swap as `content` — review finding: showing a read-only "viewing archived
  // version" banner next to the LIVE modifiedAt was misleading.
  const headerRecipe = isViewing && viewedRecipe ? viewedRecipe : rec.data
  const graph = useMemo(
    () => (content && recipePath ? recipeToCanvas(content, recipePath) : null),
    [content, recipePath],
  )

  const recipeSlash = recipePath ? recipePath.lastIndexOf('/') : -1
  const recipeDir = recipeSlash >= 0 ? recipePath!.slice(0, recipeSlash) : ''
  const ddl = useDdl(recipeDir)
  const ddlEntries = ddl.data ? Object.entries(ddl.data as Record<string, DdlColumnJson[]>) : []

  const selectedNode = graph?.nodes.find(n => n.id === selectedNodeId) ?? null

  const handleSelectFile = (f: FSFile) => {
    setSelectedPath(f.path)
    if (f.recipe) {
      setRecipePath(f.recipe)
      setSelectedNodeId(null)
      setSelectedEdge(null)
      setWireFrom(null)
      setShowRaw(false)
      setHistoryOpen(false)
      setViewingVersion(null)
      setViewedRecipe(null)
      setFocusedFormula(null)
    }
  }

  const applyEdit = (fn: (d: RecipeJson) => RecipeJson) => {
    setDraft(d => (d ? fn(d) : d))
    setDirtyOps(n => n + 1)
  }

  const handleRename = (oldName: string, newName: string) => {
    applyEdit(d => renameNode(d, oldName, newName))
    setSelectedNodeId(newName)
  }

  const handleFieldDataType = (stepName: string, fieldName: string, dataType: string) => {
    applyEdit(d => editFieldDataType(d, stepName, fieldName, dataType))
  }

  const handleFieldFormula = (stepName: string, fieldName: string, text: string) => {
    applyEdit(d => setFieldTransformation(d, stepName, fieldName, parseFormulaText(text)))
  }

  const handleFocusFormula = (stepName: string, fieldName: string) => {
    setFocusedFormula({ stepName, fieldName })
  }

  // Registry Insert (Task 11): writes the clicked entry's formula into
  // whichever field last focused a formula textarea, via the same
  // parseFormulaText -> setFieldTransformation path free-text edits use.
  const handleInsertExpression = (formula: string) => {
    if (!focusedFormula) return
    const { stepName, fieldName } = focusedFormula
    applyEdit(d => setFieldTransformation(d, stepName, fieldName, parseFormulaText(formula)))
  }

  const handleSelectNode = (id: string) => {
    setSelectedNodeId(prev => (id === prev ? null : id))
    setSelectedEdge(null)
    setFocusedFormula(null)
  }

  const handleSelectEdge = (conn: Connection) => {
    setSelectedEdge(conn)
    setSelectedNodeId(null)
  }

  // Click-wire (Task 9): a click on an OUT/IN-OUT port arms `wireFrom`; a
  // subsequent click on an IN/IN-OUT port completes it via
  // setFieldTransformation, writing the dot-ref "FROM.FIELD" verbatim into the
  // clicked port's field (`toField ?? fromPort`, per spec §6 — in practice the
  // clicked port always carries its own name, since ports are derived 1:1 from
  // existing recipe fields). Any other OUT/IN-OUT click while armed restarts
  // the wire from the new port instead.
  //
  // Self-wire guard (review finding, Task 9 fix round): every IN/OUT port is
  // BOTH a valid wire-start AND a valid wire-completion target, so an armed
  // wire could otherwise "complete" on a different port of the SAME node it
  // started from, writing a self-referencing dot-ref. A completion click
  // whose nodeId matches wireFrom.nodeId is ignored outright — wire mode
  // stays armed (neither completes nor restarts) so a stray same-node click
  // doesn't silently drop the in-progress wire either.
  const handlePortClick = (nodeId: string, port: Port) => {
    const isInEligible = port.direction === 'IN' || port.direction === 'IN/OUT'
    if (wireFrom && isInEligible) {
      if (nodeId === wireFrom.nodeId) return
      const { nodeId: fromNode, portName: fromPort } = wireFrom
      applyEdit(d => setFieldTransformation(d, nodeId, port.name || fromPort, { source: `${fromNode}.${fromPort}` }))
      setWireFrom(null)
      return
    }
    if (port.direction !== 'IN') {
      setWireFrom({ nodeId, portName: port.name })
    }
  }

  const handlePaletteAdd = (type: string) => {
    applyEdit(d => (type === SOURCE_TABLE_TYPE ? addSourceTable(d) : addStep(d, type)))
  }

  const handleDeleteNode = (name: string) => {
    applyEdit(d => deleteNode(d, name))
    setSelectedNodeId(null)
  }

  const handleDeleteEdge = (conn: Connection) => {
    // conn.fromNode identifies which sources[] entry to drop when this is a
    // center-anchor edge (conn.toPort === '') — see recipeEdits.deleteEdge's
    // docstring (review finding, Task 9 fix round).
    applyEdit(d => deleteEdge(d, conn.toNode, conn.toPort, conn.fromNode))
    setSelectedEdge(null)
  }

  // History drawer (Task 10): the drawer owns the version LIST query and the
  // RESTORE (rollback) call; loading an individual archived version's content
  // into the canvas is this component's job (`onView` per the interface docs
  // — HistoryDrawer only hands back the version string).
  const handleViewVersion = async (version: string) => {
    if (!recipePath) return
    try {
      const archived = await apiGet<RecipeFile>(`/recipes/history/${recipePath}?version=${version}`)
      setViewedRecipe(archived)
      setViewingVersion(version)
      setSelectedNodeId(null)
      setSelectedEdge(null)
      setWireFrom(null)
    } catch (e) {
      const err = e as ApiError
      setSaveError({ title: err.title ?? 'Failed to load version', detail: err.detail })
    }
  }

  const handleRestored = () => {
    void queryClient.invalidateQueries({ queryKey: ['recipe', recipePath] })
    setViewingVersion(null)
    setViewedRecipe(null)
  }

  // Closing the drawer is the only escape hatch out of view mode short of
  // Restore (spec §6 documents Restore as the exit; this additionally treats
  // "close the panel" as "go back to the live draft" so viewing a version
  // never strands the canvas read-only with no way back).
  const handleToggleHistory = () => {
    setHistoryOpen(o => {
      const next = !o
      if (!next) {
        setViewingVersion(null)
        setViewedRecipe(null)
      }
      return next
    })
  }

  const handleDiscard = () => {
    if (rec.data) setDraft(structuredClone(rec.data.content as RecipeJson))
    setDirtyOps(0)
    setValidationErrors([])
    setSaveError(null)
  }

  const handleSave = async () => {
    if (!draft || !recipePath || !rec.data) return
    setValidationErrors([])
    setSaveError(null)
    try {
      const result = await apiSend<RecipeValidation>('POST', '/recipes/validate', draft)
      if (!result.valid) {
        setValidationErrors(result.errors ?? [])
        return
      }
      await apiSend('PUT', `/recipes/${recipePath}`, { baseModified: rec.data.modifiedAt, content: draft })
      await queryClient.invalidateQueries({ queryKey: ['recipe', recipePath] })
      setDirtyOps(0)
    } catch (e) {
      const err = e as ApiError
      setSaveError({ title: err.title ?? 'Save failed', detail: err.detail })
    }
  }

  const sidebarExtra = loading ? (
    <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: 12 }}>Loading corpus…</div>
  ) : error ? (
    <div style={{ color: 'var(--red)', fontSize: 12, padding: 12 }}>
      <div>{error.title}</div>
      {error.detail && <div>{error.detail}</div>}
    </div>
  ) : null

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <Sidebar
        searchQuery={searchQuery}
        selectedPath={selectedPath}
        onSelectFile={handleSelectFile}
        filesystem={fs ?? EMPTY_FS}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(c => !c)}
        extraContent={sidebarExtra}
      />

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {!recipePath ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5570', flexDirection: 'column', gap: 8 }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect x="8" y="4" width="24" height="32" rx="3" stroke="#2a3050" strokeWidth="1.5" fill="none" />
              <line x1="13" y1="12" x2="27" y2="12" stroke="#2a3050" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="13" y1="18" x2="27" y2="18" stroke="#2a3050" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="13" y1="24" x2="20" y2="24" stroke="#2a3050" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 12 }}>Select an _ETL_*.json recipe to edit</span>
          </div>
        ) : rec.isLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
            Loading recipe…
          </div>
        ) : recError ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4, color: 'var(--red)', fontSize: 12 }}>
            <div>{recError.title}</div>
            {recError.detail && <div>{recError.detail}</div>}
          </div>
        ) : rec.data && graph ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* recipe header */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 16,
              padding: '16px 20px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, width: '100%' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#e2e8f8' }}>{headerRecipe?.fileName}</h2>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                      background: 'rgba(79,156,249,0.15)',
                      color: '#4f9cf9',
                      border: '1px solid rgba(79,156,249,0.3)',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}>{(headerRecipe?.path ?? '').split('/')[0]}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                    <EditableField label="Path" value={headerRecipe?.path ?? ''} onChange={() => {}} mono />
                    <EditableField label="Size bytes" value={String(headerRecipe?.sizeBytes ?? '')} onChange={() => {}} mono />
                    <EditableField label="Modified" value={headerRecipe?.modifiedAt ?? ''} onChange={() => {}} mono />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={handleToggleHistory} style={{
                    padding: '5px 12px', borderRadius: 5,
                    background: historyOpen ? 'var(--surface-3)' : 'transparent', border: '1px solid var(--border)',
                    color: '#7b88aa', fontSize: 11, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
                  }}>{'{ history }'}</button>
                  <button onClick={() => setShowRaw(r => !r)} style={{
                    padding: '5px 12px', borderRadius: 5,
                    background: showRaw ? 'var(--surface-3)' : 'transparent', border: '1px solid var(--border)',
                    color: '#7b88aa', fontSize: 11, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
                  }}>{'{ raw JSON }'}</button>
                </div>
              </div>

              {showRaw && (
                <div style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 10px', background: 'var(--surface-2)',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <span style={{ fontSize: 10, color: '#4a5570', flex: 1 }}>Raw JSON</span>
                    <CopyButton value={JSON.stringify(content ?? rec.data.content, null, 2)} size={11} />
                  </div>
                  <pre style={{
                    margin: 0, padding: '10px 12px', maxHeight: 400, overflow: 'auto',
                    fontSize: 10, color: '#c8d3e8',
                    fontFamily: 'JetBrains Mono, monospace',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6,
                  }}>{JSON.stringify(content ?? rec.data.content, null, 2)}</pre>
                </div>
              )}
            </div>

            {/* source */}
            <section>
              <SectionHeader icon="→" label="Source" color="#34d399" />
              <div style={{
                padding: '16px', background: 'var(--surface)',
                border: '1px solid rgba(52,211,153,0.2)', borderRadius: 7,
              }}>
                <TableNameList names={content?.table?.sourceTableNames ?? []} emptyLabel="No source tables found in this recipe." />
              </div>
            </section>

            {/* canvas */}
            <section>
              <SectionHeader icon="⇄" label={`Canvas (${graph.nodes.length} nodes)`} color="#818cf8" />
              <div style={{ height: 420, border: '1px solid var(--border)', borderRadius: 8, position: 'relative', overflow: 'hidden' }}>
                <EtlCanvas
                  nodes={graph.nodes}
                  connections={graph.connections}
                  selectedNode={selectedNodeId}
                  onSelectNode={handleSelectNode}
                  highlightIds={[]}
                  onPortClick={isViewing ? undefined : handlePortClick}
                  onSelectEdge={isViewing ? undefined : handleSelectEdge}
                  selectedEdge={selectedEdge}
                  onDropType={isViewing ? undefined : handlePaletteAdd}
                />
              </div>
            </section>

            {/* target */}
            <section>
              <SectionHeader icon="⬡" label="Target" color="#f87171" extra={<GCPIcon service="bigquery" size={16} />} />
              <div style={{
                padding: '16px', background: 'var(--surface)',
                border: '1px solid rgba(248,113,113,0.2)', borderRadius: 7,
              }}>
                <TableNameList names={content?.table?.targetTableNames ?? []} emptyLabel="No target tables found in this recipe." />
              </div>
            </section>

            {/* edit panel — shown for whichever canvas node is selected (Task 8/9);
                hidden entirely while viewing an archived version (Task 10: "all
                editing affordances disabled while viewing"). */}
            {selectedNode && draft && !isViewing && (
              <EditPanel
                draft={draft}
                node={selectedNode}
                onRename={handleRename}
                onFieldDataType={handleFieldDataType}
                onFieldFormula={handleFieldFormula}
                onFocusFormula={handleFocusFormula}
                onDelete={handleDeleteNode}
              />
            )}

            {/* selected-edge delete control (Task 9) — also disabled while viewing */}
            {selectedEdge && !isViewing && (
              <section>
                <SectionHeader icon="⌫" label="Edge" color="var(--red)" />
                <div style={{
                  padding: 16, background: 'var(--surface)',
                  border: '1px solid var(--border)', borderRadius: 7,
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#c8d3e8', flex: 1 }}>
                    {`${selectedEdge.fromNode}.${selectedEdge.fromPort || '·'} → ${selectedEdge.toNode}.${selectedEdge.toPort || '·'}`}
                  </span>
                  <button onClick={() => handleDeleteEdge(selectedEdge)} style={dangerButtonStyle}>Delete</button>
                </div>
              </section>
            )}

            {/* expression registry (Task 11): corpus-wide, merged xml+recipe origins */}
            <ExpressionRegistry
              entries={expr.data ?? []}
              isLoading={expr.isLoading}
              error={expr.error as ApiError | null}
              filter={exprFilter}
              onFilterChange={setExprFilter}
              canInsert={focusedFormula !== null && !isViewing}
              onInsert={handleInsertExpression}
            />

            {/* DDL — hidden entirely when the map is empty or errored */}
            {!ddl.error && ddlEntries.length > 0 && (
              <section>
                <SectionHeader icon="⬡" label="BigQuery DDL Schema" color="#4f9cf9" extra={<GCPIcon service="bigquery" size={16} />} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {ddlEntries.map(([table, cols]) => (
                    <div key={table}>
                      <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 6, fontFamily: 'JetBrains Mono, monospace' }}>{table}</div>
                      <DDLViewer cols={cols} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div style={{ height: 60 }} />
          </div>
        ) : null}

        {(validationErrors.length > 0 || saveError) && (
          <div style={{
            padding: '10px 16px', background: 'var(--surface)',
            borderTop: '1px solid var(--red)', color: 'var(--red)', fontSize: 11,
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {validationErrors.map((e, i) => (
              <div key={i}>
                {e.path && <div style={{ fontSize: 9, opacity: 0.7 }}>{e.path}</div>}
                <div>{e.message}</div>
              </div>
            ))}
            {saveError && (
              <div>
                <div>{saveError.title}</div>
                {saveError.detail && <div>{saveError.detail}</div>}
              </div>
            )}
          </div>
        )}

        {/* SaveBar is itself an editing affordance (Save/Discard mutate the
            draft) — hidden while viewing an archived version. */}
        {!isViewing && (
          <SaveBar
            changes={dirtyOps}
            wireFrom={wireFrom}
            onCancelWire={() => setWireFrom(null)}
            onSave={handleSave}
            onDiscard={handleDiscard}
          />
        )}
      </div>

      {draft && !isViewing && <Palette onAdd={handlePaletteAdd} />}
      {recipePath && historyOpen && (
        <HistoryDrawer
          recipePath={recipePath}
          onView={handleViewVersion}
          onRestored={handleRestored}
        />
      )}
    </div>
  )
}
