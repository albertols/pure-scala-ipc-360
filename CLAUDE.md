# CLAUDE.md

## What this is

ETL 360: Informatica PowerCenter (IPC) Powermart XML exports made browsable and
platform-agnostic. A multi-module Maven repo:

- `parser/` — pure Scala 2.12 (JDK 11 target) XML→JSON parser, the original standalone
  tool, unchanged in behavior. Produces `_ETL_<mapping>.json` recipes, `<TABLE>.json`
  BigQuery DDL, and `_sqlTranslations_ETL_<mapping>.json` Oracle→BigQuery SQL.
- `backend/` — Spring Boot 3.3 / Java 17 read-only REST API that calls the parser
  in-JVM and serves the corpus (tree, DOM, semantic model, recipes, DDL, expressions,
  table relationships, mock operational job history).
- `frontend/` — React 19 / Vite / Tailwind v4 GUI (Figma Make prototype), wired to
  `backend/` tab by tab. **All four tabs are real now** — Tab 1 (IPC ETL Viewer)'s
  canvas/detail panel/search/zoom, Tab 2 (ETL Modifier)'s banded `IpcCanvas` (drag,
  auto-layout, per-node conformance dots) inside a fixed-height editor shell (docked
  Inspector, two draggable splitters + a corner grip whose sizes persist to
  `localStorage`, a collapsible Source/Transformations/Target/DDL/Edge drawer, and a
  25-entry undo/redo stack; UX round 4: node clicks always select — closing the
  Inspector is explicit (header ✕, or a clean canvas-background click) instead of the
  old re-click toggle — boxes hover-highlight, selection auto-pans a clipped node back
  into view, and the Expressions dock collapses to a 36px strip), a schema-driven
  Inspector covering every recipe key for all 20 of
  the ruleset's `source:`/`target:` kinds — `union` (10) and `joiner` (5) sources now
  get canvas nodes too, closing spec `2026-08-01-etl-modifier-redesign-design.md` §13
  deviation 3, though their 2197 `unionTables[].fieldMapping` pairs render read-only
  (nested-object editing is still unbuilt — the editable `{ raw JSON }` panel is the
  authoring path for those shapes meanwhile) — a declared-but-unconsumed
  `table.sourceTableNames` entry also gets a Sources-band node, which is what makes the
  first insertion into a from-scratch recipe visible — a conformance chip + drawer against the
  IPC ruleset (`docs/ipc/`), a pre-add configuration dialog gated on the `connections`
  adjacency matrix (`docs/adr/0012-ipc-connection-matrix.md`) so the palette cannot
  insert an orphan into any non-empty draft (the one exception: a *source table* on a
  still-blank canvas skips the gate — it adds a `table.sourceTableNames` entry, never a
  step, so `IPC-FLW-003` has nothing to orphan; spec §12 deviation 5),
  registry-backed authoring of a recipe from scratch, a recipe-scoped
  Explorer/expression dock (formulas clamped, list capped at 150 with an honest count),
  focus mode (`?focus=<recipePath>`), and save/history/rollback (the backend's write
  API, `PUT`/`POST`/`validate`/`history`/`rollback` on `/api/recipes`), Tab 3 (ETL
  Operational)'s relationships graph + operational summary (with a `data: real|mock|absent` chip,
  and the `/api/diagnostics` data-root report under an empty graph — ADR-0013) — rebuilt around a
  b15 cluster index (`docs/adr/0014-b15-cluster-index.md`) so a real export loads only the
  selected clusters' scoped subgraph instead of the whole corpus: a `ClusterPane` left rail
  (search, multi-select, lazy expansion), a `SelectionStrip` naming the current selection and its
  aggregate counts, three card densities (Detailed/Compact/Minimal, each re-laying out and
  refitting the canvas), an `AvailabilityCalendar` popover (has-data/no-data/in-selection/selected
  day states, empty-day clicks snap to the nearest available date), `⌘`/`Ctrl`+wheel
  cursor-anchored zoom and `Shift`+wheel horizontal pan on the canvas, and a module-level view-state
  store (`operationalView.ts`) that survives a tab switch with no refetch — and Tab 4 (ETL DAG)'s
  clusters/run history, both now sharing one `RunPicker` (bars + selected-run field) and one Google
  Cloud console link builder (`docs/adr/0015-gcp-deep-links.md`, `src/api/gcpLinks.ts` — the only
  file that builds a console URL) all consume the live corpus. Sub-project 11 adds a landing page —
  the app's opening screen, ahead of Tab 1 — bound to one `GET /api/readiness` aggregate: a mascot
  hero scene whose overlay/colour-grade flips between an "ok" and a "degraded" mood off
  `readiness.status`, corpus/operational/DAG stat cards, a clickable architecture diagram reused in
  the README, tab-preview cards sourced from `src/tabs.tsx` (so the strip and the landing page
  cannot drift), and a repo-sourced progress strip — a `tasksDone / tasksTotal` ratio counted over
  every `- [x]`/`- [ ]` plan checkbox across all plans plus an ADR count, nullable when `docs/` is
  unreachable (`docs/adr/0016-landing-readiness-aggregate.md`). The backlog is conveyed only as
  `tasksTotal - tasksDone`, never as an itemized shipped/planned list — that split was specified
  but not built; see the spec's §6.3/§10 deviation note.
  Tab 2's seven sanctioned visual
  departures (`2026-08-01-etl-modifier-ux2-design.md` §10) and sub-project 10's Tab 3 rebuild +
  the app-wide `InfoTooltip` contrast fix (`2026-08-27-operational-scale-design.md` §12) are
  **pending human visual sign-off** — the mechanisms are unit-tested and gated in
  `make validate-loop`; Task 19 ran every deterministic gate from a clean build (see its
  acceptance-walk results) but did not drive a browser, so the rendered result of either
  sub-project remains unobserved.
  See `frontend/AGENTS.md`.
- `docs/` — ADRs, `architecture.md`, and `superpowers/{specs,plans}/` design artifacts.

No Spark, GCS, or xlsx dependencies in `parser/` — deliberately removed in the slim
pass; do not reintroduce them.

## Repo layout

| Dir | What |
|---|---|
| `parser/` | Scala parser + corpus (`src/main/resources/xmltobq`), Maven module |
| `backend/` | Spring Boot API, Maven module, depends on `parser` |
| `frontend/` | Vite/React GUI, own `package.json` |
| `docs/adr/` | Architecture Decision Records (MADR-lite) |
| `docs/architecture.md` | Diagrams, endpoint table, config reference |
| `docs/superpowers/{specs,plans}/` | Design specs and checkbox-tracked implementation plans |
| `scripts/`, `Makefile` | Dev harness |

## Build & run

```bash
make dev                                    # backend :8080 + frontend :8443, Ctrl-C stops both
mvn -q -am -pl backend test                 # all backend tests (parser + backend, full reactor)
mvn -q -pl backend test                     # focused backend re-run — no -am, needs a prior install
cd frontend && pnpm test                    # frontend unit/component tests (vitest)
mvn -q -pl parser compile exec:java -Dexec.args="--xmlPath <file-or-dir> --generateDDLContent --generateRecipe --generateTargetDDL --generateSourceDDL"
```

- `make dev` runs `mvn -am -pl backend install -DskipTests` then `spring-boot:run` scoped
  to `backend` — a multi-module reactor and the `spring-boot:run` goal don't mix directly.
- `--generateDDLContent` must accompany `--generateTargetDDL`/`--generateSourceDDL`, else
  DDL files are written empty-handed.
- Parser output is written **next to each input XML**. Never run generation against
  `parser/src/main/resources/xmltobq` in place — use `make regen-corpus` (temp copy + diff).
- `config.json` (git-ignored, `config.example.json` template) is the user entrypoint —
  `scripts/dev.sh` maps it onto `ETL360_*` env vars and resolves JAVA_HOME/node;
  `scripts/dev.sh --check-config` dry-runs the resolution (ADR-0009).
- Full endpoint table, config keys, and diagrams: `docs/architecture.md`.

## Hard rules

1. **Figma visual contract.** `frontend/`'s look (tokens in `src/index.css`, Inter/
   JetBrains Mono, layout/interactions) is sacred. Rewiring swaps data sources only —
   no restyling without an explicit ask. See `docs/adr/0005-figma-visual-contract.md`.
   The one sanctioned amendment is Tab 3's semantic palette
   (`docs/adr/0017-semantic-colour-system.md`): kind = GCP product colour + the edge the
   status bar sits on, layer = medallion tier, status = unchanged. All of it lives in
   `frontend/src/theme/semanticColors.ts` — **the only file that maps a layer, kind or
   status to a colour**. Never hardcode one of those hexes elsewhere; the values are
   mirrored in `src/index.css` as custom properties and the two change together.
   `LAYER_RANK` (`api/relationshipsAdapter.ts`) is likewise the ONE layer ordering —
   `STG ODS ETL DWH CDM RDM QDM OUTPUT UNKNOWN` — and it drives the canvas columns AND
   Tab 3's filter chips. Never sort layers by a second rule anywhere.
2. **Corpus safety.** `parser/src/main/resources/xmltobq/` is anonymized sample data;
   outputs sit next to inputs. Experiment in temp copies. `DWH_CONTROL/` stays
   git-ignored, never committed.
3. **Parser behavior unchanged.** Recipe/DDL/SQL generation must stay byte-identical;
   fix bugs in `parser/`, never hand-patch generated JSON. SQL translations are
   **derived artifacts** — fix `parser/.../sql/calcite` or `sql/sqlglot`, not the JSON.
   Manual overrides: `parser/src/main/resources/xmltobq/_sqlTranslations_manual.json`.
   Recipe source field references use `SOURCE_NAME.FIELD_NAME` dot notation — preserve
   it when generating or editing recipe output. The recipe write API (`PUT`/`POST`/
   `validate`/`history`/`rollback` on `/api/recipes`, Tab 2's save path) archives the
   pre-edit version to a `<recipeDir>/_history/<base>.<yyyyMMdd-HHmmss-SSS>.json` sidecar
   before writing — committable by design, but excluded from every corpus walk
   (`/api/tree`, contract tests, DDL discovery) so a viewer never lists an archived
   version as live data (`backend/.../service/support/HistorySidecar.java`).
   `POST /api/recipes/{*path}` is the one endpoint that *creates* corpus files: 409 if
   the file exists, 400 unless the path is exactly `<layer>/<mapping>/_ETL_<mapping>.json`
   under an existing top-level corpus directory (enumerated per request, never
   hardcoded), and the body must validate with zero errors first. A recipe authored
   while testing must never be committed — it would move the contract-test floors.
4. **Specs and plans live in `docs/superpowers/`**; progress is tracked by `- [ ]`
   checkboxes committed alongside each task's changes — the commit history is the
   resumability record. New architectural decisions get an ADR (`docs/adr/`, template
   at `0000-template.md`).

## Testing

- `make test` = `mvn -am -pl backend test` + `cd frontend && pnpm test`.
- **Corpus contract test** (`backend/.../CorpusContractTest`, JUnit): every XML in the
  corpus serves `/api/mappings/dom` and `/model` with 200 (≥81 mappings — 55 lowercase
  `.xml` + 14 uppercase `.XML` + the 12 synthetic `m_CAS_*` mappings, real corpus + the
  `SYN`/`CAS` families); every `_ETL_*.json` recipe serves via `/api/recipes` (≥86).
  `backend/.../LayerToLayerContractTest` gates the mock `LayerToLayerConfig` mirror the
  same way: ≥33 entries, zero skipped rows, every configured recipe present in the
  corpus. Both floors grew with the CAS family (`docs/adr/0008-manifest-driven-cas-mock-data.md`).
  This replaces the old manual "regenerate and eyeball" smoke check.
- Parser regression is verified once at the module move (Task 1: pre/post-move
  byte-diff of full corpus regeneration) plus the ongoing corpus contract test above —
  there is no standing JUnit regen-diff harness.
- `make check` adds `tsc --noEmit` + `pnpm format --check` (frontend format backlog
  documented in root `README.md`; it doesn't fail the target while that backlog exists).
- `make validate-loop` (`scripts/validate_loop.sh`) is the frontend→middleware→backend
  gate, chaining four sweeps against a booted backend before the frontend hook tests:
  (1) health/relationships/operational curls (`/api/health`, `/api/relationships`,
  `/api/operational/dates`/`{date}`) over the committed synthetic mock operational data
  (`SYN`-marked mappings, mock `LayerToLayerConfig`, 14-day b15 job history — see
  `docs/adr/0006-synthetic-operational-data.md`); (2) `scripts/viewer_sweep.mts` — every
  mapping in the tree renders (81/81); (3) `scripts/recipe_sweep.mts` — every recipe
  renders+validates (86/86) via the extended `POST /api/recipes/validate` (`checks[]`
  against the IPC ruleset) and fails if any returned `checks[].ruleId` is absent from
  `GET /api/ipc/rules`, printing a per-run tally of warning-severity checks so a
  severity regression is visible without failing the gate (`docs/adr/0010-ipc-conformance-ruleset.md`);
  it also asserts every `union`/`joiner` source yields a canvas node of that name (15
  occurrences across 8 recipes) and that `GET /api/ipc/rules`'s `connections` covers
  every source kind the corpus actually uses (10/10, `docs/adr/0012-ipc-connection-matrix.md`);
  (4) `node --experimental-strip-types
  scripts/mock_etl_data.mts --check` (manifest↔corpus↔mock drift over the `m_CAS_*`
  family) then `scripts/relationships_sweep.mts` (asserts every CAS relationship
  casuistic — fan-in, 1→N, diamond converge, lookup edge, source-only table,
  consumer-less recipe, ≥6-hop chain, anchor-date KO — against the live
  `/api/relationships` + `/api/operational/summary`) — see
  `docs/adr/0008-manifest-driven-cas-mock-data.md`. The script pins
  `ETL360_DWH_CONTROL_ROOT`/`ETL360_COMPOSER_ROOT` to the committed mock tiers unless
  the caller overrides them, so the gate validates the committed mock data and can't
  flip to "real" (and silently assert against an empty graph) just because a developer
  machine happens to carry an untracked local `DWH_CONTROL`/composer export.
  `GET /api/summary` (corpus counts for the view-aware Explorer footer/chip) and
  `GET`/`PUT /api/layouts/{*path}` (canvas node offsets, `docs/adr/0011-canvas-layout-sidecar.md`)
  round out sub-project 8's endpoints; sub-project 9 adds `GET /api/registry` (the
  authoring inventory: 108 source tables, 87 target tables, 180 DDL names — 11 of them
  carrying divergent `variants[]` — and 8 layers) and `POST /api/recipes/{*path}`. All
  four are covered by backend contract tests rather than a `validate-loop` curl.
  `GET /api/diagnostics` (ADR-0013) reports per data root the resolved absolute path, the tier
  that won, and — for the control schema — staged scan counts (`presentDirs` → `filesRead` →
  `anchorHits` → `rowsParsed`) plus the `INSERT INTO <table>` identifiers actually found, so an
  empty Tab 3 names its own cause. Both contract-tested and gated in `validate-loop`.
  Sub-project 10 adds three read-only endpoints — `GET /api/operational/clusters` (the whole-history
  b15 cluster index), `GET /api/operational/clusters/{name}` (one cluster's recipes with per-recipe
  dates/OK/KO), `GET /api/operational/runs?recipe=…&limit=` (run history by recipe, newest-first,
  ≤200 recipes) — plus an optional `?clusters=` scope on `GET /api/relationships` (strict subset +
  1-hop neighbours; the unscoped response stays byte-identical). `make validate-loop` curls all
  three new endpoints and asserts the committed-mock b15 floors **21 clusters · 30 recipes · 14
  dates · 417 rows**, with the largest cluster holding ≥4 recipes (`docs/adr/0014-b15-cluster-index.md`).
  Sub-project 11 adds `GET /api/readiness` (the landing page's single payload — corpus, operational
  and DAG counts, per-root diagnosis, repo-sourced progress). `make validate-loop` curls it and
  asserts the committed-mock floors **81 XML · 86 recipes · 212 DDL** corpus, **21 clusters · 30
  recipes · 14 dates · 417 rows** operational, and **22** distinct `workflow` values — the DAG count
  is read from `LayerToLayerService.entries()`, never the relationships graph
  (`docs/adr/0016-landing-readiness-aggregate.md`).
  Sub-project 12 adds `GET /api/operational/search?q=&limit=` (`docs/adr/0019-operational-search.md`)
  — the recipe↔table↔cluster join ADR-0014 deliberately kept off the client, since table names live
  only in the L2L graph and are therefore invisible to any client-side search; `make validate-loop`
  curls it and asserts BOTH recipe and table hits (a recipes-only result means the join silently
  degraded to the b15 index) plus its bounds. It also gates the b15 status vocabulary
  (`docs/adr/0018-b15-status-vocabulary.md`): `FAILURE` must be in `statusKo`, `rowsScanned` must be
  417, and `unrecognizedStatuses` must be empty for the committed mock.
  `GET /api/operational/lineage?node=&limit=` (`docs/adr/0020-lineage-flow.md`) backs Tab 3's
  "Show all related", which is a full upstream+downstream flow rather than a one-hop list. It is
  **breadth-first on purpose** — the node budget must cut the furthest hops, never an arbitrary
  branch — and **not cluster-scoped**, because lineage crosses cluster boundaries and stopping at
  the selection would draw a complete-looking flow that is not one. `make validate-loop` asserts
  both directions are reached, that every edge endpoint is a returned node, and that a capped
  result reports `truncated` with a surviving `totalReachable`.

## Corpus caveats

- Everything under `parser/src/main/resources/xmltobq` is **anonymized** sample data
  (names like MAPLEGROVE/CEDARFORGE are deliberate). Never "fix" them back to
  real-looking identifiers.
- The committed recipe JSONs were anonymized *after* generation, including some JSON
  key names — regenerated output legitimately differs from committed JSONs in those
  renamed keys. Do not treat that diff as a parser bug.
- The anonymizer once mangled XML entities (`&gt;` → `&southford;` etc.); that is
  repaired. A new XML failing SAX parsing with an undeclared-entity error should be
  suspected of anonymizer damage first, not the parser.
- `parser/src/main/resources/DWH_CONTROL/` is intentionally untracked (git-ignored,
  history rewritten); never commit it. The committed mock mirror lives at
  `backend/src/main/resources/mock/DWH_CONTROL/` instead.
- The anonymizer had also renamed the recipe structural key "fields" to "weststone" in
  64 recipes; repaired 2026-07-31 (key rename only, byte-diff limited to the key
  token). The frontend recipe adapter still tolerates both spellings defensively.
- The 12 `m_CAS_*` mappings (all 8 layers, corpus floors 81 XMLs/86 recipes/33 L2L
  entries) are **generated**, not hand-authored — every byte derives from
  `scripts/mock_etl_data.manifest.json` via `scripts/mock_etl_data.mts`. Regenerate
  ONLY via `make cas-gen` (XML + real-parser recipes, temp-copy idiom) and
  `--emit l2l`/`--emit b15` (L2L rows / b15 history, marker-delimited strip-then-append
  — both byte-idempotent). Never hand-edit a `m_CAS_*` XML, recipe, L2L row, or b15
  CSV row directly; see the `mock-etl-data` skill.
- `scripts/gen_b15_history.py` is **frozen** as of the CAS family landing: its
  per-recipe profiles index off `sorted(set(recipe_filenames))` across all layers'
  `statements.sql`, so adding the 12 CAS recipe names shifts every index after the
  insertion point — re-running it would silently rewrite the existing SYN/real b15
  rows. CAS b15 rows are owned exclusively by `mock_etl_data.mts --emit b15`.
- The control-schema **vocabulary is anonymized too**: `CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG`
  and the eight layer directory names are this corpus's sample values, not IPC law. Both are
  configurable since ADR-0013 (`etl360.layer-to-layer.anchor-table`/`.layer-dirs`, `config.json`
  `layerToLayerTable`/`layerDirs`) with the current values as defaults — a real export that misses
  on either parses to zero rows *silently*, which is what `GET /api/diagnostics` exists to explain.
  Never hardcode a second copy of either value; read them from `Etl360Properties.LayerToLayer`.
- The b15 **`status` vocabulary is anonymized sample data too**: the corpus writes
  `SUCCESS`/`FAILED`, a real Composer export writes `FAILURE`. Until sub-project 12 that token
  matched no literal in four separate places and fell through to `PENDING`, so every failed run
  rendered as "never ran" and the tab reported `0 KO` on data full of failures. Canonicalisation
  now happens ONCE, in `B15Reader.parse` via `service/support/B15Status.java`, and is configurable
  (`etl360.b15.status-ok`/`.status-ko`, `config.json` `b15StatusOk`/`b15StatusKo`). Never add a
  second status comparison anywhere downstream — everything after the reader sees only
  `SUCCESS`/`FAILED`/`""`. Unrecognized tokens are reported by `GET /api/diagnostics`
  (`b15.unrecognizedStatuses`), never swallowed (`docs/adr/0018-b15-status-vocabulary.md`).
- Four recipe `type` values (`BERYLFALLS`, `ASHPATH2`, `CEDARWICK2`, `EARLYGLADE`) and
  one structural key (`greencliff`) are anonymizer output, not IPC vocabulary — resolved
  to their canonical kind/key (`sourceQualifier`/`joinerInput`/`storedProcedure`/
  `unionInput`, `groups`) by `IpcVocabulary`'s alias table for rule evaluation and canvas
  labels only; the JSON on disk is never rewritten. Rule evaluation resolves server-side
  (`IpcVocabulary.canonicalTargetType`/`canonicalSourceType`); canvas labels resolve
  client-side — `GET /api/ipc/rules`'s `typeAliases` is threaded into
  `frontend/src/api/recipeAdapter.ts`'s `kindAndLabel` (an optional third parameter,
  never a hardcoded frontend copy of the map) so an aliased node renders identically to
  the canonical kind it aliases instead of falling through to a generic expression box
  (closed 2026-08-01, sub-project 8 Task 19 — see spec §13 deviation 4). Every mapping is
  confirmed against a source-XML witness and re-asserted by `AliasWitnessContractTest`,
  so treat a new unrecognized `type` token the same way — as anonymizer damage to alias,
  not a bug to patch into the corpus. See `docs/ipc/README.md` for the full table and
  witnesses.
- `cluster_name` (a b15 CSV column) and `workflow` (L2L control-table column 4, e.g.
  `wf_Carga_DWH`) are **different facts from different sources** — deliberately unrelated. The
  code never derives one from the other (`RelationshipService.graph()` reads only L2L entries;
  `cluster_name` is absent from the graph). The CAS mock manifest groups clusters *across*
  workflows on purpose — e.g. `cluster-wf-cas-load-4001` recurs against mappings from more than
  one workflow — specifically so the two groupings can never be conflated by a reader of the
  data. See `docs/adr/0014-b15-cluster-index.md` and spec `2026-08-27-operational-scale-design.md`
  §2.

## Working practices

Sub-projects run the SDD/TDD harness: spec → plan → per-task TDD with the
`implementer`/`task-reviewer` agents → gates → acceptance walk. The loop, the
common skills (`sdd-cycle`, `tab-rewire`, `mock-etl-data`, `regen-corpus`,
`run-app`, `validate-loop`), and how the gates compose: `docs/harness.md`.
Visual overview (4 diagrams; screenshots pending a human capture pass — see its
checklist): `docs/visual-guide.md`.

## More

- Running the suite on someone else's data (own IPC exports, corp laptops):
  root `HOW_TO_RUN_ON_YOUR_DATA.md` — the single source of truth for config fields,
  the layout each data root must have, the parser run that produces recipes, and the
  real/mock verification step. **Keep it current**: it ends with a per-section table of
  the files its claims derive from (`DataRoots`, `CorpusService`, `OperationalService`,
  `LayerToLayerService`, `Etl360Properties`, `scripts/dev.sh`, `XMLParser.scala`,
  `frontend/vite.config.ts`) — change one of those and update the doc in the same commit.
- API endpoints, sequence diagrams, config reference: `docs/architecture.md`
- Design rationale: `docs/adr/0001`–`0020`
- `docs/ipc/` — the IPC (Informatica PowerCenter) conformance wiki: provenance policy,
  alias table, per-kind transformation pages, the full `IPC-*` rule catalogue, and the
  expression grammar. Start at `docs/ipc/README.md`.
- Current spec/plan:
  `docs/superpowers/specs/2026-08-29-operational-clarity-design.md` +
  `docs/superpowers/plans/2026-08-29-operational-clarity.md`
  (previous sub-project: `…/2026-08-28-landing-page-design.md` + its plan)
- Parser deep-dive: `parser/src/main/scala/io/pure360/ipc/xmltojson/README.md`,
  `_DWH_Transformations_and_XML_Parsing.md`
- Dev harness, prerequisites, `.env.example` reference: root `README.md`
- Harness detail (skills, agents, gate composition): `docs/harness.md`
- Visual overview (diagrams; screenshots pending a human capture pass): `docs/visual-guide.md`
