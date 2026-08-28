# ETL Operational at Scale — Cluster-Scoped Loading, Density, Unified Run History — Design (sub-project 10)

**Date:** 2026-08-27 · **Branch:** `feat/etl360-operational-scale` · **Status:** approved by user (session 2026-08-27)

## 1. Goal & context

Tab 3 (ETL Operational) was built and validated against the committed mock: 30 recipes, 14 dates,
417 b15 rows. Run against a real IPC export it loads, in one go, **~7 000 recipes, ~5 000 tables
and thousands of b15 rows per day** — and becomes unusable. The user's report names the symptom
("we need to load progressively what we need to be observed rather than ALL") and, separately,
four defects in the operational cards.

The scale problem has three independent causes, all confirmed in the code:

1. **`GET /api/relationships` has no scope parameter.** `RelationshipService.graph()`
   (`backend/.../service/RelationshipService.java`) builds and returns the *entire* graph from
   every `LayerToLayerService` entry on every call. There is no way to ask for less.
2. **`GET /api/operational/summary` is uncached and re-walks everything.**
   `OperationalService.summary()` calls `dates()` then `snapshot(date)` for *every* date, and
   `snapshot()` re-parses the CSV from disk each time (`parseCsv`, no cache). Every page load
   re-reads the full b15 history. `DomService` and `SemanticModelService` both have mtime caches;
   `OperationalService` has none.
3. **Tab 4 fetches every date in parallel.** `useOperationalSnapshots(dates)`
   (`frontend/src/api/dagQueries.ts`) issues one `/operational/{date}` request per available date
   and holds every row of every day in memory, purely to draw a run-history strip.

The card defects share one root cause with each other:

4. **`app_id` and `job_id` are the same value, and one of the two links is malformed.**
   `dagAdapter.ts:146` sets `jobId: sel?.jobId, appId: sel?.jobId` — literally the same string
   (b15's `job_id` *is* the YARN application id, as its own comment says). `OperationalCard.tsx:37-38`
   then declares its own `GCP_LOGGING_BASE`/`GCP_JOBS_BASE` constants instead of using the served
   `AppConfigDto` URL templates, and builds the `app_id` href as
   `…/logs/query?resource.type=…&resource.labels.job_id=…` (`:200`) — a *query-string* shape with
   no `query=` expression and no `cursorTimestamp`. The Cloud Logging console answers that with
   "Failed to load default log scope. Querying project logs." Meanwhile the side panel's "Cloud
   Logging" row (`ETLOperational.tsx:368`) uses the configured `loggingUrl` template and works.
   So the app has two buttons carrying one value, one of which is built by hand and wrong.
5. **Card history is capped at 5 and is not selectable.** `OperationalCard` renders
   `History (last {card.history.length})` over a `StatusType[]` (`types.ts:122`) that carries no
   date, no job id and no timestamp — so a run cannot be picked, and no link can be scoped to a
   chosen execution.
6. **Stat labels fail contrast.** `avg`/`p50`/`p95`/`p99`/`avg rows` render at `#4a5570` on
   `--surface-2` (`#1a1f30`) = **2.2:1**, well under AA. `--text-muted` (`#7b88aa`) on the same
   background measures **4.6:1**.

This sub-project fixes all six. It is the first of two: the landing page (Feature 1) is a separate
spec that will read the cheap aggregates this one introduces.

## 2. Non-goals

- **No new frontend runtime dependency.** `frontend/package.json` dependencies stay exactly
  `@tanstack/react-query`, `react`, `react-dom`. The cluster list is windowed by hand over a fixed
  row height; there is no virtualization, calendar, or graph library.
- **No streaming/SSE progress.** The backend cannot report "day 14 of 31" without a streaming
  endpoint. The loading panel reports *stages and resolved totals*, never a fabricated percentage.
  (Corrects the "14/31 days" sketch from the brainstorm session — that number is not obtainable.)
- **No changes to parser behaviour.** No file under `parser/src/main/scala` is modified.
- **No changes to Tabs 1 or 2**, beyond Tab 2's shared `OperationalCard`/link consumers and the
  tab-mounting change in `App.tsx`. `EtlCanvas.tsx` and `NodeBox.tsx` stay untouched.
- **No write path.** Every endpoint added here is read-only.
- **No "which cluster runs recipe X?" global search.** The pane searches cluster names; recipe
  selection happens inside an expanded cluster. A global reverse lookup is deferred.
- **No replacement of the `workflow` grouping in Tab 4.** `cluster_name` (b15) and `workflow`
  (L2L column 4) are different facts from different sources. Tab 4 keeps grouping by `workflow`;
  Tab 3 gains grouping by `cluster_name`. They are not merged or inferred from one another.

## 3. Parts & sequencing

One spec, three internally-ordered parts.

| Part | Contents | Depends on |
|---|---|---|
| **1 — Backend** | `B15Reader` cache, `ClusterIndexService`, three new endpoints, `?clusters=` on `/api/relationships` | — |
| **2 — Run history & links** | `gcpLinks.ts`, `loggingUrl` template + `cursorTimestamp`, `RunPicker`, contrast fix, `app_id` removal | Part 1 (`/operational/runs`) |
| **3 — Tab 3 UI** | cluster pane, selection strip, density, calendar, wheel modifiers, staged loading, view-state cache | Parts 1 and 2 |

Mock-data work (§8) lands with Part 1 — the committed mock cannot exercise a multi-recipe cluster
until it does, so Part 1's tests need it.

## 4. Ground truth

Measured in this repo on 2026-08-27, not assumed.

| Fact | Value | Source |
|---|---|---|
| b15 CSV columns | `cluster_name,recipe_filename,job_id,app_start_iso,avg_job_duration_in_mins_sec,status,message` | `B15_HEADER`, `scripts/mock_etl_data.mts:44` |
| b15 location | `<composer>/dwh/config/cluster_tuning/inputs/<YYYY_MM_DD>/b15_application_end_with_recipe_null_status.csv` | `OperationalService.inputsDir()` |
| Committed mock dates | 14 (`2026_07_16` … `2026_07_29`) | directory listing |
| Committed mock b15 rows | 417 | `cat */b15*.csv \| grep -v ^cluster_name \| wc -l` |
| Committed mock distinct `cluster_name` | 30 | `cut -d, -f1 \| sort -u \| wc -l` |
| Committed mock distinct `recipe_filename` | 30 | `cut -d, -f2 \| sort -u \| wc -l` |
| Committed mock distinct (cluster, recipe) pairs | **30** | `cut -d, -f1,2 \| sort -u \| wc -l` |
| ⇒ committed mock cluster cardinality | **1 cluster : 1 recipe** — degenerate, see §8 | derived from the three rows above |
| `cluster_name` stability across dates | stable; the same name recurs on every date it ran | `uniq -c` per cluster: 12–14 dates each |
| `cluster_name` in the graph | **absent** — `RelationshipService` reads only L2L entries | `RelationshipService.graph()` |
| `workflow` source | L2L control-table column 4, e.g. `wf_Carga_DWH` | `mock/DWH_CONTROL/LAYER_TO_LAYER/DWH/statements.sql` |
| Status literals | `SUCCESS` → OK, `FAILED` → KO, other → neither | `OperationalService.summary()` |
| Duration cell format | `<m>m <ss>sec` | `OperationalService.DURATION`, `parseDurationSec` |
| Backend caches today | `DomService`, `SemanticModelService` only | `grep ConcurrentHashMap backend/src/main/java` |
| Contrast, `#4a5570` on `--surface-2` | **2.2:1** | WCAG relative-luminance computation |
| Contrast, `--text-muted` on `--surface-2` | **4.6:1** | same |
| Tab 3 wheel handler today | `e.stopPropagation()` only — no zoom, no pan | `ETLOperational.tsx:128` |
| Tab 3 density today | implicit `compact = zoom < 0.65` | `ETLOperational.tsx:116` |
| Existing contract floors | 81 XMLs · 86 recipes · 33 L2L entries | `CLAUDE.md`, `CorpusContractTest`, `LayerToLayerContractTest` |

**The user's real-data shape (stated in session, not inspected):** `cluster_name` is stable across
days for the same cluster, so the pane lists one row per cluster and a real cluster groups many
recipes. The committed mock does not reproduce that shape today; §8 fixes it.

## 5. Part 1 — Backend

### 5.1 `B15Reader` — parse each CSV once

Extract the CSV parse out of `OperationalService` into a dedicated component that caches per file
on `(mtime, size)`, following the exact idiom `DomService` and `SemanticModelService` already use:

```java
@Component
class B15Reader {
    private record Cached(FileTime mtime, long size, List<B15RowDto> rows) {}
    private final Map<Path, Cached> cache = new ConcurrentHashMap<>();
    List<B15RowDto> rows(Path csv);   // re-parses only when mtime or size changed
}
```

`OperationalService.snapshot()` and `ClusterIndexService` both read through it, so a given date's
CSV is parsed at most once per modification. This alone removes cause (2): `summary()` stops
re-reading the full history on every request.

Column parsing (including the `cell()` null→`""` normalization) moves with it unchanged.

### 5.2 `ClusterIndexService` — the b15 index

Built lazily on first request over **all available dates** (user decision), cached whole, and
invalidated by a directory fingerprint rather than a TTL:

> **Fingerprint** = the sorted list of `<dateDir>/<mtime>/<size>` for every b15 CSV under
> `inputs/`. Computing it is a directory walk plus one `stat` per file — cheap. The expensive
> parse re-runs only when the fingerprint changes, so a new dated export appears without a
> restart, matching the "no TTL logic, no restart needed" rule in `docs/architecture.md`.

Model:

```java
record ClusterIndex(
    List<String> dates,                        // ascending ISO, the global axis
    Map<String, ClusterEntry> byCluster,       // clusterName -> entry, name-ascending
    Map<String, List<RunEntry>> runsByRecipe,  // recipeFilename -> runs, date-ascending
    Totals totals) {}

record ClusterEntry(String name, List<Integer> dateIdx, List<String> recipes,
                    int rows, int ok, int ko, String lastDate, String lastStatus) {}

record RunEntry(String date, String clusterName, String recipeFilename, String jobId,
                String appStartIso, Double durationMin, String status, String message) {}
```

`ClusterEntry.recipes` is the in-memory recipe list; the `/clusters` DTO projects it to a bare
`recipeCount` and the full list is served only by `/clusters/{name}` (§5.4). `dateIdx` indexes the
global `dates` array. At the user's scale (~1 300 clusters × ~90 dates) that
is the difference between a compact integer payload and ~115 000 duplicated ISO strings.

Status counting reuses `OperationalService`'s literals exactly (`SUCCESS`/`FAILED`); anything else
increments `rows` only, never `ok` or `ko`. Duration parsing reuses
`OperationalService.parseDurationMin`, which already returns `null` for unparseable cells rather
than throwing.

### 5.3 `GET /api/operational/clusters`

The pane's only startup fetch.

```json
{
  "mode": "real|mock|absent",
  "dates": ["2026-07-16", "..."],
  "totals": { "clusters": 21, "recipes": 30, "dates": 14, "rows": 417 },
  "clusters": [
    { "name": "…", "recipeCount": 5, "dateIdx": [0,1,2],
      "rows": 70, "ok": 68, "ko": 2, "lastDate": "2026-07-29", "lastStatus": "SUCCESS" }
  ]
}
```

Sorted by `name` ascending, deterministically, as `summary()` already sorts its recipes.
`totals` deliberately carries **no table count** — b15 knows nothing about tables; table counts
come from the graph, and inventing one here would be a fabricated number.
`mode` mirrors the existing `OperationalDatesDto.mode` (`real|mock|absent`).

### 5.4 `GET /api/operational/clusters/{name}`

Fetched lazily when a pane row is expanded.

```json
{ "name": "…", "dates": ["…"],
  "recipes": [ { "recipeFilename": "_ETL_m_….json", "layer": "DWH", "dateIdx": [0,1],
                 "rows": 14, "ok": 13, "ko": 1, "lastDate": "…", "lastStatus": "FAILED" } ] }
```

`layer` resolves through `LayerToLayerService` with the same first-match-wins rule and the same
`"UNKNOWN"` fallback `OperationalService.summary()` uses — a recipe present in b15 but absent from
L2L is reported as `UNKNOWN`, not dropped. Unknown cluster → `NotFoundException` (404), matching
the existing error idiom.

### 5.5 `GET /api/operational/runs?recipe=A&recipe=B&limit=10`

The single source of run history for **both** tabs. Replaces Tab 4's fetch-every-date pattern.

- `recipe` — repeatable, required, **bounded at 200 per request** (400 beyond, with a message
  naming the limit). An unbounded fan-out here would just relocate the scale problem.
- `limit` — default **10** (the user's ask), max 50.
- Response: `{ "limit": 10, "byRecipe": { "A": [ run, … ] } }`, **newest-first**, each run being a
  `RunEntry` (§5.2). A requested recipe with no runs maps to `[]` rather than being omitted, so the
  client's shape is stable.

**Client rule for the bound.** A cluster or DAG may hold more than 200 recipes. The frontend hook
chunks its recipe list into ≤200-recipe requests and merges the responses — the bound is never
allowed to surface as a 400 to the user. The chunking lives in one hook (`useRuns`) so neither tab
reimplements it, and is unit-tested at the boundary (200, 201).

### 5.6 `GET /api/relationships?clusters=a,b`

Optional scoping on the existing endpoint rather than a new one, so Tab 4, `CorpusContractTest`
and `scripts/relationships_sweep.mts` keep calling exactly what they call today.

- **Absent** → today's full graph, byte-identical.
- **Present** (repeatable or comma-separated) → scoped build:
  1. recipe set = union of the selected clusters' `recipes`;
  2. filter L2L entries to that recipe set and build nodes/edges through the *existing*
     `RelationshipService` construction — no second graph builder;
  3. **1-hop expansion** (user decision): for every table in the subset, include L2L entries
     outside the subset that read or write it; their **recipe nodes** are added and flagged
     `neighbor: true`, along with the edges joining them to tables the core subgraph already holds.
     Neighbours are **not** expanded further.

     > **Corrected during implementation (Task 6).** This clause originally also added "the tables
     > directly attached to" a neighbour recipe. That is two hops, not one — core table → neighbour
     > recipe → the neighbour's *other* tables — and it contradicted this spec's own
     > `neighboursAreNotExpandedASecondTime` test, which requires every edge to have at least one
     > core endpoint. The implementer found the contradiction because the test failed against the
     > code this spec prescribed. The one-hop reading also matches the option actually chosen in
     > session ("the directly-adjacent nodes from other clusters").
     >
     > **Consequence for consumers:** every node carrying `neighbor: true` is a **recipe**. No table
     > is ever flagged. `NodeDto.neighbor` remains declared on table nodes so that widening the rule
     > later needs no wire change, but today it is never populated on one.

`NodeDto` gains two fields, both `@JsonInclude(NON_NULL)` so the unscoped response is unchanged:

| Field | Type | Meaning |
|---|---|---|
| `clusterNames` | `List<String>` | clusters this recipe ran in; null for table nodes and when unscoped |
| `neighbor` | `Boolean` | true = 1-hop context outside the selection; null when unscoped |

`MetaDto` gains `scopedClusters: List<String>` and `neighborCount: int` (both null/absent when
unscoped), so the UI can state "312 nodes · 41 from neighbouring clusters" truthfully.

A `clusters` value matching no known cluster is **not** a 404 — it yields an empty scoped graph
with `scopedClusters` echoing the request, so a stale UI selection degrades to "nothing here"
rather than an error page.

## 6. Part 2 — Unified run history & GCP deep links

### 6.1 What gets deleted

- `OperationalCard.tsx:37-38` — the two hardcoded `GCP_*_BASE` constants.
- `OperationalCard.tsx:198-214` — the entire `app_id` anchor.
- `OperationalCard`'s `appId` prop consumption and `types.ts:131`'s `appId?: string`.
- `dagAdapter.ts:146`'s `appId: sel?.jobId || undefined`.
- `dagQueries.ts`'s `useOperationalSnapshots` fan-out (replaced by `/operational/runs`).

After this change **nothing in the app constructs a Google Cloud console URL by hand.**

### 6.2 `frontend/src/api/gcpLinks.ts`

One module, three builders, all reading the served `AppConfigDto` templates with the existing
`DEFAULT_*` constants as fallbacks:

```ts
buildDataprocJobUrl(cfg, { jobId })
buildDataprocClusterUrl(cfg, { clusterName })
buildLoggingUrl(cfg, { jobId, cursorTimestamp, duration })
```

`fillGcpUrl` moves here from `dagAdapter.ts` and gains two behaviours it needs to produce a URL
the console actually accepts:

1. **Matrix-safe encoding.** Google's console reads `;key=value` *path matrix* segments, and the
   working link shape carries an unencoded RFC-3339 timestamp (`;cursorTimestamp=…T…:…:…Z;`).
   Blanket `encodeURIComponent` would emit `%3A` for every colon. So placeholders declared
   matrix-safe (`cursorTimestamp`, `duration`) are encoded as
   `encodeURIComponent(v).replace(/%3A/g, ':')`. Every other placeholder keeps today's full
   encoding.
2. **Empty-segment collapse.** After substitution, any `;key=` segment left with an empty value is
   removed entirely — never `;cursorTimestamp=;`. With no resolvable run the link degrades to the
   job-id-only query that already works today.

Both behaviours are unit-tested directly; neither is left to the acceptance pass to discover.

### 6.3 Configured logging template

`backend/src/main/resources/application.yml`:

```yaml
    logging-url: "https://console.cloud.google.com/logs/query;query=resource.labels.job_id%3D%22{jobId}%22;cursorTimestamp={cursorTimestamp};duration={duration}?project={project}"
    logging-duration: ${ETL360_GCP_LOGGING_DURATION:P31D}
```

`Etl360Properties.Gcp` gains `loggingDuration`; `AppConfigDto` carries it to the frontend.
`cursorTimestamp` resolves from the **selected run's `app_start_iso`** — the b15 column that
already exists. `config.json` gains an optional `gcpLoggingDuration` key mapped by
`scripts/dev.sh` alongside the existing `ETL360_*` mappings.

### 6.4 `frontend/src/components/shared/RunPicker.tsx`

One component, used by Tab 3's card, Tab 3's detail panel, and Tab 4's Operational State panel —
the user's explicit "do not duplicate the implementation" requirement.

- Renders up to `limit` (default **10**) bars, oldest → newest left to right, matching the current
  `HistoryBar` order.
- **Every bar stays visible.** The selected run renders at full opacity with a 1px accent ring;
  the others render dimmed (opacity ~0.55) — the user's "the others must be also shown but not
  highlighted".
- Beside the bars, a field for the selected run: `2026-07-29 · 04:52 UTC · 44m 37s · OK`. Clicking
  it opens a dropdown listing all runs in the same format.
- Default selection: the run on the tab's currently selected date if one exists, else the newest.
- Emits the selected `RunEntry` upward. The parent's Logging and job_id links are built from it,
  so **the picked execution is the one the links open** — in both tabs.

`OperationalCard` gains `runs?: RunEntry[]` and `selectedRunDate`/`onSelectRun`, and renders
`RunPicker` in place of `HistoryBar` when runs are supplied. With no runs supplied it falls back to
today's read-only `history: StatusType[]` rendering, so no caller breaks mid-migration.

### 6.5 Contrast

Swap `#4a5570` → `var(--text-muted)` for text on `--surface-2`: the stats-grid labels
(`OperationalCard.tsx:163,170`), the `History (last N)` label (`:142`) and the `card.kind` label
(`:121`). 2.2:1 → 4.6:1. Existing token, existing palette, no new colour — inside the Figma visual
contract (ADR-0005), recorded in §12.

## 7. Part 3 — Tab 3 UI

### 7.1 `ClusterPane`

Left rail, collapsible, resizable, following Tab 2's established idiom (`useResizableLayout`,
`localStorage` persistence, 36px collapsed strip).

- Default width 260, range 200–420, persisted as `etl360.tab3.clusterPaneWidth`.
- **Hand-rolled windowing**: fixed 30px rows, render `ceil(viewportH / 30) + 10` around
  `scrollTop`. No dependency (§2).
- Row: `[✓] <name>  ×<recipeCount>  ●<ok> ●<ko>`.
- Search filters cluster names by case-insensitive substring.
- The chevron expands a row → lazy `GET /operational/clusters/{name}` → nested **recipe**
  checkboxes and **date** checkboxes, both of which further filter the canvas.

### 7.2 Selection strip

Above the canvas, always visible, so the current scope is never a mystery: compact chips
`wf_A ×62 ✕` per selected cluster plus an aggregate line
`3 clusters · 187 recipes · 14 dates · 1 842 OK · 6 KO`. This is the user's "show the selected
cluster_name in an elegant, concise, compact way".

### 7.3 Density

An explicit three-level control beside the zoom buttons — Detailed / Compact / Minimal — with
auto-refit (user decision).

| Level | Card | Layout pitch |
|---|---|---|
| Detailed | today's full card | 320 × 190 |
| Compact | header only: name, layer, kind, status chip | 230 × 80 |
| Minimal | one line: status dot · layer · name · status | 200 × 36 |

Changing level re-lays out at the new pitch, then fits the bounding box to the viewport (zoom
clamped to `[0.3, 1]`) — so collapsing genuinely fits more flow on screen rather than only
shrinking boxes.

`OperationalCard`'s boolean `compact` prop becomes `density: 'detailed' | 'compact' | 'minimal'`;
its two existing call sites (`ETLOperational.tsx:205`, `:479`) migrate to `'compact'`. **Tab 3's implicit `compact = zoom < 0.65`
(`ETLOperational.tsx:116`) is removed** — an implicit density that fights an explicit control is a
bug waiting to happen. Tab 1's `EtlCanvas` zoom-collapse is untouched (§2).

### 7.4 Calendar

A popover anchored to the existing `TimePicker`'s date field — additive, `TimePicker` itself is not
restyled.

- Month grid with month arrows and a "today" jump.
- Day states: **no data** (dim), **has data** (accent tint), **has data in the selected clusters**
  (stronger accent), **selected** (ring). A legend row names all four.
- Clicking a no-data day snaps to the nearest available date, reusing the existing
  `nearestAvailableDate` client mirror of the backend rule.

### 7.5 Canvas interactions

Replacing `ETLOperational.tsx:128`'s `stopPropagation`-only handler:

| Gesture | Effect |
|---|---|
| `⌘`/`Ctrl` + wheel | zoom **about the cursor** — `clamp(z · e^(−Δy·0.002), 0.2, 2)`, pan corrected so the point under the pointer stays fixed |
| `Shift` + wheel | pan horizontally |
| wheel | pan vertically |

`preventDefault()` fires only on gestures we act on. Trackpad pinch arrives as ctrl+wheel, so pinch
zoom works for free.

### 7.6 Staged loading

`OperationalProgress` replaces `LoadingState label="Loading relationships…"` (`:323`), driven by
real query state and resolved totals — **stage names and counts, no fabricated percentage** (§2):

```
Indexing b15 history…                     → 14 days · 21 clusters · 417 rows
Loading cluster wf_CAS_STG_LOAD…          → 5 recipes · 14 dates
Building graph for 2 clusters…            → 312 nodes · 41 from neighbours
```

### 7.7 View state across tab switches

Two mechanisms, because they solve different halves:

1. **`frontend/src/state/operationalView.ts`** — a module-level store read via
   `useSyncExternalStore` (React 19 built-in, no dependency) holding selected clusters, expanded
   cluster, selected recipes/dates, density, zoom, pan, selected node and selected date. `density`,
   `paneWidth` and `paneCollapsed` persist to `localStorage`; the rest is session-lived.
2. **`App.tsx` keeps visited tabs mounted.** A `Set<TabId>` of visited tabs; once visited, a tab
   stays in the tree under `display: none`. This preserves DOM-level state (scroll offsets) that no
   store can restore.

React Query already caches the *data*; this caches the *view*. Together they mean switching away
from Tab 3 and back recomputes nothing.

All four tabs get the same treatment rather than special-casing 3 and 4 — a uniform rule is easier
to reason about, and the mount cost is paid once per tab per session.

## 8. Mock data: the committed mock has no multi-recipe cluster

Measured (§4): the committed mock is **30 clusters, 30 recipes, 30 distinct (cluster, recipe)
pairs** — exactly one recipe per cluster. Every feature in this spec that groups recipes under a
cluster is therefore untestable against it, and `make validate-loop` would assert nothing about the
case that matters.

**Fix, via the sanctioned path only.** `scripts/mock_etl_data.manifest.json` carries a per-mapping
`b15.cluster` string (`scripts/mock_etl_data.mts:27`). Edit the 12 CAS mappings so they share
**three** cluster names (5 / 4 / 3 recipes), then regenerate with
`node --experimental-strip-types scripts/mock_etl_data.mts --emit b15`, which strips and re-appends
only the marker-delimited CAS block and is byte-idempotent.

- The 18 SYN clusters are **not** touched. `scripts/gen_b15_history.py` stays frozen
  (`CLAUDE.md` — re-running it would silently rewrite existing rows).
- No b15 CSV, L2L row or XML is hand-edited.

**New floors:** 21 clusters · 30 recipes · 14 dates · 417 rows, with at least one cluster of ≥4
recipes. `scripts/mock_etl_data.mts --check` and `scripts/relationships_sweep.mts` must still pass
unchanged — cluster names appear in neither the graph nor the CAS casuistics assertions.

## 9. API changes

| Method | Path | Change |
|---|---|---|
| GET | `/api/operational/clusters` | **new** — cluster index: totals, global dates, per-cluster counts |
| GET | `/api/operational/clusters/{name}` | **new** — one cluster's recipes with per-recipe dates/ok/ko |
| GET | `/api/operational/runs?recipe=…&limit=10` | **new** — run history by recipe, newest-first, ≤200 recipes |
| GET | `/api/relationships?clusters=a,b` | **extended** — optional scoping + 1-hop neighbours; unscoped response unchanged |
| GET | `/api/config` | **extended** — `loggingDuration` added to `AppConfigDto` |
| — | `NodeDto` | **extended** — `clusterNames`, `neighbor` (both `NON_NULL`) |
| — | `MetaDto` | **extended** — `scopedClusters`, `neighborCount` (both `NON_NULL`) |

`frontend/src/api/types.gen.ts` is regenerated via `pnpm generate:api` against the running backend,
never hand-edited.

## 10. Gates & testing

**Backend (JUnit)**
- `B15ReaderTest` — parses once, re-parses on mtime/size change, normalizes missing cells.
- `ClusterIndexServiceTest` — index correctness against the committed mock (21/30/14/417); a
  multi-recipe cluster resolves all its recipes; fingerprint invalidation when a date directory
  appears; `UNKNOWN` layer for a b15 recipe absent from L2L.
- `ClusterEndpointsContractTest` — the three new endpoints: shapes, sort order, 404 on unknown
  cluster, `limit` default/max, the 200-recipe bound returning 400.
- `ScopedRelationshipsContractTest` — `?clusters=` yields a strict subset; 1-hop neighbours present
  and flagged; neighbours not expanded twice; **absent param yields a response identical to today's**;
  unknown cluster name yields an empty scoped graph, not a 404.

**Frontend (vitest)**
- `gcpLinks.test.ts` — matrix-safe encoding keeps colons in `cursorTimestamp`; empty-segment
  collapse removes `;cursorTimestamp=` when no run resolves; the served template beats the fallback.
- `RunPicker.test.tsx` — 10 bars; unselected runs dimmed **not hidden**; clicking a bar changes the
  emitted run and therefore the built URL; default selection follows the tab's date.
- `ClusterPane.test.tsx` — search, multi-select, lazy expand, windowing renders a bounded row count
  over a large list.
- `density.test.tsx` — three levels relayout at their pitches and refit; no implicit zoom-collapse.
- `Calendar.test.tsx` — four day states; empty-day click snaps to nearest available.
- `canvasWheel.test.tsx` — the three wheel gestures; cursor-anchored zoom.
- `operationalView.test.ts` — state survives an unmount/remount cycle; persisted keys only.

**Sweeps**
- `make validate-loop` gains curls over the three new endpoints, asserting the committed-mock
  floors **21 clusters · 30 recipes · 14 dates · 417 rows** and that at least one cluster has ≥4
  recipes — a real floor alongside the existing 81/86/33.
- `scripts/mock_etl_data.mts --check` and `scripts/relationships_sweep.mts` must pass unchanged.

**Browser acceptance (user decision)**
A Chrome pass I drive at the end of each part: load the app, exercise the cluster pane, density
toggle, calendar, wheel gestures and the Logging link; read the console for errors; commit
screenshots to `docs/img/` — the path `docs/visual-guide.md`'s capture checklist already links to,
so the same pass fills its seven pending images. This also closes the outstanding Tab 2 visual
sign-off recorded in `CLAUDE.md`. Deterministic assertions stay in vitest/JUnit — the browser pass is evidence, not the
gate of record.

## 11. Acceptance criteria

1. Opening Tab 3 with nothing selected fetches **only** `/api/operational/clusters` — no graph
   request, no per-date fan-out.
2. Selecting a cluster loads its scoped graph plus dimmed 1-hop neighbours; the node count and
   neighbour count are stated in the UI.
3. Deselecting every cluster returns to the empty-canvas prompt without refetching the index.
4. The pane lists clusters with recipe counts and OK/KO; expanding one lists its recipes and dates,
   each independently selectable.
5. The selection strip always names the selected clusters and their aggregate counts.
6. Density cycles Detailed → Compact → Minimal, re-laying out and refitting each time.
7. The calendar distinguishes has-data / no-data / in-selection / selected days; an empty day snaps
   to the nearest available date.
8. `⌘`/`Ctrl`+wheel zooms about the cursor; `Shift`+wheel pans horizontally; wheel pans vertically.
9. Switching to another tab and back restores the previous view with no visible recomputation and
   no refetch.
10. Cards show up to **10** runs; every run is visible; the selected one is highlighted.
11. Clicking **Logging** opens the console filtered to the *selected* run's `job_id` **with** a
    `cursorTimestamp` derived from that run's `app_start_iso` — verified live in the browser pass.
12. **No `app_id` button exists anywhere in the app**, and no source file outside `gcpLinks.ts`
    builds a console URL.
13. Tab 4's Operational State uses the same `RunPicker` and the same link builders, and no longer
    fetches every date.
14. Stat labels on cards measure ≥4.5:1 against their background.
15. `mvn -q -am -pl backend test`, `pnpm test`, `make check` and `make validate-loop` all pass, with
    the new cluster floors asserted.

## Acceptance walk — results (Task 19, 2026-08-28)

Two verdicts, used strictly: **PASS (automated)** (proven by a named test or gate; run and quoted
below — not a prediction), **PENDING (browser)** (the criterion's substance is only observable by
driving the running app, which is explicitly out of this task's scope — the orchestrator runs that
pass separately with the user). Nothing here is marked PASS on the strength of a unit test if the
criterion is actually a claim about what a human sees; those cases are marked PASS (automated) for
the mechanism only, with the unobserved visual remainder named explicitly.

| # | Verdict | Evidence — and what was *not* proven |
|---|---|---|
| 1 | **PASS (automated)** | `ETLOperational.test.tsx` "fetches only the cluster index when nothing is selected" instruments every request path over the whole render: `/api/operational/clusters` present, `/api/relationships` **and** `/api/operational/summary` absent, and `/api/operational/clusters` is the *only* `/api/operational/*` call — the test's own comment names this as criterion 1's proof. |
| 2 | **PASS (automated)** | `ETLOperational.test.tsx` "loads the scoped graph once a cluster is selected", "dims nodes that came from a neighbouring cluster", "offers a Layer chip for a neighbour whose layer meta.layers omits"; `SelectionStrip.test.tsx` "states how many nodes came from neighbouring clusters". Backend: `ScopedRelationshipsContractTest.aScopedRequestIsAStrictSubsetOfTheFullGraph`, `.neighboursAreIncludedAndFlaggedAndCountedInMeta`, `.neighboursAreNotExpandedASecondTime`. |
| 3 | **PASS (automated)** | `ETLOperational.test.tsx` "returns to the prompt when the last cluster is deselected, without refetching the index" (asserts no repeat call to `/api/operational/clusters`). |
| 4 | **PASS (automated)** | Structure: `ClusterPane.test.tsx` "shows the totals so the scale is visible before anything is selected", "expanding a cluster lazily loads its recipes and dates", "fetches no detail until a row is expanded", "toggling a date checkbox updates selectedDates, and toggling it again clears the filter", "unchecking a recipe records it as deselected". Per-cluster ok/ko counts render at `ClusterPane.tsx:77-78`. Backend shape: `ClusterEndpointsContractTest.theDetailEndpointListsTheClustersRecipesWithTheirLayer`, `.recipesInOneClusterCanCarryDifferentLayers`. **Filtering EFFECT** (the substance of "both of which further filter the canvas", §7.1): `ETLOperational.test.tsx` "removes a card from the canvas when its recipe is unchecked in the pane" (the card's node disappears; the tables it joined stay), "restricts the status resolution to the checked dates" (the same card flips OK→KO when only the earlier date is checked), "leaves every card status unresolved-but-honest when no run falls on a checked date" (PENDING, never a carried-forward status), and "names the active pane filters on the toolbar and clears them on click"; the narrowing itself is unit-tested in `viewScope.test.ts` (10 tests). **Corrected 2026-08-28:** this row previously cited only the `ClusterPane.test.tsx` cases, which assert the store WRITE, not the filtering effect — and at that time there was no effect: `deselectedRecipes`/`selectedDates` were read nowhere but their own `checked` attribute. |
| 5 | **PASS (automated)** | `SelectionStrip.test.tsx` "names every selected cluster and the aggregate counts", "a chip removes its cluster from the selection", "clears the whole selection". |
| 6 | **PASS (automated)**, mechanism only | `ETLOperational.test.tsx` "cycles density and re-lays out", "has no implicit zoom-driven density any more"; `OperationalCard.test.tsx`'s `detailed`/`compact`/`minimal` renders plus "defaults to detailed"; `operationalView.test.ts` persists the `density` key. **Not observed:** the actual re-layout/refit geometry on screen — jsdom computes no layout, so this proves the state transition and the relayout call fire, not that the canvas visibly refits. |
| 7 | **PASS (automated)**, mechanism only | `AvailabilityCalendar.test.tsx`'s `dayState` unit tests ("distinguishes all four states", "selected wins over in-selection") and `monthGrid` tests, plus component tests "labels each day with its availability state", "shows a legend for all four states", "snaps an empty day to the nearest available date". **Not observed:** the popover's rendered appearance — colour/position of the four day states in a browser. |
| 8 | **PASS (automated)**, geometry math only | `canvasGestures.test.ts`'s `applyWheel` suite: cmd+wheel and ctrl+wheel both zoom, "keeps the point under the cursor fixed while zooming", clamps to `[0.3, 2]`, shift+wheel pans horizontally leaving zoom/y alone, a plain wheel pans vertically, and `wheelActs` gates when `preventDefault` fires. `ETLOperational.tsx:159-182` wires this pure function to the canvas's real `onWheel` prop. **Not test-covered, surprising enough to flag:** no test dispatches an actual DOM `wheel` event at the mounted canvas and asserts the resulting pan/zoom state — the wiring is confirmed by reading the source, not by a test, and the rendered effect is unobserved. |
| 9 | **PASS (automated)** | `App.test.tsx` "App — visited tabs stay mounted (Task 12)": "keeps a visited tab mounted after switching away" (Tab 3's DOM survives a switch to Tab 4 under `display:none` rather than unmounting — which makes a refetch structurally impossible, not merely unobserved) and "does not mount a tab that was never visited"; `operationalView.test.ts` "survives an unmount and remount" covers the belt-and-suspenders case of an actual unmount. **Not observed:** "no visible recomputation" as a rendered claim — no test measures a render count, though the no-unmount mechanism makes the concern moot. |
| 10 | **PASS (automated)** | `RunPicker.test.tsx` "renders one bar per run, up to ten", "dims the unselected runs rather than hiding them" (dimmed, not hidden — satisfies "every run is visible"), "marks the selected bar with aria-pressed". |
| 11 | **PENDING (browser)** | Inherently unobservable outside a live Google Cloud console session. `gcpLinks.test.ts`'s `buildLoggingUrl` suite proves the URL is *built* correctly — job-id query, colon-preserving `cursorTimestamp`, `duration`, served-template-over-fallback — but confirming the console actually opens scoped to the selected run and does **not** show "Failed to load default log scope" requires driving Chrome. Explicitly out of this task's scope (see brief); the orchestrator runs that pass with the user. |
| 12 | **PASS (automated)** | `grep -rn "app_id\|appId" frontend/src --include=*.tsx --include=*.ts` (excluding tests) and the same over `backend/src/main/java/.../api/dto/` both return nothing; `OperationalCard.test.tsx` "has no app_id affordance at all". Every non-`gcpLinks.ts` file referencing a Google URL fragment (`OperationalCard.tsx`, `ETLDag.tsx`, `ETLOperational.tsx`) does so only by importing `buildLoggingUrl`/`buildDataprocJobUrl`/`buildDataprocClusterUrl`/`buildBigQueryUrl` — none contains a literal `console.cloud.google.com` or `logs/query` string of its own (grep-verified). |
| 13 | **PASS (automated)** | `frontend/src/components/tab4/ETLDag.tsx` imports `useRuns` from `../../api/clusterQueries` (the same hook Tab 3 uses) bounded by `RUNS_LIMIT`, renders the shared `OperationalCard` (which renders `RunPicker`) for its Operational State card, and imports `buildLoggingUrl`/`buildDataprocClusterUrl` from `gcpLinks.ts`. `ETLDag.test.tsx` "(g) the run-history strip renders only the fetched window (10), oldest-fetched first — not every available date" and "(d) the synthesized Operational State card renders the KO badge and the run picker" prove both halves directly. |
| 14 | **PASS (automated)**, computed not measured | Computed directly from `frontend/src/index.css`'s committed token values via the WCAG relative-luminance formula: `--text-muted` (`#7b88aa`) against `--surface` (`#131621`) is **5.1:1**, against `--surface-2` (`#1a1f30`) is **4.63:1** — both clear 4.5:1, versus the old hardcoded `#4a5570`'s 2.2–2.43:1 (independently recomputed for this walk, matching §12 item 6's figure). `OperationalCard.tsx:108,162,177,183,213,220` is the exhaustive set of stat-label `color` sites and every one now reads `var(--text-muted)`; `OperationalCard.test.tsx` "uses no hardcoded #4a5570 for label text" guards the regression. **Not observed:** actual on-screen legibility — the ratio is computed from token values, not measured off a rendered pixel. |
| 15 | **PASS (automated)** | `mvn -q -am -pl backend clean test`: **256 tests, 0 failures, 0 errors**; 42 surefire reports == 42 `*Test.java` files. `cd frontend && pnpm test`: **541 tests passed, 43 files**. `pnpm exec tsc --noEmit`: clean. `pnpm build`: succeeded. `make check`: exit 0 ("check done"; its `pnpm format --check` sub-step reports the pre-existing, non-fatal-by-design backlog per `README.md`). `make validate-loop`: **PASS**, reporting `b15 index: 21 clusters, 30 recipes, 14 dates, 417 rows; largest cluster 5 recipes` and `scoped graph: 18 nodes (5 neighbours) of 81`, plus the unchanged `viewer_sweep: 81/81`, `recipe_sweep: 86/86`, `mock_etl_data --check: clean`, `relationships_sweep: PASS`. |

**Tally: 14 PASS (automated) (1–10, 12–15) · 1 PENDING (browser) (11) · 0 FAIL.** Five of the
fourteen automated passes (6, 7, 8, 9, 14) carry a named unobserved remainder — four visual
(6, 7, 9, 14) and one a wiring path confirmed by source reading rather than a DOM-level test (8).
This is a larger set than the brief's own estimate ("the visual aspects of 6, 7 and 14"), because
inspection during this walk also surfaced 8's untested `onWheel` wiring and 9's "no visible
recomputation" phrasing as claims a unit test cannot settle either — recorded here rather than
rounded into a clean PASS. Criterion 11 is the sole PENDING; it requires a live Chrome session
against the committed mock tier and is explicitly reserved for the orchestrator's browser pass
(Steps 2–4 of the Task 19 plan entry, not run here).

**Baselines vs. this walk:** the plan's baselines at authorship were backend 212 tests / frontend
428 tests. This walk's clean run measured backend **256** tests (42 test classes) and frontend
**541** tests (43 files) — both grew across Tasks 1–18 as the cluster index, scoped relationships,
`gcpLinks`, `RunPicker` and the Tab 3 rebuild landed their own test suites; neither number was
rounded to the baseline or to a prediction.

## 12. Visual contract impact

Additive, under ADR-0005. New surfaces use existing tokens (`--surface`, `--surface-2`, `--border`,
`--text`, `--text-muted`, the four status colours) and the existing Inter / JetBrains Mono pairing.

Sanctioned departures, all recorded here for the visual sign-off pass:

1. **Left rail on Tab 3.** Tab 3 previously had no left rail (its 300px panel is the right-hand
   detail panel). The cluster pane adds one, mirroring Tab 2's rail geometry.
2. **Contrast token swap** — `#4a5570` → `--text-muted` for text on `--surface-2` (§6.5).
3. **Two new card densities** — Compact and Minimal are new card silhouettes; Detailed is unchanged.
4. **`app_id` button removed** from the card's link row; `job_id` keeps its position and a
   `Logging` button takes the vacated slot.
5. **Calendar popover** — a new overlay shape, built from existing tokens.
6. **`InfoTooltip`'s ⓘ icon contrast — app-wide, added during Task 10.** Its circle stroke and "i"
   glyph were hardcoded `#4a5570`: **2.4:1** on `--surface`, failing both the 4.5:1 text threshold
   and the 3:1 graphical-object threshold. Moved to `var(--text-muted)` (**5.1:1**). This component
   renders in **all four tabs**, so unlike departures 1-5 this one is visible outside Tab 3. It is a
   token swap for legibility, not a restyle, and it is the same class of fix as departure 2 — but it
   widens this sub-project's visual footprint and must be observed in the Task 19 browser pass across
   every tab, not only Tab 3.

The floating bottom-left `CorpusSummary` chip, the toolbar filter chips, the `DataRootsChip` and
the detail panel keep their current geometry.

## 13. ADRs

- **ADR-0014 — b15 cluster index and cluster-scoped operational loading.** Why the index is
  fingerprint-invalidated rather than TTL'd; why scoping extends `/api/relationships` instead of
  adding an endpoint; why 1-hop neighbours are included and flagged rather than filtered out.
- **ADR-0015 — one GCP deep-link builder, one run selection.** Why `app_id` was removed rather than
  repaired; why link templates are served, never hardcoded; the matrix-safe encoding and
  empty-segment collapse rules and what breaks without them.

## 14. Documentation impact

`CLAUDE.md` requires `HOW_TO_RUN_ON_YOUR_DATA.md` to be updated in the *same commit* as any change
to the files its derivation table names. This sub-project changes three of them
(`OperationalService`, `Etl360Properties`, `scripts/dev.sh`), so the following are part of the work,
not follow-ups:

| Doc | Change | Triggered by |
|---|---|---|
| `HOW_TO_RUN_ON_YOUR_DATA.md` §2 | new `gcpLoggingDuration` config field | `Etl360Properties`, `scripts/dev.sh` |
| `HOW_TO_RUN_ON_YOUR_DATA.md` §3.2 | b15 is now indexed by cluster, not only read per date | `OperationalService`, `ClusterIndexService` |
| `HOW_TO_RUN_ON_YOUR_DATA.md` §5 | verification step covers `/api/operational/clusters` | `ConfigController`, new endpoints |
| `docs/architecture.md` | endpoint table gains the three new endpoints and the `?clusters=` parameter | §9 |
| `config.example.json` | `gcpLoggingDuration` key with its default | §6.3 |
| `CLAUDE.md` | new floors (21 clusters), new endpoints, ADR range → 0015 | §8, §9, §13 |
| `docs/visual-guide.md` | screenshots captured by the browser pass (§10) | §10 |

## 15. Data-handling rule

The user's report included live console URLs, a real `job_id`, a real project id and a real cursor
timestamp. **None of those values enter this repository** — not in code, tests, fixtures, comments,
docs, screenshots or commit messages. They were used to diagnose the URL *shape* and nothing else.

- URL shapes live in `application.yml` as templates with placeholders, configurable per deployment.
- Every fixture and every asserted number in this spec comes from the committed anonymized mock.
- Screenshots committed during the browser acceptance pass are taken against the committed mock
  data, never against a real export, and are reviewed for identifiers before committing.
