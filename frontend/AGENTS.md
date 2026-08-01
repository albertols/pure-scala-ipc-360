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
  `useRelationships` + `useOperationalSummary` + `useOperationalDates`.
- Tab 4 (ETL DAG): `src/api/dagAdapter.ts` + `useRelationships`/`useOperationalSnapshots`.

### Tab 2 components (`src/components/tab2/`)

`ETLModifier.tsx` is state + composition; the body it composes lives in sibling files
(sub-project 8, Parts 1–2 of `docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md`):

| File | Role |
|---|---|
| `IpcCanvas.tsx` | Tab-2-only banded canvas (Sources/Transformations/Target bands, hand-rolled pointer-event drag snapped to a 10px grid, `⌗ auto-layout`, wide invisible edge-hit paths). Reuses `NodeBox`/`getNodeHeight`/`getPortY`/`buildPath`/`NODE_WIDTH`/`NODE_STYLES` from `tab1/NodeBox.tsx`. `EtlCanvas.tsx` (Tab 1) is never imported or modified — the two canvases are deliberately isolated so Tab 1 stays byte-identical. |
| `Inspector.tsx` | Right-hand panel driven entirely by `GET /api/ipc/rules`'s `keySchema` — renders every key a node's kind admits, with the widget its schema entry names. No per-kind branching; a JSON key absent from the schema renders read-only under "unrecognized keys" rather than disappearing. **Gap:** `union` (10) and `joiner` (5) sources have no canvas node at all (`recipeAdapter.ts`'s `recipeToCanvas` only makes one per step target, and no union/joiner source shares a name with one), so their keys — 2197 `fieldMapping` pairs, 5 `joinerTables`/`joinerType`/`joinerCondition` configs — are unreachable in the GUI even though the Inspector widgets that would render them are proven correct in isolation; see `docs/superpowers/specs/2026-08-01-etl-modifier-redesign-design.md` §13 deviation 3. |
| `InspectorWidgets.tsx` | The seven widget primitives Inspector.tsx picks from by `keySchema[...].widget`: text, toggle, textarea, string-list, row-table, formula, field-table. |
| `ConformanceChip.tsx` | Header chip (green/amber/red with counts) + drawer, purely presentational over `ipcRules.ts`'s `useValidation` output — makes no network call of its own. |
| `ExpressionDock.tsx` | Right-side dock (was the inline `ExpressionRegistry`), filtered to `origin === 'recipe'` only; rows are drag sources onto Inspector field rows and canvas nodes. |
| `HistoryDrawer.tsx` | Version list (`GET /recipes/history/{path}`) + rollback (`POST /recipes/rollback/{path}`); loading an archived version's content into the canvas stays the parent's job. |
| `SaveBar.tsx` | Save/discard controls, extracted verbatim from `ETLModifier.tsx` (pure move, Task 11). |
| `DDLViewer.tsx` | DDL column table, extracted verbatim (pure move, Task 11). |
| `Palette.tsx` | Right-side vertical strip of IPC primitives, click-to-add and drag-to-drop. |

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
- `recipeAdapter.ts` (recipe→canvas projection, `recipeToCanvas`) and
  `recipeEdits.ts` (immutable draft mutators — `setFieldTransformation`, `addStep`,
  `deleteNode`, `deleteEdge`, …) behind Tab 2's editing state: `import type` only,
  runtime imports use explicit `.ts` extensions so `node --experimental-strip-types`
  can load the chain for `scripts/recipe_sweep.mts`.
- `ipcRules.ts` — Tab 2's conformance-chip data layer: `useValidation(draft)` (debounced
  `POST /api/recipes/validate`, the SOLE source of conformance state — no local
  TypeScript mirror of the IPC rules, per spec §13 deviation 1), `nodeIdFromPath`
  (`$.steps[N]…` → canvas node id) and `nodeStatusFrom` (per-node ok/warn/error, error
  always wins over warning on the same node). The catalogue fetch itself —
  `useIpcRules()`, `GET /api/ipc/rules`, `staleTime: Infinity` since the catalogue is
  static per backend build — lives in `queries.ts` alongside the other TanStack hooks;
  `Inspector.tsx` consumes its `keySchema` and `ETLModifier.tsx` threads it down.
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
