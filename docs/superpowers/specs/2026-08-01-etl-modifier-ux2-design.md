# ETL Modifier UX Round 2 — Editor Layout, Safe Authoring, Recipes From Scratch — Design (sub-project 9)

**Date:** 2026-08-01 · **Branch:** `feat/etl360-modifier-ux2` · **Status:** approved by user (session 2026-08-01)

## 1. Goal & context

Sub-project 8 (`docs/superpowers/specs/2026-08-01-etl-modifier-redesign-design.md`) made Tab 2 a
real IPC designer: a banded canvas, a schema-driven Inspector covering every recipe key, and a
conformance chip over a 35-rule ruleset. Using it surfaced four defects and three missing
capabilities, all reported by the user with screenshots.

The four defects share fewer root causes than they appear to:

1. **The expression dock is an unreadable wall of lines.** It mounts all **1909** recipe-origin
   entries at once (`ExpressionDock.tsx:84`, an unbounded `.map`), renders each formula
   unclamped in a 260 px column (`:56`, `:114-118`), and breaks on `wordBreak: 'break-all'`,
   which shatters identifiers mid-token. Measured formula lengths: median 79 chars, p90 347,
   **max 53 881** — that one entry alone wraps to roughly 1585 lines at the dock's width, and
   389 entries exceed 200 chars.
2. **Clicking a canvas node appears to do nothing.** It does not: the Inspector renders
   correctly, roughly 500 px below the fold. Tab 2's body is a scrolling document
   (`ETLModifier.tsx:598`) ordered header → Source → canvas → Target → **Inspector** → Edge →
   DDL, so selecting a node updates a panel the user cannot see.
3. **The canvas is a fixed 420 px letterbox** (`ETLModifier.tsx:700`) inside that same
   scrolling document, with no way to enlarge it.
4. **The palette creates orphans.** `addStep` (`recipeEdits.ts`) emits exactly
   `{name: "NEW_<TYPE>_<n>", type, fields: []}` with no sources, no fields and no references —
   the `NEW_TABLE_1` box in the user's screenshot is the designed behaviour, not a bug in the
   usual sense.

Defects 2 and 3 are one problem: the tab is laid out as an article with an editor embedded in
it. That framing is what this sub-project changes.

The three missing capabilities: undo/redo; a way to know which IPC entities may legally connect
before adding one; and authoring a recipe from scratch rather than only editing parsed ones.

## 2. Non-goals

- **No canvas or virtualization library.** `frontend/package.json` runtime dependencies stay at
  exactly `@tanstack/react-query`, `react`, `react-dom`. The expression list is bounded by a
  render cap, not a windowing dependency.
- **No IPC XML authoring or write-back.** Recipes remain the only write surface (ADR-0007).
  Authored recipes have no source XML by design.
- **No changes to Tabs 1, 3 or 4's layout.** Only Tab 2 restructures. `EtlCanvas.tsx` and
  `NodeBox.tsx` stay untouched, as in sub-project 8.
- **No multi-select, copy/paste, or rubber-band wiring.** Carried over.
- **No changes to parser behaviour.** No file under `parser/src/main/scala` is modified.
- **Undo/redo is draft-local.** It does not span saves, and it is not a second history mechanism
  alongside the `_history/` sidecar — that remains the record of *saved* versions.

## 3. Parts & sequencing

One spec, two internally-ordered parts (user decision, session 2026-08-01).

| Part | Contents | Depends on |
|---|---|---|
| **1 — Editor usability** | expression dock fix, Tab 2 layout overhaul, resizable canvas, undo/redo | — |
| **2 — Semantic authoring** | union/joiner canvas nodes, IPC adjacency matrix, pre-add configuration dialog, new recipe from scratch | Part 1 (the dialog and the blank canvas live in the new layout) |

## 4. Ground truth

Measured against the committed corpus on 2026-08-01. These numbers are the empirical basis for
§5 and §6 and are re-asserted by tests where a rule depends on them.

**Expression archive.** 1909 recipe-origin entries. Formula length: min 12, median 79, p90 347,
max 53 881. 389 entries exceed 200 characters.

**Authoring registry.** 108 distinct source tables, 87 distinct target tables, 212 DDL
`<TABLE>.json` files, 8 layers (`ODS` 35 recipes, `DWH` 16, `ETL` 14, `CDM` 9, `STG` 4, `QDM` 3,
`RDM` 3, `OUTPUT` 2).

**Recipes without a sibling XML.** 81 of 86 recipes sit in a directory with a sibling
`.xml`/`.XML`; **5 already do not**. An authored recipe is therefore not the first of its kind,
and the tree walk, `allRecipePaths()` and the contract tests already tolerate the shape.

**Observed kind-to-kind adjacency.** Across all 86 recipes, a step's `sources[]` feed its
`target`. Thirty distinct pairings occur (alias-resolved via `IpcVocabulary`):

| source kind → target kind | n | | source kind → target kind | n |
|---|---|---|---|---|
| `table` → `sourceQualifier` | 110 | | `aggregator` → `filter` | 3 |
| `sourceQualifier` → `table` | 42 | | `sourceQualifier` → `normalizer` | 2 |
| `table` → `table` | 28 | | `aggregator` → `table` | 2 |
| `sourceQualifier` → `unionInput` | 24 | | `union` → `aggregator` | 2 |
| `sourceQualifier` → `filter` | 15 | | `normalizer` → `table` | 1 |
| `router` → `unionInput` | 14 | | `table` → `normalizer` | 1 |
| `filter` → `table` | 12 | | `filter` → `filter` | 1 |
| `filter` → `unionInput` | 9 | | `joiner` → `table` | 1 |
| `union` → `table` | 6 | | `storedProcedure` → `filter` | 1 |
| `sourceQualifier` → `joinerInput` | 6 | | `sourceQualifier` → `storedProcedure` | 1 |
| `sourceQualifier` → `aggregator` | 4 | | `java` → `table` | 1 |
| `normalizer` → `filter` | 3 | | `sourceQualifier` → `java` | 1 |
| `joiner` → `joinerInput` | 3 | | `filter` → `router` | 1 |
| | | | `aggregator` → `unionInput` | 1 |
| | | | `joiner` → `normalizer` | 1 |
| | | | `union` → `joinerInput` | 1 |
| | | | `union` → `unionInput` | 1 |

**Unreachable source metadata.** `recipeToCanvas` skips every non-`table` source
(`recipeAdapter.ts:352`). All non-table kinds except two share a name with a step target, so
their node exists anyway; `union` (10) and `joiner` (5) do not, leaving 2197
`unionTables[].fieldMapping` pairs across 7 recipes and 5 joiner configurations with no clickable
node. This is the same structural fact `IPC-REF-003` records (currently `warning`, 23 violations,
of which 15 are this class).

## 5. Part 1 — Editor usability

### 5.1 Expression dock

Three changes to `ExpressionDock.tsx`, all presentation:

- **Clamp** each formula to 3 lines (`max-height` + `overflow: hidden`) with a click-to-expand
  toggle per row. An expanded row scrolls internally rather than growing the dock unboundedly.
- **Cap** the rendered list at 150 entries, with a footer line stating exactly what is shown —
  `showing 150 of 1909 · refine the filter`. The cap applies after filtering, so the filter
  remains the way to reach any entry. Never silently truncate: the count is always visible.
- **`wordBreak: 'break-word'`** instead of `break-all`, so identifiers wrap at boundaries rather
  than shattering mid-token.

Drag-to-field and click-to-Insert both keep working unchanged.

### 5.2 Tab 2 layout

Tab 2's body stops being a scrolling document. When a recipe is open it becomes a fixed-height
editor:

```
┌ toolbar: fileName · layer · conformance chip · ↶ ↷ · Discard · Save · { history } { raw } ⤢ ┐
├──────────────────────────────────────────────┬──────────────────────┤
│                                              │                      │
│           CANVAS  (dominant, flex: 1)        │      INSPECTOR       │  ← vertical splitter
│                                              │      (docked)        │
├──────────────────────────────────────────────┴──────────────────────┤  ← horizontal splitter
│  drawer (collapsible tabs):  Source │ Target │ DDL │ Edge           │
└─────────────────────────────────────────────────────────────────────┘
```

- The Explorer stays left; `Palette` and `ExpressionDock` stay right. Only the middle column
  restructures.
- The recipe header's metadata fields (path, size, modified) move into the `{ raw }` panel; the
  toolbar keeps identity plus actions, so vertical space goes to the canvas.
- `Source`, `Target`, `BigQuery DDL` and the edge control move into a collapsible bottom drawer
  with tabs. Collapsed by default; the canvas gets that height.
- **Selecting a node updates the docked Inspector in place.** Nothing scrolls, and the graph
  stays visible while editing — which is the actual fix for "I click and nothing pops up".
- Focus mode (`?focus=`) renders the same editor layout minus the Explorer.

### 5.3 Resizable regions

Both splitters drag, plus a corner grip at the canvas's bottom-right (the two-headed arrow the
user asked for) that resizes both axes at once. Constraints: canvas minimum 240 px tall and
360 px wide; Inspector minimum 280 px wide; drawer minimum 0 (fully collapsed).

Sizes persist in **`localStorage`**, not the layout sidecar. This is deliberate and is the
distinction to hold onto: `_layout_*.json` holds *node positions*, which describe the recipe and
are worth sharing and committing; splitter sizes describe one person's screen and are not.

### 5.4 Undo / redo

A bounded snapshot stack in `ETLModifier`: every `applyEdit` (`ETLModifier.tsx:365`) pushes the
pre-edit draft, `↶`/`↷` step through it, and both are disabled at their ends. Placement: left of
Discard in the toolbar, per the user's request.

**Capped at 25 entries.** Each entry is a `structuredClone` of a whole recipe, and the largest
corpus recipe is ~1000 lines — an unbounded stack is a real memory cost, not a theoretical one.
Discard clears the stack; a successful save resets the baseline so undo cannot step across a
write. Undo/redo mutate the draft through the same path as every other edit, so the conformance
chip and dirty count follow automatically.

## 6. Part 2 — Semantic authoring

### 6.1 Union and joiner canvas nodes

`recipeToCanvas` gains nodes for `union` and `joiner` sources, closing the gap recorded as
sub-project 8's spec §13 deviation 3:

- **Union node** — kind `expression`, label `UNI`. Output ports from
  `unionTables[].fieldMapping[].union`; input edges from the `unionInput` steps that feed it.
- **Joiner node** — kind `joiner`, label `JNR`. Ports from `joinerTables`; input edges from its
  `joinerInput` (MASTER/DETAIL) steps, and its `joinerType`/`joinerCondition` become Inspector
  properties.

This changes node and edge counts for 12 recipes, so `scripts/recipe_sweep.mts`,
`CorpusContractTest` and the canvas tests are all re-verified rather than assumed. It also makes
15 of `IPC-REF-003`'s 23 violations resolvable, so that rule is **recalibrated** by re-running
sub-project 8's severity procedure (ADR-0010) — not left stale. Whether it returns to `error`
depends on whether the remaining 8 (`type: "table"` sources absent from `sourceTableNames`) are
themselves resolvable; the calibration decides, and its outcome is recorded.

### 6.2 IPC adjacency matrix

A new `connections` section in `backend/src/main/resources/ipc/ipc-rules.json`:

```json
"connections": {
  "sourceQualifier": { "mayFeed": ["table", "filter", "unionInput", "joinerInput",
                                   "aggregator", "normalizer", "java", "storedProcedure"] },
  "joinerInput":     { "mayFeed": ["joiner"], "requires": { "exactly": 2,
                                   "named": ["MASTER", "DETAIL"] } }
}
```

Authored from IPC semantics and the parser's step model — **not** derived from the corpus, which
can only show what this sample happens to contain. The corpus is the *validation* set instead: a
contract test asserts every one of §4's 30 observed pairings is permitted by the matrix. An
over-strict matrix fails that test immediately; an invented one is caught by the same run.

Served through the existing `GET /api/ipc/rules` alongside `keySchema` and the alias tables, so
the frontend continues to hold no second copy of the grammar.

### 6.3 Pre-add configuration dialog

Clicking or dragging a palette entry opens a dialog **before** anything is inserted:

- **Name** — required, live-checked for uniqueness against the draft.
- **Required keys** — rendered by the existing `InspectorWidgets` from the kind's `keySchema`
  entry. No second widget system, and no per-kind branching in the dialog.
- **Connections** — a picker of existing nodes this kind may legally feed or be fed by, from
  §6.2's matrix. Illegal candidates render disabled with the reason shown, so the dialog teaches
  the model rather than merely enforcing it.
- **Preview** — the JSON fragment that will be inserted, plus a live conformance result for the
  draft-with-fragment-applied.
- **Insert is disabled until the result validates.** An orphan like `NEW_TABLE_1` — no name, no
  fields, no links — becomes unreachable by construction rather than by discipline.

Cancel inserts nothing. The dialog is the only palette path; click-to-add and drag-to-canvas both
route through it.

### 6.4 New recipe from scratch

- **`GET /api/registry`** — the searchable inventory: source tables, target tables, DDL table
  names with their columns, and layers, each with the recipes referencing them. Backed by the
  same corpus walk as `/api/summary`, with the same `_history/`/`_layout_*` exclusions.
- **Blank canvas** — a "New recipe" action picks a layer and a mapping name, then opens the Part 1
  editor with an empty draft. Construction uses §6.3's dialog throughout.
- **`POST /api/recipes/{*path}`** — creates. **409 if the file exists**; **400 unless the path is
  exactly `<layer>/<mapping>/_ETL_<mapping>.json` where `<layer>` is an existing top-level
  directory of the corpus root** (today: `ODS`, `DWH`, `ETL`, `CDM`, `STG`, `QDM`, `RDM`,
  `OUTPUT` — enumerated at request time, never hardcoded); and the body must pass validation with
  zero errors before anything is written. It creates the `<mapping>` directory only, never a new
  layer.
- **Target DDL** — when a chosen target table name matches a `<TABLE>.json` DDL, its columns are
  offered as the target's fields; otherwise the name is free text and the fields are authored.

**On writing into the corpus.** Sub-project 8's final review caught `LayoutService` creating
corpus directories as an accidental side effect, and that was fixed. This endpoint does it
deliberately — the difference being that it is explicit, validated, layer-scoped, and refuses to
overwrite. That distinction is the whole reason the endpoint is a `POST` that 409s rather than a
`PUT` that upserts, and it warrants the same scrutiny the earlier bug earned.

## 7. API changes

| Endpoint | Change |
|---|---|
| `GET /api/ipc/rules` | Response gains `connections` (§6.2). Existing `rules`/`keySchema`/`typeAliases`/`keyAliases` unchanged. |
| `GET /api/registry` | **New.** Searchable authoring inventory (§6.4). |
| `POST /api/recipes/{*path}` | **New.** Create a recipe; 409 on existing, 400 outside a layer dir, validation-gated. |

`frontend/src/api/types.gen.ts` is regenerated via `make generate-api` in the task that changes
each DTO; it is never hand-edited.

## 8. Gates & testing

- **TDD throughout**, RED evidence captured per task.
- **Backend:** MockMvc per new endpoint including the 409 and the outside-a-layer 400; a contract
  test asserting all 30 observed pairings are permitted by the matrix; `IpcRulesContractTest`
  extended so `connections` covers every kind in `IpcVocabulary`.
- **Frontend:** RTL for the clamped/capped dock (including that the count line is truthful); the
  splitter drag and its `localStorage` round-trip; undo/redo across a mutation sequence including
  the 25-entry cap and the save-resets-baseline rule; the pre-add dialog refusing to insert an
  invalid fragment; union/joiner nodes appearing with correct ports; the from-scratch flow
  end-to-end against MSW.
- **Sweeps:** `scripts/recipe_sweep.mts` re-verified after §6.1 changes node/edge counts, and
  extended to assert union/joiner nodes exist where the recipe has those sources. Wired **into**
  `make validate-loop`, never beside it.
- **Floors:** 81 XMLs, 86 recipes, 33 L2L entries — unchanged. A recipe authored during manual
  testing must not be committed.
- **Existing gates:** `make test`, `make check`, `make validate-loop` green.

## 9. Acceptance criteria

1. The expression dock renders legibly: formulas clamped to 3 lines with expand, the 53 881-char
   entry no longer floods the panel, and the footer truthfully states how many of the matching
   entries are rendered (`showing 150 of 1909` unfiltered; `showing 12 of 12` when a filter
   narrows below the cap, with no footer noise when nothing is hidden).
2. Clicking any canvas node updates the docked Inspector without scrolling, with the graph still
   visible.
3. The canvas fills the available height; both splitters and the corner grip resize it; sizes
   survive a reload via `localStorage`.
4. Undo steps back through at least 5 consecutive edits and redo returns forward; both disable at
   their ends; Discard clears; a save resets the baseline.
5. Union and joiner sources render as canvas nodes with ports, and their `unionTables` /
   `joinerTables` metadata is reachable and editable in the Inspector.
6. `GET /api/ipc/rules` serves `connections`, and a contract test proves all 30 corpus pairings
   are permitted.
7. `IPC-REF-003` is recalibrated after §6.1, with its new severity and evidence recorded.
8. The palette dialog cannot insert an invalid or orphan node; Insert stays disabled until the
   preview validates; Cancel inserts nothing.
9. A recipe can be authored from scratch on a blank canvas, using registry search for sources and
   targets, and saved via `POST` — with 409 on an existing path.
10. All 86 corpus recipes still validate error-free; `make validate-loop` green.
11. `pnpm test`, `npx tsc --noEmit`, `make test`, `make check` green.
12. Docs updated: `CLAUDE.md`, `docs/architecture.md`, `frontend/AGENTS.md`, and an ADR for the
    adjacency matrix.

## 10. Visual contract impact

ADR-0005 makes the prototype's look a hard contract; the user has explicitly asked for this
tab's restructure, so the following are sanctioned:

1. Tab 2's body becomes a fixed-height editor rather than a scrolling document.
2. The recipe header compacts into a toolbar; its metadata fields move into the raw-JSON panel.
3. Source / Target / DDL / Edge move into a collapsible bottom drawer.
4. The Inspector docks beside the canvas.
5. Two splitters and a corner resize grip.
6. Undo/redo controls in the toolbar.
7. A modal dialog for node configuration — the first modal in this application.

All compose from existing tokens (`--surface`, `--surface-2`, `--surface-3`, `--border`,
`--border-subtle`, `--bg`, `--red`, `--green`, `--text-dim`, `NODE_STYLES`). No new design token.
Items 1–7 have no exact prototype precedent and are flagged for human visual sign-off at the
acceptance walk, in the manner of sub-project 8.

## 11. ADRs

- **ADR-0012 — IPC connection adjacency matrix.** Why the matrix is authored from IPC semantics
  rather than derived from the corpus; the corpus as validation set rather than source; where it
  lives and how it is served; why gating Insert behind validation is preferable to permitting
  orphans and flagging them afterwards.

## 12. Implementation deviations

Recorded here at implementation time, each traced to its task and commit.

_(none yet — filled in as the plan executes)_
