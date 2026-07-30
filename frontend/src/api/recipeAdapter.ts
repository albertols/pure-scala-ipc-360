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

export interface RecipeSourceJson {
  name?: string
  type?: string
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

/** Kind + label for a step target/source `type` string. */
function kindAndLabel(typ: string | undefined): { type: NodeType; label: string } {
  const t = typ ?? ''
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

// ─── Node construction ─────────────────────────────────────────────────────────

function toStepNode(step: RecipeStepJson, isTarget: boolean, file: string): ETLNode {
  const target = step.target
  const id = target?.name ?? ''
  const name = id
  const properties: Record<string, string> = {}
  collectScalarProps(properties, target as unknown as Record<string, unknown>)

  const fields = fieldsOf(target)
  if (isTarget) {
    const ports: Port[] = fields.map(field => ({
      name: field.name ?? '',
      dataType: field.dataType ?? '',
      direction: 'IN' as const,
    }))
    return { id, type: 'target', label: ABBR.target, name, x: 0, y: 0, ports, properties, file }
  }

  const { type, label } = kindAndLabel(target?.type)
  const ports: Port[] = fields.map(field => ({
    name: field.name ?? '',
    dataType: field.dataType ?? '',
    direction: 'IN/OUT' as const,
  }))
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

// ─── Entry point ────────────────────────────────────────────────────────────────

export function recipeToCanvas(recipe: RecipeJson, recipePath: string): CanvasGraph {
  const steps = recipe.steps ?? []
  const basename = recipePath.split('/').pop() ?? recipePath
  const targetTableNames = new Set(recipe.table?.targetTableNames ?? [])

  const nodes: ETLNode[] = []
  const nodeIds = new Set<string>()

  for (const step of steps) {
    const target = step.target
    if (!target || isBlank(target.name)) continue
    const isTarget = target.type === 'table' && targetTableNames.has(target.name!)
    const node = toStepNode(step, isTarget, basename)
    if (nodeIds.has(node.id)) continue
    nodeIds.add(node.id)
    nodes.push(node)
  }

  const refs = collectRefs(recipe)
  for (const step of steps) {
    for (const source of step.sources ?? []) {
      if (source.type !== 'table') continue
      const id = source.name
      if (isBlank(id) || nodeIds.has(id!)) continue
      nodeIds.add(id!)
      nodes.push(toSourceNode(source, refs, basename))
    }
  }

  const connections: Connection[] = []
  layoutNodes(nodes, connections)

  return { nodes, connections, mappingNames: [basename], renderedMapping: basename }
}
