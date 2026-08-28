# How to run ETL 360 on your own data

This is the setup guide for anyone who has their **own** Informatica PowerCenter
exports — the Powermart XMLs, the b15 job-history CSVs, the `LAYER_TO_LAYER` control
statements — and wants the app to browse *those* instead of the anonymized sample
corpus committed to this repo.

No code changes are needed. The whole job is: install four tools, write one git-ignored
config file, run the parser once over your XMLs, boot, and verify. Budget 20 minutes on
a machine that already has a JDK.

The three data roots are **independent and optional** — point at what you have, and the
tabs it feeds light up. Everything you leave unset keeps serving the committed
synthetic sample data.

---

## 0. What you bring, and what it lights up

| You provide | Config field | Powers |
|---|---|---|
| IPC Powermart XML exports (+ parser output next to them) | `xmltobqPath` | Tab 1 *IPC ETL Viewer*, Tab 2 *ETL Modifier* |
| b15 "application end" CSV history | `composerRoot` | Tab 3 *ETL Operational*, Tab 4 *ETL DAG* (run history, clusters) |
| `LAYER_TO_LAYER` control-schema statements | `dwhControlRoot` | Tab 3 + Tab 4 relationships graph, layer attribution |

> **The one failure mode that looks like success.** A data root that is missing — *or
> present but not carrying the substructure its reader needs* — does not error. It
> silently falls back to the committed synthetic mock tier, and the app renders
> plausible-looking `SYN`-marked fake data. Section 5's verification step is how you
> find out which tier you are actually on; do not skip it.

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| JDK | **17+** | Backend and `spring-boot-maven-plugin` both refuse older. The parser targets JDK 11 bytecode but builds fine on 17+. |
| Maven | **3.9+** | |
| Node | **22+** | 22.6+ if you run `make validate-loop` — its sweep scripts use `node --experimental-strip-types`. |
| pnpm | **9+** | `corepack enable` is the least-friction install. |

**On a locked-down corp machine, the friction is dependency resolution, not the app:**

- Maven needs your internal mirror in `~/.m2/settings.xml` (Nexus/Artifactory) if
  Maven Central is blocked.
- pnpm needs your internal npm registry in `~/.npmrc`.
- If your shell profile pins an older JDK, you do **not** need to fight it —
  `scripts/dev.sh` probes `JAVA_HOME` for its real version, ignores it when it is
  below 17, and auto-detects a usable JDK (`/usr/libexec/java_home -v 17`, then an
  IntelliJ-bundled JBR). Override explicitly with `javaHome` in `config.json` if
  auto-detection picks the wrong one.

**At runtime the app makes no outbound network calls.** The GCP project id and region
are used only to build `href` deep links to the Cloud Console — nothing is sent to
Google, there is no `gcloud` auth step, no BigQuery access, and no credentials of any
kind are read. See section 7 if you need this in writing for a review.

---

## 2. Clone and configure

```bash
git clone <this repo> && cd pure-scala-ipc-360
cp config.example.json config.json     # config.json is git-ignored — yours to edit
$EDITOR config.json
```

```json
{
  "xmltobqPath":    "/abs/path/to/your/xmltobq",
  "composerRoot":   "/abs/path/to/your/composer",
  "dwhControlRoot": "/abs/path/to/your/DWH_CONTROL",
  "gcpProjectId":   "your-gcp-project-id",
  "gcpLoggingDuration": "P31D",
  "layerToLayerTable": "CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG",
  "layerDirs":      ["STG", "ODS", "DWH", "CDM", "RDM", "QDM", "ETL", "OUTPUT"],
  "javaHome":       "",
  "nodeBin":        ""
}
```

| Field | Feeds | Meaning |
|---|---|---|
| `xmltobqPath` | `ETL360_CORPUS_ROOT` | Root of the XML corpus + parser output (§3.1) |
| `composerRoot` | `ETL360_COMPOSER_ROOT` | Root of the composer export holding b15 CSVs (§3.2) |
| `dwhControlRoot` | `ETL360_DWH_CONTROL_ROOT` | Root of the control-schema export (§3.3) |
| `gcpProjectId` | `ETL360_GCP_PROJECT` | Project id for Dataproc/Logging/BigQuery deep links |
| `gcpLoggingDuration` | `ETL360_GCP_LOGGING_DURATION` | Cloud Logging's `duration` window, ISO-8601 (default `P31D`) — how far back the log-scope link looks from a run's cursor timestamp |
| `layerToLayerTable` | `ETL360_L2L_TABLE` | The control table your `INSERT INTO … VALUES` statements target (§3.3). The default is an **anonymized** sample value — yours will differ |
| `layerDirs` | `ETL360_L2L_LAYER_DIRS` | Layer directory names under `LAYER_TO_LAYER/` (§3.3). Array or comma-separated string |
| `javaHome` | `JAVA_HOME` | JDK 17+ home; empty = auto-detect |
| `nodeBin` | `PATH` | A Node `bin/` directory; empty = auto-detect |

**Absolute paths are taken as-is**, so your data can live entirely outside the repo —
nothing has to be copied in, and nothing of yours can end up in a commit. Relative
paths resolve against the repo root (the first ancestor holding both `pom.xml` and
`parser/`), not the shell's current directory.

`config.json` is entirely optional: with no file at all, the app boots on the committed
sample corpus and mock operational tiers.

**Not exposed in `config.json`:** the GCP *region* (`ETL360_GCP_REGION`, default
`europe-southwest1`). If your Dataproc region differs, set it in `.env` or export it —
see §8.

---

## 3. Expected data layouts

Each root is checked for the specific substructure its reader needs. Get these paths
wrong and you land in the silent mock fallback from §0.

### 3.1 Corpus — `xmltobqPath`

```
<xmltobqPath>/<LAYER>/m_NAME.xml                  # IPC Powermart export (.xml or .XML)
<xmltobqPath>/<LAYER>/m_NAME/                     # parser output, next to the XML
    _ETL_m_NAME.json                              #   the recipe        → Tab 2
    <TABLE>.json                                  #   BigQuery DDL      → DDL viewer
    _sqlTranslations_ETL_m_NAME.json              #   Oracle→BQ SQL     → SQL viewer
```

- **Layer names are free-form here.** They are read from the first path segment of
  whatever the walk finds — your layers do not have to be the sample corpus's
  `STG ODS DWH CDM RDM QDM ETL OUTPUT`. (This is *not* true of the control-schema
  export; see §3.3.)
- Both `.xml` and `.XML` are matched, case-insensitively.
- The XML alone is enough for Tab 1 — the backend parses it in-JVM on request. The
  `_ETL_*.json` recipes must exist **on disk** for Tab 2, which is what §4 produces.
- `_history/` subdirectories (written by Tab 2's save) and `_layout_*.json` sidecars
  are deliberately excluded from every corpus walk; you will never see them in the tree.

### 3.2 Composer / b15 job history — `composerRoot`

```
<composerRoot>/dwh/config/cluster_tuning/inputs/<YYYY_MM_DD>/b15_application_end_with_recipe_null_status.csv
```

- The **entire** `dwh/config/cluster_tuning/inputs` chain must exist, or the root is
  rejected as unusable and the mock tier takes over.
- Date directories must match `YYYY_MM_DD` exactly (underscores, zero-padded). Anything
  else in `inputs/` is ignored.
- The CSV filename is matched literally, character for character.
- Columns are read **by header name**, so column order does not matter, but the names do:

  ```
  cluster_name,recipe_filename,job_id,app_start_iso,avg_job_duration_in_mins_sec,status,message
  ```

- `avg_job_duration_in_mins_sec` is parsed as `43m 28sec`; anything unparseable becomes
  a null duration rather than a fabricated zero (it is excluded from the average and
  percentile stats).
- `status` is compared literally against `SUCCESS` and `FAILED` for the OK/KO counters.
  Any other value still renders as a row but counts as neither.
- `recipe_filename` is the join key back to your corpus (`_ETL_m_NAME.json`) and to the
  control-schema rows. A b15 row whose recipe has no `LAYER_TO_LAYER` entry still shows
  up — its layer reads `UNKNOWN`.
- `cluster_name` is now indexed across the whole history, not just read one date at a
  time — `ClusterIndexService` groups every row by it, and that grouping is the key Tab 3's
  cluster pane loads by (`docs/adr/0014-b15-cluster-index.md`). If your export's cluster
  names are not stable across days (e.g. a fresh Dataproc cluster id per run), each day's
  rows land in their own cluster instead of accumulating into one — you will see one pane
  row per run rather than one row per recurring job.

### 3.3 Control schema / relationships — `dwhControlRoot`

```
<dwhControlRoot>/LAYER_TO_LAYER/<LAYER>/statements.sql
```

Each file holds one or more statements of this shape. Parsing is balanced-paren and
quote-aware, so whitespace and line breaks inside a statement are fine — but the
`--` annotations below are **for this document only**; a real row carries no SQL
comments (the reference files ship one statement per line):

```sql
INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES (
  'DWH',                                     -- layer
  'src/main/resources/xmltobq/DWH',          -- source dir (informational)
  '_ETL_m_X.json',                           -- recipe filename  ← join key
  'wf_X',                                    -- workflow
  'TARGET_TABLE',                            -- target
  3,                                         -- order
  [STRUCT('SRC_TABLE', true, 0)],            -- sources
  ['LKP_X'],                                 -- lookups
  [STRUCT('TARGET_TABLE', 'TRUNCATE_INSERT')],
  [STRUCT('TARGET_TABLE', 'DAILY', 'LOAD_DATE', 'UNKNOWN_SUBPARTITION')]
)
```

Three constraints here — one hard, two configurable:

1. **`LAYER_TO_LAYER/` must exist under the root.** A control-schema export from before
   that layout (e.g. one holding only `2.1.STG_TO_ODS/` folders) is rejected — this is
   deliberate, because such a root used to win the "real" tier and then serve an empty
   relationships graph with no explanation. This one is not configurable.
2. **The layer directory names** default to `STG ODS DWH CDM RDM QDM ETL OUTPUT`. A
   `statements.sql` under any other directory name is skipped. If your control schema uses
   different layer names, set `layerDirs` in `config.json` (array or comma-separated string):

   ```json
   "layerDirs": ["RAW_ZONE", "STG", "ODS", "CURATED"]
   ```
3. **The control table name** defaults to `CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG` — which
   is an **anonymized sample value**, not IPC vocabulary. Only statements beginning
   `INSERT INTO <that table> VALUES` are parsed; yours almost certainly names a different
   table, so set `layerToLayerTable`:

   ```json
   "layerToLayerTable": "CTL.YOUR_LAYER_TO_LAYER_CONFIG"
   ```

   You do not have to guess it: `GET /api/diagnostics` (and Tab 3's own panel) reports the
   `INSERT INTO` identifiers actually found in your files. See §5.

Neither (2) nor (3) errors when wrong — the scan simply matches nothing and Tab 3 renders
an empty graph, which is what §5's diagnostics check exists to catch.

A malformed individual row is skipped and logged (`Skipping malformed LayerToLayer row`)
without failing the rest of the file; the count is surfaced as `skippedRows`.

---

## 4. Generate recipes from your XMLs

A raw Powermart export contains XML only. Tab 1 works immediately, but Tab 2 reads
`_ETL_*.json` recipes from disk, so run the parser once:

```bash
mvn -q -pl parser compile exec:java \
  -Dexec.args="--xmlPath /abs/path/to/your/xmltobq \
               --generateDDLContent --generateRecipe --generateTargetDDL --generateSourceDDL"
```

One run covers the whole tree: the walk recurses into every layer subdirectory and
matches both `.xml` and `.XML`.

Four things to know before you run it:

- **Output is written next to each input XML** — the parser mutates your export
  directory in place. If that directory is read-only, shared, or precious, copy it
  first and point `xmltobqPath` at the copy.
- **`--generateDDLContent` must accompany** `--generateTargetDDL`/`--generateSourceDDL`,
  or the DDL files are written empty.
- **`--xmlPath` must be a *directory* if you pass an absolute path.** An absolute path
  to a single XML file silently matches nothing and parses zero files (the resolver
  prefixes the working directory unconditionally). To parse one file, pass a path
  relative to the directory you launch `mvn` from.
- Never run this against `parser/src/main/resources/xmltobq` in the repo — use
  `make regen-corpus`, which works on a temp copy and diffs.

If you plan to use Tab 2's **save / history / rollback**, the corpus directory must be
writable: each save archives the pre-edit version to
`<recipeDir>/_history/<base>.<timestamp>.json` before writing.

---

## 5. Boot and verify

```bash
bash scripts/dev.sh --check-config    # dry run: prints the resolved config table, exits
make dev                              # backend :8080 + frontend :8443, Ctrl-C stops both
```

`--check-config` prints exactly what the backend will resolve, including a `mode` per
root that mirrors the server's own fallback logic:

```
[1/4] config resolution
  xmltobq      /abs/path/to/your/xmltobq (config.json)
  DWH_CONTROL  /abs/path/to/your/DWH_CONTROL (config.json, mode real)
  composer     /abs/path/to/your/composer (config.json, mode real)
  gcp-project  your-gcp-project-id (config.json)
  JAVA_HOME    /path/to/jdk-17 (auto (java_home))
  node         /path/to/node (auto (toolchain))
```

Then confirm against the running server — **this is the step that catches the silent
fallback**:

```bash
curl -s localhost:8080/api/health   # xmlCount, recipeCount, dwhControlMode, composerMode
curl -s localhost:8080/api/config   # gcpProjectId, region, dwhControlMode, composerMode, corpusRoot
```

Read it like this:

- `corpusPresent: true` and an `xmlCount` / `recipeCount` matching your export → §3.1 is right.
- `dwhControlMode` / `composerMode` = **`real`** → your data. **`mock`** → you are looking at
  synthetic sample data; re-check the paths in §3.2 / §3.3. **`absent`** → neither your
  root nor the committed mock mirror is usable.

**The one command that answers "why is it empty?":**

```bash
curl -s localhost:8080/api/diagnostics | python3 -m json.tool
```

It reports, per root, what you configured, where it resolved, which tier won, and — for the
control schema — a deliberately **staged** set of counts. The first one that reads zero is the
step that failed, and each has a different fix:

| Reads zero | Means | Fix |
|---|---|---|
| `presentDirs` | `LAYER_TO_LAYER/` has no subdirectories | wrong root — §3.3 |
| `filesRead` (with `unexpectedDirs` non-empty) | your layer dirs are named something else | `layerDirs` — §3.3 (2) |
| `anchorHits` | your control table is named something else | `layerToLayerTable` — §3.3 (3); `insertTargetsFound[]` tells you the value to use |
| `rowsParsed` (with `rowsSkipped` > 0) | rows match but are malformed | check the row grammar above |

The same report renders in the GUI: Tab 3 carries a `data: real\|mock\|absent` chip at all
times, and when the graph is empty it expands the whole report under *No relationship entries* —
including the resolved path of the tier actually being read. You never have to leave the app to
find out which root is wrong.

Two more checks worth running once, since they fail quietly rather than loudly:

```bash
curl -s localhost:8080/api/relationships | python3 -m json.tool | tail -8
#   meta.entryCount   → control-schema rows actually parsed (0 = §3.3 is wrong)
#   meta.skippedRows  → malformed rows dropped; should be 0
#   meta.layers       → which configured layer dirs were found

curl -s localhost:8080/api/operational/dates
#   {"dates":["2026-08-20", ...],"mode":"real"}  ← every b15 date dir it accepted

curl -s localhost:8080/api/operational/clusters | python3 -m json.tool | head -8
#   {"mode":"real","dates":[...],"totals":{"clusters":N,"recipes":N,"dates":N,"rows":N},"clusters":[...]}
#   totals.rows == 0 means the composer root RESOLVED but held no b15 CSVs to index — a
#   different failure than composerMode == "absent"/"mock" above.
```

A `recipe` node with `"hasRecipe": false` in the relationships graph means the control
schema references a recipe that is not on disk in your corpus — usually a sign you have
not run §4 yet.

The frontend needs no configuration at all — no env vars, and `/api/*` is hardwired to
proxy `localhost:8080` in `frontend/vite.config.ts`. Override the frontend port with
`PORT` if 8443 is taken.

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `mode mock` despite a configured path | Root exists but lacks its required substructure | §3.2 needs the full `dwh/config/cluster_tuning/inputs` chain; §3.3 needs `LAYER_TO_LAYER/` |
| Tab 3 relationships graph is empty | One of four silent-skip paths — the panel under *No relationship entries* names which | Read the staged counts (§5); usually `layerToLayerTable` or `layerDirs` |
| `anchorHits: 0` with files read | Your control table is not `CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG` | Set `layerToLayerTable` to the value `insertTargetsFound[]` reports (§3.3) |
| `filesRead: 0` with `unexpectedDirs` listed | Your layer dirs are named something else | Set `layerDirs` to those names (§3.3) |
| Tabs 3/4 show `SYN`-marked mappings you have never seen | Committed synthetic mock tier is serving | Check `composerMode`/`dwhControlMode` — see §5 |
| Tree renders, Tab 2 says no recipe | `_ETL_*.json` not generated | Run §4 |
| Parser run reports success but writes nothing | Absolute `--xmlPath` pointing at a single file | Pass the directory instead (§4) |
| Some dates missing from the operational date picker | Directory name is not `YYYY_MM_DD`, or the CSV filename differs | §3.2 |
| A recipe's layer shows `UNKNOWN` | b15 `recipe_filename` has no matching `LAYER_TO_LAYER` row | Expected; add the control row if you want attribution |
| Build fails on JDK version | Corp profile pins an old JDK | Set `javaHome` in `config.json` to a 17+ home; list candidates with `/usr/libexec/java_home -V` |
| Maven/pnpm cannot download dependencies | Corp mirror not configured | `~/.m2/settings.xml`, `~/.npmrc` (§1) |
| `config.json is not valid JSON` | Trailing comma or comment | It is parsed strictly before anything else runs |

---

## 7. What leaves your machine: nothing

Useful when someone has to sign off on running this against internal metadata:

- The app is **read-only over the network**: it serves your local files over
  `127.0.0.1:8080` and makes no outbound requests at runtime.
- The only writes are inside your corpus directory, and only when you explicitly save
  from Tab 2 (recipe JSON + a `_history/` archive sidecar + `_layout_*.json` canvas
  offsets).
- The GCP project id and region are **string interpolation into Cloud Console URLs**
  only. No SDK, no credentials, no API calls.
- `/api/config` deliberately exposes no filesystem layout beyond the corpus root itself.
- `config.json`, `.env`, and real `DWH_CONTROL`/composer exports are git-ignored. The
  only network access needed is dependency download at build time.

---

## 8. Advanced: the `.env` tier and precedence

`config.json` is the recommended entrypoint, but every setting is ultimately an
`ETL360_*` environment variable. Precedence, lowest to highest (ADR-0009):

```
application.yml defaults  <  config.json  <  .env  <  exported shell env
```

Copy `.env.example` to `.env` for the power-user tier — it is the only way to reach the
settings `config.json` does not expose:

| Variable | Purpose |
|---|---|
| `ETL360_CORPUS_ROOT` | Same as `xmltobqPath` |
| `ETL360_DWH_CONTROL_ROOT` | Same as `dwhControlRoot` |
| `ETL360_COMPOSER_ROOT` | Same as `composerRoot` |
| `ETL360_GCP_PROJECT` | Same as `gcpProjectId` |
| `ETL360_GCP_LOGGING_DURATION` | Same as `gcpLoggingDuration` |
| `ETL360_L2L_TABLE` | Same as `layerToLayerTable` |
| `ETL360_L2L_LAYER_DIRS` | Same as `layerDirs` (comma-separated) |
| **`ETL360_GCP_REGION`** | GCP region for deep links — **no `config.json` field** |
| **`ETL360_MOCK_ROOT`** | Where the mock fallback tier lives — **no `config.json` field** |

Note that pointing `composerRoot`/`dwhControlRoot` at the committed mock directories
reports mode `real`, not `mock`: an explicitly configured directory always wins the real
tier. That is intended — it lets you demo on sample data while exercising the real code
path.

---

## Keeping this document honest

Everything above is derived from code, not from memory. When you change one of these,
re-check the section that depends on it:

| Section | Source of truth |
|---|---|
| §1 prerequisites, JDK probing | `scripts/dev.sh`, root `README.md` |
| §2 fields, precedence, path resolution | `config.example.json`, `scripts/dev.sh`, `backend/.../config/Etl360Properties.java`, `backend/.../config/RepoRoot.java`, `docs/adr/0009-config-json-entrypoint.md` |
| §3 root usability + mock fallback | `backend/.../config/DataRoots.java` (`LAYER_TO_LAYER`, `COMPOSER_INPUTS`) |
| §3.1 corpus walk, layer inference, exclusions | `backend/.../service/CorpusService.java` |
| §3.2 b15 filename, date pattern, CSV headers | `backend/.../service/OperationalService.java` |
| §3.3 layer dirs, control table, row grammar | `backend/.../service/LayerToLayerService.java`, `backend/.../config/Etl360Properties.java` (`LayerToLayer`) |
| §4 parser flags, traversal, path quirk | `parser/.../xmltojson/XMLParser.scala`, `parser/.../utils/dir/ScalaFileUtils.scala` |
| §5 verification fields | `backend/.../api/HealthController.java`, `backend/.../api/ConfigController.java`, `backend/.../service/DiagnosticsService.java`, `docs/adr/0013-data-root-diagnostics.md` |
| §5 frontend port/proxy | `frontend/vite.config.ts` |

Related reading: root `README.md` (dev harness, make targets), `docs/architecture.md`
(endpoint table, sequence diagrams), `docs/adr/0009-config-json-entrypoint.md` (config
layering), `docs/adr/0006-synthetic-operational-data.md` (what the mock tier contains).
