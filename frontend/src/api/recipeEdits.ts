// ─── recipeEdits — pure draft-mutation helpers (Task 8) ────────────────────────
//
// Every exported mutator takes a RecipeJson `d` and returns a NEW RecipeJson —
// `structuredClone(d)` first, then localized mutation of the clone, `d` itself is
// never touched. Dot-notation source refs ("TABLE.FIELD") are rewritten only via
// exact-table-token match (the substring before the first '.') and are otherwise
// carried through byte-for-byte.
//
// Deliberately "import type only" from recipeAdapter.ts (per the task-8 brief) —
// this module owns its own tiny read-only field/ref walkers (mirroring
// recipeAdapter's fieldsOf/collectRefs/renderFormula shapes) rather than pulling in
// a runtime dependency on the canvas adapter.

import type {
  RecipeJson,
  RecipeFieldJson,
  RecipeSourceJson,
  RecipeStepJson,
  RecipeTargetJson,
  RecipeTransformationJson,
} from './recipeAdapter'

function isBlank(s: string | undefined | null): boolean {
  return s === undefined || s === null || s === ''
}

/** fields ?? weststone ?? [] — read-only mirror of recipeAdapter.fieldsOf. */
function readFields(target: RecipeTargetJson | undefined): RecipeFieldJson[] {
  if (!target) return []
  return target.fields ?? target.weststone ?? []
}

/** Mutating field-array accessor: returns whichever of fields/weststone the target
 * already carries (mutating it in place), creating a `fields` array only when
 * neither key is present yet. */
function fieldsArrayFor(target: RecipeTargetJson): RecipeFieldJson[] {
  if (!target.fields && target.weststone) return target.weststone
  if (!target.fields) target.fields = []
  return target.fields
}

/** True if `param` is Field-shaped (has a `.transformation`) rather than a bare
 * transformation-tree node ({source}/{value}/{name,parameters}) — mirrors
 * recipeAdapter's isFieldShaped. */
function isFieldShaped(param: unknown): param is RecipeFieldJson {
  return typeof param === 'object' && param !== null && 'transformation' in param
}

/** Read-only visitor: calls `visit` with every leaf dot-ref `source` string
 * ("TABLE.FIELD") found anywhere in the transformation tree. */
function walkRefs(t: RecipeTransformationJson | undefined, visit: (source: string) => void): void {
  if (!t) return
  if (!isBlank(t.source) && t.source!.includes('.')) visit(t.source!)
  for (const param of t.parameters ?? []) {
    if (isFieldShaped(param)) walkRefs(param.transformation, visit)
    else walkRefs(param as RecipeTransformationJson, visit)
  }
}

/** Mutating rewrite: every leaf `source` "OLD.field" -> "NEW.field", exact
 * table-token match only (never a substring/prefix match). */
function rewriteRefs(t: RecipeTransformationJson | undefined, oldName: string, newName: string): void {
  if (!t) return
  if (!isBlank(t.source) && t.source!.includes('.')) {
    const dot = t.source!.indexOf('.')
    if (t.source!.slice(0, dot) === oldName) t.source = newName + t.source!.slice(dot)
  }
  for (const param of t.parameters ?? []) {
    if (isFieldShaped(param)) rewriteRefs(param.transformation, oldName, newName)
    else rewriteRefs(param as RecipeTransformationJson, oldName, newName)
  }
}

/** True if the dot-ref's table token (substring before the first '.') is `name`. */
function refTableIs(source: string, name: string): boolean {
  return source.slice(0, source.indexOf('.')) === name
}

function allNodeNames(d: RecipeJson): Set<string> {
  const names = new Set<string>()
  for (const step of d.steps ?? []) {
    if (step.target?.name) names.add(step.target.name)
    for (const source of step.sources ?? []) {
      if (source.name) names.add(source.name)
    }
  }
  return names
}

/** Smallest `NEW_<PREFIX>_<n>` (n >= 1) not already used by any step target or
 * source name in `d`. */
function nextUniqueName(d: RecipeJson, prefix: string): string {
  const existing = allNodeNames(d)
  let n = 1
  let name = `NEW_${prefix}_${n}`
  while (existing.has(name)) {
    n += 1
    name = `NEW_${prefix}_${n}`
  }
  return name
}

// ─── Mutators ───────────────────────────────────────────────────────────────────

/** Sets (or creates) a field's transformation on the named step's target. Writes
 * to whichever of fields/weststone the target already carries. A missing field is
 * created as `{name, dataType: 'String', transformation}`. No-op (returns an
 * unchanged clone) if `stepName` doesn't resolve to a step target. */
export function setFieldTransformation(
  d: RecipeJson,
  stepName: string,
  fieldName: string,
  t: RecipeTransformationJson,
): RecipeJson {
  const draft = structuredClone(d)
  const step = draft.steps?.find(s => s.target?.name === stepName)
  if (!step?.target) return draft
  const fields = fieldsArrayFor(step.target)
  const field = fields.find(f => f.name === fieldName)
  if (field) {
    field.transformation = t
  } else {
    fields.push({ name: fieldName, dataType: 'String', transformation: t })
  }
  return draft
}

/** Renames a node everywhere it's named: the step target (if `oldName` is a step),
 * every `sources[].name` entry, both `table.targetTableNames`/`sourceTableNames`
 * lists, and every dot-ref "OLD.F" -> "NEW.F" across every field's transformation
 * tree in the whole recipe (exact-table-token match). */
export function renameNode(d: RecipeJson, oldName: string, newName: string): RecipeJson {
  const draft = structuredClone(d)

  for (const step of draft.steps ?? []) {
    if (step.target?.name === oldName) step.target.name = newName
    for (const source of step.sources ?? []) {
      if (source.name === oldName) source.name = newName
    }
  }

  if (draft.table?.targetTableNames) {
    draft.table.targetTableNames = draft.table.targetTableNames.map(n => (n === oldName ? newName : n))
  }
  if (draft.table?.sourceTableNames) {
    draft.table.sourceTableNames = draft.table.sourceTableNames.map(n => (n === oldName ? newName : n))
  }

  for (const step of draft.steps ?? []) {
    for (const field of readFields(step.target)) {
      rewriteRefs(field.transformation, oldName, newName)
    }
  }

  return draft
}

/** Sets a field's dataType on the named step's target. No-op if the step or field
 * doesn't exist (edit, not create — see setFieldTransformation for the creating
 * variant). */
export function editFieldDataType(d: RecipeJson, stepName: string, fieldName: string, dataType: string): RecipeJson {
  const draft = structuredClone(d)
  const step = draft.steps?.find(s => s.target?.name === stepName)
  if (!step?.target) return draft
  const field = fieldsArrayFor(step.target).find(f => f.name === fieldName)
  if (field) field.dataType = dataType
  return draft
}

/** Appends a new step `{name: NEW_<TYPE>_<n>, type, fields: []}` (n picked to be
 * unique across every existing node name). For `type === 'table'` also appends the
 * new name to `table.targetTableNames`. */
export function addStep(d: RecipeJson, type: string): RecipeJson {
  const draft = structuredClone(d)
  const name = nextUniqueName(draft, type.toUpperCase())
  const newStep: RecipeStepJson = { target: { name, type, fields: [] }, sources: [] }
  draft.steps = [...(draft.steps ?? []), newStep]
  if (type === 'table') {
    draft.table = draft.table ?? {}
    draft.table.targetTableNames = [...(draft.table.targetTableNames ?? []), name]
  }
  return draft
}

/** Appends a new `{name: NEW_SOURCE_<n>, type: 'table'}` source into the named
 * step's `sources[]` (falling back to the first step when `stepName` is omitted or
 * doesn't resolve), plus `table.sourceTableNames`. Creates a stub `table`-typed
 * step (via addStep) first when the recipe has no steps at all to land on. */
export function addSourceTable(d: RecipeJson, stepName?: string): RecipeJson {
  let draft = structuredClone(d)

  let step = stepName ? draft.steps?.find(s => s.target?.name === stepName) : undefined
  if (!step) step = draft.steps?.[0]
  if (!step) {
    draft = addStep(draft, 'table')
    step = draft.steps![draft.steps!.length - 1]
  }

  const name = nextUniqueName(draft, 'SOURCE')
  const source: RecipeSourceJson = { name, type: 'table' }
  step.sources = [...(step.sources ?? []), source]
  draft.table = draft.table ?? {}
  draft.table.sourceTableNames = [...(draft.table.sourceTableNames ?? []), name]
  return draft
}

/** Removes every step-target and sources[] entry named `name`, and every mention
 * of it in the table lists. Before removing anything, CLEARS (deletes) the
 * `.transformation` of every field anywhere in the recipe whose transformation
 * tree contains a dot-ref into `name` — see `refsInto` for the matching count. */
export function deleteNode(d: RecipeJson, name: string): RecipeJson {
  const draft = structuredClone(d)

  // Collect the fields to clear BEFORE any structural removal, so the ref-scan
  // always walks the full pre-delete tree.
  const fieldsToClear: RecipeFieldJson[] = []
  for (const step of draft.steps ?? []) {
    for (const field of readFields(step.target)) {
      let referencesName = false
      walkRefs(field.transformation, source => {
        if (refTableIs(source, name)) referencesName = true
      })
      if (referencesName) fieldsToClear.push(field)
    }
  }
  for (const field of fieldsToClear) delete field.transformation

  draft.steps = (draft.steps ?? []).filter(step => step.target?.name !== name)
  for (const step of draft.steps) {
    if (step.sources) step.sources = step.sources.filter(source => source.name !== name)
  }
  if (draft.table?.targetTableNames) {
    draft.table.targetTableNames = draft.table.targetTableNames.filter(n => n !== name)
  }
  if (draft.table?.sourceTableNames) {
    draft.table.sourceTableNames = draft.table.sourceTableNames.filter(n => n !== name)
  }

  return draft
}

/** Count of dot-ref occurrences anywhere in the recipe whose table token is
 * `name` — the number of transformations `deleteNode(d, name)` would clear. Used
 * for the delete confirm hint ("this will clear N expressions"). */
export function refsInto(d: RecipeJson, name: string): number {
  let count = 0
  for (const step of d.steps ?? []) {
    for (const field of readFields(step.target)) {
      walkRefs(field.transformation, source => {
        if (refTableIs(source, name)) count += 1
      })
    }
  }
  return count
}

/** Clears (deletes) the `.transformation` of a single field — the edge from
 * whatever it referenced into `toStep.toField`. No-op if the step/field don't
 * exist. */
export function deleteEdge(d: RecipeJson, toStep: string, toField: string): RecipeJson {
  const draft = structuredClone(d)
  const step = draft.steps?.find(s => s.target?.name === toStep)
  if (!step) return draft
  const field = readFields(step.target).find(f => f.name === toField)
  if (field) delete field.transformation
  return draft
}

// ─── Formula text <-> transformation tree ────────────────────────────────────────

/** Depth-0 comma split (parens tracked, no quote-awareness — matches the brief's
 * "lenient" contract). `''` splits to `[]`. */
function splitTopLevel(s: string): string[] {
  if (s.trim() === '') return []
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of s) {
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  parts.push(current)
  return parts
}

const CALL_RE = /^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/
const DOT_REF_RE = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Lenient inverse of `renderFormula`: `NAME(a, b, …)` -> `{name, parameters}`
 * (recursive, depth-0 comma split); a bare `TABLE.FIELD` token -> `{source}`;
 * anything else -> `{value}` verbatim (trimmed).
 */
export function parseFormulaText(text: string): RecipeTransformationJson {
  const trimmed = text.trim()
  const call = trimmed.match(CALL_RE)
  if (call) {
    const name = call[1]
    const parameters = splitTopLevel(call[2]).map(p => parseFormulaText(p.trim()))
    return { name, parameters }
  }
  if (DOT_REF_RE.test(trimmed)) return { source: trimmed }
  return { value: trimmed }
}
