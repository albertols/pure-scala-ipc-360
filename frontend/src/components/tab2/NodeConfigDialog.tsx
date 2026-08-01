import { useEffect, useMemo, useRef, useState } from 'react'
import type { RecipeJson, RecipeTransformationJson } from '../../api/recipeAdapter'
import type { IpcConnections, IpcKeySpec } from '../../api/queries'
import { useValidation } from '../../api/ipcRules'
import { buildStep, insertConfiguredStep } from '../../api/recipeEdits'
import type { RecipeNodeRef } from '../../api/recipeEdits'
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

  const specs = keySchema[`target:${kind}`] ?? []
  const propertySpecs = specs.filter(s => s.key !== 'name' && s.key !== 'type' && s.widget !== 'fieldTable')

  const [name, setName] = useState('')
  const [props, setProps] = useState<Record<string, unknown>>(() => defaultProps(propertySpecs))
  const [fedBy, setFedBy] = useState<string[]>([])
  const [feeds, setFeeds] = useState<string[]>([])

  const commitProp = (key: string, value: unknown) => setProps(prev => ({ ...prev, [key]: value }))

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

  const step = useMemo(
    () => buildStep(kind, trimmedName, props, feeds, fedByRefs),
    [kind, trimmedName, props, feeds, fedByRefs],
  )
  const previewDraft = useMemo(() => insertConfiguredStep(draft, step), [draft, step])
  const validation = useValidation(previewDraft)

  const canInsert = !nameEmpty && !nameDuplicate && requiredPresent
    && !validation.isValidating && !validation.failed && validation.errors.length === 0

  const fedByCandidates = nodes.map(n => ({ ...n, legal: mayConnect(connections, n.kind, kind) }))
  const feedsCandidates = nodes
    .filter(n => targetNames.has(n.name))
    .map(n => ({ ...n, legal: mayConnect(connections, kind, n.kind) }))

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
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f8' }}>{`Add ${kind}`}</div>

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

        <div data-testid="node-config-fedby">
          <div style={sectionTitleStyle}>Fed by</div>
          {fedByCandidates.length === 0 ? (
            <div style={{ fontSize: 11, color: '#4a5570' }}>No existing nodes.</div>
          ) : fedByCandidates.map(c => (
            <button
              key={c.name}
              type="button"
              disabled={!c.legal}
              title={c.legal ? undefined : `${c.kind} may not feed ${kind}`}
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

        <div data-testid="node-config-feeds">
          <div style={sectionTitleStyle}>Feeds</div>
          {feedsCandidates.length === 0 ? (
            <div style={{ fontSize: 11, color: '#4a5570' }}>No existing nodes.</div>
          ) : feedsCandidates.map(c => (
            <button
              key={c.name}
              type="button"
              disabled={!c.legal}
              title={c.legal ? undefined : `${kind} may not feed ${c.kind}`}
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

        <div>
          <div style={sectionTitleStyle}>Preview</div>
          <pre style={{
            margin: 0, padding: '8px 10px',
            background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 5,
            fontSize: 10, color: '#a78bfa', fontFamily: 'JetBrains Mono, monospace',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 160, overflowY: 'auto',
          }}>{JSON.stringify({ target: step.target, sources: step.sources }, null, 2)}</pre>
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
