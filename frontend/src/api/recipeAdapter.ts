import type { Connection, ETLNode, NodeType, Port } from '../types'
import type { CanvasGraph } from './mappingAdapter'
import { layoutNodes } from './canvasLayout.ts'

// ─── Recipe JSON shape (parser `_ETL_<mapping>.json` output) ─────────────────

export interface RecipeTransformationJson {
  source?: string
  value?: string
  name?: string
  outputField?: string
  parameters?: unknown[]
}

export interface RecipeFieldJson {
  name?: string
  dataType?: string
  transformation?: RecipeTransformationJson
}

export interface RecipeTargetJson {
  name?: string
  type?: string
  fields?: RecipeFieldJson[]
  /** Pre-repair spelling — anonymizer-damaged corpora used this key; tolerated defensively. */
  weststone?: RecipeFieldJson[]
}

/** One `unionTables[].fieldMapping[]` entry: `origin` is the field name as it arrives
 * from the feeding `unionInput` (deduped/suffixed per branch), `union` is the field name
 * the union transformation exposes downstream — the latter is what becomes the union
 * node's OUT port name (and what downstream dot-refs like `Union.ID_LOCATION` target). */
export interface UnionFieldMappingJson {
  origin?: string
  union?: string
}

/** One branch of a `union` source: `name` is the feeding `unionInput` step's target
 * name (`AbstractTargetFactory.scala` union-branch naming), matched against
 * `step.target.name` to wire the unionInput -> union edge. */
export interface UnionTableJson {
  name?: string
  fieldMapping?: UnionFieldMappingJson[]
}

export interface RecipeSourceJson {
  name?: string
  type?: string
  /** `union`-typed sources only. */
  unionTables?: UnionTableJson[]
  /** `joiner`-typed sources only — always `[<joiner>.MASTER, <joiner>.DETAIL]`, the
   * joiner's own two `joinerInput` step target names (corpus-verified). */
  joinerTables?: string[]
  /** `joiner`-typed sources only; scalar — lifted into `node.properties` via
   * `collectScalarProps`. */
  joinerType?: string
  joinerCondition?: string
}

export interface RecipeStepJson {
  target?: RecipeTargetJson
  sources?: RecipeSourceJson[]
}

export interface RecipeJson {
  steps?: RecipeStepJson[]
  table?: { targetTableNames?: string[]; sourceTableNames?: string[] }
}

/** A single field-level dot-ref collected from a transformation tree. */
interface RecipeRef {
  table: string
  field: string
  toStep: string
  toField: string
}

// ─── Kind map (rule 1) ────────────────────────────────────────────────────────

/** Recipe target/source `type` string -> canvas NodeType, for the small set of kinds
 * that map onto an existing NodeType. Everything else falls through to 'expression'
 * with a fixed or derived 3-letter label (see FIXED_LABEL / fallbackLabel below). */
const RECIPE_KIND: Record<string, NodeType> = {
  sourceQualifier: 'sq',
  filter: 'filter',
  aggregator: 'aggregator',
  router: 'router',
  joinerInput: 'joiner',
  joiner: 'joiner',
}

/** Fixed labels (binding spec §5 values — NOT derived) for kinds that render as
 * 'expression' but have a canonical abbreviation rather than a fallback-derived one. */
const FIXED_LABEL: Record<string, string> = {
  unionInput: 'UNI',
  union: 'UNI',
  normalizer: 'NRM',
  java: 'JAV',
  storedProcedure: 'STO',
  table: 'TBL', // intermediate (non-target) table step
}

const ABBR: Record<NodeType, string> = {
  source: 'SRC',
  target: 'TGT',
  sq: 'SQ',
  expression: 'EXP',
  lookup: 'LKP',
  joiner: 'JNR',
  aggregator: 'AGG',
  router: 'RTR',
  filter: 'FLT',
}

/** Derive a 3-letter fallback label from an arbitrary/corrupted type string
 * (mirrors mappingAdapter.ts:52-54 — anonymizer-damaged type values like
 * "BERYLFALLS" resolve here). */
function fallbackLabel(typ: string): string {
  return typ.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
}

function isBlank(s: string | undefined | null): boolean {
  return s === undefined || s === null || s === ''
}

/** fields ?? weststone ?? [] — tolerates both the repaired and pre-repair key. */
export function fieldsOf(t: RecipeTargetJson | undefined): RecipeFieldJson[] {
  if (!t) return []
  return t.fields ?? t.weststone ?? []
}

/** Add every non-blank scalar string field of an object into a properties bag. */
function collectScalarProps(props: Record<string, string>, obj: Record<string, unknown> | undefined | null): void {
  if (!obj) return
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== 'string') continue
    if (isBlank(value)) continue
    props[key] = value
  }
}

/** `typeAliases` (served by `GET /api/ipc/rules`, backend `IpcVocabulary.TYPE_ALIASES`)
 * resolves anonymizer tokens (`BERYLFALLS` -> `sourceQualifier`, etc.) to their
 * canonical kind string. Shared by `kindAndLabel` (step targets) and the union/joiner
 * source branch below (Task 6) so both take the exact same resolution path — never a
 * parallel, hardcoded one. Defaults to `{}`, so a type with no matching alias resolves
 * to itself, unchanged. */
function resolveCanonicalType(typ: string | undefined, typeAliases: Record<string, string>): string {
  return typeAliases[typ ?? ''] ?? (typ ?? '')
}

/** Kind + label for a step target/source `type` string. See `resolveCanonicalType` for
 * the alias resolution this builds on. */
function kindAndLabel(typ: string | undefined, typeAliases: Record<string, string>): { type: NodeType; label: string } {
  const t = resolveCanonicalType(typ, typeAliases)
  const kind = RECIPE_KIND[t]
  if (kind) return { type: kind, label: ABBR[kind] }
  const fixed = FIXED_LABEL[t]
  if (fixed) return { type: 'expression', label: fixed }
  return { type: 'expression', label: fallbackLabel(t) }
}

// ─── Ref collection (rule 3) ───────────────────────────────────────────────────

/** True if `param` is Field-shaped (has a `.transformation`) rather than a bare
 * transformation-tree node ({source}/{value}/{name,parameters}). */
function isFieldShaped(param: unknown): param is RecipeFieldJson {
  return typeof param === 'object' && param !== null && 'transformation' in param
}

function walkTransformation(t: RecipeTransformationJson | undefined, toStep: string, toField: string, out: RecipeRef[]): void {
  if (!t) return
  const source = t.source
  if (!isBlank(source) && source!.includes('.')) {
    const dot = source!.indexOf('.')
    const table = source!.slice(0, dot)
    const field = source!.slice(dot + 1)
    if (!isBlank(table) && !isBlank(field)) out.push({ table, field, toStep, toField })
  }
  for (const param of t.parameters ?? []) {
    if (isFieldShaped(param)) {
      walkTransformation(param.transformation, toStep, toField, out)
    } else {
      walkTransformation(param as RecipeTransformationJson, toStep, toField, out)
    }
  }
}

/** Walk every step target's fields' transformation trees and collect all dot-refs
 * (`T.F` -> {table, field}), tagged with the step/field they land on. Module-private;
 * Task 5 reuses this for edge derivation. */
function collectRefs(recipe: RecipeJson): RecipeRef[] {
  const refs: RecipeRef[] = []
  for (const step of recipe.steps ?? []) {
    const toStep = step.target?.name ?? ''
    for (const field of fieldsOf(step.target)) {
      const toField = field.name ?? ''
      walkTransformation(field.transformation, toStep, toField, refs)
    }
  }
  return refs
}

// ─── Formula rendering (ƒ rule) ─────────────────────────────────────────────────

/**
 * Render a transformation tree as a formula string:
 * - `{name, parameters}` -> `NAME(p1, p2, …)` recursively — a Field-shaped parameter
 *   (the `{name, dataType, transformation}` bind-var wrapper lookup calls use for their
 *   arguments) renders its nested `.transformation` rather than itself.
 * - `{source: "T.F"}` -> `T.F` VERBATIM — dot-refs are sacred, never normalized.
 * - `{value: "v"}` -> `v` verbatim.
 * - undefined / no recognized shape -> `''`.
 * Exported: Task 11's expression registry (backend `FormulaRenderer.java`) and its
 * frontend registry view depend on this producing byte-identical output.
 */
export function renderFormula(t: RecipeTransformationJson | undefined): string {
  if (!t) return ''
  if (!isBlank(t.name)) {
    const params = (t.parameters ?? []).map(renderFormulaParam)
    return `${t.name}(${params.join(', ')})`
  }
  if (!isBlank(t.source)) return t.source!
  if (!isBlank(t.value)) return t.value!
  return ''
}

function renderFormulaParam(param: unknown): string {
  if (isFieldShaped(param)) return renderFormula(param.transformation)
  return renderFormula(param as RecipeTransformationJson)
}

/** ƒ rule: a field's transformation is a call tree (has `name`) -> render its formula
 * into `port.expression`; a plain `{source}`/`{value}` leaf sets no expression at all. */
function portFor(field: RecipeFieldJson, direction: Port['direction']): Port {
  const port: Port = { name: field.name ?? '', dataType: field.dataType ?? '', direction }
  const t = field.transformation
  if (t && !isBlank(t.name)) port.expression = renderFormula(t)
  return port
}

// ─── Node construction ─────────────────────────────────────────────────────────

function toStepNode(step: RecipeStepJson, isTarget: boolean, file: string, typeAliases: Record<string, string>): ETLNode {
  const target = step.target
  const id = target?.name ?? ''
  const name = id
  const properties: Record<string, string> = {}
  collectScalarProps(properties, target as unknown as Record<string, unknown>)

  const fields = fieldsOf(target)
  if (isTarget) {
    const ports: Port[] = fields.map(field => portFor(field, 'IN'))
    return { id, type: 'target', label: ABBR.target, name, x: 0, y: 0, ports, properties, file }
  }

  const { type, label } = kindAndLabel(target?.type, typeAliases)
  const ports: Port[] = fields.map(field => portFor(field, 'IN/OUT'))
  return { id, type, label, name, x: 0, y: 0, ports, properties, file }
}

function toSourceNode(source: RecipeSourceJson, refs: RecipeRef[], file: string): ETLNode {
  const id = source.name ?? ''
  const name = id
  const properties: Record<string, string> = {}
  collectScalarProps(properties, source as unknown as Record<string, unknown>)

  const fieldNames = new Set<string>()
  const exactMatches = refs.filter(r => r.table === id)
  const matches = exactMatches.length > 0 ? exactMatches : refs.filter(r => r.table.toLowerCase() === id.toLowerCase())
  for (const ref of matches) fieldNames.add(ref.field)

  const ports: Port[] = [...fieldNames].map(fieldName => ({
    name: fieldName,
    dataType: '',
    direction: 'OUT' as const,
  }))
  return { id, type: 'source', label: ABBR.source, name, x: 0, y: 0, ports, properties, file }
}

/** A `union`-typed `sources[]` entry becomes its own node (Task 6) — kind/label resolved
 * through `kindAndLabel` like every other kind, never hardcoded. Ports: one OUT port per
 * DISTINCT `unionTables[].fieldMapping[].union` value (the field name the union exposes
 * downstream — matches the `Union.<field>` dot-refs a consuming step's transformations
 * already carry, so those edges fall out of the existing `deriveConnections` ref walk
 * once this node exists; no new edge-derivation code needed for them). */
function toUnionNode(source: RecipeSourceJson, file: string, typeAliases: Record<string, string>): ETLNode {
  const { type, label } = kindAndLabel(source.type, typeAliases)
  const id = source.name ?? ''
  const properties: Record<string, string> = {}
  collectScalarProps(properties, source as unknown as Record<string, unknown>)

  const fieldNames = new Set<string>()
  for (const table of source.unionTables ?? []) {
    for (const mapping of table.fieldMapping ?? []) {
      if (!isBlank(mapping.union)) fieldNames.add(mapping.union!)
    }
  }
  const ports: Port[] = [...fieldNames].map(fieldName => ({ name: fieldName, dataType: '', direction: 'OUT' as const }))
  return { id, type, label, name: id, x: 0, y: 0, ports, properties, file }
}

/** A `joiner`-typed `sources[]` entry becomes its own node (Task 6) — kind/label
 * resolved through `kindAndLabel`, which already maps `joiner` to `NodeType 'joiner'`/
 * `ABBR.joiner === 'JNR'` (same map `joinerInput` step targets use). Ports: the
 * `joinerTables` entries (the joiner's own `<joiner>.MASTER`/`<joiner>.DETAIL`
 * `joinerInput` step names), direction OUT. `joinerType`/`joinerCondition` are lifted
 * into `properties` by `collectScalarProps`; `joinerTables` (array-valued) stays on the
 * raw JSON for the Inspector, which resolves it independently by node id. */
function toJoinerNode(source: RecipeSourceJson, file: string, typeAliases: Record<string, string>): ETLNode {
  const { type, label } = kindAndLabel(source.type, typeAliases)
  const id = source.name ?? ''
  const properties: Record<string, string> = {}
  collectScalarProps(properties, source as unknown as Record<string, unknown>)

  const ports: Port[] = (source.joinerTables ?? []).map(tableName => ({ name: tableName, dataType: '', direction: 'OUT' as const }))
  return { id, type, label, name: id, x: 0, y: 0, ports, properties, file }
}

// ─── Edge derivation ────────────────────────────────────────────────────────────

/** Case-insensitive-fallback node-id resolver: exact node id first, else the (first)
 * node whose id matches case-insensitively; returns undefined — DROP — when neither
 * resolves (corpus audit: 10 tokens across 8 recipes reference joiner/union constructs
 * that exist only as non-table `sources[]` entries, never as a step target or table
 * source; dropped by design). */
function buildResolver(nodeIds: Set<string>): (table: string) => string | undefined {
  const lowerToId = new Map<string, string>()
  for (const id of nodeIds) {
    const lower = id.toLowerCase()
    if (!lowerToId.has(lower)) lowerToId.set(lower, id)
  }
  return (table: string) => (nodeIds.has(table) ? table : lowerToId.get(table.toLowerCase()))
}

/** Mirrors mappingAdapter.ts:150-153 — marks the named port `linked` if it exists;
 * center-anchor edges pass an empty port name, which never matches a real port, so
 * this is a safe no-op for them (EtlCanvas center-anchors missing ports itself). */
function markLinked(nodeById: Map<string, ETLNode>, id: string, portName: string): void {
  const port = nodeById.get(id)?.ports.find(p => p.name === portName)
  if (port) port.linked = true
}

/**
 * Field edges from the collected dot-refs, plus a single node-center edge (empty
 * `fromPort`/`toPort`) for every `sources[]` entry of a step that has ZERO field-level
 * edges landing on that step — deduped via the `fromNode|fromPort|toNode|toPort` key
 * set. Unresolvable ref tables are dropped silently (never a dangling endpoint).
 *
 * Task 6 adds a THIRD edge source with no dot-ref counterpart at all: a step whose
 * target resolves (via `typeAliases`) to `unionInput`/`joinerInput` gets a node-center
 * edge TO the union/joiner node it feeds. For joiners the owning joiner is recovered
 * from the LAST dot, not the first: `AbstractTargetFactory.scala:88` builds the name as
 * `s"${joiner.name}.$inputType"` — the joiner's own (arbitrary) name, exactly one dot,
 * then a fixed no-dot `MASTER`/`DETAIL` suffix — so inverting that construction means
 * stripping the trailing `.MASTER`/`.DETAIL`, which is only safe via `lastIndexOf`
 * (`indexOf`, the first dot, mis-splits a joiner name that itself contains a dot, e.g.
 * `A.B.DETAIL` -> `A` instead of `A.B`; every real corpus joiner name is dot-free today,
 * so both would agree there, but `lastIndexOf` is the one that actually matches the
 * factory's construction rather than merely surviving on today's data). For unions
 * there's no such naming convention, so `unionInputOwner` (built while creating union
 * nodes: every `unionTables[].name` -> the union's own node id) is consulted instead.
 */
function deriveConnections(
  steps: RecipeStepJson[],
  refs: RecipeRef[],
  nodeIds: Set<string>,
  nodeById: Map<string, ETLNode>,
  typeAliases: Record<string, string>,
  unionInputOwner: Map<string, string>,
): Connection[] {
  const resolve = buildResolver(nodeIds)
  const connections: Connection[] = []
  const keys = new Set<string>()

  const add = (c: Connection): void => {
    const key = `${c.fromNode}|${c.fromPort}|${c.toNode}|${c.toPort}`
    if (keys.has(key)) return
    keys.add(key)
    connections.push(c)
    markLinked(nodeById, c.fromNode, c.fromPort)
    markLinked(nodeById, c.toNode, c.toPort)
  }

  for (const ref of refs) {
    if (isBlank(ref.toStep) || !nodeIds.has(ref.toStep)) continue
    const fromNode = resolve(ref.table)
    if (!fromNode) continue
    add({ fromNode, fromPort: ref.field, toNode: ref.toStep, toPort: ref.toField })
  }

  for (const step of steps) {
    const toNode = step.target?.name
    if (isBlank(toNode) || !nodeIds.has(toNode!)) continue
    for (const source of step.sources ?? []) {
      if (isBlank(source.name)) continue
      const fromNode = resolve(source.name!)
      if (!fromNode) continue
      const hasFieldEdge = connections.some(c => c.fromNode === fromNode && c.toNode === toNode)
      if (!hasFieldEdge) add({ fromNode, fromPort: '', toNode: toNode!, toPort: '' })
    }
  }

  for (const step of steps) {
    const stepName = step.target?.name
    if (isBlank(stepName) || !nodeIds.has(stepName!)) continue
    const canonical = resolveCanonicalType(step.target?.type, typeAliases)
    if (canonical === 'unionInput') {
      const unionId = unionInputOwner.get(stepName!)
      if (unionId && nodeIds.has(unionId)) add({ fromNode: stepName!, fromPort: '', toNode: unionId, toPort: '' })
    } else if (canonical === 'joinerInput') {
      const dot = stepName!.lastIndexOf('.')
      const joinerId = dot >= 0 ? stepName!.slice(0, dot) : stepName!
      if (nodeIds.has(joinerId)) add({ fromNode: stepName!, fromPort: '', toNode: joinerId, toPort: '' })
    }
  }

  return connections
}

// ─── Entry point ────────────────────────────────────────────────────────────────

/**
 * `typeAliases` (`GET /api/ipc/rules`'s `typeAliases`, `useIpcRules()` in
 * `queries.ts`) resolves the anonymized-corpus type tokens (`BERYLFALLS`,
 * `EARLYGLADE`, `ASHPATH2`, `CEDARWICK2` — CLAUDE.md corpus caveats) to their
 * canonical IPC kind before node/label derivation. Optional, defaults to `{}`, so
 * every existing caller (this module's own tests, `scripts/recipe_sweep.mts`
 * pre-Task-19) keeps working unchanged — the frontend never hardcodes a second copy
 * of this map; it must be threaded in from the backend-served catalogue.
 */
export function recipeToCanvas(recipe: RecipeJson, recipePath: string, typeAliases: Record<string, string> = {}): CanvasGraph {
  const steps = recipe.steps ?? []
  const basename = recipePath.split('/').pop() ?? recipePath
  const targetTableNames = new Set(recipe.table?.targetTableNames ?? [])

  const nodes: ETLNode[] = []
  const nodeIds = new Set<string>()

  for (const step of steps) {
    const target = step.target
    if (!target || isBlank(target.name)) continue
    const isTarget = target.type === 'table' && targetTableNames.has(target.name!)
    const node = toStepNode(step, isTarget, basename, typeAliases)
    if (nodeIds.has(node.id)) continue
    nodeIds.add(node.id)
    nodes.push(node)
  }

  const refs = collectRefs(recipe)
  // unionInput step target name -> owning union's node id, built alongside union nodes
  // (Task 6) — consulted by deriveConnections to wire the unionInput -> union edge.
  const unionInputOwner = new Map<string, string>()
  for (const step of steps) {
    for (const source of step.sources ?? []) {
      const canonical = resolveCanonicalType(source.type, typeAliases)
      if (canonical === 'table') {
        const id = source.name
        if (isBlank(id) || nodeIds.has(id!)) continue
        nodeIds.add(id!)
        nodes.push(toSourceNode(source, refs, basename))
      } else if (canonical === 'union') {
        const id = source.name
        if (!isBlank(id)) {
          if (!nodeIds.has(id!)) {
            nodeIds.add(id!)
            nodes.push(toUnionNode(source, basename, typeAliases))
          }
          for (const table of source.unionTables ?? []) {
            if (!isBlank(table.name)) unionInputOwner.set(table.name!, id!)
          }
        }
      } else if (canonical === 'joiner') {
        const id = source.name
        if (isBlank(id) || nodeIds.has(id!)) continue
        nodeIds.add(id!)
        nodes.push(toJoinerNode(source, basename, typeAliases))
      }
    }
  }

  // Declared-but-unconsumed source tables (UX round 3, issue 3). Everything
  // above derives from `steps[]`, so a `table.sourceTableNames` entry that no
  // step references produced NO node — which is precisely what a source table
  // inserted into an empty draft is: `insertSourceTable` deliberately appends no
  // step (a source table is a root that reads a physical table, not a step), so
  // the first node of a from-scratch recipe was invisible and the canvas stayed
  // blank. It also hid four real corpus lookup tables that are declared here and
  // reached only through `LKP_*` calls rather than a `sources[]` entry.
  //
  // Matched CASE-INSENSITIVELY against the nodes already built: the corpus
  // declares "FF_BIZLINK" for a `sources[]` entry spelled "ff_BIZLINK" (same
  // physical table), and painting both would double the node. This mirrors
  // `buildResolver`/`toSourceNode`, which already fold case for the same reason.
  //
  // Built through `toSourceNode` like any other table source, so a declared
  // table that IS dot-referenced gets its OUT ports and its edges for free from
  // the existing ref walk below — no second edge-derivation path.
  const lowerNodeIds = new Set([...nodeIds].map(id => id.toLowerCase()))
  for (const declared of recipe.table?.sourceTableNames ?? []) {
    if (isBlank(declared)) continue
    if (lowerNodeIds.has(declared.toLowerCase())) continue
    lowerNodeIds.add(declared.toLowerCase())
    nodeIds.add(declared)
    nodes.push(toSourceNode({ name: declared, type: 'table' }, refs, basename))
  }

  const nodeById = new Map(nodes.map(n => [n.id, n]))
  const connections = deriveConnections(steps, refs, nodeIds, nodeById, typeAliases, unionInputOwner)

  layoutNodes(nodes, connections)

  return { nodes, connections, mappingNames: [basename], renderedMapping: basename }
}
