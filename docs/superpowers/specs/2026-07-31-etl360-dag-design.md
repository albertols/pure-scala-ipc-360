# Tab 4 ETL DAG on Real Data — Design (sub-project 5)

**Date:** 2026-07-31 · **Branch:** `feat/etl360-dag` (git worktree `.worktrees/etl360-dag`,
forked from CURRENT `main` = `85963a9`) · **Status:** approved for planning (session 2026-07-31)

## 1. Goal & context

Tab 4 (ETL DAG, `frontend/src/components/tab4/ETLDag.tsx`) rewires from the
`DAG_CLUSTERS`/`DAG_RUNS`/`OPERATIONAL_CARDS` mocks to real data using ONLY endpoints that
exist on current `main`: `GET /api/relationships`, `GET /api/operational/dates`,
`GET /api/operational/{date}`, `GET /api/config`. The DAG view becomes **workflows as
clusters**: relationship recipe-nodes grouped by `workflow`, ordered by `executionOrder`,
with recipe→recipe edges derived from table-mediated dependencies (recipe A writes table T,
recipe B reads T ⇒ A→B). Run history becomes the real b15 snapshot dates; selecting a run
(date) colors DAG nodes OK/KO/no-data via a client-side join on `recipe_filename`. Pure
adapter `frontend/src/api/dagAdapter.ts` maps DTOs onto the EXISTING tab4 prop shapes
(`DagCluster`/`DagTask`/`DagRun`, `frontend/src/types.ts:139-165`) so the components render
real data with minimal markup changes.

## 2. Non-goals

- Backend — untouched, zero files. No new endpoints, no DTO changes.
- **No dependency on `GET /api/operational/summary`** — Stream B is building it in
  parallel; consuming it would create a cross-branch dependency. Client-side aggregation
  from dates + per-date rows is small and sufficient.
- Real Pub/Sub replay — the "Replay" buttons stay a client-side mock toast
  (`ETLDag.tsx:409-413` already is one), labeled as mock in a code comment + ledger note.
- Restyling — Figma visual contract (`docs/adr/0005-figma-visual-contract.md`) holds; only
  sanctioned additions (§5, states + run-selection affordance + GCP link rows).
- Tabs 1–3, shared components (`OperationalCard.tsx`, `TimePicker.tsx`, `GCPIcon.tsx`,
  `InfoTooltip.tsx`), `queries.ts`, `types.ts` — untouched (parallel-stream isolation, §8).
- Sub-DAG rendering (`DagTask.sub_dag`) — real data has no nesting; the code path stays but
  is never fed.

## 3. Ground-truth data facts (verified on main)

**Relationships** (`backend/.../RelationshipService.java`, `frontend/src/api/types.gen.ts`):
- `RelationshipsDto { nodes, edges, meta }` — `types.gen.ts:225-229`. `NodeDto` carries
  `id, kind, name, layer, mappingPath, hasRecipe, workflow, executionOrder (int32),
  writeMode, partitionType`, all optional — `types.gen.ts:212-224`. `EdgeDto {from, to, kind}`
  — `types.gen.ts:200-204`.
- Node ids `table:<NAME>` / `recipe:<FILE>`; edge kinds `source` (table→recipe), `lookup`
  (table→recipe), `writes` (recipe→table) — `RelationshipService.java:16-18,83,89,96`.
- Recipe node `name` = the recipe filename (e.g. `_ETL_m_SYN_ODS_ORDERS.json`) = the
  b15 join key (`RelationshipService.java:73-78`); `workflow`/`executionOrder` only on
  recipe nodes; table nodes have them `null` (`RelationshipService.java:112-113`).
- Mock tier: 19 served entries, 18 distinct recipes, **14 distinct workflows** (`wf_SYN_*`
  + `wf_Carga_*`; the ARCHIVE decoy's `wf_SYN_ARCHIVE_LOAD` is never served —
  `LayerToLayerService.java:17` lists 8 layer dirs, no ARCHIVE). Contract floor
  `meta.entryCount ≥ 18` (`RelationshipAndOperationalControllerTest.java:40`).

**Operational** (`backend/.../OperationalService.java`):
- `/api/operational/dates` → `{dates: [YYYY-MM-DD], mode}` sorted ascending
  (`OperationalService.java:45-61`); committed mock = 14 dates `2026-07-16`…`2026-07-29`.
- `/api/operational/{date}` → `{date, rows: B15RowDto[]}`; `B15RowDto` camelCase:
  `clusterName, recipeFilename, jobId, appStartIso, avgJobDurationInMinsSec, status,
  message` (`types.gen.ts:239-247`); missing CSV cells normalized to `""`
  (`OperationalService.java:119-122`). 18 rows per mock date.
- Status values in mock CSVs: `SUCCESS`, `FAILED`, and **blank** (null-status rows exist,
  e.g. `2026_07_18` row for `_ETL_m_DWH_MAPLEGROVE_PARTYPROFILE_INSERT.json`). Duration
  format `"44m 37sec"`. `jobId` is a YARN application id (`application_1774840360_11000`).

**Config** (`types.gen.ts:473-482`, `application.yml:11-15`): `AppConfigDto` carries
`projectId` (NOT `gcpProjectId` — the design intent's field name does not exist; code uses
`config?.projectId ?? 'mock-project'`, same defensive shape), `region`, and URL templates
`dataprocJobUrl`/`dataprocClusterUrl`/`loggingUrl` with `{jobId}`/`{clusterName}`/
`{project}`/`{region}` placeholders. Defaults: `db-dev-example-project`, `europe-southwest1`.

**Tab 4 prop shapes** (`ETLDag.tsx`): `DagExplorer` takes `clusters: DagCluster[]` (:21-33);
`DagCanvas` takes `dag: DagCluster | null` and renders `task.x`/`task.y` absolutely, edges
from `depends_on` with a **silent guard dropping deps whose task is not in the cluster**
(:222-225) — cross-workflow deps are safely listed but not drawn. `STATUS_COLOR` maps
`success/failed/running/skipped` → green/red/yellow/grey (:9-14) — `skipped` grey IS the
no-data visual. Detail-panel meta rows (:484-496); `RunHistory` reads `DAG_RUNS[dagId]`
(:359-389) and its tooltip already promises "Click any run to view details" (:366).
Mock geometry: task x ∈ {60, 280, 520, 740} (pitch 220), y ∈ {80, 200} (pitch 120).
`App.tsx:219` renders `<ETLDag />` with no props.

**Local-run trap** (`DataRoots.java:29-43`): a git-ignored partial real
`parser/src/main/resources/DWH_CONTROL` exists on this machine WITHOUT `LAYER_TO_LAYER/`
⇒ real tier wins and `/api/relationships` serves an EMPTY graph. Manual verification must
boot with `ETL360_DWH_CONTROL_ROOT=backend/src/main/resources/mock/DWH_CONTROL` (env
override only — no backend edit).

## 4. Adapter derivation rules (exact, binding)

`frontend/src/api/dagAdapter.ts` — pure: `import type` only from `./types.gen` and
`../types`, no React, no runtime imports (mirrors `mappingAdapter.ts`'s purity idiom;
if a runtime import is ever added it uses the `.ts`-extension form per
`allowImportingTsExtensions`).

1. **Clusters** (`toDagClusters(rel)`): recipe nodes (`kind === 'recipe'`) grouped by
   `workflow?.trim() || 'UNGROUPED'`; clusters sorted by name (`localeCompare`).
   `dag_id` = workflow name; `schedule` slot (existing mono text under the dag name,
   `ETLDag.tsx:118`) = `"<n> recipes"`; `status`/`last_run` = `'skipped'`/`''` until a run
   overlay is applied; table nodes never become tasks.
2. **Tasks**: `task_id` = node `name` (the b15 join key); `recipe_id` = `mappingPath ?? ''`
   (renders in the existing second line); `last_status: 'skipped'`, `duration_s: 0`.
3. **Edges**: from the whole graph build `writersByTable` (`writes` edges) and
   `readsByRecipe` (`source` AND `lookup` edges). `depends_on(r)` = sorted unique names of
   writers of every table r reads, self excluded. Cross-workflow deps are INCLUDED
   (informative in the panel; the canvas guard at `ETLDag.tsx:224` drops them from render).
4. **Layout** (mirrors mock geometry): within a cluster, `col(t) = max(orderRank(t),
   1 + col(dep))` over intra-cluster deps only, memoized with an in-progress cycle guard
   (back-edge ⇒ treated absent); `orderRank` = index of the task's `executionOrder` in the
   cluster's distinct sorted orders. Row stacking by (`executionOrder`, `task_id`).
   `x = 60 + col*220`, `y = 80 + row*120`.
5. **Run overlay** (`overlayRun(cluster, rows)`): join rows by
   `recipeFilename === task_id`; `statusFromB15`: `SUCCESS→'success'`, `FAILED→'failed'`,
   `RUNNING→'running'`, blank/unknown/undefined→`'skipped'` (no-data); missing row ⇒
   `'skipped'`. `parseDurationSec("44m 37sec") = 2677`; unparseable ⇒ 0. Cluster status:
   any `failed` ⇒ `failed`; else any `success|running` ⇒ `success`; else `skipped`.
   `last_run` = max `appStartIso` among the cluster's rows.
6. **Runs** (`clusterRuns(cluster, dates, rowsByDate)`): one `DagRun` per date ascending;
   `run_id` = the date; `duration_s` = sum of task durations that date.
7. **Cards** (`toOperationalCard(task, dates, rowsByDate, selectedDate)`): synthesizes the
   EXISTING `OperationalCard` type — `history` = per-date `StatusType` (`OK/KO/RUNNING`,
   missing ⇒ `PENDING`), stats avg + nearest-rank p50/p95/p99 over parsed durations,
   `avg_count: 0` (no row-count in b15), `layer` = `mappingPath` dir prefix (`'—'` if none),
   `jobId`/`appId` = selected date's `jobId`, `relations` = `depends_on`. Component
   unmodified.
8. **GCP URLs** (`fillGcpUrl(template, fallback, vars)`): `{key}` placeholders replaced
   with `encodeURIComponent`; fallback constants duplicate `application.yml:12-15`.

## 5. UI behavior per region (data swap + sanctioned states only)

- **Toolbar**: unchanged. The existing `TimePicker` date drives the selected run:
  `selectedDate = timeVal.isNow ? latestAvailableDate : timeVal.date` ("Now" = latest
  snapshot). A date outside `dates` ⇒ all-no-data coloring (honest).
- **DAG Explorer**: real clusters; status square colored by the selected run's overlay.
- **Canvas**: real tasks/edges; node accent + status text from overlay; cross-cluster deps
  not drawn (existing guard).
- **Run History**: real `DagRun[]` (strip chronological, rows newest-first); cells/rows
  become clickable (`onSelectRun(date)` ⇒ `setTimeVal({...date, isNow: false})`) — the
  prototype's own tooltip sanctions the click; selected run marked with a
  `1px solid #4f9cf9` outline/border (existing accent value). Sanctioned addition.
- **Detail panel**: meta rows show real recipe/status/duration/depends-on, plus a `Message`
  row when the selected date's row has one; below them a GCP link row (`cluster ↗` via
  `dataprocClusterUrl`, `logs ↗` via `loggingUrl`, link visuals copied from
  `OperationalCard.tsx:187-192`, `target="_blank"`), templates + `projectId`/`region` from
  `useAppConfig()` with defensive fallbacks. "Operational State" card = synthesized
  `toOperationalCard` (real 14-cell history, percentiles, job links). Replay buttons/modal
  unchanged, mock-labeled in code.
- **States** (Task-12 idiom, existing tokens): relationships loading ⇒ dim
  "Loading workflows…"; `ApiError` ⇒ `var(--red)` title/detail; empty graph ⇒ empty-hint
  "No workflows in the relationships graph".
- **Data layer**: new `frontend/src/api/dagQueries.ts` hosts `useOperationalSnapshots(dates)`
  (TanStack `useQueries` + `combine`, cache keys shared with `useOperational`) — kept out of
  `queries.ts` to avoid a merge overlap with Stream B's `useOperationalSummary`.

## 6. Testing & gates

- **TDD throughout.** Adapter unit tests vs a mini in-test `RelationshipsDto` fixture (two
  workflows, cross-workflow table dependency, lookup-mediated dep, same-order stacking,
  cycle guard). Aggregation unit tests (duration parse, blank status, overlay, runs, card
  percentiles, URL fill).
- RTL+MSW component tests (`ETLDag.test.tsx`): handlers model = `ETLViewer.test.tsx:132-139`;
  **no RTL auto-cleanup in this project** — new test files add their own
  `afterEach(() => cleanup())` (model: `DetailPanel.test.tsx:1-8`).
- Edge cases pinned: empty `workflow` ⇒ `UNGROUPED` cluster; recipe with no b15 rows ⇒
  no-data (grey); cross-workflow dep listed in panel but not drawn; `projectId` fallback.
- Per-task gate: `cd frontend && pnpm test && npx tsc --noEmit`. Final: `make validate-loop`
  green from the worktree (no regression; this stream does NOT edit `validate_loop.sh`).

## 7. Acceptance criteria

1. Tab 4 lists every workflow served by `/api/relationships` as a cluster — floors phrased
   ≥ against whatever `main` serves at merge time (mock tier today: ≥14 workflows, all
   `wf_SYN_*`+`wf_Carga_*`; if Stream B's CAS family has landed, `wf_CAS_*` clusters render
   too with zero code change).
2. Selecting a cluster renders its recipes ordered by `executionOrder` with table-mediated
   edges; the ≥6-hop SYN chain STG→ODS→DWH→CDM→RDM→OUTPUT is traversable across clusters
   via panel `Depends on` entries.
3. Run history shows the real dates (≥14); clicking a run or picking its date recolors
   nodes to match the CSVs — spot-check: `2026-07-18` colors
   `_ETL_m_DWH_E_MAPLEGROVE_CALLHUB_MAPLEBEND_OAKRIVER.json` red (FAILED) and
   `_ETL_m_DWH_MAPLEGROVE_PARTYPROFILE_INSERT.json` grey (blank status).
4. A recipe absent from the selected date's rows renders no-data; empty-workflow recipes
   group under `UNGROUPED` (unit+RTL pinned).
5. GCP links fill the served URL templates with `projectId`/`region`
   (`'mock-project'`/`'europe-southwest1'` fallbacks proven by test).
6. Replay remains a client-side mock toast, labeled in code + ledger.
7. `pnpm test` + `npx tsc --noEmit` + `make validate-loop` green; `git diff --stat` proves
   tabs 1–3, shared components, `queries.ts`, `types.ts`, `backend/` untouched.
8. `mockData.ts`: `DAG_CLUSTERS`/`DAG_RUNS` exports deleted (grep-verified no importers);
   `OPERATIONAL_CARDS` retained (tab3 on main still imports it, `ETLOperational.tsx:3` —
   Stream B retires its own); header ledger updated.
9. Docs: one line in `docs/architecture.md` + `frontend/AGENTS.md` ledger.

## 8. Dependencies & parallelism

- Fork point: current `main` (`85963a9`, `.worktrees/` already git-ignored). Worktree
  `.worktrees/etl360-dag`, branch `feat/etl360-dag`.
- Zero backend edits; zero edits to `scripts/validate_loop.sh`, root `CLAUDE.md`,
  `README.md` (root CLAUDE.md is owned by a later distribution stream).
- No shared files with Streams A (modifier), B (operational-casuistics), D (distribution)
  beyond `frontend/AGENTS.md` + `docs/architecture.md` (both append-only ledger edits),
  with ONE acknowledged exception: `frontend/src/mockData.ts` — this stream edits the
  header comment and deletes the tab4-only export blocks (lines 293-347); Stream B deletes
  `OPERATIONAL_CARDS` separately. Disjoint regions, trivial merge.
- `useOperationalSnapshots` lives in NEW `dagQueries.ts`, not `queries.ts`, precisely so
  Stream B's `useOperationalSummary` addition cannot conflict.
- If Stream B lands first, this tab renders CAS workflows automatically; acceptance asserts
  against main-at-merge-time with ≥ floors — no re-plan needed either way.
