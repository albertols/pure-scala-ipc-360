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
function rewriteRefs(
  t: RecipeTransformationJson | undefined,
  oldName: string,
  newName: string,
): void {
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

/** Every field anywhere in `d` whose transformation tree contains AT LEAST ONE
 * dot-ref into `name` — field granularity, not occurrence count. A field whose
 * expression references `name` more than once (e.g. `CONCAT(T.A, T.B)`) still
 * appears here exactly once, because `deleteNode` clears it with a single
 * `delete field.transformation` regardless of how many refs it contains. Shared
 * by `deleteNode` (what to clear) and `refsInto` (how many that is), so the two
 * can never drift apart. */
function fieldsReferencing(d: RecipeJson, name: string): RecipeFieldJson[] {
  const fields: RecipeFieldJson[] = []
  for (const step of d.steps ?? []) {
    for (const field of readFields(step.target)) {
      let referencesName = false
      walkRefs(field.transformation, source => {
        if (refTableIs(source, name)) referencesName = true
      })
      if (referencesName) fields.push(field)
    }
  }
  return fields
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
    draft.table.targetTableNames = draft.table.targetTableNames.map(n =>
      n === oldName ? newName : n,
    )
  }
  if (draft.table?.sourceTableNames) {
    draft.table.sourceTableNames = draft.table.sourceTableNames.map(n =>
      n === oldName ? newName : n,
    )
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
 * variant).
 *
 * Final-review fix: this used to look the field up via the MUTATING
 * `fieldsArrayFor` — for a target with neither `fields` nor `weststone` at all
 * (no key present, not even `[]`), that stamped an empty `fields: []` onto the
 * draft even on the no-op path (field not found), so a genuine no-op didn't
 * leave the draft untouched. Reading via `readFields` (non-mutating) for the
 * lookup, and only touching the field object itself once found, means a miss
 * truly changes nothing. */
export function editFieldDataType(
  d: RecipeJson,
  stepName: string,
  fieldName: string,
  dataType: string,
): RecipeJson {
  const draft = structuredClone(d)
  const step = draft.steps?.find(s => s.target?.name === stepName)
  if (!step?.target) return draft
  const field = readFields(step.target).find(f => f.name === fieldName)
  if (!field) return draft
  field.dataType = dataType
  return draft
}

/** Appends a new field `{name, dataType: dataType || 'String'}` (no
 * `transformation`) to the named step's target. Final-review fix: a freshly
 * inserted node can legitimately carry an empty `fields[]` (a dialog-built step's
 * own "map fields" section leaves room for more than what it mapped at insert
 * time) — ports derive 1:1 from fields (recipeAdapter's `toStepNode`), so a field
 * the dialog didn't map could never be wired without this. Writes to whichever of
 * fields/weststone the target already carries (see `fieldsArrayFor`, creating
 * `fields` only when neither key is present yet). No-op (unchanged clone) if
 * `stepName` doesn't resolve to a step target. */
export function addField(
  d: RecipeJson,
  { stepName, fieldName, dataType }: { stepName: string; fieldName: string; dataType?: string },
): RecipeJson {
  const draft = structuredClone(d)
  const step = draft.steps?.find(s => s.target?.name === stepName)
  if (!step?.target) return draft
  const fields = fieldsArrayFor(step.target)
  fields.push({ name: fieldName, dataType: dataType || 'String' })
  return draft
}

/** Removes every step-target and sources[] entry named `name`, and every mention
 * of it in the table lists. Before removing anything, CLEARS (deletes) the
 * `.transformation` of every field anywhere in the recipe whose transformation
 * tree contains a dot-ref into `name` (field granularity — a field referencing
 * `name` more than once is still cleared once) — see `refsInto` for the exact
 * matching count. */
export function deleteNode(d: RecipeJson, name: string): RecipeJson {
  const draft = structuredClone(d)

  // Collect the fields to clear BEFORE any structural removal, so the ref-scan
  // always walks the full pre-delete tree.
  for (const field of fieldsReferencing(draft, name)) delete field.transformation

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

/** Count of distinct FIELDS anywhere in the recipe whose transformation tree
 * contains at least one dot-ref into `name` — field granularity, exactly the set
 * `deleteNode(d, name)` would clear (NOT a count of dot-ref occurrences: a field
 * referencing `name` more than once in one expression still counts once, since
 * `deleteNode` clears the whole field's transformation in a single step). Used
 * for the delete confirm hint ("this will clear N expressions"). */
export function refsInto(d: RecipeJson, name: string): number {
  return fieldsReferencing(d, name).length
}

// ─── Configured-node insertion (Task 10) ─────────────────────────────────────
//
// The old direct-add path (`addStep`/`addSourceTable`, removed in Task 11 once
// every palette add routed through `NodeConfigDialog` — human ruling, pre-flight
// scan 2026-08-01) used to emit an ORPHAN: {name: NEW_<TYPE>_<n>, type, fields:
// []} — no sources, no fields, no refs — the floating NEW_TABLE_1 the user
// screenshotted. `buildStep`/`insertConfiguredStep` are `NodeConfigDialog`'s
// write path for every kind EXCEPT a source table: the dialog gathers a name,
// schema-driven properties, and a legality-checked set of "fed by"/"feeds" node
// names, then commits ONE fully-formed step through these two pure helpers —
// same clone-then-mutate idiom as every other mutator here.
//
// A source table (the palette's `SOURCE_TABLE_TYPE` sentinel) is NOT a step —
// it's a root that reads a physical table with no upstream, so it structurally
// cannot carry a `fedBy`/mapped-field requirement the way a transformation step
// must. `IPC-FLW-003` ("no orphan step") iterates `d.steps` only, so a bare
// `sources[]` occurrence never reaches it in the first place — see
// `insertSourceTable` below, `NodeConfigDialog`'s write path for that one kind.

/** A node already present in the draft, resolved to its name + kind (a step
 * target's own `type`, or a `sources[]` entry's own `type`) — what
 * `NodeConfigDialog`'s connection picker offers as "fed by"/"feeds" candidates. */
export interface RecipeNodeRef {
  name: string
  kind: string
}

/** One field mapping the dialog's "map fields" section produces: `source` is
 * the upstream dot-ref (`"UPSTREAM.FIELD"`), `name`/`dataType` describe the
 * NEW step's own field (defaults to the upstream field's own name/dataType,
 * user-editable — see `NodeConfigDialog`).
 *
 * (Task 16: an EMPTY `source` is legal and means "this field exists but its
 * value is not mapped yet" — what the dialog's target-DDL offer produces, since
 * a `<TABLE>.json` names a column and its type but says nothing about where the
 * data comes from. See `mappedFieldToRecipeField`.)
 *
 * (Fix round 1, task-10-report.md: `IPC-FLW-003` ("no orphan step") measures
 * orphan-ness by dot-refs in field FORMULAS, not by `sources[]` membership —
 * a `fields: []` step can carry no outbound dot-ref no matter how many
 * `sources[]` entries it declares, so it always failed that check and Insert
 * could never enable. At least one real field mapping is what makes a new
 * step genuinely connected.) */
export interface MappedField {
  name: string
  dataType: string
  source: string
}

/** An empty `source` yields `{name, dataType}` with NO `transformation` key —
 * the same shape `addField` produces for an unmapped field — rather than an
 * empty `{source: ""}` formula, which would be a transformation tree claiming a
 * reference it does not have (`ReferentialRules.collectRefs` skips blank
 * sources, so such a node is pure noise in the JSON). */
function mappedFieldToRecipeField(m: MappedField): RecipeFieldJson {
  return m.source === ''
    ? { name: m.name, dataType: m.dataType }
    : { name: m.name, dataType: m.dataType, transformation: { source: m.source } }
}

/**
 * Builds the step a freshly-configured palette node inserts as:
 * `{target: {name, type: kind, ...props, fields: [...]}, sources: [...]}` —
 * `fields[]` is `mappedFields` rendered as real
 * `{name, dataType, transformation: {source: "UPSTREAM.FIELD"}}` entries
 * (never `[]` — see `MappedField`'s doc comment for why a fieldless step
 * cannot pass validation regardless of its `sources[]`). `fields` is spread
 * in AFTER `...props` so it always wins even if `props` happened to carry a
 * `fields` key (unreachable today — the dialog filters out the
 * `fieldTable`-widget key before building `props` — but the ordering itself
 * should not depend on that).
 *
 * The `sources[]` array is built from `fedBy`, each entry `{name, type: <that
 * node's own kind>}` (a `sources[]` entry always records the UPSTREAM node's
 * kind, never this step's own).
 *
 * `feeds` needs no per-node kind — the `sources[]` entry `insertConfiguredStep`
 * adds to each CONSUMING step always has `type: kind`, this new step's own kind
 * — so it travels as plain names. `RecipeStepJson` has no field for it though,
 * so it rides along as a transient marker on the returned object, read and
 * stripped by `insertConfiguredStep`; it is never written into the persisted
 * target/sources JSON (see the task-10 report's deviation log: the plan's
 * literal `fedBy: string[]` cannot carry the per-node kind this function's own
 * prose requires without a draft lookup buildStep's signature has no room for,
 * so `fedBy` is `RecipeNodeRef[]` instead).
 */
export function buildStep(
  kind: string,
  name: string,
  props: Record<string, unknown>,
  feeds: string[],
  fedBy: RecipeNodeRef[],
  mappedFields: MappedField[],
): RecipeStepJson {
  const target = {
    name,
    type: kind,
    ...props,
    fields: mappedFields.map(mappedFieldToRecipeField),
  } as unknown as RecipeTargetJson
  const sources: RecipeSourceJson[] = fedBy.map(f => ({ name: f.name, type: f.kind }))
  const step: RecipeStepJson = { target, sources }
  // Transient carrier consumed by insertConfiguredStep, see the doc comment above —
  // never part of a real RecipeStepJson's own shape.
  ;(step as unknown as { feeds?: string[] }).feeds = feeds
  return step
}

/**
 * Appends `step` (as built by `buildStep`) to `d.steps` immutably. When the
 * step's kind is `table`, also appends its name to `table.targetTableNames`
 * (same table-list bookkeeping a target-table addition always needs). For
 * every name in `step`'s transient `feeds` list that resolves to an EXISTING
 * step target, appends `{name, type: kind}` — this new step's own name/kind
 * — onto that consuming step's `sources[]`; a `feeds` name that doesn't
 * resolve to a step target is a safe no-op (nothing to attach to). Never
 * mutates `d` or `step`.
 */
export function insertConfiguredStep(d: RecipeJson, step: RecipeStepJson): RecipeJson {
  const draft = structuredClone(d)
  const persisted: RecipeStepJson = structuredClone({ target: step.target, sources: step.sources })
  const feeds = (step as unknown as { feeds?: string[] }).feeds ?? []

  draft.steps = [...(draft.steps ?? []), persisted]

  const name = persisted.target?.name
  const kind = persisted.target?.type
  if (kind === 'table' && name) {
    draft.table = draft.table ?? {}
    draft.table.targetTableNames = [...(draft.table.targetTableNames ?? []), name]
  }

  if (name && kind && feeds.length > 0) {
    draft.steps = draft.steps.map(s =>
      feeds.includes(s.target?.name ?? '')
        ? { ...s, sources: [...(s.sources ?? []), { name, type: kind }] }
        : s,
    )
  }

  return draft
}

/**
 * Inserts a **source table** — `NodeConfigDialog`'s write path for the
 * palette's `SOURCE_TABLE_TYPE` sentinel (Task 11 design ruling). A source
 * table is a ROOT: it reads a physical table and has no upstream of its own,
 * and it is not even a step — unlike `insertConfiguredStep`, this NEVER
 * appends to `d.steps`. It becomes real by being referenced: a `sources[]`
 * entry `{name, type: 'table', ...props}` is appended to EVERY step named in
 * `feeds` that already exists (a `feeds` name that doesn't resolve to a step
 * target is a safe no-op for that entry, same contract as
 * `insertConfiguredStep`'s own `feeds` handling — the table is still
 * recorded in `table.sourceTableNames` even if nothing consumes it yet),
 * plus `name` is appended to `table.sourceTableNames` (mirrors the removed
 * `addSourceTable`'s own table-list bookkeeping). Each consuming step gets
 * its OWN clone of the source entry — never a shared object reference across
 * more than one step's `sources[]`. Pure — never mutates `d`.
 */
export function insertSourceTable(
  d: RecipeJson,
  name: string,
  props: Record<string, unknown>,
  feeds: string[],
): RecipeJson {
  const draft = structuredClone(d)
  const source = { name, type: 'table', ...props } as unknown as RecipeSourceJson

  draft.steps = (draft.steps ?? []).map(s =>
    feeds.includes(s.target?.name ?? '')
      ? { ...s, sources: [...(s.sources ?? []), structuredClone(source)] }
      : s,
  )

  draft.table = draft.table ?? {}
  draft.table.sourceTableNames = [...(draft.table.sourceTableNames ?? []), name]

  return draft
}

/** Clears (deletes) the `.transformation` of a single field — the edge from
 * whatever it referenced into `toStep.toField`.
 *
 * Center-anchor edges (recipeAdapter's `deriveConnections`: a blank-port edge
 * synthesized for a `sources[]` entry that has zero field-level dot-refs
 * landing on its step — there is no field to clear) are handled by a
 * DIFFERENT removal: when `toField` is blank, this removes the matching
 * `sources[]` entry (matched by `fromNode`, the source table's name) from
 * `toStep` instead — that IS the semantic of "delete this edge" when the edge
 * *is* the sources[]-entry connectivity itself, not a field transformation.
 * Kept deliberately simple per review: only `toStep`'s own `sources[]` entry
 * is removed (`table.sourceTableNames` and any OTHER step's `sources[]`
 * mention of the same table are left alone — another step may still legitimately
 * depend on it; that's a `deleteNode`-shaped decision, not this one's).
 * `fromNode` is optional so 3-arg callers (an existing field-level edge, where
 * `toField` is always non-blank) are unaffected; omitting it for a blank
 * `toField` is a safe no-op (nothing to identify which sources[] entry to drop).
 * No-op if the step doesn't exist, or (field case) the field doesn't exist. */
export function deleteEdge(
  d: RecipeJson,
  toStep: string,
  toField: string,
  fromNode?: string,
): RecipeJson {
  const draft = structuredClone(d)
  const step = draft.steps?.find(s => s.target?.name === toStep)
  if (!step) return draft

  if (isBlank(toField)) {
    if (fromNode !== undefined && step.sources) {
      step.sources = step.sources.filter(s => s.name !== fromNode)
    }
    return draft
  }

  const field = readFields(step.target).find(f => f.name === toField)
  if (field) delete field.transformation
  return draft
}

// ─── Generic property mutators (Task 12 — schema-driven Inspector) ──────────────
//
// The Inspector renders whatever GET /api/ipc/rules says a kind admits; it never
// hardcodes a per-kind key list. These three mutators are its write path: given a
// key name resolved by the Inspector (already alias-resolved against the wire's
// keyAliases table, so a write lands on the SAME raw key — e.g. "greencliff" — the
// node already carries, rather than growing a stray parallel "groups" key), they
// set/delete that key on the target's or a specific sources[] entry's raw object.
// Deliberately untyped (`Record<string, unknown>`) at the write site — same
// `as unknown as Record<string, unknown>` idiom recipeAdapter.ts's
// `collectScalarProps` already uses for the closed RecipeTargetJson/RecipeSourceJson
// interfaces — since the recipe grammar the Inspector renders is exactly whatever
// the backend's key schema says, not a second copy hand-typed here.

/** Sets an arbitrary key on the named step's target (resolved by `target.name`).
 * No-op (unchanged clone) if `stepName` doesn't resolve to a step target. */
export function setTargetProperty(
  d: RecipeJson,
  stepName: string,
  key: string,
  value: unknown,
): RecipeJson {
  const draft = structuredClone(d)
  const step = draft.steps?.find(s => s.target?.name === stepName)
  if (!step?.target) return draft
  ;(step.target as unknown as Record<string, unknown>)[key] = value
  return draft
}

/** Deletes an arbitrary key from the named step's target (resolved by
 * `target.name`). No-op if the step doesn't exist or the key is already absent. */
export function deleteTargetProperty(d: RecipeJson, stepName: string, key: string): RecipeJson {
  const draft = structuredClone(d)
  const step = draft.steps?.find(s => s.target?.name === stepName)
  if (!step?.target) return draft
  delete (step.target as unknown as Record<string, unknown>)[key]
  return draft
}

/** Sets an arbitrary key on ONE `sources[]` entry: the step is resolved by
 * `target.name` (`stepName`), then the entry within that step's `sources[]` by
 * `sourceName` — the same source name can appear in more than one step's
 * `sources[]` with genuinely different property values (a router's group
 * consumers are the canonical case: same `name`, a different `group` per
 * consuming step), so both coordinates are required to identify a single
 * occurrence. No-op if either doesn't resolve. */
export function setSourceProperty(
  d: RecipeJson,
  stepName: string,
  sourceName: string,
  key: string,
  value: unknown,
): RecipeJson {
  const draft = structuredClone(d)
  const step = draft.steps?.find(s => s.target?.name === stepName)
  const source = step?.sources?.find(s => s.name === sourceName)
  if (!source) return draft
  ;(source as unknown as Record<string, unknown>)[key] = value
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
