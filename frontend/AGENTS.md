# frontend — ETL 360 GUI

React 19 + Vite 8 + Tailwind CSS v4. Originally a Figma Make prototype; now part of
the ETL 360 monorepo (`pure-scala-ipc-360`), being wired tab-by-tab to the real
`backend/` REST API. See root `CLAUDE.md` and `docs/architecture.md` for the whole
suite; this file covers `frontend/` specifics only.

**This is not a Figma Make sandbox.** There is no dev server "always running" and no
`.mise.toml` — those were prototype-platform assumptions that no longer apply. Run
everything locally as described below.

## Development

```bash
make dev            # from repo root: backend :8080 + frontend :8443 together
# or, with the backend already running separately:
pnpm dev             # frontend only, http://localhost:8443
```

`vite.config.ts` proxies `/api/*` to `http://localhost:8080` — without a running
backend, API calls 502 (the sidebar tree shows its error state; this is expected, not
a bug).

## Testing

```bash
pnpm test            # vitest run — unit/component tests (RTL, MSW-mocked API)
pnpm test:watch       # watch mode
npx tsc --noEmit      # type-check (part of `make check`)
```

## Visual contract — read before touching any component

The prototype's look (dark theme tokens in `src/index.css`, Inter/JetBrains Mono,
component layout and interactions) is a **hard contract** — see
`docs/adr/0005-figma-visual-contract.md`. Rewiring a tab to real data means swapping
its data source only. No restyling, spacing, or interaction changes without an
explicit ask. New UI states (loading, error, empty) reuse existing tokens
(`--text-dim`, `--red`, etc.) rather than introducing new ones.

`src/mockData.ts` is **legacy, being retired tab-by-tab** (see its header comment).
**All four tab bodies are real now** — `src/mockData.ts` has finished retiring:
- Tab 1 (IPC ETL Viewer): `src/api/filesystemAdapter.ts` + `useFilesystem`;
  `src/api/mappingAdapter.ts` + `useMappingModel`/`useMappingDom`.
- Tab 2 (ETL Modifier): `src/api/recipeAdapter.ts` + `useRecipe`/`useDdl`, editing via
  `src/api/recipeEdits.ts` against the recipe write API; a real IPC-style designer as
  of sub-project 8 (`docs/superpowers/specs/2026-08-01-etl-modifier-redesign-design.md`)
  — see "Tab 2 components" below.
- Tab 3 (ETL Operational): `src/api/relationshipsAdapter.ts`'s `toOperationalGraph` over
  `useScopedRelationships` + `useClusterIndex` (`src/api/clusterQueries.ts`, the b15 cluster
  index, `docs/adr/0014-b15-cluster-index.md`) + `useOperationalSummary` + `useRuns`. Its empty
  state is not a dead end: `tab3/DataRootsPanel.tsx` renders `useDiagnostics()`
  (`GET /api/diagnostics`) as a toolbar `DataRootsChip` at all times and, under *No relationship
  entries*, the full per-root report — resolved path of the tier that actually SERVED, the staged
  scan counts, and the hint naming the `config.json` key to change
  (`docs/adr/0013-data-root-diagnostics.md`).
- Tab 4 (ETL DAG): `src/api/dagAdapter.ts` + `useRelationships`/`useOperationalDates`/
  `useOperational`/`useRuns` (the last from `src/api/clusterQueries.ts`).

### Tab 2 components (`src/components/tab2/`)

`ETLModifier.tsx` is state + composition; the body it composes lives in sibling files
(sub-project 8, Parts 1–2 of `docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md`;
sub-project 9 restructured the shell and added the authoring path,
`docs/superpowers/plans/2026-08-01-etl-modifier-ux2.md`):

| File | Role |
|---|---|
| `IpcCanvas.tsx` | Tab-2-only banded canvas (Sources/Transformations/Target bands, hand-rolled pointer-event drag snapped to a 10px grid, `⌗ auto-layout`, wide invisible edge-hit paths). Reuses `NodeBox`/`getNodeHeight`/`getPortY`/`buildPath`/`NODE_WIDTH`/`NODE_STYLES` from `tab1/NodeBox.tsx`. `EtlCanvas.tsx` (Tab 1) is never imported or modified — the two canvases are deliberately isolated so Tab 1 stays byte-identical. **Click targets (UX round 3):** wiring belongs to the connector DOTS only — `NodeBox` paints an invisible `PORT_HIT_R` (9px) circle over each 4px dot, rendered only when `onPortClick` is supplied. A click on the port ROW goes to `onPortRowClick` instead, which selects the node and names the field for the Inspector to scroll to. Before this the row owned the wire click across the whole node body, so only the 44px header ever opened the Inspector. Tab 1 passes neither handler, so it gains no extra elements and no new behaviour. **Selection (UX round 4):** node clicks ALWAYS select — the old toggle made every second click close the Inspector, so a habitual double-click flashed it open and shut. Closing is explicit instead: the Inspector's ✕ or a clean background click (`onBackgroundClick`, gated by a `CLICK_SLOP_PX` movement budget so a pan's release click never deselects). `NodeBox` gains an opt-in `hoverHighlight` (kind-color stroke while hovered; Tab 1 doesn't pass it), and `revealPan` (exported, pure) pans the minimal distance to keep a just-selected node visible when the docked Inspector would otherwise swallow it — follow-up clicks on where the node was were silently landing on Inspector widgets. |
| `Inspector.tsx` | Right-hand panel driven entirely by `GET /api/ipc/rules`'s `keySchema` — renders every key a node's kind admits, with the widget its schema entry names. No per-kind branching; a JSON key absent from the schema renders read-only under "unrecognized keys" rather than disappearing. It resolves its schema key from the DRAFT (`findTargetStep` → `target:<kind>`, else `findSourceOccurrence` → `source:<kind>`), not from the canvas node's kind — which is why sub-project 9's synthetic union/joiner nodes reach `source:union`/`source:joiner` with no Inspector change. A node in NEITHER (a declared-only source table, see `recipeAdapter.ts` below) gets its own honest rename+delete panel rather than the `null` that used to leave the dock mounted and empty. `focusField` outlines and scrolls to the field a canvas port-row click named. `onClose` (optional) renders the header ✕ — UX round 4's explicit close, replacing the hidden re-click-the-node gesture; both panel variants share `HeaderRow`. **Residual gap:** `unionTables[].fieldMapping` is an array of OBJECTS, rendered read-only by `RowTableWidget`'s `nested` column (values always visible, never editable) — nested-object editing is still unbuilt; the `{ raw JSON }` editor is the way to author those until a widget exists. |
| `InspectorWidgets.tsx` | The seven widget primitives Inspector.tsx picks from by `keySchema[...].widget`: text, toggle, textarea, string-list, row-table, formula, field-table. |
| `ConformanceChip.tsx` | Header chip (green/amber/red with counts) + drawer, purely presentational over `ipcRules.ts`'s `useValidation` output — makes no network call of its own. |
| `ExpressionDock.tsx` | Right-side dock (was the inline `ExpressionRegistry`), filtered to `origin === 'recipe'` only; rows are drag sources onto Inspector field rows and canvas nodes. Each formula is clamped to 3 lines with a click-to-expand toggle and the list is capped at `RENDER_CAP` (150) **after** filtering, with a footer that states the truth (`showing 150 of 1909`) and disappears when nothing is hidden — the corpus max formula is 53 881 chars. Rows carry `flexShrink: 0`, which is load-bearing: the row's own `overflow: hidden` (its rounded-corner clip) zeroes the flex automatic minimum size, so inside this fixed-height column the default `flex-shrink: 1` squeezed all 150 rows to their 2px border box and the dock painted as a stack of hairlines. UX round 4 adds a pane-level collapse (header `»` / strip `«`, distinct from the per-formula clamp): collapsed it is a 36px strip, giving the ~390px the dock+palette column costs back to the canvas; state is local and per-session, like the Explorer's own collapse. |
| `HistoryDrawer.tsx` | Version list (`GET /recipes/history/{path}`) + rollback (`POST /recipes/rollback/{path}`); loading an archived version's content into the canvas stays the parent's job. |
| `SaveBar.tsx` | **No component — two style constants only** (`dangerButtonStyle`, `ghostButtonStyle`). The Save/Discard/dirty-count controls moved into `EditorToolbar.tsx` when the fixed-height editor removed the page bottom a sticky bar could dock to; the file survives because several Tab 2 components — the toolbar, the Inspector, `ETLModifier` itself and its two dialogs — import its styles directly. |
| `DDLViewer.tsx` | DDL column table, extracted verbatim (pure move, Task 11). |
| `Palette.tsx` | Right-side vertical strip of IPC primitives. Click-to-add and drag-to-drop both open `NodeConfigDialog` — neither ever mutates the draft directly. |
| `EditorLayout.tsx` | The fixed-height shell: toolbar / canvas / docked inspector / collapsible drawer, two draggable splitters and a corner grip. Presentational — owns no recipe state. |
| `useResizableLayout.ts` | Region sizes, drag math, floors (`LAYOUT_MIN`) and `localStorage` persistence. Deliberately NOT the `_layout_*.json` sidecar: that holds node positions, which describe the recipe; splitter sizes describe one person's screen. |
| `EditorToolbar.tsx` | Compact identity + actions row: filename, layer, conformance chip, `↶`/`↷`, Discard/Save, `{ history }`/`⤢`/`{ raw JSON }` (button labels quoted literally from `EditorToolbar.tsx:100,111,118` — the spec §5.2 sketch writes the last one `{ raw }`). The old recipe header's path/size/modified fields moved into the `{ raw JSON }` panel. The dropdown sets no width of its own — `RawJsonPanel` sizes itself. |
| `RawJsonPanel.tsx` | The `{ raw JSON }` dropdown's body, and an EDITOR since UX round 3 (was a read-only `<pre>` capped at 400px in a 420px dropdown). Textarea at `min(820px, 92vw)` × `min(52vh, 460px)`, vertically resizable, with Revert/Apply. Typing never touches the draft: `parseRecipeText` guards both malformed JSON *and* the non-object documents `JSON.parse` happily accepts (`[]`, `null`, `42`, `"x"`), Apply is disabled until it parses, and only Apply calls back — through `ETLModifier`'s `applyEdit`, so undo/redo, the dirty count and the conformance chip follow like any other edit. Mirrors upstream draft changes while untouched; once edited it stops mirroring rather than overwriting work in progress. Read-only while viewing an archived version. |
| `useDraftHistory.ts` | Bounded (`HISTORY_CAP` 25) undo/redo stack of `structuredClone`d drafts, pushed from `ETLModifier`'s single `applyEdit` funnel. Discard resets it; a successful save re-baselines so undo cannot step across a write. |
| `NodeConfigDialog.tsx` | The pre-add modal — name uniqueness, the kind's `keySchema` widgets (reusing `InspectorWidgets`, never a second widget system), fed-by/feeds pickers filtered by `connections` (illegal candidates disabled with the reason), field mapping from the chosen upstream, a JSON preview and a live `POST /api/recipes/validate` of the draft-with-fragment. Insert stays disabled until that validates. Commits through `recipeEdits`' `buildStep`/`insertConfiguredStep`, or `insertSourceTable` for a source table (which is not a step). |
| `RegistrySearch.tsx` | Searchable table/DDL picker over `useRegistry()`, scoped by kind (source / target / ddl). Reuses `ExpressionDock`'s `RENDER_CAP` and its honest-footer idiom; a divergent DDL name reports each variant's own column count, never the union. |
| `NewRecipeDialog.tsx` | Layer (from the registry, not a hardcoded list) + mapping name → the exact `<layer>/<mapping>/_ETL_<mapping>.json` path that `POST` will create. Resolves the path only; it makes no network call. |

Focus mode (`?focus=<recipePath>`, read in `App.tsx`) renders `ETLModifier` alone, full
viewport, no tab bar or Explorer — no new component, no router dependency.

`MAPPINGS`, `ETL_RECIPES`/`DDL_SCHEMAS` and `DAG_CLUSTERS`/`DAG_RUNS` are gone (zero
importers, grep-verified at each retirement). `OPERATIONAL_CARDS` still exists but has
zero importers after the four-stream merge — retire it in the next task that touches
`mockData.ts`. Tab 4's Replay button is a client-side mock toast (no Pub/Sub) — labeled
in `ETLDag.tsx`.

## API layer

`src/api/`:
- `types.gen.ts` — generated, committed; regenerate from a running backend with
  `make generate-api` (or `pnpm generate:api`) after any backend DTO change. Don't
  hand-edit it.
- `client.ts` — thin typed fetch wrapper: `apiGet` for reads, `apiSend` for
  `PUT`/`POST` writes (recipe save/validate/rollback); both map problem+json →
  `ApiError`.
- `queries.ts` — TanStack Query hooks (`useTree`, `useMappingDom`, `useMappingModel`,
  `useRecipe`, `useDdl`, `useExpressions`, `useAppConfig`, plus the Operational/DAG
  hooks) and the type aliases app code should import instead of `types.gen.ts`
  directly. Hooks keyed on a path argument (`useMappingDom`, `useMappingModel`,
  `useRecipe`, `useDdl`) set `enabled: !!path` so no request fires before a tree click
  supplies one.
- `recipeAdapter.ts` (recipe→canvas projection, `recipeToCanvas` — since sub-project 9
  it also synthesizes a node per `union`/`joiner` source, recovering a joiner's owner
  from the LAST dot of `<joiner>.<MASTER|DETAIL>`, matching how
  `AbstractTargetFactory.scala:88` builds that name; since UX round 3 it additionally
  emits a `source` node for every `table.sourceTableNames` entry no step references —
  matched CASE-INSENSITIVELY against the step-derived nodes, since the corpus declares
  e.g. `FF_BIZLINK` for a `sources[]` entry spelled `ff_BIZLINK`. That is what makes the
  first insertion into an empty draft visible at all — `insertSourceTable` appends no
  step by design — and it surfaces 4 real corpus lookup tables reached only through
  `LKP_*` calls) and `recipeEdits.ts` (immutable
  draft mutators — `setFieldTransformation`, `buildStep`/`insertConfiguredStep`/
  `insertSourceTable`, `deleteNode`, `deleteEdge`, …; the orphan-producing `addStep`/
  `addSourceTable` were deleted in Task 11) behind Tab 2's editing state: `import type`
  only, runtime imports use explicit `.ts` extensions so
  `node --experimental-strip-types` can load the chain for `scripts/recipe_sweep.mts`.
- `ipcRules.ts` — Tab 2's conformance-chip data layer: `useValidation(draft)` (debounced
  `POST /api/recipes/validate`, the SOLE source of conformance state — no local
  TypeScript mirror of the IPC rules, per spec §13 deviation 1), `nodeIdFromPath`
  (`$.steps[N]…` → canvas node id) and `nodeStatusFrom` (per-node ok/warn/error, error
  always wins over warning on the same node). The catalogue fetch itself —
  `useIpcRules()`, `GET /api/ipc/rules`, `staleTime: Infinity` since the catalogue is
  static per backend build — lives in `queries.ts` alongside the other TanStack hooks;
  `Inspector.tsx` consumes its `keySchema` and `ETLModifier.tsx` threads it down.
- `registryQueries.ts` — `useRegistry()` over `GET /api/registry` (`staleTime: Infinity`,
  same reasoning as `useIpcRules()`: the inventory is static per backend build). Feeds
  `RegistrySearch` and `NewRecipeDialog`'s layer list.
- `layoutQueries.ts` — the canvas layout sidecar: `useLayout(recipePath)`
  (`GET /api/layouts/{*path}`, no "missing" state to handle since an unsaved layout is
  `{version:1,nodes:{}}`, never a 404) and `putLayout(recipePath, nodes)`
  (`PUT`, `{dx,dy}` offsets keyed by node id — see `docs/adr/0011-canvas-layout-sidecar.md`
  for why offsets rather than absolute coordinates).

## Key files

- `src/App.tsx` — main application component (tab shell)
- `src/main.tsx` — React entry point, `QueryClientProvider`
- `src/index.css` — design tokens (visual contract) + Tailwind import
- `src/mockData.ts` — legacy prototype data, retiring tab-by-tab
- `src/api/` — backend data layer (see above)
- `vite.config.ts` — dev server (port 8443), `/api` proxy, Tailwind plugin
