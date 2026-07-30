# ETL Modifier on Real Recipes — Design (sub-project 3)

**Date:** 2026-07-31 · **Branch:** `feat/etl360-modifier` · **Status:** approved by user (session 2026-07-30/31)

## 1. Goal & context

Tab 2 (ETL Modifier) becomes a real, editable designer over `_ETL_*.json` recipes — the
recipes are the platform-agnostic source of truth an ETL operator creates and evolves
interactively. Today the tab is fully mock-fed: clicking a real `_ETL_*.json` in the
Explorer does nothing (`filesystemAdapter.toFile` never sets `f.recipe`,
`filesystemAdapter.ts:16-23`), the tab renders `ETL_RECIPES`/`DDL_SCHEMAS` from
`mockData.ts`, and Save is a `setTimeout` flash. The backend is 100 % read-only (zero
`@PostMapping`/`@PutMapping` in `backend/src/main/java`).

Deliverables: recipe canvas (same visual language as Tab 1), designer palette with all
IPC primitives, click-wire editing, expression registry (recipe + XML merged), save with
sidecar history/rollback/raw-JSON view, collapsible Explorer in all tabs, and a
`recipe_sweep` gate proving every corpus recipe renders.

## 2. Non-goals

- Drag-from-port rubber-band wiring, multi-select, copy/paste (v2 polish; v1 is
  palette-drop + click-wire per user decision).
- Tab 4 (DAG) — untouched. Tab 3 — separate sub-project 4 (parallel stream).
- Editing the XML side; regenerating recipes from XML inside the GUI.
- Concurrent-editor conflict resolution beyond a single optimistic `baseModified`
  precondition check.

## 3. Shared foundations (Part 1 — merged to `main` early)

Stream B (sub-project 4) forks from `main` after these land:

1. **Corpus repair — `"weststone"` → `"fields"`.** The anonymizer renamed the recipe
   structural key `fields` to `weststone` in 64 of 74 recipes (verified corpus-wide;
   `AbstractTarget.scala:7` proves `fields` is the generated name; e.g.
   `_ETL_m_DM_INFOHUB_BIZLINK.json:9,17`). Same damage class as the repaired XML
   entities (CLAUDE.md corpus caveats). Repair = key rename ONLY, byte-diff limited to
   `"weststone":` → `"fields":`; no other content changes. The frontend adapter still
   tolerates both spellings defensively.
2. **Canvas + layout extraction.** The `Canvas` component inside
   `frontend/src/components/tab1/ETLViewer.tsx` moves to
   `frontend/src/components/shared/EtlCanvas.tsx` as a PURE move (props:
   `nodes, connections, selectedNode, onSelectNode, highlightIds`, plus new optional
   `children`/`overlay` slot only if a task proves it necessary), AND the layered
   layout algorithm inside `mappingAdapter.ts` is extracted to a shared pure module
   `frontend/src/api/canvasLayout.ts` (both future adapters call one implementation).
   Tab 1 keeps byte-identical visuals and behavior; existing tests keep passing
   unmodified except import paths; viewer sweep stays 69/69. `NodeBox`,
   `getNodeHeight`, `getPortY`, `buildPath`, `NODE_WIDTH`, `NODE_STYLES` stay in
   `tab1/NodeBox.tsx` and are imported by the shared canvas (follow-up moves only if
   imports get circular).
3. **Collapsible Explorer.** `frontend/src/components/shared/Sidebar.tsx` gains a
   collapse toggle: collapsed state renders a slim rail (~28 px) with an expand chevron
   and the EXPLORER glyph; expanded is today's 240 px, unchanged. State lives per tab
   component (default expanded). Explicitly user-requested ⇒ sanctioned visual change;
   new UI reuses existing tokens only (`--surface`, `--border`, `#7b88aa`, mono 10).

**Checkpoint:** after tasks 1–3 pass review, merge `feat/etl360-modifier` → `main`
(fast-forward or merge commit, tests green) so Stream B forks with the shared canvas.
Stream A continues on the same branch.

## 4. Recipe model (ground truth)

From `parser/src/main/scala/io/pure360/ipc/model/recipe/` (`Recipe.scala:5-16`,
`AbstractTarget.scala:6-89`, `AbstractSource.scala:6-46`, `RecipeTransformation.scala:8-14`)
and corpus files:

- Top level: `{ steps: Step[], table: { targetTableNames: string[], sourceTableNames: string[] } }`.
- `step.target` — one of types `table | sourceQualifier | filter | joinerInput |
  aggregator | router | normalizer | java | storedProcedure | unionInput`; carries
  `name`, `type`, `fields: [{name, dataType, transformation}]` (key possibly
  `weststone` pre-repair).
- `step.sources` — list of `{name, type}` (+ join/union metadata); **no field lists**.
- `transformation` union: `{source: "TABLE.FIELD"}` (dot-notation ref — MUST be
  preserved verbatim, CLAUDE.md hard rule), `{value: "literal"}`, or
  `{name: "EXP_*", parameters: [...]}` (nested call tree).
- **No explicit connectors** — connectivity is implicit. The backend serves the recipe
  as raw `JsonNode` passthrough (`RecipeService.java:29-44`, `RecipeDto.java:5`).

## 5. Canvas derivation (`recipeAdapter.ts`)

Pure module (`import type` only, same idiom as `mappingAdapter.ts`), signature:

```ts
export function recipeToCanvas(recipe: RecipeJson, recipePath: string): CanvasGraph
// CanvasGraph = the EXISTING { nodes: ETLNode[]; connections: Connection[]; ... } shape
```

- **Nodes:** one per unique `step.target` (kind from type map below) and one per unique
  source table name appearing in `steps[].sources` of type `table` (kind `source`).
  Target-table steps (`type: "table"`) are kind `target`. Ports: target nodes get one
  port per `fields[]` entry (`direction 'IN'` for pure targets, `'IN/OUT'` for
  intermediate steps); source-table nodes get `OUT` ports derived from every
  `TABLE.FIELD` reference against them (union of referenced fields).
- **Kind map:** `sourceQualifier→sq`, `filter→filter`, `aggregator→aggregator`,
  `router→router`, `joinerInput/joiner→joiner`, `table(as step target, non-final)→expression`;
  `union/unionInput`, `normalizer`, `java`, `storedProcedure` → viewer's unknown-type
  rule: `type: 'expression'` + `label` = 3-letter derived abbreviation (`UNI`, `NRM`,
  `JAV`, `STO`) rendered by the existing NodeBox chip fallback.
- **Edges:** derived two ways, deduped: (a) every `transformation.source: "T.F"` inside
  step S ⇒ connection `T.F → S.target.<fieldName>`; (b) recursive walk of nested
  `parameters` trees collecting inner `{source}` refs. Step chaining: a step whose
  `sources[]` names another step's target links via the dot-refs naturally; if a
  `sources[]` entry has NO field-level ref anywhere, emit a single node-center edge
  (fromPort/toPort empty strings — the shared canvas already center-anchors missing
  ports).
- **ƒ rule:** a target field whose transformation is a call tree (`{name, parameters}`)
  gets `port.expression` = the rendered formula (see §8 rendering); plain
  `{source}`/`{value}` set no expression.
- **Layout:** call the shared `canvasLayout.ts` extracted in §3 item 2.
- **Target vs intermediate rule (explicit):** a step whose target `type` is `table`
  AND whose name appears in `table.targetTableNames` is kind `target`; a `table`-typed
  step target NOT in that list is an intermediate (kind `expression`, label `TBL`).
- Empty/unparseable recipe ⇒ empty graph, never throw; adapter tolerates
  `fields`/`weststone` both.

## 6. Editing model — JSON is the truth, canvas is a projection

State in `ETLModifier.tsx`: `draft: RecipeJson` (deep clone on load), `dirtyOps:
count`, canvas re-derives via `useMemo(recipeToCanvas(draft))` on every mutation.
No graph→JSON inverse mapping exists; every UI operation mutates `draft` directly:

- **Palette** (right-side vertical strip, existing tokens): one entry per primitive
  (source table, sourceQualifier, filter, joiner, aggregator, router, union,
  normalizer, java, storedProcedure, target table, expression step). Drop (HTML5 drag
  onto the canvas div, or click-to-add fallback) appends a template step/source to
  `draft` (`{name: "NEW_<TYPE>_<n>", type, fields: []}`) — position emerges from
  auto-layout (v1 has no persisted x/y).
- **Click-wire:** click an OUT/IN-OUT port (wire-mode indicator on selection) then an
  IN port ⇒ sets/adds the target field's `transformation.source = "FROM.FIELD"`; if the
  target field doesn't exist, one is created named after the source field.
- **Inline edit:** the Tab-2 detail/edit panel (existing card idiom) edits node name,
  field name/dataType, and expression trees as text (formula textarea; parsed back
  leniently: stored as `{name, parameters}` when it parses as a call, else `{value}`).
  Registry insert button (§8) drops a formula into the textarea.
- **Delete:** selected node ⇒ removes the step/source and every dot-ref pointing at it
  (listed in a confirm hint); selected edge ⇒ clears that field's `transformation`.
- **SaveBar** (existing component): "N unsaved changes" = count of mutations; Save ⇒
  `POST validate` then `PUT`; Discard ⇒ reload from server. Validation errors render in
  the existing `--red` idiom.
- **Raw JSON toggle:** read-only pretty-printed `draft` with CopyButton (existing
  panel styling); v1 not directly editable.
- **History drawer:** list from `GET history` (timestamp, size); View loads a version
  read-only into the canvas (banner + "Restore this version"); Restore ⇒
  `POST rollback` then reload.

## 7. Backend write API (all new)

Controller additions (same package conventions; `PathResolver` sandbox everywhere;
only files matching `_ETL_*.json` are writable; any write outside the sandbox or to a
non-recipe file ⇒ 400):

| Endpoint | Behavior |
|---|---|
| `PUT /api/recipes/{*path}` | Body = full recipe JSON + `If-Unmodified-Since`-style field `baseModified` (the `modifiedAt` the client loaded). Mismatch ⇒ 409. Archives current file to `_history/` then writes atomically (temp + move). Returns fresh `RecipeDto`. |
| `POST /api/recipes/validate` | Body = recipe JSON. Returns `{valid, errors: [{path, message}]}` — checks: parses; `steps[]` present; every step type known; every field has `name`; every dot-ref `T.F` where `T` is either a `sources[]` name, a step target name, or a `table.sourceTableNames` entry; accepts both `fields`/`weststone`. No file IO. |
| `GET /api/recipes/{*path}/history` | Sorted list `[{version, timestamp, sizeBytes}]` from the sidecar. |
| `GET /api/recipes/{*path}/history/{version}` | That archived content as `RecipeDto`-shaped payload. |
| `POST /api/recipes/{*path}/rollback/{version}` | Archives current, restores the archived version, returns fresh `RecipeDto`. |

**Sidecar layout:** `<recipeDir>/_history/_ETL_<name>.<yyyyMMdd-HHmmss-SSS>.json`.
Committable (user's git-versioning intent). Exclusions: `_history/` never appears in
`/api/tree`, `CorpusService.allRecipePaths()`, DDL discovery, or the expression walk —
one shared filter, contract-tested.

**Recipes fork from XML at first edit** (user-approved direction): a GUI-saved recipe
is the truth thereafter; `make regen-corpus` would overwrite it, and that risk is
documented in the regen skill/README rather than guarded in code (v1). Record as ADR
`0007-recipes-as-source-of-truth` (write API + sidecar versioning + fork-on-edit).

## 8. Expression registry

- `ExpressionService` gains a recipe walk: for every corpus recipe (excluding
  `_history/`), every target field whose `transformation` is a call tree yields an
  entry `{recipePath, layer, step, field, formula, origin:"recipe"}`. **Formula
  rendering:** `{name, parameters}` ⇒ `NAME(p1, p2, …)` recursively; `{source:"T.F"}` ⇒
  `T.F`; `{value:"v"}` ⇒ `v` — deterministic, tested against SYN fixtures.
- `GET /api/expressions` returns the merged XML + recipe list reusing the EXISTING
  `ExpressionEntryDto` — recipe entries map `mappingPath←recipePath`,
  `transformation←step name`, `port←field name`, `origin:"recipe"`. One DTO, no
  frontend type change.
- GUI: Tab 2's "All Expressions" collector becomes the registry view — all entries
  across the corpus, filter box, origin badge, CopyButton, and "Insert" when a formula
  textarea has focus context.

## 9. Gates & testing

- **TDD throughout** (RED evidence per task). RTL+MSW flows: select recipe from tree ⇒
  canvas renders named boxes; edit expression ⇒ SaveBar counts; Save ⇒ MSW captures
  validate+PUT; palette add ⇒ node appears; click-wire ⇒ edge + dot-ref in draft;
  history rollback flow. Backend: MockMvc tests per endpoint incl. sandbox-escape 400s,
  409 precondition, sidecar layout, exclusion filters, registry rendering.
- **`scripts/recipe_sweep.mts`** (Node ≥22.6, same idiom as `viewer_sweep.mts`): walks
  `/api/tree` for recipe files, fetches each via `/api/recipes`, runs `recipeToCanvas`
  — asserts ≥74 recipes, non-empty canvas, no dangling edges, finite layout, and
  `POST validate` returns `valid:true` for every corpus recipe. Wired into
  `validate_loop.sh` after `viewer_sweep`.
- Existing floors unchanged by this stream (69 mappings / 74 recipes / 18 L2L).
- **Visual contract:** sanctioned changes = palette strip, history drawer, raw-JSON
  toggle, collapsible sidebar, canvas-in-tab2 — all composed from existing tokens and
  component idioms; everything else pixel-stable. Tab 1 visuals byte-identical after
  the canvas extraction.

## 10. Acceptance criteria

1. Clicking any `_ETL_*.json` in the Explorer renders its canvas (boxes: sources,
   transformations, target) — spot-checked incl. `CDM/m_DM_INFOHUB_BIZLINK` (the
   1000-line recipe) and a SYN recipe.
2. `recipe_sweep`: ≥74/74 recipes render AND validate green inside `make validate-loop`.
3. Palette: dropping every primitive adds a correctly-typed node; click-wire produces a
   dot-notation ref preserved verbatim in the saved JSON.
4. Save → file changes on disk with prior version archived in `_history/`; History
   lists it; Rollback restores byte-identical content; 409 on stale `baseModified`.
5. Expression registry shows entries from BOTH origins across the whole corpus;
   Insert works into a formula textarea.
6. Explorer collapses/expands in all four tabs; Tab 1 canvas visuals unchanged
   (`git diff` scope proof + existing tests).
7. `pnpm test`, `tsc`, `make test`, `make check`, `make validate-loop` all green.
8. Docs updated (CLAUDE.md frontend line, architecture.md endpoints, frontend/AGENTS.md
   ledger, ADR 0007). Corpus repair recorded in CLAUDE.md corpus caveats.
