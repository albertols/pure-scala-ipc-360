import { useEffect, useState } from 'react'
import type { ETLNode } from '../../types'
import type {
  RecipeFieldJson,
  RecipeJson,
  RecipeSourceJson,
  RecipeStepJson,
  RecipeTransformationJson,
} from '../../api/recipeAdapter'
import { fieldsOf } from '../../api/recipeAdapter'
import type { IpcKeySpec } from '../../api/queries'
import {
  addField,
  editFieldDataType,
  refsInto,
  renameNode,
  setFieldTransformation,
  setSourceProperty,
  setTargetProperty,
} from '../../api/recipeEdits'
import { dangerButtonStyle, ghostButtonStyle } from './SaveBar'
import {
  FormulaWidget,
  RowTableWidget,
  StringListWidget,
  TextWidget,
  TextareaWidget,
  ToggleWidget,
} from './InspectorWidgets'
import type { RowTableColumn } from './InspectorWidgets'

// ─── Schema-driven Inspector (Task 12) ──────────────────────────────────────────
//
// Renders WHATEVER `GET /api/ipc/rules`'s `keySchema` says the selected node's kind
// admits — no per-kind key list is hardcoded here. `keySchema`/`typeAliases`/
// `keyAliases` are all props (sourced from `useIpcRules()` one level up, in
// ETLModifier.tsx) rather than a network call from this component, so tests feed a
// fixed literal and stay fast/offline (per the task-12 brief).

type KeySchemaMap = Record<string, IpcKeySpec[]>
type RawRecord = Record<string, unknown>

/** Every canvas node is either a step TARGET (the vast majority — table/
 * sourceQualifier/filter/aggregator/router/normalizer/java/storedProcedure/
 * joinerInput/unionInput all render via `toStepNode` in recipeAdapter.ts,
 * regardless of whether they're the mapping's final BigQuery target) or a
 * `sources[]` entry of kind `table`, `union`, or `joiner` (recipeToCanvas turns
 * each of those into its own canvas node — `toSourceNode`/`toUnionNode`/
 * `toJoinerNode`, Task 6 — via `resolveCanonicalType`, so an aliased source
 * type takes the same path as its canonical one; every OTHER source kind is
 * edge-only, resolved onto the step it already exists as under that same
 * name). Resolved by searching `draft` directly (not `node.type`, which
 * collapses many kinds down to a fixed abbreviation) — mirrors the old
 * EditPanel's own `draft.steps?.find(s => s.target?.name === node.id)`
 * lookup. */
function findTargetStep(draft: RecipeJson, id: string): RecipeStepJson | undefined {
  return draft.steps?.find(s => s.target?.name === id)
}

/** First step (in draft order) whose `sources[]` carries an entry named `id` —
 * the same source name can appear, with genuinely different properties, in more
 * than one step's `sources[]` (a router's group consumers are the canonical
 * case); the canvas already dedupes to a single node for it (recipeAdapter.ts's
 * `recipeToCanvas`), so this mirrors that same "first occurrence wins" choice. */
function findSourceOccurrence(draft: RecipeJson, id: string): { stepName: string; source: RecipeSourceJson } | undefined {
  for (const step of draft.steps ?? []) {
    const source = step.sources?.find(s => s.name === id)
    if (source) return { stepName: step.target?.name ?? '', source }
  }
  return undefined
}

/** The raw key actually present on `raw` that canonicalizes (via `keyAliases`) to
 * `canonicalKey` — e.g. "greencliff" answers a "groups" lookup. Falls back to
 * `canonicalKey` itself when no raw key aliases to it (a fresh key, or one
 * already stored under its canonical name) — so a write always lands on
 * whichever key the node ALREADY carries rather than growing a stray parallel
 * canonical-named key next to a still-present anonymized one. */
function resolveRawKey(raw: RawRecord, canonicalKey: string, keyAliases: Record<string, string>): string {
  if (canonicalKey in raw) return canonicalKey
  for (const k of Object.keys(raw)) {
    if ((keyAliases[k] ?? k) === canonicalKey) return k
  }
  return canonicalKey
}

/** Column descriptor derived from the row VALUES themselves, first-seen order —
 * deliberately shape-driven, not kind-driven: no `if (type === 'router')`
 * anywhere, which is what lets ONE row-table renderer cover groups/
 * normalizedFields/unionTables alike.
 *
 * - `boolean` -> `toggle`, `string`/`number` -> `text` (both editable in place).
 * - An array whose elements are all strings (or an empty array — a `List[String]`
 *   with nothing in it yet) -> `stringList` (editable — a normalized field's own
 *   `refSource` is exactly this shape).
 * - An array whose elements are objects (a union table's own `fieldMapping`, a
 *   router group's own `fields`) -> `nested` — always RENDERED (read-only; see
 *   `NestedArrayCell`/`RowTableColumn`'s own docs and the task-12 report's
 *   deferred-editing deviation for why this isn't independently editable yet).
 *   "Nothing is hidden" holds regardless of whether an editor exists: every key on
 *   every row gets SOME column. */
function deriveRowTableColumns(rows: RawRecord[]): RowTableColumn[] {
  const seen = new Set<string>()
  const columns: RowTableColumn[] = []
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (seen.has(k)) continue
      if (typeof v === 'boolean') {
        seen.add(k)
        columns.push({ key: k, label: k, widget: 'toggle' })
      } else if (typeof v === 'string' || typeof v === 'number') {
        seen.add(k)
        columns.push({ key: k, label: k, widget: 'text' })
      } else if (Array.isArray(v)) {
        seen.add(k)
        const isStringList = v.every(x => typeof x === 'string')
        columns.push({ key: k, label: k, widget: isStringList ? 'stringList' : 'nested' })
      }
      // A bare nested OBJECT (non-array) row value has never appeared in the real
      // corpus for a row-table row (spot-checked against all 86 recipes: router
      // groups/normalizedFields/unionTables rows only ever carry scalars,
      // booleans, and arrays) — left without a column (falls through) rather than
      // guessed at; would need its own widget class if the corpus ever grows one.
    }
  }
  return columns
}

// ─── Field table (moved verbatim from ETLModifier.tsx's FieldEditor/AddFieldControl) ─

/** One field's editors: dataType (TextWidget) + formula (FormulaWidget, seeded
 * with renderFormula / parsed back via parseFormulaText on blur — the same
 * round-trip the old FieldEditor used). `onFocus` reports focus-in so the "All
 * Expressions" registry (ETLModifier.tsx, Task 11) can offer an Insert action
 * targeting this exact field. */
function FieldRow({
  draft,
  stepName,
  field,
  onChange,
  onFocusFormula,
}: {
  draft: RecipeJson
  stepName: string
  field: RecipeFieldJson
  onChange: (next: RecipeJson) => void
  onFocusFormula: (stepName: string, fieldName: string) => void
}) {
  const fieldName = field.name ?? ''
  return (
    <div style={{
      border: '1px solid var(--border-subtle)', borderRadius: 5, padding: 10,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ fontSize: 10, color: '#4a5570', fontFamily: 'JetBrains Mono, monospace' }}>{fieldName}</div>
      <TextWidget label="Data type" value={field.dataType ?? ''} mono
        onChange={v => onChange(editFieldDataType(draft, stepName, fieldName, v))} />
      <FormulaWidget label="Formula" value={field.transformation}
        onFocus={() => onFocusFormula(stepName, fieldName)}
        onChange={t => onChange(setFieldTransformation(draft, stepName, fieldName, t))} />
    </div>
  )
}

/** "+ field" affordance — verbatim port of the old AddFieldControl (a
 * palette-added node starts with `fields: []`; ports derive 1:1 from fields, so
 * without this a freshly added node could never be wired). */
function AddFieldRow({ onAdd }: { onAdd: (fieldName: string) => void }) {
  const [name, setName] = useState('')
  const commit = () => {
    const trimmed = name.trim()
    if (trimmed === '') return
    onAdd(trimmed)
    setName('')
  }
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit() }}
        placeholder="field name…"
        style={{
          flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 4, color: '#c8d3e8', fontSize: 11, padding: '5px 8px',
          fontFamily: 'JetBrains Mono, monospace', outline: 'none',
        }}
      />
      <button onClick={commit} style={{
        padding: '5px 10px', borderRadius: 4,
        background: 'rgba(79,156,249,0.15)', border: '1px solid #4f9cf9',
        color: '#4f9cf9', fontSize: 11, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
      }}>+ field</button>
    </div>
  )
}

// ─── Delete control (moved verbatim from ETLModifier.tsx's DeleteNodeControl) ────

function DeleteControl({ draft, nodeId, onDelete }: { draft: RecipeJson; nodeId: string; onDelete: (name: string) => void }) {
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

// ─── Inspector ───────────────────────────────────────────────────────────────

export function Inspector({
  draft,
  node,
  keySchema,
  typeAliases = {},
  keyAliases = {},
  onChange,
  onDelete,
  onFocusFormula,
}: {
  draft: RecipeJson
  node: ETLNode
  keySchema: KeySchemaMap
  /** `IpcRulesDto.typeAliases` — resolves an anonymized `type` token (e.g.
   * "BERYLFALLS") to its canonical kind before the schema lookup. Not in the
   * brief's literal 6-prop list; both this and `keyAliases` are required by the
   * SAME brief's "resolve through keyAliases/typeAliases from useIpcRules"
   * instruction, so they're threaded through as props (see task-12-report.md
   * deviation log) rather than this component reaching for the network itself. */
  typeAliases?: Record<string, string>
  /** `IpcRulesDto.keyAliases` — resolves an anonymized key token (e.g.
   * "greencliff") to its canonical key both for reading (render the row table
   * under its canonical label) and writing (commit back onto the SAME raw key
   * the node already carries, never a stray parallel canonical-named key). */
  keyAliases?: Record<string, string>
  /** Commits a full next RecipeJson. The parent owns `draft`/the dirty counter.
   * The optional second argument reports a NEW node id after a rename (renaming
   * is otherwise invisible to the parent's `selectedNodeId`, since the schema
   * lookup below is driven entirely by identity match on the OLD id) — the
   * parent uses it to keep the Inspector attached to the renamed node, exactly
   * as the old EditPanel's dedicated `onRename` prop did. */
  onChange: (next: RecipeJson, selectId?: string) => void
  onDelete: (name: string) => void
  onFocusFormula: (stepName: string, fieldName: string) => void
}) {
  const targetStep = findTargetStep(draft, node.id)
  const sourceOcc = !targetStep ? findSourceOccurrence(draft, node.id) : undefined
  const raw = (targetStep ? targetStep.target : sourceOcc?.source) as unknown as RawRecord | undefined

  if (!raw) return null

  const rawType = typeof raw.type === 'string' ? raw.type : ''
  const canonicalType = typeAliases[rawType] ?? rawType
  const schemaKey = (targetStep ? 'target:' : 'source:') + canonicalType
  const specs = keySchema[schemaKey] ?? []

  const commit = (canonicalKey: string, value: unknown) => {
    const rawKey = resolveRawKey(raw, canonicalKey, keyAliases)
    const next = targetStep
      ? setTargetProperty(draft, node.id, rawKey, value)
      : setSourceProperty(draft, sourceOcc!.stepName, node.id, rawKey, value)
    onChange(next)
  }

  const handleRename = (newName: string) => {
    const trimmed = newName.trim()
    if (trimmed === '' || trimmed === node.id) return
    onChange(renameNode(draft, node.id, trimmed), trimmed)
  }

  const propertySpecs = specs.filter(s => s.key !== 'name' && s.widget !== 'fieldTable')
  const fieldTableSpecs = specs.filter(s => s.widget === 'fieldTable')
  const fields = targetStep ? fieldsOf(targetStep.target) : []

  const recognizedKeys = new Set(specs.map(s => s.key).filter((k): k is string => !!k))
  const unrecognized = Object.entries(raw).filter(([k]) => !recognizedKeys.has(keyAliases[k] ?? k))

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 14, color: '#4f9cf9', fontFamily: 'JetBrains Mono, monospace' }}>✎</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f8' }}>{`Edit — ${node.id}`}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      <div style={{
        padding: 16, background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 7,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <TextWidget label="Node name" value={node.id} onChange={handleRename} />

        {propertySpecs.map(spec => {
          const key = spec.key ?? ''
          const rawKey = resolveRawKey(raw, key, keyAliases)
          const value = raw[rawKey]
          switch (spec.widget) {
            case 'toggle':
              return <ToggleWidget key={key} label={key} value={Boolean(value)} onChange={v => commit(key, v)} />
            case 'textarea':
              return <TextareaWidget key={key} label={key} value={typeof value === 'string' ? value : ''} onChange={v => commit(key, v)} />
            case 'stringList':
              return <StringListWidget key={key} label={key} value={Array.isArray(value) ? value as string[] : []} onChange={v => commit(key, v)} />
            case 'formula':
              return <FormulaWidget key={key} label={key} value={value as RecipeTransformationJson | undefined} onChange={v => commit(key, v)} />
            case 'rowTable': {
              const rows = Array.isArray(value) ? value as RawRecord[] : []
              return (
                <RowTableWidget key={key} label={key} value={rows}
                  columns={deriveRowTableColumns(rows)}
                  onChange={v => commit(key, v)} />
              )
            }
            case 'text':
            default:
              return <TextWidget key={key} label={key} value={typeof value === 'string' ? value : (value === undefined ? '' : String(value))} onChange={v => commit(key, v)} />
          }
        })}

        {fieldTableSpecs.length > 0 && targetStep && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {fields.map(f => (
              <FieldRow key={f.name} draft={draft} stepName={node.id} field={f}
                onChange={onChange} onFocusFormula={onFocusFormula} />
            ))}
            <AddFieldRow onAdd={fieldName => onChange(addField(draft, { stepName: node.id, fieldName }))} />
          </div>
        )}

        {unrecognized.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, color: '#4a5570', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Unrecognized keys</div>
            {unrecognized.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                <span style={{ color: '#4a5570', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>{k}</span>
                <span style={{
                  color: '#c8d3e8', fontFamily: 'JetBrains Mono, monospace',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{JSON.stringify(v)}</span>
              </div>
            ))}
          </div>
        )}

        <DeleteControl draft={draft} nodeId={node.id} onDelete={onDelete} />
      </div>
    </section>
  )
}
