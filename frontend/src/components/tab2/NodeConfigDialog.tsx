import { useEffect, useMemo, useRef, useState } from 'react'
import type { RecipeJson, RecipeTransformationJson } from '../../api/recipeAdapter'
import { fieldsOf } from '../../api/recipeAdapter'
import type { IpcConnections, IpcKeySpec } from '../../api/queries'
import { useValidation } from '../../api/ipcRules'
import { buildStep, insertConfiguredStep, insertSourceTable } from '../../api/recipeEdits'
import type { MappedField, RecipeNodeRef } from '../../api/recipeEdits'
import { SOURCE_TABLE_TYPE } from './Palette'
import { ghostButtonStyle } from './SaveBar'
import {
  FormulaWidget,
  RowTableWidget,
  StringListWidget,
  TextWidget,
  TextareaWidget,
  ToggleWidget,
} from './InspectorWidgets'

// ─── NodeConfigDialog — configure before inserting (Task 10) ────────────────
//
// `addStep` used to insert `{name: NEW_<TYPE>_<n>, type, fields: []}` with no
// sources, no fields and no refs — the orphan `NEW_TABLE_1` floating on the
// canvas the user screenshotted. This dialog is the ONLY way a palette node
// reaches the draft as of Task 11: it gathers a name, the kind's schema-driven
// properties (same `spec.widget` dispatch as `Inspector.tsx` — no per-kind
// branching here either), and a legality-checked set of "fed by"/"feeds"
// links, then gates Insert behind a live preview validated against the real
// backend catalogue. Producing an orphan through this dialog is structurally
// unreachable: Insert stays disabled until the previewed draft has zero
// validation errors.
//
// A source table (the palette's `SOURCE_TABLE_TYPE` sentinel) is the one
// exception to "gathers fed-by / requires a mapped field": it is a ROOT —
// reads a physical table, has no upstream — and structurally isn't even a
// step (`IPC-FLW-003` iterates `steps[]` only, so a bare `sources[]`
// occurrence never reaches it — see `recipeEdits.insertSourceTable`'s doc
// comment). This dialog switches into a source-table MODE for that one kind:
// no "fed by", no "map fields" section at all; "feeds" instead asks which
// EXISTING step consumes the table, required non-empty, and Insert commits
// via `insertSourceTable` — a `sources[]` entry on each selected consumer
// plus the name in `table.sourceTableNames`, never a new `steps[]` entry.

type KeySchemaMap = Record<string, IpcKeySpec[]>

const dialogLabelStyle: React.CSSProperties = { fontSize: 10, color: '#4a5570', marginBottom: 3 }

const dialogInputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: '#c8d3e8',
  fontSize: 12,
  padding: '5px 8px',
  fontFamily: 'Inter, sans-serif',
  outline: 'none',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 10, color: '#4a5570', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
}

const candidateButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '4px 9px', borderRadius: 4, fontSize: 10,
  fontFamily: 'JetBrains Mono, monospace', marginRight: 6, marginBottom: 6,
}

/** Default value seeded per widget kind, so every property key the schema
 * names is present in state the instant the dialog mounts (a required
 * `toggle`/`stringList`/`rowTable` key is structurally "present" the moment
 * it exists at all — the backend's own required-key check is a missing-node
 * test, not a non-blank/non-empty one; see `TypeShapeRules.checkNode`). */
function defaultPropValue(widget: string | undefined): unknown {
  switch (widget) {
    case 'toggle': return false
    case 'stringList': return []
    case 'rowTable': return []
    case 'formula': return undefined
    case 'textarea':
    case 'text':
    default: return ''
  }
}

function defaultProps(specs: IpcKeySpec[]): Record<string, unknown> {
  const init: Record<string, unknown> = {}
  for (const spec of specs) {
    const key = spec.key ?? ''
    if (key === '') continue
    init[key] = defaultPropValue(spec.widget)
  }
  return init
}

/** Every node already present in the draft, resolved to its name + kind —
 * a step target's own `type`, or a `sources[]` entry's own `type`. Target
 * entries win over a same-named source occurrence (mirrors `Inspector.tsx`'s
 * own target-first precedence). */
function draftNodes(draft: RecipeJson): RecipeNodeRef[] {
  const map = new Map<string, string>()
  for (const step of draft.steps ?? []) {
    for (const source of step.sources ?? []) {
      if (source.name) map.set(source.name, source.type ?? '')
    }
  }
  for (const step of draft.steps ?? []) {
    if (step.target?.name) map.set(step.target.name, step.target.type ?? '')
  }
  return Array.from(map, ([name, kind]) => ({ name, kind }))
}

/** Names with their OWN step target (i.e. something with a `sources[]` array
 * a "feeds" link can actually append into — a bare source-only occurrence,
 * e.g. a `union`/`joiner` node, has none). */
function stepTargetNames(draft: RecipeJson): Set<string> {
  const names = new Set<string>()
  for (const step of draft.steps ?? []) if (step.target?.name) names.add(step.target.name)
  return names
}

function mayConnect(connections: IpcConnections, fromKind: string, toKind: string): boolean {
  return Boolean(connections?.[fromKind]?.mayFeed?.includes(toKind))
}

function toggleName(list: string[], name: string): string[] {
  return list.includes(name) ? list.filter(n => n !== name) : [...list, name]
}

function toggleInSet(set: Set<string>, item: string): Set<string> {
  const next = new Set(set)
  if (!next.delete(item)) next.add(item)
  return next
}

/** `upstream.field` — the row key `included`/`overrides` are keyed by, and
 * (unaliased) exactly the dot-ref the resulting `MappedField.source` carries. */
function fieldRowKey(upstream: string, field: string): string {
  return `${upstream}.${field}`
}

/** The step in `draft` whose target is named `name`, if any — shared by
 * `mappedFieldsFrom` (what a mapping is BUILT from) and the dialog's own
 * render (what UI to SHOW), so the two can never disagree about whether a
 * given "fed by" upstream is a step target or a bare source occurrence. */
function findStepTarget(draft: RecipeJson, name: string) {
  return draft.steps?.find(s => s.target?.name === name)
}

/** Fix round 1 (task-10-report.md): `IPC-FLW-003` ("no orphan step") reads
 * outbound dot-refs off FIELD FORMULAS, not `sources[]` membership — a
 * `fields: []` step always failed it regardless of connections, so Insert
 * could never enable. This is the honest replacement: field mappings drawn
 * from each SELECTED "fed by" node.
 *
 * - Upstream resolves to a step target (has `steps[].target.name === name`,
 *   even one with an empty `fields[]` today) — offer exactly `fieldsOf` that
 *   target, each opt-in via `included`.
 * - Upstream has NO step target (a bare `sources[]` occurrence — structurally
 *   a `table` source in the real corpus, since every other kind's source
 *   occurrence shares a name with its own step) — the recipe JSON carries no
 *   field list for it at all, so free text is the only honest option; never
 *   fabricate names.
 */
function mappedFieldsFrom(
  fedBy: string[],
  draft: RecipeJson,
  included: Set<string>,
  overrides: Record<string, { name?: string; dataType?: string }>,
  freeTextNames: Record<string, string[]>,
): MappedField[] {
  const out: MappedField[] = []
  for (const upstream of fedBy) {
    const upstreamStep = findStepTarget(draft, upstream)
    if (upstreamStep) {
      for (const f of fieldsOf(upstreamStep.target)) {
        if (!f.name) continue
        const key = fieldRowKey(upstream, f.name)
        if (!included.has(key)) continue
        out.push({
          name: overrides[key]?.name ?? f.name,
          dataType: overrides[key]?.dataType ?? (f.dataType || 'String'),
          source: key,
        })
      }
    } else {
      for (const f of freeTextNames[upstream] ?? []) {
        if (f.trim() === '') continue
        const key = fieldRowKey(upstream, f)
        out.push({ name: f, dataType: overrides[key]?.dataType ?? 'String', source: key })
      }
    }
  }
  return out
}

export function NodeConfigDialog({
  kind,
  draft,
  keySchema,
  connections,
  onCancel,
  onInsert,
}: {
  kind: string
  draft: RecipeJson
  keySchema: KeySchemaMap
  connections: IpcConnections
  onCancel: () => void
  onInsert: (next: RecipeJson) => void
}) {
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameInputRef.current?.focus() }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  // Source-table mode (Task 11 design ruling — see the file-header comment):
  // `kind` is the palette's `SOURCE_TABLE_TYPE` sentinel, never a real recipe
  // type. `recipeKind` is what actually gets PERSISTED and looked up against
  // the schema/connections matrix — a source table's own `type` is genuinely
  // `table`, same as a full target-table step's.
  const isSourceTable = kind === SOURCE_TABLE_TYPE
  const recipeKind = isSourceTable ? 'table' : kind
  const specs = keySchema[isSourceTable ? 'source:table' : `target:${recipeKind}`] ?? []
  const propertySpecs = specs.filter(s => s.key !== 'name' && s.key !== 'type' && s.widget !== 'fieldTable')

  const [name, setName] = useState('')
  const [props, setProps] = useState<Record<string, unknown>>(() => defaultProps(propertySpecs))
  const [fedBy, setFedBy] = useState<string[]>([])
  const [feeds, setFeeds] = useState<string[]>([])
  // Map-fields state (fix round 1) — see mappedFieldsFrom's doc comment.
  const [includedFields, setIncludedFields] = useState<Set<string>>(new Set())
  const [fieldOverrides, setFieldOverrides] = useState<Record<string, { name?: string; dataType?: string }>>({})
  const [freeTextFields, setFreeTextFields] = useState<Record<string, string[]>>({})

  const commitProp = (key: string, value: unknown) => setProps(prev => ({ ...prev, [key]: value }))
  const setFieldOverride = (key: string, patch: { name?: string; dataType?: string }) =>
    setFieldOverrides(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))

  const nodes = useMemo(() => draftNodes(draft), [draft])
  const targetNames = useMemo(() => stepTargetNames(draft), [draft])
  const existingNames = useMemo(() => new Set(nodes.map(n => n.name)), [nodes])

  const trimmedName = name.trim()
  const nameEmpty = trimmedName === ''
  const nameDuplicate = !nameEmpty && existingNames.has(trimmedName)

  const requiredPresent = propertySpecs
    .filter(s => s.required)
    .every(s => props[s.key ?? ''] !== undefined)

  const fedByRefs = useMemo(
    () => fedBy
      .map(n => nodes.find(x => x.name === n))
      .filter((x): x is RecipeNodeRef => !!x),
    [fedBy, nodes],
  )

  const mappedFields = useMemo(
    () => mappedFieldsFrom(fedBy, draft, includedFields, fieldOverrides, freeTextFields),
    [fedBy, draft, includedFields, fieldOverrides, freeTextFields],
  )
  const hasMappedField = mappedFields.length > 0

  // `step` is `null` in source-table mode — there is no step to build at all
  // (see `insertSourceTable`'s doc comment: a source table never enters
  // `d.steps`), so `previewDraft` branches to the sibling mutator instead.
  const step = useMemo(
    () => (isSourceTable ? null : buildStep(recipeKind, trimmedName, props, feeds, fedByRefs, mappedFields)),
    [isSourceTable, recipeKind, trimmedName, props, feeds, fedByRefs, mappedFields],
  )
  const previewDraft = useMemo(
    () => (isSourceTable
      ? insertSourceTable(draft, trimmedName, props, feeds)
      : insertConfiguredStep(draft, step!)),
    [isSourceTable, draft, trimmedName, props, feeds, step],
  )
  const validation = useValidation(previewDraft)

  // A source table needs no mapped field (it has no upstream to map FROM) but
  // DOES need at least one consuming step selected — otherwise it would never
  // reach the canvas at all (recipeAdapter's recipeToCanvas only derives a
  // source-table node from a `sources[]` occurrence, never from
  // `table.sourceTableNames` alone). Every other kind keeps Task 10's gate:
  // at least one mapped field, feeds optional.
  const canInsert = !nameEmpty && !nameDuplicate && requiredPresent
    && (isSourceTable ? feeds.length > 0 : hasMappedField)
    && !validation.isValidating && !validation.failed && validation.errors.length === 0

  const fedByCandidates = nodes.map(n => ({ ...n, legal: mayConnect(connections, n.kind, recipeKind) }))
  const feedsCandidates = nodes
    .filter(n => targetNames.has(n.name))
    .map(n => ({ ...n, legal: mayConnect(connections, recipeKind, n.kind) }))

  const previewJson = isSourceTable
    ? { source: { name: trimmedName, type: 'table', ...props }, feeds }
    : { target: step!.target, sources: step!.sources }

  return (
    <div
      data-testid="node-config-scrim"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 560, maxHeight: '85vh', overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          padding: 20, display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f8' }}>{isSourceTable ? 'Add source table' : `Add ${kind}`}</div>

        <div>
          <label htmlFor="node-config-name" style={dialogLabelStyle}>Name</label>
          <input
            id="node-config-name"
            ref={nameInputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            style={dialogInputStyle}
          />
          {nameDuplicate && (
            <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 3 }}>
              {`"${trimmedName}" is already used in this recipe`}
            </div>
          )}
        </div>

        {propertySpecs.length > 0 && (
          <div>
            <div style={sectionTitleStyle}>Properties</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {propertySpecs.map(spec => {
                const key = spec.key ?? ''
                const value = props[key]
                switch (spec.widget) {
                  case 'toggle':
                    return <ToggleWidget key={key} label={key} value={Boolean(value)} onChange={v => commitProp(key, v)} />
                  case 'textarea':
                    return <TextareaWidget key={key} label={key} value={typeof value === 'string' ? value : ''} onChange={v => commitProp(key, v)} />
                  case 'stringList':
                    return <StringListWidget key={key} label={key} value={Array.isArray(value) ? value as string[] : []} onChange={v => commitProp(key, v)} />
                  case 'formula':
                    return <FormulaWidget key={key} label={key} value={value as RecipeTransformationJson | undefined} onChange={v => commitProp(key, v)} />
                  case 'rowTable': {
                    // A freshly-configured node's row-table properties (router.groups,
                    // normalizer.normalizedFields, …) always start empty — RowTableWidget
                    // renders its own "No rows." state in that case without consulting
                    // `columns`, so there is nothing to derive them from yet.
                    const rows = Array.isArray(value) ? value as Record<string, unknown>[] : []
                    return <RowTableWidget key={key} label={key} value={rows} columns={[]} onChange={v => commitProp(key, v)} />
                  }
                  case 'text':
                  default:
                    return <TextWidget key={key} label={key} value={typeof value === 'string' ? value : ''} onChange={v => commitProp(key, v)} />
                }
              })}
            </div>
          </div>
        )}

        {/* A source table is a root — no upstream, so nothing "feeds" it (Task 11
            design ruling, see the file-header comment). */}
        {!isSourceTable && (
          <div data-testid="node-config-fedby">
            <div style={sectionTitleStyle}>Fed by</div>
            {fedByCandidates.length === 0 ? (
              <div style={{ fontSize: 11, color: '#4a5570' }}>No existing nodes.</div>
            ) : fedByCandidates.map(c => (
              <button
                key={c.name}
                type="button"
                disabled={!c.legal}
                title={c.legal ? undefined : `${c.kind} may not feed ${recipeKind}`}
                onClick={() => setFedBy(prev => toggleName(prev, c.name))}
                style={{
                  ...candidateButtonStyle,
                  cursor: c.legal ? 'pointer' : 'not-allowed',
                  opacity: c.legal ? 1 : 0.4,
                  background: fedBy.includes(c.name) ? 'rgba(79,156,249,0.15)' : 'var(--surface-2)',
                  border: `1px solid ${fedBy.includes(c.name) ? '#4f9cf9' : 'var(--border)'}`,
                  color: fedBy.includes(c.name) ? '#4f9cf9' : '#7b88aa',
                }}
              >{`${c.name} — ${c.kind}`}</button>
            ))}
          </div>
        )}

        <div data-testid="node-config-feeds">
          <div style={sectionTitleStyle}>Feeds</div>
          {isSourceTable && (
            <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 8 }}>
              A source table has no upstream — select at least one existing step that
              reads from it.
            </div>
          )}
          {feedsCandidates.length === 0 ? (
            <div style={{ fontSize: 11, color: '#4a5570' }}>No existing nodes.</div>
          ) : feedsCandidates.map(c => (
            <button
              key={c.name}
              type="button"
              disabled={!c.legal}
              title={c.legal ? undefined : `${recipeKind} may not feed ${c.kind}`}
              onClick={() => setFeeds(prev => toggleName(prev, c.name))}
              style={{
                ...candidateButtonStyle,
                cursor: c.legal ? 'pointer' : 'not-allowed',
                opacity: c.legal ? 1 : 0.4,
                background: feeds.includes(c.name) ? 'rgba(79,156,249,0.15)' : 'var(--surface-2)',
                border: `1px solid ${feeds.includes(c.name) ? '#4f9cf9' : 'var(--border)'}`,
                color: feeds.includes(c.name) ? '#4f9cf9' : '#7b88aa',
              }}
            >{`${c.name} — ${c.kind}`}</button>
          ))}
        </div>

        {!isSourceTable && fedBy.length > 0 && (
          <div data-testid="node-config-fieldmap">
            <div style={sectionTitleStyle}>Map fields</div>
            <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 8 }}>
              At least one mapped field is required — an unmapped step moves no data and
              cannot validate.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {fedBy.map(upstream => {
                const upstreamStep = findStepTarget(draft, upstream)
                const upstreamFields = upstreamStep ? fieldsOf(upstreamStep.target) : []
                return (
                  <div key={upstream}>
                    <div style={{ fontSize: 10, color: '#7b88aa', marginBottom: 4 }}>{`From ${upstream}`}</div>
                    {upstreamStep ? (
                      upstreamFields.length === 0 ? (
                        <div style={{ fontSize: 10, color: '#4a5570' }}>No fields on this node yet.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {upstreamFields.map(f => {
                            if (!f.name) return null
                            const key = fieldRowKey(upstream, f.name)
                            const isIncluded = includedFields.has(key)
                            return (
                              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <input
                                  type="checkbox"
                                  aria-label={f.name}
                                  checked={isIncluded}
                                  onChange={() => setIncludedFields(prev => toggleInSet(prev, key))}
                                />
                                <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#c8d3e8' }}>{f.name}</span>
                                <span style={{ fontSize: 9, color: '#4a5570' }}>{`(${f.dataType || 'String'})`}</span>
                                {isIncluded && (
                                  <>
                                    <input
                                      aria-label={`${f.name} mapped field name`}
                                      value={fieldOverrides[key]?.name ?? f.name}
                                      onChange={e => setFieldOverride(key, { name: e.target.value })}
                                      style={{ ...dialogInputStyle, width: 140 }}
                                    />
                                    <input
                                      aria-label={`${f.name} mapped field dataType`}
                                      value={fieldOverrides[key]?.dataType ?? (f.dataType || 'String')}
                                      onChange={e => setFieldOverride(key, { dataType: e.target.value })}
                                      style={{ ...dialogInputStyle, width: 100, fontFamily: 'JetBrains Mono, monospace' }}
                                    />
                                  </>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    ) : (
                      <StringListWidget
                        label=""
                        value={freeTextFields[upstream] ?? []}
                        onChange={v => setFreeTextFields(prev => ({ ...prev, [upstream]: v }))}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <div style={sectionTitleStyle}>Preview</div>
          <pre style={{
            margin: 0, padding: '8px 10px',
            background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 5,
            fontSize: 10, color: '#a78bfa', fontFamily: 'JetBrains Mono, monospace',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 160, overflowY: 'auto',
          }}>{JSON.stringify(previewJson, null, 2)}</pre>
          <div style={{
            fontSize: 11, marginTop: 6,
            color: validation.isValidating ? '#7b88aa' : validation.errors.length > 0 ? 'var(--red)' : 'var(--green)',
          }}>
            {validation.isValidating
              ? 'Validating…'
              : `${validation.errors.length} error${validation.errors.length === 1 ? '' : 's'} · ${validation.warnings.length} warning${validation.warnings.length === 1 ? '' : 's'}`}
          </div>
          {validation.errors.map((e, i) => (
            <div key={i} style={{ fontSize: 10, color: 'var(--red)', marginTop: 2 }}>{e.message}</div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={ghostButtonStyle}>Cancel</button>
          <button
            onClick={() => onInsert(previewDraft)}
            disabled={!canInsert}
            style={{
              padding: '5px 16px', borderRadius: 5,
              background: 'rgba(79,156,249,0.15)', border: '1px solid #4f9cf9',
              color: '#4f9cf9', fontSize: 12, fontWeight: 600,
              cursor: canInsert ? 'pointer' : 'default',
              opacity: canInsert ? 1 : 0.5,
            }}
          >Insert</button>
        </div>
      </div>
    </div>
  )
}
