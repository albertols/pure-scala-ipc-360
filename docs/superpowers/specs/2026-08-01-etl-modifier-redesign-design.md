# ETL Modifier Redesign — IPC Conformance, Interactive Canvas, Shell Chrome — Design (sub-project 8)

**Date:** 2026-08-01 · **Branch:** `feat/etl360-modifier-redesign` · **Status:** approved by user (session 2026-08-01)

## 1. Goal & context

Tab 2 (ETL Modifier) is wired to real recipes (sub-project 3,
`docs/superpowers/specs/2026-07-31-etl-modifier-design.md`) but is not usable as an ETL
designer. Three concrete failures, all verified against the running app:

1. **The canvas renders nothing.** `ETLModifier.tsx:926` wraps `<EtlCanvas>` in a plain
   block `div` with `height: 420`, while `EtlCanvas.tsx:74` styles its own root
   `flex: 1` and positions every child `absolute`. With a non-flex parent the `flex`
   shorthand does not apply and the element collapses to 0 px, so the section header
   truthfully reports "Canvas (2 nodes)" above an empty box. Tab 1 is unaffected because
   `ETLViewer.tsx:124` mounts the same component inside a flex column.
2. **Most of the recipe is invisible and uneditable.** `AbstractTarget.scala:6-89` and
   `AbstractSource.scala:6-46` define 10 step-target kinds and 10 source kinds carrying
   `selectDistinct`, `sourceFilter`, `sqlQuery`, `userDefinedJoin`, `filterCondition`,
   `groupByFields`, `groups[]`, `normalizedFields[]`, `javaCode`, `procedureName`,
   `returnField`, `joinerTables`/`joinerType`/`joinerCondition`,
   `unionTables[].fieldMapping[]`, `primaryKeys` and `updateOverride`. A corpus scan
   (§4) confirms every one of these is in live use. Today's `EditPanel`
   (`ETLModifier.tsx:377-427`) surfaces exactly three things: node name, field
   `dataType`, and a rendered formula string.
3. **Nothing tells the operator whether the JSON is IPC-legal.**
   `RecipeService.validate` (`RecipeService.java:177-220`) checks four things: `steps`
   non-empty, target has a `name`, target `type` is non-blank, and dot-ref first
   segments resolve. Its own Javadoc records that "every step type known" was
   downgraded to "non-blank" because the anonymizer corrupted the type values
   corpus-wide.

This sub-project makes Tab 2 a real IPC-style designer over the platform-agnostic
`_ETL_*.json` model, backed by a documented, machine-checkable IPC conformance ruleset,
and adds two pieces of shell chrome (corpus summary, loading states) that apply to all
four tabs.

Deliverables, in dependency order: an IPC wiki + rule catalogue + upgraded validator
(Part 1); a banded drag-and-drop canvas, a schema-driven inspector covering every recipe
key, a conformance indicator, a recipe-scoped expression dock, focus mode, and Explorer
scoping (Part 2); a view-aware file summary and shared loading states (Part 3).

## 2. Non-goals

- **Writing IPC XML back out.** Recipes remain the only write surface (ADR-0007). The
  Modifier never edits, regenerates, or emits `.xml`.
- **Vendoring Informatica material.** `powrmart.dtd` and Informatica documentation text
  are not copied into this repo — see §5.1.
- **A canvas library.** No `react-flow`, `dnd-kit`, `d3-drag` or similar. Dragging is
  hand-rolled on the existing SVG; a library would replace the prototype's visual
  language wholesale and break ADR-0005. `frontend/package.json` runtime dependencies
  stay at exactly `@tanstack/react-query`, `react`, `react-dom`.
- **Restyling outside scope.** Sanctioned visual surface is Tab 2's body, the Explorer
  footer, and loading states (§12). Tabs 1, 3 and 4 keep their current visuals apart
  from the summary footer and the loading-state swap.
- **Multi-select, copy/paste, undo/redo, rubber-band wiring.** Click-wire and
  palette-drop remain the editing idioms (carried over from sub-project 3's non-goals).
- **Concurrent-editor conflict resolution** beyond the existing optimistic
  `baseModified` precondition (`RecipeService.java:99-103`).
- **Changing parser behavior.** No file under `parser/src/main/scala` is modified. The
  ruleset *describes* the parser; it never changes what the parser emits.

## 3. Parts & sequencing

One spec, one plan, three internally-ordered parts (user decision, session 2026-08-01).

| Part | Contents | Depends on |
|---|---|---|
| **1 — IPC conformance** | `docs/ipc/` wiki, alias table, `ipc-rules.json` + Java rule engine, extended `POST /api/recipes/validate`, new `GET /api/ipc/rules`, contract test | — |
| **2 — Canvas & editor** | canvas collapse fix, `IpcCanvas` (bands + drag), layout sidecar API, schema-driven Inspector, conformance chip, expression dock, focus mode, Explorer scoping | Part 1 (rule catalogue drives both the Inspector's key schema and the chip) |
| **3 — Shell chrome** | `GET /api/summary`, view-aware summary footer, shared loading states | — (independent; ordered last so it lands against the final Tab 2 layout) |

The canvas collapse fix (§6.1) is the first task of Part 2 and is deliberately tiny —
everything else in Part 2 is invisible until it lands.

## 4. Ground truth — the recipe grammar

From `parser/src/main/scala/io/pure360/ipc/model/recipe/` plus a scan of all 86 corpus
recipes (`_ETL_*.json`, excluding `_history/`). Counts below are corpus occurrences and
are the empirical basis for §5's severity assignment.

**Top level** (`Recipe.scala:5`): `{ steps: Step[], table: RecipeTable }`.
`RecipeTable` (`Recipe.scala:15`) = `{ targetTableNames: string[], sourceTableNames:
string[], dq2?: RecipeDuplication }`. `dq2` is never emitted in this corpus.

**Step** (`Recipe.scala:7`): `{ target: AbstractTarget, sources: AbstractSource[] }`.
There are **no explicit connectors** — connectivity is implicit in dot-refs.

**Step target kinds** (`AbstractTarget.scala`), all carrying `name`, `type`, `fields`.
Corpus counts are **alias-resolved** (§5.3) — four of these kinds appear in the committed
JSON under anonymized `type` tokens, not under the canonical name shown here:

| `type` | class:line | additional keys | corpus |
|---|---|---|---|
| `table` | `TableTarget:10` | `primaryKeys?` (9), `updateOverride?` (0 — `None` throughout this corpus) | 90 |
| `unionInput` | `UnionInputTarget:16` | — | 49 |
| `sourceQualifier` | `SourceQualifierTarget:20` | `sourceFilter?`, `sqlQuery?`, `userDefinedJoin?`, `selectDistinct` | 86 |
| `filter` | `FilterTarget:28` | `filterCondition?` (a transformation tree) | 23 |
| `joinerInput` | `JoinerTarget:33` | — (name is `<joiner>.<MASTER\|DETAIL>`, `AbstractTargetFactory.scala:88`) | 10 |
| `aggregator` | `AggregatorTarget:37` | `groupByFields` | 6 |
| `router` | `RouterTarget:42` | `groups: RouterGroup[]` — appears in the corpus under the anonymized key `greencliff` (§5.3) | 1 |
| `normalizer` | `NormalizerTarget:58` | `normalizedFields: NormalizedField[]` | 4 |
| `java` | `JavaTarget:80` | `javaCode` | 1 |
| `storedProcedure` | `StoredProcedureTarget:85` | `procedureName`, `returnField?` | 1 |

`RouterGroup` (`AbstractTarget.scala:47`) = `{ name, filterCondition?, default, fields }`.
`NormalizedField` (`AbstractTarget.scala:75`) = `{ name, refSource: string[],
generatedColumnId, generatedKey }`.

**Source kinds** (`AbstractSource.scala`), all carrying `name`, `type`, **never a field
list**:

| `type` | class:line | additional keys | corpus |
|---|---|---|---|
| `table` | `TableSource:19` | `primaryKeys?` | 139 |
| `sourceQualifier` | `SourceQualifierSource:16` | — | 95 |
| `router` | `RouterSource:35` | `group` | 14 |
| `filter` | `FilterSource:23` | — | 23 |
| `union` | `UnionSource:8` | `unionTables: UnionTable[]` | 10 |
| `aggregator` | `AggregatorSource:32` | — | 6 |
| `joiner` | `JoinerSource:26` | `joinerTables: string[]`, `joinerType`, `joinerCondition` | 5 |
| `normalizer` | `NormalizerSource:39` | — | 4 |
| `java` | `JavaSource:42` | — | 1 |
| `storedProcedure` | `StoredProcedureSource:45` | — | 1 |

`UnionTable` (`AbstractSource.scala:12`) = `{ name, fieldMapping: FieldMap[] }`;
`FieldMap:14` = `{ origin, union }`.

**Field** (`Recipe.scala:9`) = `{ name, dataType, transformation, dq1b? }`. `dq1b` is
never emitted in this corpus. `dataType` ∈ `ScalaType.scala:7`
(`String | BigDecimal | Long | Integer | Timestamp | LocalDateTime | LocalDate | Boolean
| Unknown`); the corpus uses six of the nine — `String` 7362, `BigDecimal` 4206, `Long`
615, `Timestamp` 214, `LocalDateTime` 74, `Integer` 9.

**Transformation** (`RecipeTransformation.scala`), a four-way union:

- `{ source: "TABLE.FIELD" }` (`:11`) — dot notation, **preserved verbatim** (CLAUDE.md
  hard rule 3).
- `{ value: "literal" }` (`:13`).
- `{ name, parameters? }` (`:8`) — nested call tree.
- `{ name: "EXP_LOOKUP", outputField, table?, condition?, sourceFilter?, sqlOverride?,
  matchPolicy, parameters: Field[] }` (`:15`) — `matchPolicy` ∈ `Any | First | Last`
  (`LookupMatchType.scala:7`). Note its `parameters` are **Field-shaped**, not
  transformation-shaped; `recipeAdapter.ts:130` already discriminates on this.

**IPC Expression transformations are not steps.** `StepMode` (`StepMode.scala:5`) has no
`EXPRESSION` value, and `AbstractTarget` has no expression subclass. An IPC `Expression`
transformation is inlined into field transformation trees as `EXP_*` call nodes. This
matters for §6.2: the canvas must stop presenting unknown types as "expression" nodes.

## 5. Part 1 — IPC conformance

### 5.1 Provenance policy

`docs.informatica.com` returns **HTTP 403 to direct fetches** (verified 2026-08-01 on
both `designer-guide/mappings/validating-a-mapping.html` and its `connection-validation`
child), while the same content is reachable through search result summaries. Combined
with the fact that `powrmart.dtd` and the PowerCenter guides are Informatica's
copyrighted material, the wiki's policy is:

- **Cite, don't vendor.** Every IPC-sourced rule carries an `ipcRef` URL. Short rule
  statements may be quoted with attribution; no page, guide or DTD is copied wholesale
  into this repo.
- **Derive the element inventory from our own corpus.** The IPC XML element/attribute
  reference in the wiki is generated from the 81 corpus XMLs, not transcribed from the
  DTD. This is also more accurate for this tool, which only ever sees exports of this
  shape.
- **The parser is the local authority.** Where IPC documentation and
  `parser/src/main/scala` disagree about what a construct means, the wiki records both
  and the ruleset follows the parser — the ruleset's job is to keep recipes loadable by
  *this* pipeline.

### 5.2 The wiki — `docs/ipc/`

| File | Contents |
|---|---|
| `README.md` | How to read the wiki, the provenance policy (§5.1), the alias table (§5.3), and the "which file is authoritative for what" map |
| `00-model-map.md` | Three-column map: IPC XML element (`TRANSFORMATION@TYPE`, `TRANSFORMFIELD`, `CONNECTOR`, `GROUP`, `TABLEATTRIBUTE`, `INSTANCE`) → parser class (`file:line`) → recipe JSON key |
| `transformations/<kind>.md` | One page per kind in §4's two tables (20 pages, `table` shared). Each: what IPC says (cited), what the parser emits (`file:line`), the recipe JSON shape, required/optional keys, corpus occurrence count, worked example from the corpus, and the rule ids that apply |
| `rules.md` | The full rule catalogue — id, statement, severity, `parserRef`, `ipcRef`, and for every `warning` the corpus evidence that forced the downgrade |
| `expressions.md` | The `EXP_*` call-tree grammar, the `PredefinedFunctions` list (`RecipeConstants.scala:48-52`), the operator sets (`:54-57`), and how `EXP_LOOKUP` differs from a plain call |

### 5.3 The alias table

Four `type` values in the committed corpus are anonymizer output, not IPC vocabulary.
Resolution, with the evidence that identifies each:

All four are **confirmed against the source XML** (verified 2026-08-01; the exact
witnesses below are re-asserted as a test in Part 1):

| Token | Corpus | Confirming witness | Resolves to |
|---|---|---|---|
| `BERYLFALLS` | 86 target / 95 source | Step `SQ_ff_BIZLINK` in `CDM/m_DM_INFOHUB_BIZLINK` ⇒ `<TRANSFORMATION NAME="SQ_ff_BIZLINK" TYPE="Source Qualifier">` | `sourceQualifier` |
| `ASHPATH2` | 10 target | Step `JNR_Ashshore.DETAIL` in `DWH/m_DWH_MAPLEGROVE_ACT_CLIENTMGR_PROFILES` ⇒ `<TRANSFORMATION NAME="JNR_Ashshore" TYPE="Joiner">`, with the `.DETAIL` suffix produced by `AbstractTargetFactory.scala:88` | `joinerInput` |
| `CEDARWICK2` | 1 target / 1 source | Step `SWIFTVALE_BIRCHMILL_OAKFORD_P_MAIN` in `QDM/m_GENERATE_ERROR_BRISKGROVE` ⇒ `<TRANSFORMATION NAME="…" TYPE="Stored Procedure">` | `storedProcedure` |
| `EARLYGLADE` | 49 target | Step `LKP_CEDARMOOR_NETHUB_ELMYARD` in `CDM/m_DM_LKP_CONTACTREF_MEMBER_NETHUB_PAIR` is **not** a `TRANSFORMATION` name at all — it is `<GROUP NAME="LKP_CEDARMOOR_NETHUB_ELMYARD" ORDER="9" TYPE="INPUT"/>`, i.e. an input-group name. That is exactly what `createUnionTarget` (`AbstractTargetFactory.scala:51-55`) uses to name a `UnionInputTarget` (`inputGroup` ← the `TRANSFORMFIELD@GROUP` attribute) | `unionInput` |

`EARLYGLADE`'s witness is a different evidence class from the other three — union input
steps are named after IPC input **groups**, not transformations, so a
`TRANSFORMATION@TYPE` lookup necessarily misses them. The Part 1 test must therefore
assert `GROUP@NAME` for this token and `TRANSFORMATION@TYPE` for the other three, rather
than applying one lookup uniformly.

One **key** alias also survives the `weststone`→`fields` repair. `greencliff` appears on
exactly 1 target — step `RTR_CIPHERKEY_OFFERING` (`ETL/m_DWH_E_MAPLEGROVE_DEALFLOW_MIS_GCP1`),
whose `type` is `router` and whose XML witness is `<TRANSFORMATION NAME="RTR_CIPHERKEY_OFFERING"
TYPE="Router">`. Its value is a 14-entry array of `{name, filterCondition, default,
fields}` objects with exactly one `default: true` — structurally identical to
`RouterGroup` (`AbstractTarget.scala:47`). So **`greencliff` = `groups`**
(`RouterTarget:44`), and `updateOverride` (`TableTarget:13`) simply never appears in this
corpus, being an `Option` that is `None` throughout. This also means the corpus already
satisfies the `IPC-TYP-ROUTER` "at most one `default: true`" rule (§5.4) on real data.

**Display and validation only.** The alias table never rewrites corpus bytes (CLAUDE.md
hard rule 2 and the "never fix them back to real-looking identifiers" caveat). It is
consumed by the rule engine (to apply type-specific rules) and by
`recipeAdapter.kindAndLabel` (to label nodes) — the JSON on disk is untouched.

This directly fixes a live defect: `recipeAdapter.ts:117-124` falls through unknown
types to `{ type: 'expression', label: fallbackLabel(t) }`, so the 49 `EARLYGLADE`
union-input steps currently render as generic `EAR` expression boxes, 86 `BERYLFALLS`
source qualifiers as `BER`, and 10 `ASHPATH2` joiner inputs as `ASH`.

### 5.4 The rule catalogue

**Storage split.** Rule *logic* lives in Java (`backend/.../service/ipc/`, one checker
per rule id). Rule *metadata* — id, severity, statement, `parserRef`, `ipcRef`,
`wikiRef` — lives in `backend/src/main/resources/ipc/ipc-rules.json`. A contract test
asserts the id sets match exactly across three places: the Java registry, the JSON, and
`docs/ipc/rules.md`. Drift is a test failure, not a documentation rot.

**Families.**

- **`IPC-STR-*` structural** (enumerated, ~8 rules): `steps` is a non-empty array; every
  step has a `target` object; target has non-blank `name` and `type`; `type` resolves to
  a known kind (canonical ∪ alias); step target names are unique within a recipe; field
  names are unique within a target; every field has a non-blank `name`; `dataType` ∈
  `ScalaType.scala:7`.
- **`IPC-TYP-<KIND>-*` type shape** (defined by a rule, not by an enumeration): for each
  of the 20 kinds in §4, one required-present rule per non-`Option` constructor field and
  one type-correctness rule per field. The rules are hand-authored, but their
  *completeness* is machine-enforced — §9's contract test (c) fails if any case class
  field lacks a corresponding rule, so the catalogue cannot fall behind the parser model.
  Concrete examples: `sourceQualifier` requires a
  boolean `selectDistinct`; `aggregator` requires an array `groupByFields`; `router`
  requires `groups[]` with **at most one** `default: true`; `normalizer` requires every
  `normalizedFields[].refSource` non-empty; `java` requires `javaCode`;
  `storedProcedure` requires `procedureName`; `joiner` source requires `joinerTables`,
  `joinerType` and `joinerCondition`; `union` source requires
  `unionTables[].fieldMapping[]` entries carrying both `origin` and `union`;
  `joinerInput` target names match `^.+\.(MASTER|DETAIL)$`.
- **`IPC-REF-*` referential** (~6 rules): every dot-ref `T.F`'s `T` resolves against the
  union of step target names, `sources[].name` and `table.sourceTableNames` (this is
  today's check, `RecipeService.java:331-356`); **plus the field half** — when `T` is a
  step target, `F` must exist among that target's `fields[]`; every `sources[].name`
  resolves to a step target or a `table.sourceTableNames` entry; no field references its
  own step; `table.targetTableNames` contains every `type: "table"` target name; the
  step reference graph is acyclic.
- **`IPC-FLW-*` dataflow** (~4 rules): every non-source step is reachable from at least
  one source; every `table.targetTableNames` entry is reachable; no orphan step (no
  inbound and no outbound refs); every `EXP_LOOKUP`'s `condition` references at least one
  of its own `parameters[].name` bind variables.
- **`IPC-EXP-*` expression** (~3 rules): call-tree `name` values are either `EXP_*`
  internal markers or members of `RecipeConstants.PredefinedFunctions`
  (`RecipeConstants.scala:48-52`); `{value}` operator literals belong to the
  arithmetic/comparison/logical/string operator sets (`:54-57`); `matchPolicy` ∈
  `LookupMatchType.scala:7`.

**Severity assignment procedure** (deterministic, and what guarantees the corpus stays
green): run the full catalogue over all 86 corpus recipes. Any rule with zero violations
ships `severity: "error"`. Any rule with violations ships `severity: "warning"`, and its
wiki entry records the violation count and one example path. Exception: a rule whose
corpus violations are **provably anonymizer damage** may be pinned `error`, in which case
the alias table (§5.3) must resolve those violations first — verified by the same run.
The resulting invariant, contract-tested: **every corpus recipe validates with zero
errors.**

### 5.5 API changes

| Endpoint | Change |
|---|---|
| `POST /api/recipes/validate` | Response gains `warnings: RecipeValidationErrorDto[]` and `checks: [{ruleId, severity, status, path, message}]`. Existing `valid` and `errors` keep today's meaning and shape — `valid` stays `errors.isEmpty()`, so warnings never block a save. Backward compatible for `scripts/recipe_sweep.mts` and `ETLModifier.handleSave` |
| `GET /api/ipc/rules` | New. Serves three things: the rule catalogue (id, severity, statement, `parserRef`, `ipcRef`, `wikiRef`); the alias table (§5.3); and the **per-kind key schema** — for each of the 20 kinds, `[{key, parserType, required, widget}]` where `parserType` is the Scala constructor type and `widget` is one of §6.4's classes. The key schema is what drives the Inspector, so the GUI never hardcodes a second copy of the recipe grammar |

`RecipeValidationErrorDto` is reused for `warnings` — no new DTO for that field.
`frontend/src/api/types.gen.ts` is regenerated via `make generate-api` in the same task
(never hand-edited, per `frontend/AGENTS.md`).

## 6. Part 2 — canvas & editor

### 6.1 Canvas collapse fix

`ETLModifier.tsx:926`'s wrapper gains `display: 'flex'`. First task of Part 2, with an
RTL regression test asserting the canvas host is a flex container so the collapse cannot
silently return. `EtlCanvas.tsx` itself is not modified by this task.

### 6.2 `IpcCanvas` — bands, drag, connections

New component `frontend/src/components/tab2/IpcCanvas.tsx`. **`EtlCanvas.tsx` is not
modified**, so Tab 1 and its 81/81 `viewer_sweep` gate stay byte-identical. `IpcCanvas`
reuses `NodeBox`, `getNodeHeight`, `getPortY`, `buildPath`, `NODE_WIDTH` and
`NODE_STYLES` from `tab1/NodeBox.tsx` exactly as `EtlCanvas` does.

- **Bands.** Three labelled full-height background bands — **Sources**,
  **Transformations**, **Target** — rendered behind the node layer. Membership is
  derived from the recipe, never from drop position: kind `source` (and any node whose
  id is in `table.sourceTableNames`) → Sources; kind `target` (`table`-typed targets
  listed in `table.targetTableNames`) → Target; everything else → Transformations. Band
  bounds are computed from member node extents, so a node dragged across a boundary does
  not change its band — the bands follow the data.
- **Drag.** Pointer-events drag on node boxes, snapped to a 10 px grid, with the
  existing pan/zoom untouched. Drag state is `Record<nodeId, {x, y}>` offsets layered
  over the computed layout, so `recipeToCanvas` stays pure and `layoutNodes`
  (`canvasLayout.ts:64`) is unchanged.
- **`⌗ auto-layout`.** Clears saved offsets and re-runs `layoutNodes`.
- **Edge hit areas.** Each connection renders a second transparent path at
  `strokeWidth: 12` beneath the visible one, carrying the click handler. Today's 1 px
  `<path>` (`EtlCanvas.tsx:127-135`) is effectively unclickable, which makes the existing
  edge-delete affordance unreachable in practice.
- **Node chrome.** Each box gains the alias-resolved canonical kind label (§5.3), a port
  count, and a per-node conformance dot fed by §6.5's check results.

### 6.3 Layout sidecar

Node positions persist to a committed sidecar (user decision, session 2026-08-01):
`<mappingDir>/_layout_<mapping>.json`, shape
`{ version: 1, nodes: { "<nodeId>": { "x": number, "y": number } } }`.

| Endpoint | Behavior |
|---|---|
| `GET /api/layouts/{*path}` | Layout for that recipe path; `{}`-equivalent empty layout when absent, never 404 |
| `PUT /api/layouts/{*path}` | Writes atomically (temp + move, mirroring `RecipeService.writeAtomic`, `RecipeService.java:269-277`). Sandboxed via `PathResolver.insideCorpus` |

Rationale for a sidecar rather than the recipe itself: the parser never emits `x`/`y`,
so embedding coordinates would make `make regen-corpus` diff on every recipe and break
CLAUDE.md hard rule 3.

**Exclusions.** `_layout_*.json` must be invisible to every corpus walk, exactly as
`_history/` is:
- `CorpusService.java:34-45` (tree children) — currently skips the `_history` directory
  by name (`:38`); the `.json` leaf branch (`:42-43`) gains a `_layout_` filename skip.
- `RecipeService.ddls` (`RecipeService.java:77`) already skips any `_`-prefixed name, so
  DDL discovery is covered with no change — asserted by test, not assumed.
- `CorpusService.allRecipePaths()` matches `_ETL_*.json`, so it is unaffected — also
  asserted.

The shared predicate lives beside `HistorySidecar` as `LayoutSidecar` (same package,
same shape: a `DIR`/prefix constant plus an `isLayoutPath` predicate) so the exclusion
rule has exactly one definition.

### 6.4 Inspector — full property coverage

`EditPanel` (`ETLModifier.tsx:377-427`) is replaced by
`frontend/src/components/tab2/Inspector.tsx`, a right-hand panel driven by the per-kind
key schema from `GET /api/ipc/rules` (§5.5). For the selected node it renders **every
key the kind admits**, with a widget matched to the key's parser type:

| Parser type | Widget | Keys |
|---|---|---|
| `String` | text input | `name`, `procedureName`, `returnField`, `joinerType`, `group` |
| `Boolean` | toggle | `selectDistinct`, `generatedColumnId`, `generatedKey`, `default` |
| long-form string (SQL, code, conditions) | textarea | `sqlQuery`, `javaCode`, `userDefinedJoin`, `sourceFilter`, `updateOverride`, `joinerCondition` |
| `List[String]` | string-list editor (add/remove/reorder) | `groupByFields`, `primaryKeys`, `joinerTables`, `refSource` |
| `List[case class]` | row-table editor | `groups` (name/filterCondition/default/fields), `normalizedFields` (name/refSource/generatedColumnId/generatedKey), `unionTables[].fieldMapping` (origin/union) |
| `RecipeTransformation` | formula textarea, same `renderFormula`/`parseFormulaText` round-trip as fields | `filterCondition` |
| `List[Field]` | the existing field table, extended with a `dataType` select bound to `ScalaType.scala:7`'s nine values | `fields` |

**Nothing is hidden.** A key present in the JSON but absent from the kind's schema
renders in a read-only "unrecognized keys" group with its raw JSON value, so an
anonymizer artifact or a future parser field is always visible rather than silently
dropped on save.

Each widget commits through a new mutator in `frontend/src/api/recipeEdits.ts`, following
the existing immutable-draft idiom (`setFieldTransformation`, `addStep`, `deleteNode`,
`deleteEdge`, …) and the existing on-blur commit convention (`ETLModifier.tsx:290`).

`Inspector.tsx` is a new file rather than a growth of `ETLModifier.tsx`, which is already
1059 lines. Part 2 also extracts the existing `SaveBar`, `ExpressionRegistry` and
`DDLViewer` into sibling files under `components/tab2/`, leaving `ETLModifier.tsx` as
state + composition. This is targeted improvement of code the work touches, not
speculative refactoring.

### 6.5 Conformance indicator

A chip in the recipe header: green ✓ / amber ⚠ / red ✗ with counts
(`3 errors · 5 warnings`). Clicking opens a drawer listing every non-passing check with
its rule id, JSON path, message, and a link to the rule's wiki page.

- The full catalogue runs against `POST /api/recipes/validate`, debounced 400 ms after
  the last draft mutation. ~~The cheap `IPC-STR-*` rules are mirrored as a pure
  TypeScript function so the chip updates on every keystroke without a round trip.~~
  **Dropped** — see §13 deviation 1.
- Selecting a check in the drawer selects the node its path resolves to on the canvas.
- Per-node dots (§6.2) are the same check results, grouped by their path's step index.

### 6.6 Expression dock

Today's `ExpressionRegistry` (`ETLModifier.tsx:465-543`) renders inline below the canvas
and merges both origins. It moves into a right-side dock beside the palette and is
filtered to **recipe-origin entries only** (`origin === 'recipe'`), per the user's point
4 — the Modifier's whole premise is the post-parse agnostic model, so XML-origin
formulas belong to Tab 1.

Rows become drag sources (`text/etl-formula` payload); drop targets are field rows in the
Inspector and node boxes on the canvas, both routing to the same
`parseFormulaText` → `setFieldTransformation` path the existing Insert button uses
(`ETLModifier.tsx:673-677`). Insert stays as the click/keyboard path.

`GET /api/expressions` is unchanged — the filter is client-side, so Tab 1's use of the
merged list is unaffected.

### 6.7 Focus mode

`?focus=<recipePath>` renders only that recipe's editor, full viewport, with no tab bar
and no Explorer. `App.tsx` reads `window.location.search` on mount; no router dependency
is added. A `⤢` button in the recipe header opens the deep link with `window.open`.

Cross-tab save races need no new machinery: the existing `baseModified` precondition
(`RecipeService.java:99-103`) already returns 409 when the other tab saved first, and
`ETLModifier.handleSave` already surfaces that as a save error.

### 6.8 Explorer scoping

`Sidebar` (`Sidebar.tsx:152`) gains an optional `fileFilter?: (f: FSFile) => boolean`.
When present, non-matching files are omitted and directories whose subtree becomes empty
are pruned. Tab 2 passes a filter keeping only `_ETL_*.json`. Tabs 1 and 4 pass nothing
and are unaffected.

An `ⓘ` in the Explorer header and the same copy in the tab's empty state explain the
reason (the user's point 3): *the Modifier edits the platform-agnostic `_ETL_*.json`
recipes XMLParser produces from native IPC `.xml` exports; the source XML lives in the
IPC ETL Viewer tab.* The existing `InfoTooltip`
(`frontend/src/components/shared/InfoTooltip.tsx`) is the vehicle — no new tooltip idiom.

## 7. Part 3 — shell chrome

### 7.1 View-aware summary

Placement follows each tab's existing anatomy rather than a single hardcoded corner:

| Tab | Host | Content |
|---|---|---|
| 1 — Viewer | `Sidebar` footer (below the tree, above `extraContent`) | `81 xml · 86 recipes · 212 ddl · 119 dirs` |
| 2 — Modifier | `Sidebar` footer | `86 recipes · 8 layers`, plus the open recipe's `N steps · M fields · K sources` |
| 3 — Operational | floating chip, bottom-left of the graph body — Tab 3's only side panel is the **right-hand** detail panel (`ETLOperational.tsx:393-396`, `borderLeft`), so it has no left rail to dock into | for the selected date or range: `N b15 rows · M recipes · K tables · OK/KO` |
| 4 — DAG | `DagExplorer` footer (`ETLDag.tsx:25,89`) | `N clusters · M tasks · K runs` |

`GET /api/summary` serves the static corpus counts (xml, recipes, ddl files, dirs,
layers) with the same `_history`/`_layout_` exclusions as every other walk. Tab 3's
date-scoped numbers derive client-side from `useOperationalSnapshot(selectedDate)`, which
`ETLOperational.tsx:262` already loads — no new endpoint for that part.

### 7.2 Loading states

`frontend/src/components/shared/Spinner.tsx` — an SVG arc spinner plus a
`<LoadingState label>` wrapper, both in `--text-dim`, replacing the ad-hoc
`Loading …` strings (`ETLModifier.tsx:808,841,498`, `ETLViewer.tsx:116`, and the
Operational/DAG equivalents). Save and Validate buttons show an inline spinner and
disable while their request is in flight. A 2 px top progress bar driven by
`useIsFetching()` covers whole-page waits. No new design tokens.

## 8. Editing model (unchanged premise)

JSON remains the truth and the canvas remains a projection — sub-project 3's §6 model is
preserved in full. Every new affordance in §6 mutates `draft: RecipeJson` through a
`recipeEdits.ts` mutator; the canvas re-derives via `useMemo(recipeToCanvas(draft))`.
There is still no graph→JSON inverse mapping. Node positions are the sole exception and
are deliberately kept out of the recipe (§6.3).

## 9. Gates & testing

TDD throughout, RED evidence captured per task (`docs/harness.md`).

**Backend.** MockMvc per new/changed endpoint including sandbox-escape 400s. New
`IpcRulesContractTest`: (a) every corpus recipe validates with **zero errors**; (b) rule
ids match across the Java registry, `ipc-rules.json` and `docs/ipc/rules.md`; (c) every
non-`Option` constructor field of every `AbstractTarget`/`AbstractSource` case class has
a corresponding `IPC-TYP-*` rule; (d) `_layout_*.json` files are absent from `/api/tree`,
`allRecipePaths()`, `allXmlPaths()` and DDL discovery.

**Frontend.** RTL + MSW: canvas host is a flex container and node boxes render for a
loaded recipe (the §6.1 regression); dragging a node persists an offset and `PUT`s the
sidecar; auto-layout clears offsets; the Inspector renders and commits each widget class
(toggle, string-list, row-table, textarea, formula); unrecognized keys render read-only;
the conformance chip flips red on a broken dot-ref and green on repair; expression rows
drag onto a field; `?focus=` renders the isolated editor; the Explorer shows only
`_ETL_*.json` in Tab 2 and is unchanged in Tab 1.

**Sweeps.** `scripts/recipe_sweep.mts` extends to assert, for all 86 recipes, that
`POST validate` returns zero errors and that every returned `checks[].ruleId` exists in
`GET /api/ipc/rules`. Wired **into** `scripts/validate_loop.sh` (repo rule: new sweeps
join the gate, never sit beside it), not as a new top-level target.

**Floors unchanged:** 81 XMLs / 86 recipes / 33 L2L entries.

**Existing gates:** `make test`, `make check`, `make validate-loop` all green.

## 10. Acceptance criteria

1. Selecting any `_ETL_*.json` renders a populated banded canvas — spot-checked on
   `CDM/m_DM_INFOHUB_BIZLINK` (the largest recipe), a `m_CAS_*` recipe, and
   `CDM/m_SYN_DM_ORDERS_SUMMARY` (the 2-node case from the bug report).
2. `docs/ipc/` exists with `README.md`, `00-model-map.md`, `rules.md`,
   `expressions.md` and one page per kind; every rule in `rules.md` cites both a
   `parserRef` (`file:line`) and, where an IPC equivalent exists, an `ipcRef` URL.
3. The alias table resolves all four type tokens and `greencliff`, each confirmed
   against source-XML `TRANSFORMATION@TYPE`; canvas node labels show canonical kinds
   (no `EAR`/`BER`/`ASH` boxes remain).
4. All 86 corpus recipes validate with **zero errors** via `POST /api/recipes/validate`,
   proved inside `make validate-loop`.
5. Every key listed in §4's tables is visible and editable in the Inspector for a node of
   that kind, and a key absent from the schema renders read-only rather than
   disappearing on save.
6. Dragging a node and reloading restores the position from `_layout_*.json`;
   `⌗ auto-layout` clears it; `/api/tree` never lists a `_layout_*.json`.
7. The conformance chip reads green for an untouched corpus recipe, red with a rule id
   and JSON path after breaking a dot-ref, and green again after repair.
8. Tab 2's Explorer lists only `_ETL_*.json`; the ⓘ explains why; Tab 1's Explorer is
   unchanged.
9. Tab 2's expression dock shows only `origin: "recipe"` entries and a row can be
   dragged onto a field.
10. `?focus=<recipePath>` opens an isolated full-viewport editor in a second browser tab;
    saving in one tab makes the other's save return 409.
11. The summary reads correctly in all four tabs, and Tab 3's follows the selected date.
12. Every previously-textual loading state shows the shared spinner.
13. `pnpm test`, `npx tsc --noEmit`, `make test`, `make check`, `make validate-loop` green.
14. Docs updated: CLAUDE.md (Tab 2 description, corpus caveats for the alias table,
    `docs/ipc/` pointer), `docs/architecture.md` (four new/changed endpoints),
    `frontend/AGENTS.md`, ADR-0010 and ADR-0011.

### Acceptance results (final)

Recorded at the Task 18 acceptance walk (2026-08-01) with status updates from Task 19
and the final-fix wave. Two criteria changed status after the walk: criterion 3 was FAIL
at the walk but closed by Task 19 (fallback-label count: 146 → 0); the final-fix wave
addressed validation-failure behavior but did not change any acceptance criterion status.

| # | Criterion (abbreviated) | Status | Evidence |
|---|---|---|---|
| 1 | Populated banded canvas on `_ETL_*.json` | PASS (mechanical) | `recipe_sweep` 86/86, `IpcCanvas.test.tsx` bands, live adapter probes |
| 2 | `docs/ipc/` wiki with README, model-map, rules, expressions per kind | PASS | `find docs/ipc -type f` 16 files, `IpcRulesContractTest` 9/9 green |
| 3 | Alias table resolves all 4 tokens; canvas labels show canonical kinds (no fallback boxes) | PASS (mechanical) | `AliasWitnessContractTest` 5/5; Task 19 re-measured: **0** fallback labels (was 146 at walk) |
| 4 | 86 corpus recipes validate with zero errors via `POST /api/recipes/validate` | PASS | `make validate-loop` `recipe_sweep: 86/86`, `IpcRulesContractTest.everyCorpusRecipeIsErrorFree` |
| 5 | Every §4 key visible+editable in Inspector; unrecognized keys read-only | FAIL | Mechanism proven correct; two disclosed gaps remain: `unionTables[].fieldMapping` read-only (spec §13.2), union/joiner sources unreachable (spec §13.3) |
| 6 | Drag + reload restores position; auto-layout clears; `/api/tree` excludes `_layout_*.json` | PASS (mechanical) | `LayoutControllerTest` 4/4, `ETLModifier.test.tsx` drag/restore/clear tests |
| 7 | Conformance chip: green untouched, red broken dot-ref, green repaired | PASS (mechanical) | Live probe (BIZLINK baseline/mutated/repaired), `ConformanceChip.test.tsx` three states |
| 8 | Tab 2 Explorer only `_ETL_*.json`; ⓘ explains; Tab 1 unchanged | PASS (mechanical) | `Sidebar.test.tsx` filter proof, `ETLModifier.test.tsx` scoping, Tab 1 tests unaffected |
| 9 | Expression dock only `origin: "recipe"`; row draggable onto field | NEEDS HUMAN VISUAL SIGN-OFF | Origin filter proven (`ExpressionDock.test.tsx`), drag source proven; drop target untested |
| 10 | `?focus=<recipePath>` opens isolated editor; cross-tab save returns 409 | NEEDS HUMAN VISUAL SIGN-OFF | Focus isolation proven, 409 precondition proven separately; cross-tab interaction untested |
| 11 | Summary reads correctly in all tabs; Tab 3 follows selected date | PASS (mechanical) | `GET /api/summary` live response, `ETLOperational.test.tsx` date-following chip |
| 12 | Every textual loading state shows shared spinner | PASS (mechanical) | `Spinner.test.tsx` component, `LoadingState` wrapper, grep confirms no raw loading strings |
| 13 | `pnpm test`, `tsc --noEmit`, `make test`, `make check`, `make validate-loop` green | PASS | All five run successfully; `pnpm test` 239 passed, `tsc` clean, `validate-loop` PASS |
| 14 | Docs: CLAUDE.md, `docs/architecture.md`, `frontend/AGENTS.md`, ADR-0010, ADR-0011 | PASS | All five present, targeted edits confirmed via `git diff --stat` |

**Status counts: 4 PASS · 7 PASS (mechanical) · 2 NEEDS HUMAN VISUAL SIGN-OFF · 1 FAIL.**

#### Still needs human sign-off

Two acceptance criteria require browser-based visual verification or interaction patterns that no automated test covers:

1. **Criterion 9: Expression dock drag-to-field** — Drop-target half has zero test coverage. Open Tab 2 with any recipe, drag an expression row from the dock onto a field in the Inspector, and verify the formula commits to that field. (Drag source and field mutation paths are proven by unit test; the drop interaction itself is not.)

2. **Criterion 10: Cross-tab save race** — The `?focus=` mode and the 409 precondition are both individually proven, but the actual pattern (open two browser tabs, edit in one, save in one, observe 409 in the other) has never been exercised. Open `/app#/etl2?focus=CDM/m_DM_INFOHUB_BIZLINK` in one tab and the normal app in another pointing to the same recipe, make a change in one tab and save, then try to save stale edits in the other tab and confirm the 409 error appears in the UI.

## 11. ADRs

- **ADR-0010 — IPC conformance ruleset.** Severity tiers and the empirical assignment
  procedure; the corpus-error-free invariant; the alias table as display/validation-only;
  the cite-don't-vendor provenance policy; the Java-logic/JSON-metadata split and its
  three-way id parity test.
- **ADR-0011 — Canvas layout sidecar.** Why positions live in `_layout_*.json` rather
  than in the recipe (parser byte-identity, hard rule 3), the exclusion contract shared
  with `_history/`, and why a committed sidecar beats localStorage for this repo.

## 12. Visual contract impact

Sanctioned changes under ADR-0005, all composed from existing tokens
(`--surface`, `--surface-2`, `--surface-3`, `--border`, `--border-subtle`, `--red`,
`--green`, `--cyan`, `--text-dim`, and the `NODE_STYLES` kind colors) and existing
component idioms:

1. Tab 2 canvas gains labelled background bands and draggable nodes.
2. Tab 2's edit panel becomes a right-hand Inspector.
3. A conformance chip and drawer in the Tab 2 header.
4. The expression registry relocates from an inline section to a right-side dock.
5. Focus mode renders the editor with no tab bar or Explorer.
6. A summary line in the Explorer footer (Tabs 1, 2, 4) and a floating chip (Tab 3).
7. Shared spinner replacing textual loading states across all tabs.

Everything else is pixel-stable. Tab 1's canvas is byte-identical — `EtlCanvas.tsx`,
`NodeBox.tsx` and `ETLViewer.tsx` are not modified, proved by `git diff` scope plus the
existing Tab 1 tests and the 81/81 viewer sweep.

Items 1–7 are new idioms with no exact prototype precedent and are therefore flagged for
human visual sign-off at the acceptance walk, in the manner of sub-project 3's
deviations 6 and 7.

## 13. Implementation deviations

Recorded here at implementation time, each traced to its task and commit.

1. **§6.5's local TypeScript mirror of the `IPC-STR-*` rules is dropped** (ruled at the
   plan's pre-flight scan, 2026-08-01, before any task ran; plan Task 13). It would have
   maintained nine rules twice across two languages with no test binding the two
   implementations together, buying a latency saving that is single-digit milliseconds
   against a localhost backend. The conformance chip runs solely off the debounced
   `POST /api/recipes/validate`.

2. **`unionTables[].fieldMapping` per-pair editing is deferred** (spec §6.4 / acceptance
   criterion 5; found during Task 12, carried to the Task 18 acceptance walk for a user
   decision). Editable today: row scalars on every row-table kind, including `union`'s
   own row list. Visible read-only: the origin/union pairs nested inside each
   `unionTables[]` entry (`Inspector.test.tsx`'s
   `'a source:union node renders unionTables' nested fieldMapping pairs read-only'`).
   Round-trip integrity is preserved — shallow-spread row edits never touch the nested
   array, so no data is lost on save; the gap is editing convenience, not correctness.

3. **Union and joiner source metadata is unreachable in the GUI, not merely
   uneditable** (found during Task 12 while verifying deviation 2; affects acceptance
   criteria 1 and 5). `recipeToCanvas` (`frontend/src/api/recipeAdapter.ts:317`) only
   turns `type === 'table'` sources into canvas nodes. Measured across the corpus: every
   other non-table source kind (`sourceQualifier` 95, `filter` 23, `router` 14,
   `aggregator` 6, `normalizer` 4, `java` 1, `storedProcedure` 1) happens to share a name
   with a step target, so its node exists and the Inspector reaches it. Only `union` (10)
   and `joiner` (5) have no matching step target — the same structural fact `IPC-REF-003`
   already records as a warning: 23 violations across 9 recipes total, of which 15 (10
   union + 5 joiner) are this exact bare-name gap (the other 8 are an unrelated
   type:"table"-sources-outside-sourceTableNames pattern — see `IPC-REF-003`'s
   `corpusEvidence` in `backend/src/main/resources/ipc/ipc-rules.json`, mirrored in
   `docs/ipc/rules.md`; a prior draft of this deviation said "28/15 residue", conflating
   this rule's 23 with `IPC-REF-002`'s unrelated 28 — corrected at the final
   whole-branch review, 2026-08-01, verified against both files, which agree). Consequence:
   2197 `fieldMapping` pairs across 7 recipes, and `joinerTables`/`joinerType`/
   `joinerCondition` on 5 joiners, have no clickable node — the Inspector widgets that
   render them are proven correct in isolation (`Inspector.test.tsx`) but are never
   reachable via the canvas. Fixing this means synthesizing canvas nodes for union/joiner
   sources — a change to the canvas contract affecting the `recipe_sweep` gate, out of
   Task 12's scope — and would also resolve 15 of `IPC-REF-003`'s 23 warnings (the
   union/joiner sub-pattern only). **User decision required**; not fixed by Task 18
   (out of its file scope — `scripts/recipe_sweep.mts`, docs, and two ADRs only).

4. **Canvas node labels do not resolve the §5.3 alias table — found at the Task 18
   acceptance walk, contradicting this spec's own §5.3 claim** ("This directly fixes a
   live defect… the 49 `EARLYGLADE` union-input steps currently render as generic `EAR`
   expression boxes…"). The alias table (`IpcVocabulary`, `GET /api/ipc/rules`'s
   `typeAliases`) is wired into the backend rule engine (so validation treats an
   alias-typed node as its canonical kind) and into `Inspector.tsx`'s schema lookup
   (`typeAliases[rawType] ?? rawType`, `Inspector.tsx:265`) — but `ETLModifier.tsx:313`
   calls `recipeToCanvas(content, recipePath)` with no alias map, and
   `recipeAdapter.ts`'s `kindAndLabel` (`:117-124`) has no alias awareness at all; its
   `RECIPE_KIND`/`FIXED_LABEL` maps are keyed on canonical type strings only. Verified
   live against the running backend + the real adapter code (not a fixture): of the 86
   corpus recipes, canvas nodes still render `BER` (86), `EAR` (49), `ASH` (10), `CED`
   (1) — 146 nodes total — as generic purple `expression`-kind boxes instead of their
   canonical `sourceQualifier`/`unionInput`/`joinerInput`/`storedProcedure` kind color
   and abbreviation. `recipeAdapter.test.ts:13-14` is a *currently-passing* test that
   locks this in as expected behavior (`expect(byId.get('SQ_ff_BIZLINK')!.label).toBe('BER')`,
   commented "corrupted type 'BERYLFALLS' -> unknown rule"), so this is not a flake —
   it is a genuinely unimplemented half of §5.3. This directly fails acceptance criterion
   3's second clause ("canvas node labels show canonical kinds (no EAR/BER/ASH boxes
   remain)"). The first clause (the alias table itself, backend-side) is unaffected and
   passes. **User decision required**; not fixed by Task 18 (`recipeAdapter.ts` is
   outside this task's file scope).

   **Closed by plan Task 19** (2026-08-01, added after the Task 18 acceptance walk found
   this gap in the plan's own decomposition — no task had ever been assigned to wire the
   alias table into the canvas). `recipeToCanvas` gained a third parameter,
   `typeAliases: Record<string, string> = {}` (optional, default `{}`, so every existing
   caller — this module's own tests, `scripts/recipe_sweep.mts` — kept working
   unchanged); `kindAndLabel` resolves it before the `RECIPE_KIND`/`FIXED_LABEL` lookups,
   so an aliased type takes the identical path a canonical type would, never a parallel
   branch. `ETLModifier.tsx` threads `useIpcRules().data?.typeAliases` in; the sweep
   fetches `GET /api/ipc/rules` once and passes `typeAliases` through. The locking test
   (`recipeAdapter.test.ts:13-14`) was re-pointed at the canonical result — the assertion
   itself encoded the bug, so changing it was correct here, unlike every other test in
   this codebase's convention of never touching an existing assertion. Re-verified live
   against a running backend with the real adapter code, the same way the original defect
   was found: of the 86 corpus recipes, the fallback-label count for the four aliased
   tokens (`BER`/`EAR`/`ASH`/`CED`) is **0** (down from the 146 measured above). Acceptance
   criterion 3's second clause now passes; both halves of §5.3's promise hold.

   **Follow-up, same day:** Task 19's own file scope (`ETLModifier.tsx` only) left one
   more `recipeToCanvas` caller unaliased — `frontend/src/components/tab3/
   PreviewOverlay.tsx`, the read-only recipe preview reachable from Tab 3's relationships
   graph (a different canvas instance, `EtlCanvas`, than Tab 2's `IpcCanvas`, but the same
   adapter function). Flagged rather than silently fixed, per the same file-scope
   discipline as the rest of this deviation's history — then closed immediately on
   review, since leaving it meant "some canvases resolve aliases, some don't," which is a
   worse state than either extreme and would have re-broken the CLAUDE.md corpus caveat's
   "canvas labels" claim for exactly this one call site. `PreviewOverlay.tsx` now threads
   `useIpcRules().data?.typeAliases ?? {}` through its own `safeRecipeToCanvas` wrapper,
   identically to `ETLModifier.tsx`. A full grep inventory of every `recipeToCanvas` call
   site (production and test) turned up no third instance:
   `frontend/src/components/tab2/ETLModifier.tsx:313`, `frontend/src/components/tab3/
   PreviewOverlay.tsx:25`, and `scripts/recipe_sweep.mts:49` are the only three
   production call sites, and all three now pass `typeAliases`. A new RTL test
   (`ETLOperational.test.tsx`, "preview overlay does not blank while typeAliases is still
   loading…") proves the overlay renders immediately with a fallback label while
   `GET /api/ipc/rules` is still in flight (never blank, never throws — the same
   `typeAliases = {}` default `recipeToCanvas` already relied on) and upgrades to the
   canonical label once the query resolves, using a deliberately delayed MSW handler to
   force the assertion to run inside that window.

5. **Explorer-header ⓘ placement needs human visual sign-off** (Task 14, flagged for
   Task 18 acceptance under ADR-0005). The info affordance is an absolutely-positioned
   overlay (`right: 34`) composed in `ETLModifier.tsx` rather than a `Sidebar` header
   slot. Geometry is self-consistent by the numbers (240px sidebar, ~12-30px chevron)
   but was never pixel-verified in a browser — see acceptance criterion 8.

### Deferred minor findings (rolled up from the execution ledger, Tasks 1–17)

24 additional findings were disclosed and adjudicated non-blocking during Parts 1-3;
none is a correctness defect in shipped behavior, and none was silently dropped. The
table below is the full, self-contained record — it does not summarize a longer
account kept elsewhere. (An earlier draft of this section pointed at
`.superpowers/sdd/2026-08-01-etl-modifier-redesign/progress.md` for "full detail";
that path is git-ignored by `.superpowers/sdd/.gitignore` and will not exist for any
reader of a fresh clone, so the pointer is removed rather than left dangling — final
whole-branch review, 2026-08-01.)

| Task | Finding |
|---|---|
| 1 | `docs/ipc/00-model-map.md:14` cites `Recipe.scala:9` for three fields that actually span `:9-11`. |
| 2 | `weststoneFieldsKeyIsStillTolerated` (`StructuralRulesTest`) is a vacuous regression guard for the `weststone` fallback — the reviewer independently proved the fallback itself works via a standalone probe; only the *test's* power to catch a future regression is weak. |
| 2 | `StructuralRules` IPC-STR-005 calls `IpcVocabulary.canonical*Type` directly rather than `RuleContext`'s helpers (it also needs the raw string for the message) — harmless duplication. |
| 4 | `isFieldShaped` is duplicated verbatim across three rule files; `collectLookups` across two. |
| 4 | `IPC-REF-006` is boolean-correct on cycles but under-localizes: in a 3+-node cycle only the first back-edge's two endpoints get individual fail entries. |
| 4 | `literalValueOutsideAnOperatorPositionNeverFailsExp002`'s first fixture duplicates another test's fixture; only its second block adds coverage. |
| 5 | `ReferentialRules.groupsOf` duplicates `TypeShapeRules.keyOf`'s alias resolution (a private 6-line method), acknowledged in its own doc comment. |
| 6 | Spec §11 (historical record) still said "20 pages" where the real count is 12 — corrected at Task 6 fix-round, spec kept as a historical artifact by convention elsewhere. |
| 8 | Pan/zoom/dot-grid scaffold and `sameConnection` are duplicated between `EtlCanvas` and `IpcCanvas` — a deliberate cost of keeping Tab 1 byte-identical; worth extracting if the two ever diverge further. |
| 8 | `ETLModifier.test.tsx:609-619` still says "EtlCanvas" in test titles (stale terminology, pre-existing). |
| 9 | A `_layout_*.json` can be `PUT` for a recipe that doesn't exist (sandbox+shape gate only, same scope as `RecipeService.writableRecipeFile`). Inert. |
| 9 | Malformed sidecar JSON 500s via the catch-all rather than 422 the way `RecipeService.readJson` does; these files are only ever machine-written. |
| 9 | `LayoutSidecar`'s Javadoc says "excluded from every corpus walk" by analogy to `HistorySidecar` rather than enumerating call sites the way `HistorySidecar`'s does. |
| 10 | No test for the `putLayout` failure/`.catch` path. |
| 10 | `layoutQueries.test.ts`'s `React.createElement`-for-provider-wrapper pattern has no prior instance in this codebase (the `.ts`/`.tsx` extension rule does; the pattern itself doesn't). |
| 13 | A top-of-effect `clearTimeout` in `useValidation` is dead code (React always runs the previous cleanup first before a new effect). |
| 13 | `ConformanceChip` uses the `rgba(248,113,113,0.15)` idiom where `SaveBar` uses hex+alpha — same colors, inconsistent syntax. |
| 13 | Inert `eslint-disable` comments remain (no ESLint config exists in `frontend/`). |
| 13 | `useValidation`'s `catch` swallows validate failures with no log, unlike the layout-save path's `reportLayoutSaveError`. |
| 14 | Dock visibility gates on `draft` alone while its comment claims "same gating as Palette" (Palette also requires `!isViewing`) — preserves the pre-existing registry's behavior exactly, no regression, but the comment misleads. |
| 14 | No isolated unit test for the two new drop targets (canvas-wide drop, `FormulaWidget` drop) — confirmed still absent at the Task 18 acceptance walk (`grep -rn "onDrop\|fireEvent.drop" frontend/src/components/tab2/*.test.tsx` returns nothing); the underlying mutator path (`parseFormulaText` → `setFieldTransformation`) is shared with the tested Insert-button path, but the drop interaction itself is untested — see acceptance criterion 9. |
| 16 | `CorpusService.isDdlPath` re-derives the `!startsWith("_")` DDL convention that `xmlNode()` already encodes inline — could hoist into one named predicate. |
| 17 | `ConformanceChip`'s `{isValidating && ' …'}` is a real network-driven busy indicator a "Loading" grep can't surface; left alone deliberately rather than risk a visual change to a component the brief didn't name. |

The plan brief for this task states the ledger carries "25 deferred/flagged items"; a
literal re-count at the Task 18 acceptance walk found **24** distinct entries (23 tagged
`minor (deferred…)` or `deferred (final-review triage)`, plus the one `FLAG FOR VISUAL
SIGN-OFF` item promoted into deviation 5 above). Flagged here per this plan's own
instruction to flag a number mismatch rather than silently adjust the count to match.
