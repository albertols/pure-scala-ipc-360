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
| `table` | `TableTarget:10` | `primaryKeys?`, `updateOverride?` | 90 |
| `unionInput` | `UnionInputTarget:16` | — | 49 |
| `sourceQualifier` | `SourceQualifierTarget:20` | `sourceFilter?`, `sqlQuery?`, `userDefinedJoin?`, `selectDistinct` | 86 |
| `filter` | `FilterTarget:28` | `filterCondition?` (a transformation tree) | 23 |
| `joinerInput` | `JoinerTarget:33` | — (name is `<joiner>.<MASTER\|DETAIL>`, `AbstractTargetFactory.scala:88`) | 10 |
| `aggregator` | `AggregatorTarget:37` | `groupByFields` | 6 |
| `router` | `RouterTarget:42` | `groups: RouterGroup[]` | 1 |
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

| Token | Corpus | Evidence | Resolves to |
|---|---|---|---|
| `BERYLFALLS` | 86 target / 95 source | Every occurrence carries `selectDistinct`; 15 also `sourceFilter`, 9 `sqlQuery`, 8 `userDefinedJoin`. All 110 paired sources are `table`. Matches `SourceQualifierTarget:20` exactly | `sourceQualifier` |
| `EARLYGLADE` | 49 target | Key signature is `{fields}` only. The sole canonical target kind unaccounted for once the other three tokens resolve | `unionInput` |
| `ASHPATH2` | 10 target | All named `JNR_*`; 10 = the 5 corpus `joiner` sources × master/detail, matching `AbstractTargetFactory.scala:88`'s `<joiner>.<inputType>` naming | `joinerInput` |
| `CEDARWICK2` | 1 target / 1 source | Carries `procedureName` + `returnField` — unique to `StoredProcedureTarget:85` | `storedProcedure` |

One **key** alias also survives the `weststone`→`fields` repair: `greencliff` appears on
1 target, and `updateOverride` (`TableTarget:13`) appears 0 times corpus-wide, so
`greencliff` = `updateOverride` by elimination.

**Confirmation is a task requirement, not an assumption.** Before the alias table is
committed, each entry is verified against the corresponding source XML's
`TRANSFORMATION@TYPE` attribute for at least one mapping per token. Any token that fails
to confirm is recorded as unresolved rather than guessed.

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

- The cheap `IPC-STR-*` rules are mirrored as a pure TypeScript function so the chip
  updates on every keystroke without a round trip.
- The full catalogue runs against `POST /api/recipes/validate`, debounced 400 ms after
  the last draft mutation.
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

_(none yet — this section is filled in as the plan executes)_
