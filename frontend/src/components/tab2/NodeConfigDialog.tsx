import { useEffect, useMemo, useRef, useState } from 'react'
import type { RecipeJson, RecipeTransformationJson } from '../../api/recipeAdapter'
import { fieldsOf } from '../../api/recipeAdapter'
import type { IpcConnections, IpcKeySpec } from '../../api/queries'
import { useFanIn, useValidation } from '../../api/ipcRules'
import type { FanInPairing, FanInVerdict } from '../../api/ipcRules'
import { buildStep, insertConfiguredStep, insertSourceTable } from '../../api/recipeEdits'
import type { MappedField, RecipeNodeRef } from '../../api/recipeEdits'
import { SOURCE_TABLE_TYPE } from './Palette'
import { ghostButtonStyle } from './SaveBar'
import { RegistrySearch } from './RegistrySearch'
import { useRegistry } from '../../api/registryQueries'
import type { RegistryVariant } from '../../api/registryQueries'
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
//
// Task 13: the Name field gains a "Pick from registry" affordance for the two
// kinds whose `name` IS a physical table name — source-table mode and a
// `table`-kind step target (the palette's "target table"). Every other kind's
// `name` is a transformation instance ("FLT2", "AGG1", …), which `GET
// /api/registry` never indexes, so no affordance renders for those. Picking a
// row only SETS the name field, same as typing — free text stays the primary
// path (authoring a target that doesn't exist yet is the point of "from
// scratch", Task 15), so `RegistrySearch` mounts lazily behind the toggle
// rather than unconditionally: it calls `useRegistry()` (a TanStack query),
// and this file's own test suite renders most cases with no
// `QueryClientProvider` in scope, so an eagerly-mounted `RegistrySearch`
// would throw on every one of them.
//
// Task 16: a TARGET TABLE whose typed name matches a registry DDL entry offers
// that DDL's columns as the new node's fields (`TargetDdlOffer` below). That
// offer is driven by `variants[]` — one entry per DISTINCT column set behind
// the name, each with the mapping dirs that carry it — and NEVER by the
// `columns` union, which for the 11 corpus names whose files genuinely disagree
// matches no real `<TABLE>.json` on disk (DWH_MAPLESHORE_MAPLEBARN_MEMBERS is
// 110 and 99 columns; the union is 116 and the intersection 93, and neither
// variant is a subset of the other — so intersecting is no safer). A single
// variant is adopted with one click; a divergent name says so and makes the
// operator pick, and what lands in `fields[]` is then exactly one real file's
// columns. `TargetDdlOffer` mounts only for a target `table` with a non-empty
// name, so it is still the only path by which a `useRegistry()` call can reach
// a dialog for any other kind.

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
 * own target-first precedence).
 *
 * Task 15: also surfaces a BARE `table.sourceTableNames` entry — a source
 * table inserted (via this dialog's own empty-draft accommodation, see
 * `noStepsYet` below) before any step exists to consume it. Every other
 * source occurrence is only reachable by walking `steps[].sources[]`, but a
 * table with zero consumers lives NOWHERE in `steps[]` at all — without this
 * fallback it would be typed once and then permanently invisible to a LATER
 * dialog session's "fed by" picker. Never overrides a name already resolved
 * above (a source occurrence already attached to a real step wins, same
 * precedence target already has over source for a shared name). */
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
  for (const name of draft.table?.sourceTableNames ?? []) {
    if (!map.has(name)) map.set(name, 'table')
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

/** Key namespaces for `POST /api/ipc/fan-in` — the two pickers can offer the
 * same node name (a step target is both a possible upstream and a possible
 * downstream), so a verdict map keyed on the bare name would collide. */
const FAN_IN_FEDBY = 'fedBy:'
const FAN_IN_FEEDS = 'feeds:'

/** The `title` a fan-in verdict earns a candidate button, or `undefined` when
 * there is nothing to say. Phrased for an operator, not for the rule engine:
 * `block` states what IPC forbids, `warn` states what could not be determined
 * and that the link is still allowed. `mayFeed`'s own reason (already on the
 * button when illegal) takes precedence — a pairing that is not permitted at
 * all needs no fan-in commentary. */
function fanInTitle(verdict: FanInVerdict | undefined, group: string): string | undefined {
  if (verdict === 'block') {
    return `IPC fan-in: an active transformation must be the only input to ${group}, `
      + 'which already has one. Remove the other input first.'
  }
  if (verdict === 'warn') {
    return `IPC fan-in: ${group} already has an input, and this pairing's active/passive `
      + 'classification is not recorded — the link is allowed, but check it in Designer.'
  }
  return undefined
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

/** BigQuery DDL type -> `ScalaType` value (`ScalaType.scala:7`). The corpus's
 * `<TABLE>.json` files only ever carry STRING/NUMERIC/INT64/TIMESTAMP/DATETIME
 * today; the other three are the remaining BigQuery scalars a regenerated
 * corpus could legitimately produce. Anything unrecognized (a parameterized or
 * ARRAY/STRUCT type, say) becomes `Unknown` — itself a legal `ScalaType`, so it
 * passes `IPC-STR-008` rather than authoring an invalid recipe, and it says
 * "not known" instead of guessing `String`. */
const DDL_TYPE_TO_SCALA_TYPE: Record<string, string> = {
  STRING: 'String',
  NUMERIC: 'BigDecimal',
  BIGNUMERIC: 'BigDecimal',
  INT64: 'Long',
  TIMESTAMP: 'Timestamp',
  DATETIME: 'LocalDateTime',
  DATE: 'LocalDate',
  BOOL: 'Boolean',
}

export function scalaTypeForDdlType(ddlType: string | undefined): string {
  return DDL_TYPE_TO_SCALA_TYPE[(ddlType ?? '').trim().toUpperCase()] ?? 'Unknown'
}

/** One DDL variant rendered as authored fields: the column's own name, its type
 * mapped to a `ScalaType`, and an EMPTY `source` — the DDL knows the column,
 * not where its data comes from, so the field is authored UNMAPPED (see
 * `recipeEdits.mappedFieldToRecipeField`). */
function variantAsFields(variant: RegistryVariant): MappedField[] {
  return (variant.columns ?? [])
    .filter(c => (c.name ?? '') !== '')
    .map(c => ({ name: c.name!, dataType: scalaTypeForDdlType(c.type), source: '' }))
}

/** Upstream-mapped fields first (the operator authored those, with a real
 * dot-ref), then every adopted DDL column they did not already name. A DDL
 * column never overwrites a mapping, and a name is never emitted twice
 * (`IPC-STR-007`). */
function withAdoptedDdlFields(mapped: MappedField[], adopted: MappedField[] | null): MappedField[] {
  if (!adopted) return mapped
  const taken = new Set(mapped.map(m => m.name))
  return [...mapped, ...adopted.filter(f => !taken.has(f.name))]
}

/** The target-DDL offer (Task 16). Renders nothing at all when the typed name
 * matches no DDL in the registry — "no match" is not an error, it is the normal
 * case for a table being authored for the first time.
 *
 * With ONE variant behind the name there is no ambiguity to surface, so the
 * offer is a single "use these N columns" button. With MORE than one the corpus
 * has no canonical definition for that name: the conflict is stated, every
 * variant is listed with its own column count AND its mapping dirs (two
 * variants can carry the same count — `CAS_ODS_EVENTS` is 4 and 4 — so the
 * count alone would not identify one), and nothing is adopted until the
 * operator picks. The union is never shown, in any form.
 *
 * A FAILED registry fetch is NOT that no-match state and must not render as it
 * (final whole-branch review, BLOCKING 2 — same class as the validation banner
 * below): destructuring only `data` left `variants.length === 0` on a 500,
 * byte-identical to "this name is new", which would tell an operator authoring
 * an EXISTING corpus table, silently, that it does not exist. `isError` is
 * checked first and says what actually happened. It stays a neutral note, never
 * an error the operator must clear: the offer is an optional convenience, so a
 * registry outage never blocks Insert (that gate is `POST /recipes/validate`'s
 * alone). */
function TargetDdlOffer({
  tableName,
  adoptedIndex,
  onAdopt,
}: {
  tableName: string
  adoptedIndex: number | null
  onAdopt: (index: number, variant: RegistryVariant | null) => void
}) {
  const { data, isError } = useRegistry()
  if (isError) {
    return (
      <div data-testid="node-config-targetddl-unavailable">
        <div style={sectionTitleStyle}>Target DDL</div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
          The registry failed to load, so this name could not be checked against the corpus DDL —
          a matching definition may exist. Nothing is offered; the field list is yours to author.
        </div>
      </div>
    )
  }
  const entry = (data?.ddlTables ?? []).find(t => t.name === tableName)
  const variants = entry?.variants ?? []
  if (variants.length === 0) return null
  const divergent = variants.length > 1

  return (
    <div data-testid="node-config-targetddl">
      <div style={sectionTitleStyle}>Target DDL</div>
      <div style={{ fontSize: 10, color: divergent ? 'var(--yellow)' : '#4a5570', marginBottom: 8 }}>
        {divergent
          ? `${variants.length} conflicting DDL definitions carry this name in the corpus — there is no `
            + 'canonical schema for it. Pick the one this target follows; its columns become the '
            + 'node\'s fields.'
          : `1 DDL definition matches this name — its columns can become the node's fields.`}
      </div>
      {variants.map((v, i) => {
        const selected = adoptedIndex === i
        const count = (v.columns ?? []).length
        return (
          <button
            key={i}
            type="button"
            title={(v.mappingDirs ?? []).join('\n')}
            onClick={() => onAdopt(i, selected ? null : v)}
            style={{
              ...candidateButtonStyle,
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
              cursor: 'pointer', width: '100%', textAlign: 'left',
              background: selected ? 'rgba(79,156,249,0.15)' : 'var(--surface-2)',
              border: `1px solid ${selected ? '#4f9cf9' : 'var(--border)'}`,
              color: selected ? '#4f9cf9' : '#7b88aa',
            }}
          >
            <span>{selected ? `Using ${count} columns as fields — click to clear` : `Use ${count} columns`}</span>
            <span style={{ fontSize: 9, color: '#4a5570', wordBreak: 'break-all' }}>
              {(v.mappingDirs ?? []).join(' · ')}
            </span>
          </button>
        )
      })}
    </div>
  )
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
  // Task 13: `undefined` when `kind` isn't one of the two table kinds — the
  // affordance itself doesn't render in that case, so there's nothing to
  // toggle. `RegistrySearch` only mounts while this is a real kind, never
  // eagerly (see the file-header comment).
  const registryKind: 'source' | 'target' | undefined =
    isSourceTable ? 'source' : recipeKind === 'table' ? 'target' : undefined
  const [showRegistrySearch, setShowRegistrySearch] = useState(false)
  const [props, setProps] = useState<Record<string, unknown>>(() => defaultProps(propertySpecs))
  const [fedBy, setFedBy] = useState<string[]>([])
  const [feeds, setFeeds] = useState<string[]>([])
  // Map-fields state (fix round 1) — see mappedFieldsFrom's doc comment.
  const [includedFields, setIncludedFields] = useState<Set<string>>(new Set())
  const [fieldOverrides, setFieldOverrides] = useState<Record<string, { name?: string; dataType?: string }>>({})
  const [freeTextFields, setFreeTextFields] = useState<Record<string, string[]>>({})
  // Task 16: the adopted target-DDL variant — its index (which button reads as
  // selected) and the fields it contributes. Both are cleared whenever the name
  // changes, since a variant only means anything for the name it was offered
  // for.
  const [adoptedDdl, setAdoptedDdl] = useState<{ index: number; fields: MappedField[] } | null>(null)

  const commitProp = (key: string, value: unknown) => setProps(prev => ({ ...prev, [key]: value }))
  const setFieldOverride = (key: string, patch: { name?: string; dataType?: string }) =>
    setFieldOverrides(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))

  const nodes = useMemo(() => draftNodes(draft), [draft])
  const targetNames = useMemo(() => stepTargetNames(draft), [draft])
  const existingNames = useMemo(() => new Set(nodes.map(n => n.name)), [nodes])

  const trimmedName = name.trim()
  const nameEmpty = trimmedName === ''
  const nameDuplicate = !nameEmpty && existingNames.has(trimmedName)

  // A DDL variant is adopted FOR a name — retype the name and the adoption is
  // void (the new name may resolve to a different DDL, or to none at all).
  useEffect(() => { setAdoptedDdl(null) }, [trimmedName])

  const requiredPresent = propertySpecs
    .filter(s => s.required)
    .every(s => props[s.key ?? ''] !== undefined)

  const fedByRefs = useMemo(
    () => fedBy
      .map(n => nodes.find(x => x.name === n))
      .filter((x): x is RecipeNodeRef => !!x),
    [fedBy, nodes],
  )

  const upstreamFields = useMemo(
    () => mappedFieldsFrom(fedBy, draft, includedFields, fieldOverrides, freeTextFields),
    [fedBy, draft, includedFields, fieldOverrides, freeTextFields],
  )
  const mappedFields = useMemo(
    () => withAdoptedDdlFields(upstreamFields, adoptedDdl?.fields ?? null),
    [upstreamFields, adoptedDdl],
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
  //
  // Task 15 empty-draft accommodation (see the file-header comment on
  // `draftNodes` and this dialog's own module doc): on a genuinely blank
  // canvas (`draft.steps` empty) there is no existing step to pick as a
  // consumer, so source-table mode's own "at least one feeds" gate can never
  // clear — and the whole-recipe validate call can never clear either,
  // since `{steps: []}` always fails `IPC-STR-001` regardless of what a
  // single source table carries. Both are relaxed ONLY for
  // `isSourceTable && noStepsYet`; a draft with at least one step (this
  // dialog's every other call site, including source-table mode once the
  // canvas is no longer blank) keeps the full gate exactly as before — see
  // SOURCE_MODE_DRAFT's tests in NodeConfigDialog.test.tsx for the
  // regression guard.
  const noStepsYet = (draft.steps?.length ?? 0) === 0
  const bypassWholeRecipeValidation = isSourceTable && noStepsYet
  const canInsert = !nameEmpty && !nameDuplicate && requiredPresent
    && (isSourceTable ? (feeds.length > 0 || noStepsYet) : hasMappedField)
    && (bypassWholeRecipeValidation
      || (!validation.isValidating && !validation.failed && validation.errors.length === 0))

  const rawFedByCandidates = nodes.map(n => ({ ...n, legal: mayConnect(connections, n.kind, recipeKind) }))
  const rawFeedsCandidates = nodes
    .filter(n => targetNames.has(n.name))
    .map(n => ({ ...n, legal: mayConnect(connections, recipeKind, n.kind) }))

  // ─── Fan-in (final whole-branch review, BLOCKING 3) ───────────────────────
  //
  // `mayFeed` above answers "may kind A feed kind B?" pairwise. It cannot
  // answer "may this candidate join a group that ALREADY holds these inputs?"
  // — the constraint PowerCenter's Designer actually enforces, and the one the
  // user explicitly ruled in during planning. That answer comes from
  // `IpcConnections.fanInVerdict` over `POST /api/ipc/fan-in`; nothing here
  // re-implements it (see `useFanIn`'s doc comment).
  //
  // Two DIFFERENT input groups are in play, which is why every pairing carries
  // its own `existingSourceKinds`:
  //   - "fed by": the NEW node is the downstream, and its group is whatever is
  //     selected right now. A candidate is asked against the selection MINUS
  //     itself, so an already-selected node is never judged against its own
  //     presence.
  //   - "feeds": each candidate is a DOWNSTREAM step, and its group is that
  //     step's own `sources[]` — a different group per candidate.
  //
  // Pairings whose existing group is EMPTY are not asked at all: both `block`
  // conditions require a non-empty group, so no verdict is lost, and asking
  // anyway would paint the picker yellow on first open (`fanInVerdict([],
  // 'table')` is `warn`, because `table`'s active/passive is unrecorded) with
  // a warning about a fan-in that does not exist yet.
  const fanInPairings = useMemo<FanInPairing[]>(() => {
    const out: FanInPairing[] = []
    if (!isSourceTable) {
      for (const c of rawFedByCandidates) {
        const existing = fedByRefs.filter(r => r.name !== c.name).map(r => r.kind)
        if (existing.length === 0) continue
        out.push({ key: `${FAN_IN_FEDBY}${c.name}`, existingSourceKinds: existing, candidateKind: c.kind })
      }
    }
    for (const c of rawFeedsCandidates) {
      const existing = (findStepTarget(draft, c.name)?.sources ?? []).map(s => s.type ?? '')
      if (existing.length === 0) continue
      out.push({ key: `${FAN_IN_FEEDS}${c.name}`, existingSourceKinds: existing, candidateKind: recipeKind })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSourceTable, recipeKind, draft, JSON.stringify(rawFedByCandidates), JSON.stringify(rawFeedsCandidates), fedByRefs])
  const fanInVerdicts = useFanIn(fanInPairings)

  // A `block` never disables an ALREADY-SELECTED candidate: the operator has to
  // be able to click it again to back out of the very selection that made the
  // group illegal. Selecting is the only way into a blocked state, and the
  // first selection into an empty group can never block, so a blocked
  // candidate is unreachable as a selected one anyway — this is belt and
  // braces against a trap, not a live case.
  const fedByCandidates = rawFedByCandidates.map(c => {
    const verdict = fanInVerdicts[`${FAN_IN_FEDBY}${c.name}`]
    return { ...c, verdict, blocked: verdict === 'block' && !fedBy.includes(c.name) }
  })
  const feedsCandidates = rawFeedsCandidates.map(c => {
    const verdict = fanInVerdicts[`${FAN_IN_FEEDS}${c.name}`]
    return { ...c, verdict, blocked: verdict === 'block' && !feeds.includes(c.name) }
  })
  // `c.legal` first, matching `fanInTitle`'s own precedence rule ("a pairing
  // that is not permitted at all needs no fan-in commentary"). Without it the
  // banner contradicted the button it described: a `filter` candidate offered
  // to a `sourceQualifier` dialog is illegal by `mayFeed` AND `warn` by fan-in,
  // so it rendered disabled with "filter may not feed sourceQualifier" while
  // the banner named it and said "The link is allowed" (residuals pass,
  // finding 2).
  const fanInWarned = [...fedByCandidates, ...feedsCandidates].filter(c => c.legal && c.verdict === 'warn')

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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label htmlFor="node-config-name" style={dialogLabelStyle}>Name</label>
            {registryKind && (
              <button
                type="button"
                onClick={() => setShowRegistrySearch(v => !v)}
                style={{ ...ghostButtonStyle, padding: '2px 8px', fontSize: 10 }}
              >{showRegistrySearch ? 'Close registry' : 'Pick from registry'}</button>
            )}
          </div>
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
          {registryKind && showRegistrySearch && (
            <div style={{ marginTop: 8, padding: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 5 }}>
              <RegistrySearch
                kind={registryKind}
                onPick={t => {
                  setName(t.name ?? '')
                  setShowRegistrySearch(false)
                }}
              />
            </div>
          )}
        </div>

        {/* Target-table kind only: a source table's `name` is a physical table
            too, but a source occurrence carries no `fields[]` at all
            (`source:table` has no such key — see the schema slice in this
            file's tests), so there is nothing for DDL columns to become. */}
        {!isSourceTable && recipeKind === 'table' && !nameEmpty && (
          <TargetDdlOffer
            tableName={trimmedName}
            adoptedIndex={adoptedDdl?.index ?? null}
            onAdopt={(index, variant) =>
              setAdoptedDdl(variant ? { index, fields: variantAsFields(variant) } : null)}
          />
        )}

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
            ) : fedByCandidates.map(c => {
              const selected = fedBy.includes(c.name)
              const usable = c.legal && !c.blocked
              return (
                <button
                  key={c.name}
                  type="button"
                  disabled={!usable}
                  title={c.legal
                    ? fanInTitle(c.verdict, `${trimmedName || 'this node'}'s inputs`)
                    : `${c.kind} may not feed ${recipeKind}`}
                  onClick={() => setFedBy(prev => toggleName(prev, c.name))}
                  style={{
                    ...candidateButtonStyle,
                    cursor: usable ? 'pointer' : 'not-allowed',
                    opacity: usable ? 1 : 0.4,
                    background: selected ? 'rgba(79,156,249,0.15)' : 'var(--surface-2)',
                    border: `1px solid ${selected ? '#4f9cf9' : c.verdict === 'warn' ? 'var(--yellow)' : 'var(--border)'}`,
                    color: selected ? '#4f9cf9' : '#7b88aa',
                  }}
                >{`${c.name} — ${c.kind}`}</button>
              )
            })}
          </div>
        )}

        <div data-testid="node-config-feeds">
          <div style={sectionTitleStyle}>Feeds</div>
          {isSourceTable && (
            <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 8 }}>
              {noStepsYet
                ? 'The canvas is empty, so there is no step yet that could consume this table — it can still be inserted; it just won\'t appear on the canvas until you add the step that reads from it.'
                : 'A source table has no upstream — select at least one existing step that reads from it.'}
            </div>
          )}
          {feedsCandidates.length === 0 ? (
            <div style={{ fontSize: 11, color: '#4a5570' }}>No existing nodes.</div>
          ) : feedsCandidates.map(c => {
            const selected = feeds.includes(c.name)
            const usable = c.legal && !c.blocked
            return (
              <button
                key={c.name}
                type="button"
                disabled={!usable}
                title={c.legal
                  ? fanInTitle(c.verdict, `${c.name}'s inputs`)
                  : `${recipeKind} may not feed ${c.kind}`}
                onClick={() => setFeeds(prev => toggleName(prev, c.name))}
                style={{
                  ...candidateButtonStyle,
                  cursor: usable ? 'pointer' : 'not-allowed',
                  opacity: usable ? 1 : 0.4,
                  background: selected ? 'rgba(79,156,249,0.15)' : 'var(--surface-2)',
                  border: `1px solid ${selected ? '#4f9cf9' : c.verdict === 'warn' ? 'var(--yellow)' : 'var(--border)'}`,
                  color: selected ? '#4f9cf9' : '#7b88aa',
                }}
              >{`${c.name} — ${c.kind}`}</button>
            )
          })}
        </div>

        {/* A `warn` must be legible, not `title`-only — a tooltip an operator
            never hovers is not "surfaced". `block` needs no equivalent line:
            the candidate is visibly disabled and carries its own reason. Uses
            `--yellow`, already the warning tone of ConformanceChip and the
            divergent-DDL note (ADR-0005, no new colour). */}
        {fanInWarned.length > 0 && (
          <div data-testid="node-config-fanin-warning" style={{ fontSize: 10, color: 'var(--yellow)' }}>
            {`IPC fan-in could not be settled for ${fanInWarned.map(c => c.name).join(', ')}: `}
            the downstream input group already has an input and the active/passive classification
            of a participant is not recorded in the recipe. The link is allowed — verify it in Designer.
          </div>
        )}

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
          {/* `validation.failed` is checked FIRST — before `isValidating` and
              before the errors.length-driven green/amber/red — for the reason
              `ValidationState`'s javadoc states: on a rejected validate the
              counts are empty because nothing ran, not because the draft is
              clean, so falling through here printed a green "0 errors · 0
              warnings" beside an Insert button `canInsert` had already
              disabled with no stated reason (final whole-branch review,
              BLOCKING 2). Same neutral treatment `ConformanceChip` gives the
              same state — `var(--text-dim)`, no new colour token (ADR-0005). */}
          <div style={{
            fontSize: 11, marginTop: 6,
            color: validation.failed ? 'var(--text-dim)'
              : validation.isValidating ? '#7b88aa'
                : validation.errors.length > 0 ? 'var(--red)' : 'var(--green)',
          }}>
            {/* The second clause has to know about the bypass `canInsert`
                already knows about: on a blank canvas a source table inserts
                REGARDLESS of the whole-recipe validate, so "Insert stays
                disabled until it succeeds" was false beside an enabled button
                (residuals pass, finding 4). */}
            {validation.failed
              ? (bypassWholeRecipeValidation
                ? 'Conformance check failed to run. It does not gate this insert — a step-less recipe cannot validate clean either way.'
                : 'Conformance check failed to run — Insert stays disabled until it succeeds.')
              : validation.isValidating
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
