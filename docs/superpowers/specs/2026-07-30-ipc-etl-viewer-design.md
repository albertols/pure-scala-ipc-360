# IPC ETL Viewer (Tab 1 on real data) — Design

**Sub-project:** 2 of 6 (see Foundation spec §1 Roadmap)
**Branch:** `feat/etl360-ipc-viewer` (stacked on `feat/etl360-synthetic-operational`, PR #2)
**Source requirements:** `first_prompt.md` §Tab-1 (rename to "IPC ETL Viewer", full XML coverage, clickable/interactive, copy-everywhere, ƒ indicators, large-file smoothness)
**Approved:** 2026-07-30 in-session. Ruled decisions: semantic model feeds the canvas, lossless DOM feeds the detail panels; large mappings handled by zoom-collapse-to-pills + pan/zoom (the Operational prototype's own idiom).

## 1. Goal

Clicking ANY of the corpus's 69 mapping XMLs in the (already real) sidebar renders THAT
mapping's canvas in the exact Figma card style, with a full-fidelity detail panel, ƒ
expression indicators, copy-to-clipboard everywhere, canvas node search, and a
validate-loop sweep proving all 69 mappings render. The mock canvas retires from Tab 1.

## 2. Hard rules

1. **Figma visual contract**: canvas cards, ports, connectors, panel, tokens, spacing —
   untouched styling. Sanctioned changes ONLY: (a) tab label "ETL Viewer" → **"IPC ETL
   Viewer"** (first_prompt-mandated rename); (b) new states (loading/error/empty canvas)
   reuse existing tokens per the Task-12 idiom; (c) the zoom-collapse pill rendering
   reuses the Operational tab prototype's pill pattern/tokens.
2. All Foundation/SP4 hard rules hold (corpus safety, SYN naming, machine-neutral
   scripts, explicit staging).
3. Tab 2/3/4 remain mock-fed and untouched (Modifier = sub-project 3).

## 3. Components

### 3.1 Canvas adapter — `frontend/src/api/mappingAdapter.ts`

Pure function `toCanvas(model: MappingModel): CanvasGraph`:

- **Nodes** (one card per source/transformation/target the mapping's connectors touch):
  `{ id, kind, name, ports: [{ name, dataType, precisionScale, hasExpression, expression? }] }`.
  `kind` derives from the IPC instance/transformation `TYPE` → the prototype's badge
  vocabulary: `SRC` (Source Definition), `SQ` (Source Qualifier), `EXP` (Expression),
  `AGG` (Aggregator), `LKP` (Lookup Procedure), `FIL` (Filter), `JNR` (Joiner),
  `RTR` (Router), `UPD` (Update Strategy), `TGT` (Target Definition); any other IPC type
  renders with a generic transformation badge using its raw TYPE abbreviation (first 3
  chars, upper) — no type may fail the adapter.
- **Edges** from MAPPING connectors: `{ fromNode, fromPort, toNode, toPort }`.
- **Layout**: layered left→right. Layer = longest-path depth from source-definition
  nodes over connector flow (sources col 0, targets last; cycle-safe via visited set).
  Column x-positions and card y-stacking reuse the prototype's existing spacing
  constants (extract them from the current mock layout rather than inventing new ones).
- `hasExpression` = the port's EXPRESSION attribute is non-blank and differs from the
  port name (the Foundation `/api/expressions` rule) → ƒ badge.
- Multi-mapping XML files: the model's folder may hold several MAPPINGs — the canvas
  renders the mapping whose name matches the file's mappingPath basename; if none
  matches, the first mapping, with a name chip listing the others (data-only chip in the
  existing toolbar slot).

### 3.2 Viewer rewiring — `frontend/src/components/tab1/ETLViewer.tsx`

- Tree click on an `xml` node (mappingPath exists from Foundation) → `useMappingModel(path)`
  → `toCanvas` → render. "Active Mapping" panel lists the real open mapping.
- Loading/error states per the Task-12 sidebar idiom (existing dim-text/red tokens) in
  the canvas empty-state slot; empty canvas state = existing "select" hint styling.
- The mock `MAPPINGS` import retires from Tab 1; `mockData.ts` header comment updates
  its "retired tab-by-tab" ledger line. Other tabs' mock imports stay.
- **Zoom-collapse**: below the Operational prototype's zoom threshold (65%), cards
  render as compact pills (name + kind badge only), same pattern/tokens; pan/zoom kept.
- Tab label renamed **"IPC ETL Viewer"** where the tab strip defines it.

### 3.3 Detail panel — DOM-fed full fidelity

- Clicking a canvas node opens the right panel fed by `useMappingDom(path)`: locate the
  matching element (SOURCE/TARGET/TRANSFORMATION/INSTANCE by NAME within the folder,
  transformation-instance aware) and render **every attribute** of the element and its
  field children (nothing dropped — the lossless guarantee), the port table, and
  expression formulas in full.
- Copy-to-clipboard buttons on every property value, port name, and expression formula
  (prototype's existing copy-button component).
- Panel sections: Properties (all attributes), Ports (table w/ ƒ), Expressions (full
  formulas). Elements with >50 attributes/fields render in the existing scrollable
  panel body — no truncation.

### 3.4 Canvas node search

- A node-finder input in the existing canvas toolbar slot: typing filters/highlights
  matching transformation/port names; Enter jumps (pan) to the first match. Existing
  input styling; no new visual elements beyond the input in the already-present slot.

### 3.5 Coverage gate — the "every single .xml" requirement

- `scripts/viewer_sweep.mts` (node ≥22, no new deps): fetches `/api/tree`, walks every
  `mappingPath` (69), fetches `/api/mappings/model/<path>`, runs the SAME adapter —
  imported directly from `frontend/src/api/mappingAdapter.ts` via Node 22's
  `--experimental-strip-types` (the adapter must therefore stay a pure, dependency-free
  TS module: no vite aliases, no type-only re-export tricks) — and asserts: non-empty
  nodes, all edges resolve to nodes+ports, layout assigns every node a column. Any
  failure names the mapping.
- `make validate-loop` gains this sweep step after the existing endpoint checks.
- Frontend unit tests: adapter over fixture models — the SYN diamond
  (m_SYN_DWH_ORDERS_FACT), a lookup-bearing mapping, the dual-target bridge, and one
  real CDM model captured as a committed fixture JSON under
  `frontend/src/api/__fixtures__/` (small, anonymized already).

## 4. Data flow

Sidebar (real tree, Foundation) → `useMappingModel` (TanStack, mtime-cached backend) →
`toCanvas` (pure) → canvas components (prototype) → node click → `useMappingDom` →
DOM slice → detail panel. No new endpoints; no backend changes expected (any gap found
becomes an explicit plan task, not a silent workaround).

## 5. Testing strategy

TDD: adapter unit tests first (kinds, edges, layering, ƒ rule, multi-mapping file,
unknown-type fallback); RTL component test for the click→canvas→panel flow over MSW
(model + dom handlers with a small fixture); `pnpm test && npx tsc --noEmit` green;
`make validate-loop` incl. the 69/69 sweep; `make check` green.

## 6. Out of scope

- Any editing (Modifier = sub-project 3, next cycle), Operational GUI (5), DAG tab.
- Backend changes (model/dom endpoints already serve everything needed).
- Restyling of any kind; performance work beyond the ruled pill-collapse.

## 7. Acceptance criteria

1. Clicking each of ≥5 hand-picked mappings (incl. one huge one, one `.XML`, one SYN,
   one multi-mapping file) renders its real canvas; "Active Mapping" reflects it.
2. Detail panel shows every DOM attribute for a clicked node (spot-check vs raw XML)
   with working copy buttons; ƒ badges match the expressions archive rule.
3. Canvas search highlights and jumps; zoom below threshold collapses to pills.
4. `viewer_sweep` in `make validate-loop`: 69/69 mappings adapt + layout cleanly.
5. `pnpm test`, `npx tsc --noEmit`, `make test`, `make check` all green.
6. Tab reads "IPC ETL Viewer"; side-by-side vs prototype otherwise identical styling;
   Tabs 2–4 untouched (still mock-fed).
7. Docs: spec/plan committed; CLAUDE.md/architecture.md one-line updates (Tab 1 real);
   ADR only if an architectural decision emerges during implementation.

### Implementation deviations

- **§3.4 canvas search reuses the global TopBar search, no new toolbar input.** The
  spec assumed a canvas toolbar slot to host a node-finder input (§3.4). Tab 1 has no
  such toolbar — verified during Task 5. Ruled deviation: reuse the already-threaded
  global `searchQuery` prop (`App.tsx` TopBar → `ETLViewer.searchQuery`), computing
  `matchIds` in `ETLViewer` and passing a `highlightIds` prop into `Canvas`, which pans
  to the first match and applies the existing selected-node stroke treatment to the
  rest. Zero new chrome; no toolbar was added anywhere on Tab 1.
- **Detail panel `Fields (n)` counts field elements only, not every DOM child
  (Task 4, human-approved correction).** §3.3 originally implied the count sourced
  `children.length` on the located DOM element. The real corpus routinely nests
  non-field siblings under `SOURCE`/`TARGET`/`TRANSFORMATION` —
  `TABLEATTRIBUTE`/`FIELDDEPENDENCY`/`METADATAEXTENSION`/etc. — which inflated the
  raw count. `Fields (n)` now counts only `SOURCEFIELD`/`TARGETFIELD`/`TRANSFORMFIELD`
  children.
- **Detail panel's `INSTANCE` fallback lookup is mapping-scoped, not folder-wide
  (Task 4, human-approved correction).** §3.3's `findElementForNode` locator gained a
  4th parameter, `mappingName: string`, so the `INSTANCE`-indirection fallback (when no
  direct `SOURCE`/`TARGET`/`TRANSFORMATION` match exists) searches only the rendered
  `<MAPPING>` subtree first, falling back to a folder-wide search if that mapping isn't
  found. Without this scoping, a same-named `INSTANCE` in a sibling mapping within the
  same folder could resolve to the wrong element.
