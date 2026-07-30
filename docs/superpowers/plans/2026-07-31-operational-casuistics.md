# Tab 3 Operational Rewiring + CAS Relationship Casuistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tab 3 (ETL Operational Table Relationships) rewires from `OPERATIONAL_CARDS` mock to the real relationships graph + 14-day operational history, and the mock data grows a 12-mapping `m_CAS_*` casuistics family covering every relationship shape end-to-end (IPC XML → parser recipe → `statements.sql` row → b15 CSV rows), produced by a new reusable manifest-driven generator + committed `mock-etl-data` skill — per spec `docs/superpowers/specs/2026-07-31-operational-casuistics-design.md`.

**Architecture:** `scripts/mock_etl_data.mts` (Node ≥22.6, manifest = the spec §3 matrix as data) emits CAS XMLs / L2L rows / b15 rows deterministically and self-verifies via `--check`; recipes come from the REAL parser over a temp copy (`make cas-gen`). Backend gains `GET /api/operational/summary` (`OperationalSummaryDto`, computed in `OperationalService`, nearest-rank percentiles, `UNKNOWN` layer for L2L-missing recipes). Frontend gains a pure `relationshipsAdapter.ts` mapping `RelationshipsDto` + summary + selected date onto the EXISTING `OperationalCard`/graph props, wired into `ETLOperational.tsx` with real TimePicker dates and a full-window recipe preview overlay (shared `EtlCanvas` + `recipeToCanvas` from Stream A). `scripts/relationships_sweep.mts` gates every casuistic inside `make validate-loop`.

**Tech Stack:** Node 22 `--experimental-strip-types` (+ built-in `node:test` for the generator), Java 17 / Spring Boot 3.3 (existing backend), React 19 + TanStack Query + vitest 4 / RTL / MSW (existing frontend infra), real Scala parser via `mvn exec:java` over temp copies only.

## Global Constraints

- **Branch/worktree:** `feat/etl360-operational-casuistics` in `git worktree add .worktrees/etl360-operational-casuistics -b feat/etl360-operational-casuistics main` — created ONLY after sub-project 3's shared-foundations checkpoint is on `main` (weststone repair, `frontend/src/components/shared/EtlCanvas.tsx`, `frontend/src/api/canvasLayout.ts`, collapsible `Sidebar`). Verify before Task 1: `test -f frontend/src/components/shared/EtlCanvas.tsx && test -f frontend/src/api/canvasLayout.ts` — if missing, STOP (forked too early). All paths below are worktree-relative.
- **Environment (every shell):** node/pnpm need `export PATH="$HOME/.local/toolchains/node-v22.23.2-darwin-x64/bin:$PATH"`; maven needs `export PATH="/usr/local/bin:$PATH"` and `export JAVA_HOME="/Applications/IntelliJ IDEA CE.app/Contents/jbr/Contents/Home"`.
- **Per-task verification:** frontend tasks — `cd frontend && pnpm test && npx tsc --noEmit`; backend tasks — `mvn -q -am -pl backend test`. Both clean before every commit.
- **Figma visual contract.** Tab 3 keeps its prototype look. Sanctioned changes ONLY: (1) real data replacing `OPERATIONAL_CARDS` (incl. data-driven filter-chip option lists; `Status` chips swap the never-occurring `RUNNING` for `PENDING` — data-completeness precedent, ledger-noted); (2) loading/error/empty states reusing existing tokens (Tab-1 Task-12 idiom: `--text-dim` loading line, `--red` title/detail); (3) real TimePicker dates (clamp + snap; component file untouched); (4) the preview overlay (new full-window modal composed of existing tokens + shared `EtlCanvas`); (5) one "Open preview" button in the existing detail side panel as the overlay affordance. NOTHING else changes visually. Tabs 1/2/4 untouched (Tab 4 keeps importing `OPERATIONAL_CARDS` — the export STAYS).
- **Corpus safety (CLAUDE.md hard rule):** the parser NEVER runs against `parser/src/main/resources/xmltobq` in place — `make cas-gen` uses the temp-copy idiom. CAS XMLs are hand-off inputs (committed next to SYN); generated outputs are copied back from the temp run.
- **Determinism:** no `Date.now`/randomness in ANY emitted content — every byte derives from `scripts/mock_etl_data.manifest.json`. Re-running any `--emit` mode is byte-idempotent.
- **`scripts/gen_b15_history.py` is FROZEN after Task 3.** Its per-recipe profiles derive from the sorted recipe index — adding CAS recipes to `statements.sql` shifts every index, so re-running it would rewrite the existing SYN/real rows (violating spec §3 "SYN untouched"). CAS b15 rows are managed exclusively by `mock_etl_data.mts --emit b15` (surgical strip-and-append). Documented in the skill + CLAUDE.md (Task 11).
- **Floor raises land in the SAME task as the data:** mappings ≥69→≥81 + recipes ≥74→≥86 + `viewer_sweep` `< 69`→`< 81` in Task 2; L2L entries ≥18→**≥33** in Task 3 (19 existing rows + 14 CAS rows: one per mapping + one extra row each for the two multi-target mappings #7/#8, per the SYN `m_SYN_ETL_ORDERS_BRIDGE` two-row idiom — supersedes the spec's provisional 31 under its own "exact numbers pinned by the plan after generation" clause; footnoted in Task 11).
- **`make validate-loop` anchors must keep passing throughout:** date `2026-07-29` serves, all 14 dates intact.
- **Commit protocol:** tick this plan's checkboxes and include this file (`docs/superpowers/plans/2026-07-31-operational-casuistics.md`) in each task's commit; stage explicit paths — NEVER `git add -A` (`scripts/dev.sh` carries an uncommitted USER edit; `first_prompt.md` and `.claude/settings.json` untracked; all stay out).
- **RTL constraint:** no auto-cleanup in `frontend/src/test/setup.ts` — every NEW test file declares its own `afterEach(() => cleanup())` (the `DetailPanel.test.tsx` idiom); prefer single-flow tests.
- **Merge-overlap discipline:** the only files both streams touch are `scripts/validate_loop.sh` (append-only steps) and docs ledgers — keep additions append-only.

## Progress & resume protocol

Tick checkboxes per task, commit this file with each task. Resume = `git log --oneline` + first unticked checkbox. Task 9 has an explicit prerequisite gate (Stream A's `recipeToCanvas`) — if unmet, execute Tasks 10–11 first and return (record the resequencing in the Task 9 commit body).

---

### Task 1: Generator core — manifest, renderers, `--check`, node:test

**Files:**
- Create: `scripts/mock_etl_data.manifest.json` (the §3 matrix as data)
- Create: `scripts/mock_etl_data.mts` (pure functions + CLI)
- Test: `scripts/mock_etl_data.test.mts` (built-in `node:test` — no new deps; runs via `node --experimental-strip-types --test`; `make test` needn't cover it, validate-loop gates via `--check` from Task 10)

**Interfaces (Tasks 2/3/10 rely on these EXACT signatures):**

```ts
// scripts/mock_etl_data.mts — run: node --experimental-strip-types scripts/mock_etl_data.mts --emit xml|l2l|b15 | --check
export interface CasField { name: string; srcType: string; precision: string; scale?: string }
export interface CasMapping { n: number; name: string; layer: string; ext: 'xml' | 'XML'; workflow: string; order: number;
  sources: { table: string; dbtype: 'Flat File' | 'Oracle'; fields: string[] }[];   // "NAME:type:precision[.scale]"
  lookup: { table: string; inField: string; keyField: string; outField: string } | null;
  targets: { table: string; writeMode: string; partition: string; partitionKey: string; fields: string[] }[];
  derived: { name: string; from: string[]; expr: string };
  b15: { cluster: string; baseSeconds: number; spreadSeconds: number; koDates: string[]; koMessage?: string } }
export interface CasManifest { family: 'CAS'; creationDate: string; uuidBase: string; dates: string[];
  incidentDate: string; incidentMessage: string; jobIdEpoch: number; mappings: CasMapping[] }
export function loadManifest(path?: string): CasManifest
export function renderMappingXml(m: CasManifest, mp: CasMapping): string           // full Powermart doc, deterministic
export function l2lStatements(m: CasManifest, layer: string): string[]              // ordered INSERT rows for that layer
export function b15CasRows(m: CasManifest, date: string): string[]                  // ordered CSV lines (no header)
export function emitXml(m: CasManifest, corpusRoot: string): string[]               // written paths
export function emitL2l(m: CasManifest, l2lRoot: string): string[]                  // touched statements.sql paths (marker block)
export function emitB15(m: CasManifest, inputsRoot: string): string[]               // touched csv paths (strip CAS rows, append)
export function checkAll(m: CasManifest, repoRoot: string): string[]                // [] = clean; else drift descriptions
```

Manifest header values (exact): `creationDate: "01/07/2026 00:00:00"`, `uuidBase: "00000000-0000-0000-0000-0000000005"` (mapping UUID = base + 2-digit `n`), `dates: ["2026-07-16" … "2026-07-29"]` (all 14, explicit), `incidentDate: "2026-07-21"`, `incidentMessage: "Cluster-wide driver OOM cascade (synthetic CAS)"`, `jobIdEpoch: 1774840777`.

**The 12-mapping matrix as manifest rows** (spec §3, binding; `wf_CAS_<LAYER>_LOAD` workflows; field encoding `NAME:type:precision[.scale]`; every source/target reuses the EVENTS field family below unless noted):

| # | name (layer, ext) | order | sources → targets (writeMode/partition) | lookup | b15 cluster / base / spread / koDates |
|---|---|---|---|---|---|
| 1 | `m_CAS_STG_L_EVENTS_LOAD` (STG, xml) | 1 | `CAS_FF_EVENTS` (Flat File) → `CAS_STG_L_EVENTS` (TRUNCATE_INSERT/DAILY) | — | `cluster-wf-cas-01-4001` / 480 / 240 / [] |
| 2 | `m_CAS_STG_L_REFS_LOAD` (STG, xml) | 1 | `CAS_FF_REFS` (Flat File) → `CAS_STG_L_REFS` (TRUNCATE_INSERT/DAILY) | — | `cluster-wf-cas-02-4002` / 300 / 120 / [] |
| 3 | `m_CAS_ODS_EVENTS` (ODS, xml) | 2 | `CAS_STG_L_EVENTS` → `CAS_ODS_EVENTS` (APPEND/DAILY) | `CAS_LKP_STATUS` (in `STATUS_RAW`, key `STATUS_CODE`, out `STATUS_DESC`) | `cluster-wf-cas-03-4003` / 900 / 300 / [] |
| 4 | `m_CAS_ODS_EVENTS_ENRICH` (ODS, xml) | 2 | `CAS_STG_L_EVENTS` → `CAS_ODS_EVENTS` (APPEND/DAILY) — **second writer, fan-in** | — | `cluster-wf-cas-04-4004` / 660 / 200 / [] |
| 5 | `m_CAS_DWH_EVENTS_FACT` (DWH, xml) | 3 | `CAS_ODS_EVENTS` + `CAS_ODS_REFS` → `CAS_DWH_EVENTS_FACT` (TRUNCATE_INSERT/DAILY) — **diamond converge** | — | `cluster-wf-cas-05-4005` / 2400 / 900 / `["2026-07-18","2026-07-23","2026-07-29"]`, koMessage `"Executor lost: shuffle fetch failed (synthetic CAS)"` |
| 6 | `m_CAS_ODS_REFS` (ODS, xml) | 2 | `CAS_STG_L_REFS` → `CAS_ODS_REFS` (TRUNCATE_INSERT/DAILY) | — | `cluster-wf-cas-06-4006` / 420 / 150 / [] |
| 7 | `m_CAS_ETL_EVENTS_SPLIT` (ETL, xml) | 4 | `CAS_DWH_EVENTS_FACT` → `CAS_ETL_EVENTS_CURR` (TRUNCATE_INSERT/DAILY) **+** `CAS_ETL_EVENTS_HIST` (APPEND/MONTHLY, key `LOAD_MONTH`) — **1→N, two L2L rows** | — | `cluster-wf-cas-07-4007` / 1200 / 400 / [] |
| 8 | `m_CAS_CDM_EVENTS_MART` (CDM, xml) | 5 | `CAS_DWH_EVENTS_FACT` + `CAS_ETL_EVENTS_CURR` → `CAS_CDM_EVENTS_MART` (APPEND/DAILY) **+** `CAS_CDM_EVENTS_ROLLUP` (TRUNCATE_INSERT/MONTHLY, key `LOAD_MONTH`) — **N→N, two L2L rows** | — | `cluster-wf-cas-08-4008` / 1800 / 600 / [] |
| 9 | `m_CAS_RDM_EVENTS_EXPORT` (RDM, xml) | 6 | `CAS_CDM_EVENTS_MART` + `CAS_ODS_EVENTS` (**cross-layer skip**) → `CAS_RDM_EVENTS_EXPORT` (APPEND/DAILY) | — | `cluster-wf-cas-09-4009` / 540 / 180 / [] |
| 10 | `m_CAS_QDM_EVENTS_QUALITY` (QDM, **XML**) | 6 | `CAS_DWH_EVENTS_FACT` → `CAS_QDM_EVENTS_QUALITY` (TRUNCATE_INSERT/MONTHLY, key `LOAD_MONTH`) | — | `cluster-wf-cas-10-4010` / 240 / 90 / [] |
| 11 | `m_CAS_OUT_EVENTS_FEED` (OUTPUT, xml) | 7 | `CAS_RDM_EVENTS_EXPORT` → `CAS_OUT_EVENTS_FEED` (APPEND/DAILY) — **chain tail, ≥6-hop STG→OUTPUT** | — | `cluster-wf-cas-11-4011` / 360 / 120 / [] |
| 12 | `m_CAS_DWH_ORPHAN_METRICS` (DWH, xml) | 3 | `CAS_STG_UNREFERENCED` (**source-only, no writer**) → `CAS_DWH_ORPHAN_METRICS` (APPEND/DAILY) — **consumer-less leaf** | — | `cluster-wf-cas-12-4012` / 150 / 60 / [] |

Field families (exact, reused by name): flat-file sources `["EVENT_ID:string:20","EVENT_TS:string:26","AMOUNT_RAW:string:30","STATUS_RAW:string:4"]` (REFS/UNREFERENCED use `["REF_ID:string:20","REF_NAME:string:60"]`); Oracle tables mirror with `varchar2`/`number:18.2`. Every mapping's `derived` = one ƒ field (e.g. #1 `{name:"AMOUNT", from:["AMOUNT_RAW"], expr:"TO_DECIMAL(LTRIM(RTRIM(AMOUNT_RAW)))"}`; downstream mappings use `ROUND(AMOUNT * 1.0, 2)`-style passthrough variants). One fully-written manifest entry (#3) goes in the file as the exemplar of every key; the other 11 rows are transcriptions of this table — no invented fields.

Renderer rules (mirror the committed SYN XMLs byte-idiomatically — they are the validated-against-the-real-parser templates):
1. Document frame from `parser/src/main/resources/xmltobq/STG/m_SYN_STG_L_ORDERS_LOAD.xml` (`Windows-1252` decl, `POWERMART CREATION_DATE` from manifest, `REPOSITORY NAME="REP_SYN"`, `FOLDER NAME="CAS_EVENTS"`, folder UUID from `uuidBase`+`n`).
2. One `SOURCE` block per manifest source (`DBDNAME="CASDB"`, `DATABASETYPE` per `dbtype`), one `TARGET` per target, one `Expression` TRANSFORMATION `EXP_CAS_<n>` wiring all source fields `INPUT/OUTPUT` + the derived field `OUTPUT` with `EXPRESSION=` attr; multi-source = extra `SOURCE`+`INSTANCE`+connectors into the same EXP (the `m_SYN_DWH_ORDERS_FACT.xml` idiom); dual-target = second `TARGET` + connectors + `TARGETLOADORDER` pair (the `m_SYN_ETL_ORDERS_BRIDGE.xml` idiom); lookup = `Lookup Procedure` TRANSFORMATION with `TABLEATTRIBUTE NAME="Lookup table name" VALUE="CAS_LKP_STATUS"` + condition + policy lines (the `m_SYN_ODS_ORDERS.xml:21-28` idiom, verified in-repo).
3. b15 row formula (deterministic): `seconds = baseSeconds + ((n * 37 + dateIndex * 53) % spreadSeconds)`; duration string `` `${Math.floor(s/60)}m ${String(s%60).padStart(2,'0')}sec` ``; `app_start_iso = ${date}T${String(5 + (n % 6)).padStart(2,'0')}:${String((n * 7) % 60).padStart(2,'0')}:00.000Z`; `job_id = application_${jobIdEpoch}_${String(dateIndex).padStart(2,'0')}${String(n).padStart(3,'0')}`; `status = 'FAILED'` iff `date ∈ koDates` (message `koMessage`) or `date === incidentDate` (message `incidentMessage`), else `'SUCCESS'`.
4. `emitL2l`: per layer file, replace-or-append the block between `-- BEGIN mock_etl_data CAS (generated - do not hand-edit)` and `-- END mock_etl_data CAS` (comment lines are invisible to `LayerToLayerService.statements()`'s anchor scan — verified: it `indexOf`s the INSERT anchor only). `emitB15`: drop every existing line whose second CSV field starts with `_ETL_m_CAS_`, then append `b15CasRows` — strip-then-append makes both emitters idempotent.
5. `checkAll`: re-render every artifact in memory and byte-compare against disk (XML files, L2L marker blocks, CAS rows per date CSV), plus recipe existence `parser/src/main/resources/xmltobq/<layer>/<name>/_ETL_<name>.json`. Returns human-readable drift strings.
6. CLI `main` guarded by `process.argv[1]` endsWith check so the test file can import the pure functions.

- [ ] **Step 1: Write the failing tests** (`scripts/mock_etl_data.test.mts`):

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadManifest, renderMappingXml, l2lStatements, b15CasRows } from './mock_etl_data.mts'

const m = loadManifest()

test('manifest carries the full 12-mapping matrix over all 8 layers', () => {
  assert.equal(m.mappings.length, 12)
  assert.deepEqual([...new Set(m.mappings.map(x => x.layer))].sort(),
    ['CDM', 'DWH', 'ETL', 'ODS', 'OUTPUT', 'QDM', 'RDM', 'STG'])
  assert.equal(m.dates.length, 14)
  assert.equal(m.dates.at(-1), '2026-07-29')
})

test('xml rendering is deterministic and template-idiomatic', () => {
  const map3 = m.mappings.find(x => x.name === 'm_CAS_ODS_EVENTS')!
  const xml = renderMappingXml(m, map3)
  assert.equal(xml, renderMappingXml(m, map3))                        // byte-stable
  assert.match(xml, /CREATION_DATE="01\/07\/2026 00:00:00"/)          // manifest clock, not Date.now
  assert.match(xml, /TABLEATTRIBUTE NAME="Lookup table name" VALUE="CAS_LKP_STATUS"/)
  assert.match(xml, /<MAPPING [^>]*NAME="m_CAS_ODS_EVENTS"/)
  const split = renderMappingXml(m, m.mappings.find(x => x.name === 'm_CAS_ETL_EVENTS_SPLIT')!)
  assert.equal((split.match(/<TARGET /g) ?? []).length, 2)            // dual target
})

test('l2l rows: 14 total, two rows each for the multi-target mappings, parseable shape', () => {
  const all = ['STG','ODS','DWH','CDM','RDM','QDM','ETL','OUTPUT'].flatMap(l => l2lStatements(m, l))
  assert.equal(all.length, 14)
  assert.equal(all.filter(s => s.includes('_ETL_m_CAS_ETL_EVENTS_SPLIT.json')).length, 2)
  assert.equal(all.filter(s => s.includes('_ETL_m_CAS_CDM_EVENTS_MART.json')).length, 2)
  for (const s of all) assert.match(s, /^INSERT INTO CONTROL\.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES \('/)
})

test('b15 rows: 12 per date, KO pattern per manifest, anchor-date KO for #5', () => {
  for (const d of m.dates) assert.equal(b15CasRows(m, d).length, 12)
  const anchor = b15CasRows(m, '2026-07-29')
  const fact = anchor.find(r => r.includes('_ETL_m_CAS_DWH_EVENTS_FACT.json'))!
  assert.match(fact, /FAILED/)
  const incident = b15CasRows(m, '2026-07-21')
  assert.equal(incident.filter(r => r.includes('FAILED')).length, 12)  // all-KO incident day
  assert.equal(b15CasRows(m, '2026-07-16').join('\n'), b15CasRows(m, '2026-07-16').join('\n'))
})
```

- [ ] **Step 2: Run to verify failure** — `node --experimental-strip-types --test scripts/mock_etl_data.test.mts` — FAIL (module missing).
- [ ] **Step 3: Write the manifest + implement** `mock_etl_data.mts` per the Interfaces block. Verify a rendered XML against the real parser BEFORE trusting it (temp copy, Task-1-of-SYN idiom): render #3 to a scratch dir, `mvn -q -pl parser compile exec:java -Dexec.args="--xmlPath <scratch> --generateDDLContent --generateRecipe --generateTargetDDL --generateSourceDDL"`, confirm `_ETL_m_CAS_ODS_EVENTS.json` appears. Iterate the renderer if not (≤3 iterations, else STOP and report BLOCKED with the parser log).
- [ ] **Step 4: GREEN** — all node:test cases pass.
- [ ] **Step 5: Commit**

```bash
git add scripts/mock_etl_data.mts scripts/mock_etl_data.manifest.json scripts/mock_etl_data.test.mts docs/superpowers/plans/2026-07-31-operational-casuistics.md
git commit -m "feat(casuistics): mock_etl_data generator core — CAS manifest, xml/l2l/b15 renderers, --check"
```

---

### Task 2: CAS XMLs + parser-generated recipes + corpus floor raises (81/86)

**Files:**
- Create (rendered): 12 XMLs under `parser/src/main/resources/xmltobq/{STG,ODS,DWH,CDM,RDM,QDM,ETL,OUTPUT}/m_CAS_*.{xml,XML}`
- Create (generated by the REAL parser): 12 output dirs `parser/src/main/resources/xmltobq/<LAYER>/m_CAS_*/` (recipe + DDL JSONs)
- Create: `scripts/cas_gen.sh`; Modify: `Makefile` (new `cas-gen` target)
- Modify: `backend/src/test/java/io/pure360/etl360/CorpusContractTest.java:25` (`69`→`81`) and `:37` (`74`→`86`), with comment updates
- Modify: `scripts/viewer_sweep.mts:15` (`< 69`→`< 81`, message `>= 81`)

**Interfaces:** `make cas-gen` = render + temp-copy parser run + copy-back; re-runnable (idempotent render, regenerated outputs byte-stable modulo the documented anonymizer-key caveat which does NOT apply to fresh CAS output).

`scripts/cas_gen.sh` (exact):

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
CORPUS=parser/src/main/resources/xmltobq
node --experimental-strip-types scripts/mock_etl_data.mts --emit xml
TMP=$(mktemp -d)
mkdir -p "$TMP/xmltobq"
for f in $(cd "$CORPUS" && ls */m_CAS_*.xml */m_CAS_*.XML 2>/dev/null); do
  mkdir -p "$TMP/xmltobq/$(dirname "$f")"
  cp "$CORPUS/$f" "$TMP/xmltobq/$f"
done
mvn -q -pl parser compile exec:java -Dexec.args="--xmlPath $TMP/xmltobq --generateDDLContent --generateRecipe --generateTargetDDL --generateSourceDDL"
for d in $(cd "$TMP/xmltobq" && find . -type d -name 'm_CAS_*'); do
  rm -rf "$CORPUS/${d#./}"
  cp -R "$TMP/xmltobq/${d#./}" "$CORPUS/${d#./}"
done
echo "cas-gen: recipes regenerated from $TMP into $CORPUS"
```

Makefile addition: `cas-gen:  ## render CAS XMLs from the manifest and regenerate their recipes via the real parser (temp copy)` → `bash scripts/cas_gen.sh`.

- [ ] **Step 1: RED first** — raise the two `CorpusContractTest` floors (25: `hasSizeGreaterThanOrEqualTo(81)`; 37: `(86)`; update the `// 55 lowercase…` comment to `// 55 lowercase .xml + 14 uppercase .XML + 12 CAS (11 .xml, 1 .XML) — see CLAUDE.md corpus caveats.`) and the `viewer_sweep` floor. Run `mvn -q -am -pl backend test` — expect `CorpusContractTest` FAIL (69 < 81): the gate demands the data.
- [ ] **Step 2: Generate** — `make cas-gen`. Verify: `find parser/src/main/resources/xmltobq -name 'm_CAS_*.xml' -o -name 'm_CAS_*.XML' | wc -l` → 12; `find parser/src/main/resources/xmltobq -name '_ETL_m_CAS_*.json' | wc -l` → 12; QDM file is `m_CAS_QDM_EVENTS_QUALITY.XML` (uppercase).
- [ ] **Step 3: GREEN** — `mvn -q -am -pl backend test` (81/86 floors pass). `node --experimental-strip-types scripts/mock_etl_data.mts --check` reports L2L/b15 drift ONLY (expected until Task 3 — confirm XML+recipe checks are clean; if `--check` hard-fails on missing L2L, it must report-not-crash: fix in the generator, that is Task 10's wiring contract).
- [ ] **Step 4: Cross-gate** — `make validate-loop` end-to-end: expect `viewer_sweep: 81/81 mappings render` (any FAIL names the mapping — fix the RENDERER/template, never skip) and the `2026-07-29` anchor date still green.
- [ ] **Step 5: Commit**

```bash
git add parser/src/main/resources/xmltobq scripts/cas_gen.sh Makefile backend/src/test/java/io/pure360/etl360/CorpusContractTest.java scripts/viewer_sweep.mts docs/superpowers/plans/2026-07-31-operational-casuistics.md
git commit -m "feat(casuistics): 12 m_CAS_* mappings + parser-generated recipes — corpus floors 81/86, viewer_sweep 81"
```

(`git add parser/src/main/resources/xmltobq` is safe here: the only changes under it are the new CAS files; verify with `git status --short parser` before staging.)

---

### Task 3: L2L + b15 emission + LayerToLayer/Operational contract raises

**Files:**
- Modify (generated blocks): `backend/src/main/resources/mock/DWH_CONTROL/LAYER_TO_LAYER/{STG,ODS,DWH,CDM,RDM,QDM,ETL,OUTPUT}/statements.sql` (marker-delimited CAS block per layer; ARCHIVE untouched)
- Modify (generated rows): all 14 `backend/src/main/resources/mock/composer/dwh/config/cluster_tuning/inputs/2026_07_*/b15_application_end_with_recipe_null_status.csv`
- Modify: `backend/src/test/java/io/pure360/etl360/LayerToLayerContractTest.java` (floor 18→33 + new `casFamilyFullyConfigured`)
- Modify: `backend/src/test/java/io/pure360/etl360/OperationalContractTest.java` (recipe-node floor 18→30)

- [ ] **Step 1: RED** — add to `LayerToLayerContractTest`:

```java
@Test
void casFamilyFullyConfigured() {   // sub-project 4 spec §3: every CAS mapping has L2L row(s)
    assertThat(layerToLayer.entries()).extracting(LayerToLayerEntryDto::recipe)
        .contains("_ETL_m_CAS_STG_L_EVENTS_LOAD.json", "_ETL_m_CAS_STG_L_REFS_LOAD.json",
                  "_ETL_m_CAS_ODS_EVENTS.json", "_ETL_m_CAS_ODS_EVENTS_ENRICH.json",
                  "_ETL_m_CAS_DWH_EVENTS_FACT.json", "_ETL_m_CAS_ODS_REFS.json",
                  "_ETL_m_CAS_ETL_EVENTS_SPLIT.json", "_ETL_m_CAS_CDM_EVENTS_MART.json",
                  "_ETL_m_CAS_RDM_EVENTS_EXPORT.json", "_ETL_m_CAS_QDM_EVENTS_QUALITY.json",
                  "_ETL_m_CAS_OUT_EVENTS_FEED.json", "_ETL_m_CAS_DWH_ORPHAN_METRICS.json");
}
```

and change `everyConfiguredRecipeExistsInCorpus` to `hasSizeGreaterThanOrEqualTo(33)`; in `OperationalContractTest.relationshipsGraphConsistent` raise the recipe-node count to `isGreaterThanOrEqualTo(30)`. Run `mvn -q -am -pl backend test` — expect both FAIL (data absent).
- [ ] **Step 2: Emit** — `node --experimental-strip-types scripts/mock_etl_data.mts --emit l2l && node --experimental-strip-types scripts/mock_etl_data.mts --emit b15`. Spot-check: `grep -c 'INSERT INTO' backend/src/main/resources/mock/DWH_CONTROL/LAYER_TO_LAYER/*/statements.sql` sums to 33 (+1 ARCHIVE decoy, excluded by the service); anchor CSV gained exactly 12 `_ETL_m_CAS_` lines; `git diff` on a CSV shows APPENDED lines only (existing SYN/real bytes untouched — the spec §3 "SYN untouched" proof). Re-run both emits — `git status` clean (idempotency proof).
- [ ] **Step 3: GREEN** — `mvn -q -am -pl backend test`: new tests pass AND the pre-existing gates prove the join: `everyConfiguredRecipeExistsInCorpus` (every CAS L2L row's recipe exists in corpus), `everyB15RecipeIsConfigured` (every CAS b15 row is L2L-configured), `statusMixPresent`, `decoyDirIsExcluded`, `allFourteenDatesServe`.
- [ ] **Step 4:** `node --experimental-strip-types scripts/mock_etl_data.mts --check` → exit 0, no drift. `node --experimental-strip-types --test scripts/mock_etl_data.test.mts` still green.
- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/mock/DWH_CONTROL/LAYER_TO_LAYER backend/src/main/resources/mock/composer/dwh/config/cluster_tuning/inputs backend/src/test/java/io/pure360/etl360/LayerToLayerContractTest.java backend/src/test/java/io/pure360/etl360/OperationalContractTest.java docs/superpowers/plans/2026-07-31-operational-casuistics.md
git commit -m "feat(casuistics): CAS L2L rows (33 entries) + 14-day b15 history — KO patterns, incident day, idempotent emit"
```

---

### Task 4: `mock-etl-data` project skill

**Files:**
- Create: `.claude/skills/mock-etl-data/SKILL.md`

Follow superpowers:writing-skills conventions (mirror the committed `regen-corpus` skill: YAML frontmatter with `name` + third-person trigger-first `description`; terse body). Required content, in this order:
1. Frontmatter: `name: mock-etl-data`; `description: Use when adding, changing, or verifying synthetic CAS mock ETL data (mappings, L2L rows, b15 history) — always via scripts/mock_etl_data.mts and make cas-gen, never by hand-editing generated blocks.`
2. **Workflow:** edit `scripts/mock_etl_data.manifest.json` → `make cas-gen` (XML + recipes via real parser, temp copy) → `--emit l2l` → `--emit b15` → `--check` → raise contract floors in the SAME commit as data.
3. **Manifest schema:** the `CasManifest`/`CasMapping` fields with the `NAME:type:precision[.scale]` field encoding and the b15 formula (base/spread/koDates/incidentDate).
4. **Corpus-safety rules:** parser never runs in place (`make cas-gen` only); `DWH_CONTROL` mock mirror edits only via `--emit l2l` marker blocks; **never re-run `scripts/gen_b15_history.py` after CAS landed** (index-shift rewrites SYN rows — the frozen-generator rule) — CAS b15 rows are owned by `--emit b15`.
5. **Extension guide:** add a manifest row (next `n`, unique CAS_* tables, pick shapes), re-run the workflow, bump `CorpusContractTest`/`viewer_sweep`/`LayerToLayerContractTest` floors, extend `relationships_sweep` if a new casuistic class is introduced.

- [ ] **Step 1: Write SKILL.md** per above (≤60 lines, imperative, no narration).
- [ ] **Step 2: Verify** — `node --experimental-strip-types scripts/mock_etl_data.mts --check` exit 0 (the skill's advertised gate is true at commit time).
- [ ] **Step 3: Commit**

```bash
git add .claude/skills/mock-etl-data/SKILL.md docs/superpowers/plans/2026-07-31-operational-casuistics.md
git commit -m "docs(skill): mock-etl-data — manifest schema, emit/check workflow, corpus-safety rules"
```

---

### Task 5: Backend `GET /api/operational/summary` + regenerated frontend types

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/api/dto/OperationalSummaryDto.java`
- Modify: `backend/src/main/java/io/pure360/etl360/service/OperationalService.java` (gains `summary()` + `LayerToLayerService` constructor dep)
- Modify: `backend/src/main/java/io/pure360/etl360/api/OperationalController.java` (`@GetMapping("/summary")`)
- Modify: `backend/src/test/java/io/pure360/etl360/service/OperationalServiceTest.java` (constructor helper gains LayerToLayerService over the same fixture roots; new summary cases)
- Modify: `backend/src/test/resources/fixture-mock/composer/dwh/config/cluster_tuning/inputs/2026_07_02/b15_application_end_with_recipe_null_status.csv` (ONE appended row — existing assertions only touch 2026-07-01 and the date list)
- Create: `backend/src/test/java/io/pure360/etl360/OperationalSummaryContractTest.java` (MockMvc over the shipped mock)
- Modify: `frontend/src/api/types.gen.ts` (regenerated), `frontend/src/api/queries.ts` (+`useOperationalSummary`), `frontend/src/api/operational.test.tsx` (+summary hook case)

**Interfaces (spec §5, binding — no extra fields):**

```java
@JsonInclude(JsonInclude.Include.NON_NULL)
public record OperationalSummaryDto(List<String> dates, List<RecipeSummaryDto> recipes) {
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RecipeSummaryDto(String recipeFilename, String layer, String latestDate,
        String latestStatus, int okCount, int koCount, List<HistoryEntryDto> history,
        Double avgDurationMin, Double p50DurationMin, Double p95DurationMin,
        String lastJobId, String lastClusterName) {}
    public record HistoryEntryDto(String date, String status, Double durationMin) {}
}
// OperationalService additions:
public OperationalSummaryDto summary()                      // mode-aware: same DataRoots resolution as dates()
static Double parseDurationMin(String v)                    // "43m 31sec" -> 43.516...; null if unparseable
static double nearestRank(List<Double> sortedAsc, int pct)  // ceil(pct/100*n)-th smallest, 1-indexed
```

Semantics (exact): iterate `dates()` ascending, group rows by `recipeFilename`; `history` = one entry per date the recipe appears (raw `status` passthrough: `SUCCESS`/`FAILED`/`""` — normalization is the frontend adapter's job); `okCount`/`koCount` count `SUCCESS`/`FAILED` only; `latestDate`/`latestStatus`/`lastJobId`/`lastClusterName` from the last (max-date) row; percentiles/avg over non-null parsed durations (all-null ⇒ the three stats null); `layer` = first L2L entry with `entry.recipe().equals(recipeFilename)`, else `"UNKNOWN"`; recipes sorted by `recipeFilename`. No behavior change to existing endpoints.

- [ ] **Step 1: Fixture prep + failing unit tests.** Append to the 2026_07_02 fixture CSV: `cluster-fix-01,_ETL_m_FIXTURE.json,application_1774840000002_0002,2026-07-02T05:00:00.000Z,20m 00sec,SUCCESS,` (`_ETL_m_FIXTURE.json` IS in the fixture L2L → layer ODS). Update the `service()` helper to `new OperationalService(roots, new LayerToLayerService(roots))` (fixture-mock has a `DWH_CONTROL` tier). New cases — percentile math on known values: `_ETL_m_SYN_ODS_ORDERS.json` → history 2, layer `"UNKNOWN"` (absent from fixture L2L — the UNKNOWN contract), `p50DurationMin` ≈ 10.0, `p95DurationMin` ≈ 14.083 (n=2 nearest-rank: ceil(1)=1st, ceil(1.9)=2nd), `avgDurationMin` within 0.01 of 12.04; `_ETL_m_FIXTURE.json` → layer `"ODS"`, okCount 1, p50==p95==20.0; `_ETL_m_SYN_DM_ORDERS_SUMMARY.json` → latestStatus `""`, okCount 0, koCount 0, durations present.
- [ ] **Step 2: Failing contract test** (`OperationalSummaryContractTest`, same `@SpringBootTest(properties = "etl360.dwh-control-root=/nonexistent-etl360-test-dwh-control") @AutoConfigureMockMvc` pin as `OperationalContractTest`): `GET /api/operational/summary` → 200; `$.dates.length()` = 14; the `_ETL_m_CAS_DWH_EVENTS_FACT.json` entry has layer `DWH`, history length 14, `okCount` 10, `koCount` 4 (3 koDates + incident day), `latestDate` `2026-07-29`, `latestStatus` `FAILED`, non-empty `lastJobId`/`lastClusterName`, `p95DurationMin >= p50DurationMin`.
- [ ] **Step 3: RED** — `mvn -q -am -pl backend test` fails on the new tests only. **Step 4: implement** DTO + service + controller mapping per Interfaces. **Step 5: GREEN.**
- [ ] **Step 6: Regenerate frontend types** (the repo convention needs a running backend): `mvn -q -am -pl backend install -DskipTests && (cd backend && mvn -q spring-boot:run &)`, poll `curl -sf localhost:8080/api/health`, then `make generate-api`, then kill the boot process AND `lsof -ti tcp:8080 | xargs kill -9` (validate_loop.sh teardown idiom); verify `git diff frontend/src/api/types.gen.ts` shows `OperationalSummaryDto`.
- [ ] **Step 7: Hook.** `queries.ts`: `export type OperationalSummary = components['schemas']['OperationalSummaryDto']` + `export const useOperationalSummary = () => useQuery({ queryKey: ['operationalSummary'], queryFn: () => apiGet<OperationalSummary>('/operational/summary'), staleTime: STALE_MS })`. Extend `operational.test.tsx` with a `/api/operational/summary` MSW handler + one resolve case. `cd frontend && pnpm test && npx tsc --noEmit` green.
- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/io/pure360/etl360/api/dto/OperationalSummaryDto.java backend/src/main/java/io/pure360/etl360/service/OperationalService.java backend/src/main/java/io/pure360/etl360/api/OperationalController.java backend/src/test/java/io/pure360/etl360/service/OperationalServiceTest.java backend/src/test/java/io/pure360/etl360/OperationalSummaryContractTest.java backend/src/test/resources/fixture-mock/composer/dwh/config/cluster_tuning/inputs/2026_07_02/b15_application_end_with_recipe_null_status.csv frontend/src/api/types.gen.ts frontend/src/api/queries.ts frontend/src/api/operational.test.tsx docs/superpowers/plans/2026-07-31-operational-casuistics.md
git commit -m "feat(operational): /api/operational/summary — nearest-rank percentiles, UNKNOWN layer, useOperationalSummary hook"
```

---

### Task 6: `relationshipsAdapter.ts` — pure graph→cards adapter

**Files:**
- Create: `frontend/src/api/relationshipsAdapter.ts` (pure, `import type` ONLY — Node strip-types importable, viewer-adapter idiom)
- Test: `frontend/src/api/relationshipsAdapter.test.ts` (mini fixture incl. diamond + fan-in, hand-written inline)

**Interfaces (Tasks 7/8/10 rely on these EXACT signatures):**

```ts
import type { OperationalCard, StatusType } from '../types'
import type { RelationshipGraph, OperationalSummary } from './queries'
export interface OperationalEdge { fromId: string; toId: string; kind: 'source' | 'lookup' | 'writes' }
export interface OperationalGraphView { cards: OperationalCard[]; edges: OperationalEdge[]; layers: string[] }
export function toOperationalGraph(graph: RelationshipGraph, summary: OperationalSummary | undefined,
                                   selectedDate: string | null): OperationalGraphView
export const LAYER_RANK: Record<string, number> = { STG: 0, ODS: 1, DWH: 2, CDM: 3, RDM: 4, QDM: 5, ETL: 6, OUTPUT: 7, UNKNOWN: 8 }
```

Rules (all null-safe; every DTO field optional):
1. **Cards** — one per `graph.nodes[]` entry: `id`=node.id, `kind`, `name`, `layer` (unknown/missing → `'UNKNOWN'`).
2. **Recipe state at the selected date:** find the summary entry by `recipeFilename === node.name`; the governing history entry = the last entry with `date <= selectedDate` **equal-date only** — precisely: the entry with `date === selectedDate`, else no entry ⇒ `PENDING` (dim). Map `SUCCESS→'OK'`, `FAILED→'KO'`, `''→'PENDING'`. `selectedDate === null` ⇒ use `latestStatus`. Table state = derived from its writer recipes at the same date: any `KO` ⇒ `KO`, else any `OK` ⇒ `OK`, else `PENDING`.
3. **`history`**: the summary entry's 14 (or fewer) entries mapped to `StatusType[]` (same mapping); tables get the first writer's history; missing ⇒ `[]`.
4. **`stats`**: `avg_time_s = round(avgDurationMin*60)`, `p50 = round(p50DurationMin*60)`, `p95 = round(p95DurationMin*60)`, `p99 = p95` (nearest-rank p95 and p99 are BOTH rank ceil(.95·14)=ceil(.99·14)=14 for n=14 — mathematically identical, comment it), `avg_count: 0` (no row-count source; honest zero). Nulls ⇒ all zeros (card hides the stats block via its existing `avg_time_s > 0` guard).
5. **`lastRun`** = `${governingEntry.date}T00:00:00Z` (day-granularity data — timeAgo renders hours, acceptable and honest); fallback `latestDate`, else epoch. **`jobId`/`appId`** = `lastJobId` (recipes only; `appId` feeds the card's logging link — the b15 `job_id` IS the YARN application id).
6. **Edges**: passthrough `{fromId: e.from, toId: e.to, kind}`, deduped by `from|to|kind`, dropping edges whose endpoint ids don't exist. **`relations`**: per card, sorted unique neighbor ids from edges (both directions).
7. **Layout** (layer-ordered columns per spec §6; local implementation — `canvasLayout.ts`'s longest-path layering is connection-driven, not layer-driven, so only its stacking discipline is mirrored; note this in a file comment): column index `col = 2*rank + 1` for recipes; tables with an incoming `writes` edge `col = 2*rank + 2`; source-only tables `col = 2*rank`. `x = 40 + col * 320`; within a column order by (average predecessor y, then name), `y = 40 + i * 190`. Rank from `LAYER_RANK` (unknown → 8). This yields strictly left-to-right STG→…→OUTPUT flow incl. the cross-layer skip.

- [ ] **Step 1: Failing tests** — inline fixture: 2 STG head tables, recipes r3/r4 both writing `T_ODS` (fan-in), r5 reading `T_ODS`+`T_REFS` writing `T_FACT` (diamond converge), a lookup table into r3, plus a summary with per-date statuses. Cases: (a) fan-in table KO when one writer KO at date; (b) recipe PENDING when date absent from history; (c) x strictly increases along the chain and `(x-40) % 320 === 0`; (d) p99 === p95 and seconds rounding; (e) edges dedup + relations symmetry; (f) `summary === undefined` ⇒ all PENDING, no throw.
- [ ] **Step 2: RED → Step 3: implement → Step 4: GREEN + `npx tsc --noEmit`.**
- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/relationshipsAdapter.ts frontend/src/api/relationshipsAdapter.test.ts docs/superpowers/plans/2026-07-31-operational-casuistics.md
git commit -m "feat(operational): relationships adapter — cards/edges/layer columns from graph+summary at a date"
```

---

### Task 7: Tab 3 rewiring part 1 — real graph, cards, filters, search, selection panel

**Files:**
- Modify: `frontend/src/components/tab3/ETLOperational.tsx`
- Modify: `frontend/src/mockData.ts:1-2` (header ledger line only — the `OPERATIONAL_CARDS` export STAYS; Tab 4 `ETLDag.tsx:3,407` imports it)
- Test: `frontend/src/components/tab3/ETLOperational.test.tsx` (new, RTL+MSW, own `afterEach(cleanup)`)

**Interfaces:** consumes `useRelationships()` + `useOperationalSummary()` (Task 5) + `toOperationalGraph` (Task 6). Produces: `ETLOperational` renders real data; `selectedDate: string | null` state (this task: `summary.dates.at(-1) ?? null`; Task 8 hands it to the TimePicker).

Behavior spec (exact):
1. Delete the `OPERATIONAL_CARDS` import; `const rel = useRelationships(); const summary = useOperationalSummary()`; `const view = useMemo(() => rel.data ? toOperationalGraph(rel.data, summary.data, selectedDate) : null, [rel.data, summary.data, selectedDate])`.
2. States (Task-12 idiom, existing tokens): `rel.isLoading || summary.isLoading` ⇒ `<div style={{ color: 'var(--text-dim)', fontSize: 12, padding: 16 }}>Loading relationships…</div>`; error ⇒ `--red` title/detail from `ApiError`; `view.cards.length === 0` ⇒ dim empty-hint "No relationship entries".
3. Filtering stays the same four-way logic over `view.cards`; `FilterChips` options become data-driven: Layer `['ALL', ...view.layers]` (from `meta.layers` + `'UNKNOWN'` when present), Kind unchanged, Status `['ALL','OK','KO','PENDING']` (colors map gains `PENDING: '#4a5570'`).
4. `RelationshipGraph` gains an `edges: OperationalEdge[]` prop replacing the internal `buildEdges` relations-derivation (directional arrows already exist); lookup edges add `strokeDasharray="5 4"` (existing dashed visual language); everything else (pan, dot grid, compact <0.65, Clear selection) untouched. `CANVAS_W/H` become computed maxima from card coordinates + margins.
5. `StatusSummary` receives `view.cards` (all, unfiltered). Detail panel: `selectedCard` from `view.cards`; Related list maps `selectedCard.relations` over `view.cards` (unchanged markup); GCP quick links unchanged this task (templated in Task 8).
6. `mockData.ts:2` ledger: `// The filesystem tree, Tab-1 Viewer, and Tab-3 Operational are REAL now; OPERATIONAL_CARDS remains ONLY for Tab 4's DAG panel; other mocks retire with their sub-projects.`

RTL+MSW single-flow test: module-scoped `setupServer` with handlers `/api/relationships` (mini graph: 1 STG table + 1 recipe `_ETL_m_CAS_T.json` + 1 target table, 2 edges), `/api/operational/summary` (dates `['2026-07-28','2026-07-29']`, that recipe OK on 29, KO on 28). Flow: render inside `QueryClientProvider` (retry false) → `await findByText('_ETL_m_CAS_T.json')` → status badge `OK` present → search input narrows to 1 card → layer chip `STG` filters → click card → Details panel shows Related (2) → Clear selection.

- [ ] **Step 1: failing test → Step 2: RED (`pnpm test`) → Step 3: implement per behavior spec → Step 4: GREEN + `npx tsc --noEmit`.**
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/tab3/ETLOperational.tsx frontend/src/components/tab3/ETLOperational.test.tsx frontend/src/mockData.ts docs/superpowers/plans/2026-07-31-operational-casuistics.md
git commit -m "feat(operational): Tab 3 real graph — cards, filters, search, selection from relationships+summary"
```

---

### Task 8: Tab 3 part 2 — real TimePicker dates, stats, GCP links, 14-cell history

**Files:**
- Modify: `frontend/src/components/tab3/ETLOperational.tsx` (TimePicker wiring, GCP link templating; `TimePicker.tsx` itself UNTOUCHED)
- Test: extend `frontend/src/components/tab3/ETLOperational.test.tsx`

Behavior spec (exact):
1. `const dates = useOperationalDates()`; on first data, initialize `selectedDate` to `dates.data.dates.at(-1)` ("Now" = latest snapshot). `TimeSelection.date` binds to `selectedDate`; the date `<input>` gets `min={dates[0]} max={dates.at(-1)}` via the existing `value` plumbing — on change, snap to the NEAREST available date (client-side mirror of the backend's nearest-available rule) before setting state; `isNow`/hour/precision behavior untouched (day-granularity data — hour does not alter card state).
2. Selected date drives the adapter (already parameterized in Task 7) — changing the date flips card statuses per history.
3. GCP links: `const cfg = useAppConfig()`; detail-panel quick links become templated: Logging → `cfg.loggingUrl.replace('{jobId}', card.jobId).replace('{project}', cfg.projectId)`; Monitoring → `cfg.dataprocClusterUrl.replace('{clusterName}', lastClusterName).replace('{project}', cfg.projectId).replace('{region}', cfg.region)` (cluster name threaded through the adapter card via `properties`? NO — keep types stable: read it from the summary entry looked up by `selectedCard.name` in the component); BigQuery link keeps `?project={projectId}`. `target="_blank"` unchanged. Card-level `jobId`/`appId` links already work via Task 6's mapping.
4. History strip: `card.history` now carries up to 14 real cells (`HistoryBar` unchanged — assert cell count).

RTL additions (same file, same flow style): MSW `/api/operational/dates` (`{dates:['2026-07-28','2026-07-29'], mode:'mock'}`) + `/api/config` handler (URL templates with `{jobId}`/`{project}` placeholders). Assert: date input shows `2026-07-29` initially and card is `OK`; `fireEvent.change` to `2026-07-28` flips the badge to `KO`; select the recipe card and assert the Logging quick-link `href` contains the fixture `lastJobId` and project id; `container.querySelectorAll` on the history strip yields 2 cells (fixture) — plus one summary-fixture card asserting a 14-entry strip renders 14 cells.

- [ ] **Step 1: failing assertions → Step 2: RED → Step 3: implement → Step 4: GREEN + `npx tsc --noEmit`.**
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/tab3/ETLOperational.tsx frontend/src/components/tab3/ETLOperational.test.tsx docs/superpowers/plans/2026-07-31-operational-casuistics.md
git commit -m "feat(operational): real TimePicker dates drive card state — history strip, templated GCP links"
```

---

### Task 9: Preview overlay — full-window recipe canvas + raw JSON

**PREREQUISITE GATE (spec §9, explicit):** this task needs Stream A's `recipeToCanvas` (`frontend/src/api/recipeAdapter.ts`) and the shared `EtlCanvas` ON THIS BRANCH. The controller merges the then-current `main` (or Stream A branch state) into the worktree branch FIRST: `git merge main` (expected overlaps: `scripts/validate_loop.sh` append-only, docs ledgers). Verify `test -f frontend/src/api/recipeAdapter.ts` and `grep -q recipeToCanvas frontend/src/api/recipeAdapter.ts`. If absent: SKIP to Tasks 10–11, return here after the merge, and record the resequencing in this task's commit body.

**Files:**
- Create: `frontend/src/components/tab3/PreviewOverlay.tsx`
- Modify: `frontend/src/components/tab3/ETLOperational.tsx` (detail panel "Open preview" button + overlay state; table card ⇒ writer recipe resolution)
- Test: extend `frontend/src/components/tab3/ETLOperational.test.tsx`

**Interfaces:**

```ts
export function PreviewOverlay({ recipePath, mappingPath, onClose }:
  { recipePath: string | null; mappingPath: string | null; onClose: () => void }): JSX.Element
```

Behavior spec (exact):
1. Affordance: "Open preview" button (existing `GCPLink`-style row markup, no new tokens) in the detail side panel. Recipe card ⇒ `recipePath = node.mappingPath + '/_ETL_' + name` — NO: the summary/graph already carry it — resolve as `recipePath = card.mappingPath ? \`${card.mappingPath}/${card.name}\` : null` using the graph node's `mappingPath` (recipe dir) + `name` (recipe filename). Table card ⇒ its writer recipe = the `from` of the first `writes` edge into the table, then same resolution.
2. Overlay: fixed full-window layer (`position: fixed, inset: 0, zIndex: 100, background: 'rgba(10,12,20,0.85)'`) hosting a `var(--surface)` panel with header (recipe filename, ✕ button), a read-only shared `EtlCanvas` rendering `recipeToCanvas(recipe.parsed ?? JSON.parse(recipe.content), recipePath)` (match `RecipeDto`'s actual field at implementation time — it serves raw content; parse defensively, empty graph on failure per the adapter's contract), and a right Raw JSON pane: pretty-printed recipe with `CopyButton` (existing component). `Esc` keydown and ✕ both call `onClose`; overlay unmounts fully (Tabs 1/2 untouched — no shared state).
3. XML fallback: recipe fetch 404 AND `mappingPath` known ⇒ `useMappingModel(mappingPath)` + `toCanvas(model, mappingPath)` with a dim one-line banner "recipe missing — showing XML model" (existing `--text-dim`).
4. Data: `useRecipe(recipePath ?? '')` — add `enabled: !!path` to `useRecipe` in `queries.ts` (same sanctioned data-layer tweak precedent as `useMappingModel`).

RTL flow: MSW `/api/recipes/ODS/m_CAS_T/_ETL_m_CAS_T.json` returning a minimal recipe (`steps` + `table` per Stream A's fixture shape). Select recipe card → click "Open preview" → `await findByText` of a step/target name inside the overlay canvas AND a raw-JSON substring → `fireEvent.keyDown(document, { key: 'Escape' })` → overlay gone. Second assertion: select the TABLE card → preview resolves the writer recipe (same MSW handler hit).

- [ ] **Step 1: merge gate verified → Step 2: failing test → Step 3: RED → Step 4: implement → Step 5: GREEN + `npx tsc --noEmit`.**
- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/tab3/PreviewOverlay.tsx frontend/src/components/tab3/ETLOperational.tsx frontend/src/components/tab3/ETLOperational.test.tsx frontend/src/api/queries.ts docs/superpowers/plans/2026-07-31-operational-casuistics.md
git commit -m "feat(operational): full-window preview overlay — shared EtlCanvas of the recipe + raw JSON, Esc closes"
```

---

### Task 10: `relationships_sweep.mts` — every casuistic gated in validate-loop

**Files:**
- Create: `scripts/relationships_sweep.mts`
- Modify: `scripts/validate_loop.sh` (append TWO steps after the viewer sweep, before frontend tests — append-only for trivial Stream-A merges)

```ts
// scripts/relationships_sweep.mts — run: node --experimental-strip-types scripts/relationships_sweep.mts
// Asserts every spec §7 casuistic against the live /api/relationships + /api/operational/summary.
import { toOperationalGraph } from '../frontend/src/api/relationshipsAdapter.ts'

const BASE = process.env.ETL360_API ?? 'http://localhost:8080'
const fetchJson = async (p: string) => {
  const r = await fetch(`${BASE}${p}`)
  if (!r.ok) { console.error(`relationships_sweep: ${p} HTTP ${r.status}`); process.exit(1) }
  return r.json()
}
type Edge = { from: string; to: string; kind: string }
type Node = { id: string; kind: string; name: string }
const g = await fetchJson('/api/relationships') as { nodes: Node[]; edges: Edge[] }
const summary = await fetchJson('/api/operational/summary') as
  { dates: string[]; recipes: { recipeFilename: string; latestStatus: string; history: { date: string; status: string }[] }[] }

const fails: string[] = []
const check = (name: string, ok: boolean) => { if (!ok) fails.push(name); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`) }

const ids = new Set(g.nodes.map(n => n.id))
check('no duplicate node ids', ids.size === g.nodes.length)
check('no dangling edges', g.edges.every(e => ids.has(e.from) && ids.has(e.to)))

const writersOf = (t: string) => g.edges.filter(e => e.kind === 'writes' && e.to === t).map(e => e.from)
const writesOf = (r: string) => g.edges.filter(e => e.kind === 'writes' && e.from === r).map(e => e.to)
check('fan-in: CAS_ODS_EVENTS has >=2 writer recipes', writersOf('table:CAS_ODS_EVENTS').length >= 2)
check('1->N: SPLIT recipe has >=2 write targets', writesOf('recipe:_ETL_m_CAS_ETL_EVENTS_SPLIT.json').length >= 2)
check('source-only table: CAS_STG_UNREFERENCED has no writer',
  ids.has('table:CAS_STG_UNREFERENCED') && writersOf('table:CAS_STG_UNREFERENCED').length === 0)
check('consumer-less recipe: CAS_DWH_ORPHAN_METRICS table feeds nothing',
  g.edges.every(e => !(e.from === 'table:CAS_DWH_ORPHAN_METRICS' && (e.kind === 'source' || e.kind === 'lookup'))))
check('lookup edge into ODS EVENTS recipe', g.edges.some(e =>
  e.from === 'table:CAS_LKP_STATUS' && e.to === 'recipe:_ETL_m_CAS_ODS_EVENTS.json' && e.kind === 'lookup'))

const adj = new Map<string, string[]>()
for (const e of g.edges) { const a = adj.get(e.from) ?? []; a.push(e.to); adj.set(e.from, a) }
const bfsPath = (from: string, to: string, banned: Set<string>): string[] | null => {
  const prev = new Map<string, string>(); const q = [from]; const seen = new Set([from])
  while (q.length) {
    const cur = q.shift()!
    if (cur === to) { const p = [to]; while (p[0] !== from) p.unshift(prev.get(p[0])!); return p }
    for (const nx of adj.get(cur) ?? []) if (!seen.has(nx) && (!banned.has(nx) || nx === to)) { seen.add(nx); prev.set(nx, cur); q.push(nx) }
  }
  return null
}
const chain = bfsPath('table:CAS_STG_L_EVENTS', 'table:CAS_OUT_EVENTS_FEED', new Set())
check('>=6-hop STG->OUTPUT path', !!chain && chain.length - 1 >= 6)

const dest = 'recipe:_ETL_m_CAS_DWH_EVENTS_FACT.json'
const pathA = bfsPath('table:CAS_STG_L_EVENTS', dest, new Set())
const bannedMid = new Set((pathA ?? []).slice(1, -1))
const pathB = bfsPath('table:CAS_STG_L_REFS', dest, bannedMid)
check('diamond: two disjoint paths converge on DWH_EVENTS_FACT', !!pathA && !!pathB)

const bySummary = new Map(summary.recipes.map(r => [r.recipeFilename, r]))
const fact = bySummary.get('_ETL_m_CAS_DWH_EVENTS_FACT.json')
const anchor = summary.dates.at(-1)
check('KO on anchor date for DWH_EVENTS_FACT', anchor === '2026-07-29'
  && fact?.history.find(h => h.date === anchor)?.status === 'FAILED')
const casRecipes = g.nodes.filter(n => n.kind === 'recipe' && n.name.startsWith('_ETL_m_CAS_'))
check('12 CAS recipes in graph', casRecipes.length === 12)
check('every CAS recipe has 14 history entries',
  casRecipes.every(n => bySummary.get(n.name)?.history.length === 14))

const view = toOperationalGraph(g as never, summary as never, anchor ?? null)
check('adapter: finite layout + no dangling view edges',
  view.cards.every(c => Number.isFinite(c.x) && Number.isFinite(c.y))
  && view.edges.every(e => view.cards.some(c => c.id === e.fromId) && view.cards.some(c => c.id === e.toId)))

console.log(`relationships_sweep: ${fails.length === 0 ? 'PASS' : `FAIL (${fails.length})`}`)
process.exit(fails.length ? 1 : 0)
```

`validate_loop.sh` additions (after the viewer sweep line, before `pnpm test`):

```bash
echo "[validate-loop] mock_etl_data --check…"
node --experimental-strip-types scripts/mock_etl_data.mts --check || fail "mock_etl_data drift"
echo "[validate-loop] relationships sweep…"
node --experimental-strip-types scripts/relationships_sweep.mts || fail "relationships sweep"
```

- [ ] **Step 1: write script + wire the two steps.** Verify the adapter import loads under strip-types (`relationshipsAdapter.ts` must be `import type`-only — it is, by Task 6's contract).
- [ ] **Step 2: run `make validate-loop` end-to-end** — expect `viewer_sweep: 81/81`, `mock_etl_data --check` clean, `relationships_sweep: PASS` with every `ok` line printed, anchor-date checks green, frontend tests green. Any FAIL names its casuistic: fix data via the SKILL workflow (manifest → emit → floors), never by editing generated blocks.
- [ ] **Step 3: Commit**

```bash
git add scripts/relationships_sweep.mts scripts/validate_loop.sh docs/superpowers/plans/2026-07-31-operational-casuistics.md
git commit -m "feat(casuistics): relationships_sweep gate — all CAS shape assertions + --check wired into validate-loop"
```

---

### Task 11: Docs + acceptance sweep (spec §8)

**Files:**
- Modify: `docs/superpowers/specs/2026-07-31-operational-casuistics-design.md` (one "Implementation deviations" footnote: L2L floor 31→33 — two multi-target mappings need two rows each per the SYN bridge idiom; task-order note if Task 9 was resequenced; `gen_b15_history.py` frozen rule)
- Modify: `docs/architecture.md` (endpoint table row for `GET /api/operational/summary`; one Tab-3 line in the frontend section)
- Modify: `frontend/AGENTS.md` (ledger: Tab 3 real — `useRelationships`/`useOperationalSummary`/`useOperationalDates` + `relationshipsAdapter`; `OPERATIONAL_CARDS` remains only for Tab 4)
- Modify: root `CLAUDE.md` — frontend line (Tab 3 real), corpus caveats: CAS family note (12 `m_CAS_*` mappings are generated from `scripts/mock_etl_data.manifest.json` — regen ONLY via `make cas-gen`/`--emit`, floors 81/86/33) + the frozen-`gen_b15_history.py` hazard, testing section: `relationships_sweep` + `--check` in validate-loop
- Create: `docs/adr/0008-manifest-driven-cas-mock-data.md` (MADR-lite, ≤30 lines: manifest-as-matrix, real-parser recipes, surgical marker/strip-append emission, frozen python generator; numbered 0008 to leave 0007 for Stream A's recipes-as-truth ADR)

- [ ] **Step 1: Walk spec §8's eight criteria**, recording PASS/FAIL each with evidence:
1. Tab 3 renders the real graph (boot `make dev` once; verify SYN + CAS cards, filters/search/zoom/selection — RTL evidence + manual spot-check; visual side-by-side deferred to human sign-off per the standing Task-12 ruling, record as such).
2. TimePicker walks the 14 dates; spot-check `_ETL_m_CAS_DWH_EVENTS_FACT.json` KO on 07-18/21/23/29 against the CSVs.
3. Preview overlay: recipe → canvas + raw JSON; table → writer recipe; Esc closes; `git diff --stat main.. -- frontend/src/components/tab1 frontend/src/components/tab2 frontend/src/components/tab4` shows no Tab-1/2/4 component churn beyond the merge base.
4. `relationships_sweep` green inside `make validate-loop` (fresh full run).
5. `viewer_sweep: 81/81` (same run).
6. Full suite: `pnpm test`, `npx tsc --noEmit`, `make test`, `make check`, `make validate-loop` — all green.
7. Skill committed; `--check` exit 0; re-run `--emit l2l` + `--emit b15` → `git status` clean (idempotency evidence).
8. Docs updated (this task's own edits).
- [ ] **Step 2: Fix small reds, re-run, commit** — the commit body carries the criterion-by-criterion record:

```bash
git add docs/superpowers/specs/2026-07-31-operational-casuistics-design.md docs/architecture.md frontend/AGENTS.md CLAUDE.md docs/adr/0008-manifest-driven-cas-mock-data.md docs/superpowers/plans/2026-07-31-operational-casuistics.md
git commit -m "chore: Tab 3 operational + CAS casuistics acceptance sweep — spec criteria verified"
```

(`--allow-empty` if criteria passed without fixes; tick the final checkboxes; explicit staging only.)

---

### Critical Files for Implementation

- /Users/serna/IdeaProjects/pure-scala-ipc-360/scripts/mock_etl_data.mts (new — generator core every data task depends on)
- /Users/serna/IdeaProjects/pure-scala-ipc-360/backend/src/main/java/io/pure360/etl360/service/OperationalService.java (summary endpoint home)
- /Users/serna/IdeaProjects/pure-scala-ipc-360/frontend/src/components/tab3/ETLOperational.tsx (the rewired tab)
- /Users/serna/IdeaProjects/pure-scala-ipc-360/frontend/src/api/relationshipsAdapter.ts (new — pure graph→cards mapping, shared with the sweep)
- /Users/serna/IdeaProjects/pure-scala-ipc-360/backend/src/main/resources/mock/DWH_CONTROL/LAYER_TO_LAYER/ODS/statements.sql (representative L2L emission target + row-format ground truth)