import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ETLNode, Connection, Port } from '../../types'
import type { FSFile, FSDir } from '../../types'
import type { ApiError } from '../../api/client'
import { apiSend } from '../../api/client'
import { useRecipe, useDdl } from '../../api/queries'
import type { RecipeValidation, RecipeValidationError } from '../../api/queries'
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
}: {
  stepName: string
  field: RecipeFieldJson
  onDataType: (stepName: string, fieldName: string, dataType: string) => void
  onFormula: (stepName: string, fieldName: string, text: string) => void
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
  onDelete,
}: {
  draft: RecipeJson
  node: ETLNode
  onRename: (oldName: string, newName: string) => void
  onFieldDataType: (stepName: string, fieldName: string, dataType: string) => void
  onFieldFormula: (stepName: string, fieldName: string, text: string) => void
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
                onDataType={onFieldDataType} onFormula={onFieldFormula} />
            ))}
          </div>
        )}

        <DeleteNodeControl draft={draft} nodeId={node.id} onDelete={onDelete} />
      </div>
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

  const graph = useMemo(
    () => (draft && recipePath ? recipeToCanvas(draft, recipePath) : null),
    [draft, recipePath],
  )

  const recipeSlash = recipePath ? recipePath.lastIndexOf('/') : -1
  const recipeDir = recipeSlash >= 0 ? recipePath!.slice(0, recipeSlash) : ''
  const ddl = useDdl(recipeDir)
  const ddlEntries = ddl.data ? Object.entries(ddl.data as Record<string, DdlColumnJson[]>) : []

  const exprPorts = graph?.nodes.flatMap(n => n.ports).filter(p => p.expression) ?? []
  const selectedNode = graph?.nodes.find(n => n.id === selectedNodeId) ?? null

  const handleSelectFile = (f: FSFile) => {
    setSelectedPath(f.path)
    if (f.recipe) {
      setRecipePath(f.recipe)
      setSelectedNodeId(null)
      setSelectedEdge(null)
      setWireFrom(null)
      setShowRaw(false)
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

  const handleSelectNode = (id: string) => {
    setSelectedNodeId(prev => (id === prev ? null : id))
    setSelectedEdge(null)
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
  const handlePortClick = (nodeId: string, port: Port) => {
    const isInEligible = port.direction === 'IN' || port.direction === 'IN/OUT'
    if (wireFrom && isInEligible) {
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
    applyEdit(d => deleteEdge(d, conn.toNode, conn.toPort))
    setSelectedEdge(null)
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
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#e2e8f8' }}>{rec.data.fileName}</h2>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                      background: 'rgba(79,156,249,0.15)',
                      color: '#4f9cf9',
                      border: '1px solid rgba(79,156,249,0.3)',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}>{(rec.data.path ?? '').split('/')[0]}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                    <EditableField label="Path" value={rec.data.path ?? ''} onChange={() => {}} mono />
                    <EditableField label="Size bytes" value={String(rec.data.sizeBytes ?? '')} onChange={() => {}} mono />
                    <EditableField label="Modified" value={rec.data.modifiedAt ?? ''} onChange={() => {}} mono />
                  </div>
                </div>
                <button onClick={() => setShowRaw(r => !r)} style={{
                  padding: '5px 12px', borderRadius: 5,
                  background: showRaw ? 'var(--surface-3)' : 'transparent', border: '1px solid var(--border)',
                  color: '#7b88aa', fontSize: 11, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
                  flexShrink: 0,
                }}>{'{ raw JSON }'}</button>
              </div>

              {showRaw && (
                <div style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 10px', background: 'var(--surface-2)',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <span style={{ fontSize: 10, color: '#4a5570', flex: 1 }}>Raw JSON</span>
                    <CopyButton value={JSON.stringify(draft ?? rec.data.content, null, 2)} size={11} />
                  </div>
                  <pre style={{
                    margin: 0, padding: '10px 12px', maxHeight: 400, overflow: 'auto',
                    fontSize: 10, color: '#c8d3e8',
                    fontFamily: 'JetBrains Mono, monospace',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6,
                  }}>{JSON.stringify(draft ?? rec.data.content, null, 2)}</pre>
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
                <TableNameList names={draft?.table?.sourceTableNames ?? []} emptyLabel="No source tables found in this recipe." />
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
                  onPortClick={handlePortClick}
                  onSelectEdge={handleSelectEdge}
                  selectedEdge={selectedEdge}
                  onDropType={handlePaletteAdd}
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
                <TableNameList names={draft?.table?.targetTableNames ?? []} emptyLabel="No target tables found in this recipe." />
              </div>
            </section>

            {/* edit panel — shown for whichever canvas node is selected (Task 8/9) */}
            {selectedNode && draft && (
              <EditPanel
                draft={draft}
                node={selectedNode}
                onRename={handleRename}
                onFieldDataType={handleFieldDataType}
                onFieldFormula={handleFieldFormula}
                onDelete={handleDeleteNode}
              />
            )}

            {/* selected-edge delete control (Task 9) */}
            {selectedEdge && (
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

            {/* expressions collector (interim until Task 11's registry) */}
            <section>
              <SectionHeader icon="ƒ" label="All Expressions" color="#a78bfa" />
              {exprPorts.length === 0 ? (
                <div style={{ color: '#4a5570', fontSize: 11 }}>No expressions found in this recipe.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {exprPorts.map((p, i) => (
                    <div key={i} style={{ border: '1px solid rgba(167,139,250,0.2)', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '5px 10px', background: 'rgba(167,139,250,0.05)',
                        borderBottom: '1px solid rgba(167,139,250,0.15)',
                      }}>
                        <span style={{ fontSize: 10, color: '#c8d3e8', fontFamily: 'JetBrains Mono, monospace', flex: 1 }}>{p.name}</span>
                        {p.dataType && (
                          <span style={{ fontSize: 9, color: '#4a5570', fontFamily: 'JetBrains Mono, monospace' }}>{p.dataType}</span>
                        )}
                        <CopyButton value={p.expression!} size={11} />
                      </div>
                      <pre style={{
                        margin: 0, padding: '6px 10px',
                        fontSize: 10, color: '#a78bfa',
                        fontFamily: 'JetBrains Mono, monospace',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6,
                      }}>{p.expression}</pre>
                    </div>
                  ))}
                </div>
              )}
            </section>

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

        <SaveBar
          changes={dirtyOps}
          wireFrom={wireFrom}
          onCancelWire={() => setWireFrom(null)}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      </div>

      {draft && <Palette onAdd={handlePaletteAdd} />}
    </div>
  )
}
