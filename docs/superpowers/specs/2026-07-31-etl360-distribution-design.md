# Distribution, config.json Entrypoint & Reusable SDD/TDD Harness — Design (sub-project 6)

**Date:** 2026-07-31 · **Branch:** `feat/etl360-distribution` (git worktree `.worktrees/etl360-distribution`, forked from main `85963a9`) · **Status:** approved by user (session 2026-07-30/31)

## 1. Goal & context

A user can `git pull` the repo, fill an entry `config.json` with (a) the path of an
`xmltobq/` folder, (b) a b15.csv history structure (composer inputs dirs), (c) a
hierarchy of `statements.sql` (DWH_CONTROL/LAYER_TO_LAYER), (d) a GCP project id for
console deep links — and then fetch, operate and use all 360 suite tabs frictionlessly.
`scripts/dev.sh` becomes the resolver (with real step/health logging), README gains a
HOW-TO, a DRY visual doc (`docs/visual-guide.md`, mermaid + `.png` screenshots) shows
the suite, and the SDD/TDD practices that built sub-projects 1–5 are packaged as
reusable `.claude/` skills + agents plus `docs/harness.md`, referenced from `CLAUDE.md`.

## 2. Non-goals

- No Docker/packaging/deployment; local `make dev` remains the delivery vehicle.
- No backend config hot-reload — env vars are read at boot, as today.
- No real GCP API calls; `gcpProjectId` feeds console URL templates only
  (`application.yml:12-14`).
- No Windows support. Auto-detect tiers are macOS-flavored (`/usr/libexec/java_home`);
  Linux users use `config.json`/`.env`/env directly.
- No bats/shell test framework (not installed) — `bash -n` + a `--check-config`
  dry-run mode are the shell verification substitute.
- Other streams' features (Tab 2/3/4 internals) — untouched; this stream only makes
  their `gcpProjectId` fallback real and documents/screenshots the merged result.

## 3. Ground truth — the config surface today

- **Backend keys** (`backend/src/main/resources/application.yml:4-14`):
  `etl360.corpus-root` ← `ETL360_CORPUS_ROOT` (default `parser/src/main/resources/xmltobq`),
  `etl360.dwh-control-root` ← `ETL360_DWH_CONTROL_ROOT`, `etl360.mock-root` ←
  `ETL360_MOCK_ROOT`, `etl360.composer-root` ← `ETL360_COMPOSER_ROOT`, and
  `etl360.gcp.project-id` ← **`ETL360_GCP_PROJECT`** (NOT `ETL360_GCP_PROJECT_ID` —
  the real placeholder name at `application.yml:10` is binding for the dev.sh mapping).
- **Path resolution:** relative roots resolve against the auto-detected repo root
  (`Etl360Properties.java:13-17`, `RepoRoot.java:9-18` — first ancestor with `pom.xml`
  + `parser/`). Absolute paths pass through. So `config.json` values can be either.
- **Mode switches:** `DataRoots.java:29-59` — per root, `real` if the configured dir
  exists, else `mock` if `ETL360_MOCK_ROOT/{DWH_CONTROL,composer}` exists, else
  `absent`; computed on demand, no caching. Consequence (accepted): pointing
  `composerRoot`/`dwhControlRoot` *explicitly* at the committed mock dirs serves
  byte-identical data but reports mode `real` (`DataRoots.java:37-43,53-58`).
- **Consumers:** `OperationalService.java:94-98` reads
  `<composer>/dwh/config/cluster_tuning/inputs/<YYYY_MM_DD>/b15_application_end_with_recipe_null_status.csv`
  (filename `OperationalService.java:37`; columns `cluster_name, recipe_filename,
  job_id, app_start_iso, avg_job_duration_in_mins_sec, status, message`,
  `OperationalService.java:106-109`). `LayerToLayerService.java:33` reads
  `<dwhControl>/LAYER_TO_LAYER/<LAYER>/statements.sql` for the 8 layer dirs
  (`LayerToLayerService.java:17`), anchored on
  `INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES` (`:18`, row shape `:72-89`).
- **`/api/config` today:** `ConfigController.java:19-31` serves `AppConfigDto`
  (`projectId, region, dataprocJobUrl, dataprocClusterUrl, loggingUrl,
  dwhControlMode, composerMode, corpusRoot` — `AppConfigDto.java:9-11`), field set
  contract-tested (`ConfigControllerTest.java:29-31`). Frontend: `useAppConfig`
  (`frontend/src/api/queries.ts:32-33`); **zero consumers read `projectId` on main**
  (grep-verified). `types.gen.ts` is generated + committed, refreshed from a running
  backend via `make generate-api` (`Makefile:25-26`, `frontend/package.json:13`,
  convention in `frontend/AGENTS.md`) — never hand-edited.
- **dev.sh today** (`scripts/dev.sh:1-14`): install-then-run (reactor +
  `spring-boot:run` don't mix), plain `[backend]`/`[frontend]` prefixes, no config, no
  health wait. Lines 2-3 are an **uncommitted USER edit** exporting
  `JAVA_HOME="/Applications/IntelliJ IDEA CE.app/Contents/jbr/Contents/Home"` and the
  `~/.local/toolchains/node-v22.23.2-darwin-x64/bin` PATH — proof the committed script
  under-resolves toolchains. Machine evidence for the design: `/usr/libexec/java_home
  -v 17` **returns Azul 11** here (no registered 17+ JVM; java_home falls back to the
  default and exits 0), while the only JDK ≥17 present is the *unregistered* IntelliJ
  JBR 21.0.7 — auto-detection MUST version-probe its result and know the JBR path.
- **Latent `.gitignore` bug:** commit `85963a9` appended `.worktrees/` without a
  preceding newline, yielding the single bogus line
  `parser/src/main/scala/io/pure360/ipc/xmltojson/doc.worktrees/` — neither
  `.worktrees/` nor the `doc` dir is actually ignored (`git status` shows both `??`).
  Repaired in this stream's first task (it edits `.gitignore` anyway).
- **`.env.example` staleness:** lines 21-22 claim composer has "no mock tier — real |
  absent only", contradicted by `DataRoots.java:45-51` (mock tier landed with
  sub-project 2). Fixed in the gated docs task.
- **ADR ledger:** `docs/adr/0001`–`0006` filed; **0007** reserved by Stream A
  (recipes-as-source-of-truth, modifier spec §7) and **0008** by Stream B
  (manifest-driven CAS mock data, operational plan Task ~11). This stream files **0009**.
- **Existing harness pieces:** committed project skills
  `.claude/skills/{regen-corpus,run-app,validate-loop}`; Stream B authors
  `mock-etl-data`. No `.claude/agents/` yet. `.claude/settings.json` is untracked
  user-local. Tab labels for screenshots: `IPC ETL Viewer`, `ETL Modifier`,
  `ETL Operational`, `ETL DAG` (`App.tsx:20,34,45,60`).

## 4. config.json entrypoint

Repo-root `config.json`, **git-ignored** (`/config.json`; `/.env` added too — it was
never ignored). Committed template `config.example.json`:

```json
{
  "xmltobqPath": "parser/src/main/resources/xmltobq",
  "composerRoot": "backend/src/main/resources/mock/composer",
  "dwhControlRoot": "backend/src/main/resources/mock/DWH_CONTROL",
  "gcpProjectId": "my-gcp-project",
  "javaHome": "",
  "nodeBin": ""
}
```

- Empty string (or absent key, or absent file) = skip the tier → auto-detect/default.
  Unknown keys are ignored (forward-compat). **`config.json` is optional: a fresh
  clone boots with ZERO config** — `application.yml` defaults point at the committed
  corpus and the mock fallback tiers.
- JSON has no comments; the field companion is a **README table** (§7) — chosen over a
  separate `docs/` reference because the HOW-TO is where users meet the file. Until
  that gated task lands, `scripts/dev.sh --check-config` self-documents the live resolution.
- **Layering (ADR 0009):** for `ETL360_*` keys, `application.yml` defaults <
  `config.json` < `.env` < shell environment (repo-specific env vars are only ever set
  deliberately, so explicit env wins). For `javaHome`/`nodeBin` the order inverts:
  `config.json` outranks ambient environment — machine-global `JAVA_HOME`/PATH
  toolchains are exactly the noise that broke this repo (Azul 11 default vs required 17+).

Mapping (real names from §3): `xmltobqPath`→`ETL360_CORPUS_ROOT`,
`composerRoot`→`ETL360_COMPOSER_ROOT`, `dwhControlRoot`→`ETL360_DWH_CONTROL_ROOT`,
`gcpProjectId`→`ETL360_GCP_PROJECT`, `javaHome`→`JAVA_HOME`, `nodeBin`→PATH prepend.
`ETL360_MOCK_ROOT`, `ETL360_GCP_REGION` and URL templates stay env/.env-only (power-user).

## 5. dev.sh rewrite

- **One JSON mechanism: python3** (stdlib) — already a hard repo prerequisite
  (`scripts/gen_b15_history.py`, `python3 -m json.tool` in docs/skills); `jq` is NOT
  assumed and NOT used. Malformed `config.json` fails fast with a clear message
  (validated once via `python3 -m json.tool` before any key reads).
- **Resolution:** source `.env` with allexport if present; then per `ETL360_*` var:
  keep env if set, else export the non-empty `config.json` value, else leave unset
  (backend default applies). `JAVA_HOME`: config → env → `/usr/libexec/java_home -v 17`
  **with a `$JAVA_HOME/bin/java -version` major-version probe ≥17** (java_home lies,
  §3) → IntelliJ JBR path if present and probes ≥17 (absorbs the user's local hack
  into committed auto-detection) → warn. `node`: config `nodeBin` → newest
  `~/.local/toolchains/node-v*/bin` (`sort -V`) → PATH. The uncommitted dev.sh edit
  becomes obsolete; the committed script supersedes it (discard noted in the plan).
- **Logging:** step banners `[1/4] config resolution`, `[2/4] backend build`,
  `[3/4] backend boot` (health-wait dots against `/api/health`, 90 s budget),
  `[4/4] frontend`; a resolved-config summary (path + source tier per key, and
  real/mock mode per data root mirroring `DataRoots` dir checks); final port/URL
  summary. ANSI colors only when stdout is a TTY and `NO_COLOR` is unset.
- **`--check-config`:** prints the summary table and exits 0 before any build — the
  scriptable contract the acceptance walk asserts against.
- Boot sequence, install-then-run rationale comment, and Ctrl-C `trap 'kill 0'`
  teardown are preserved from today's script; prerequisite checks (mvn/node/pnpm)
  fail fast with actionable messages.

## 6. gcpProjectId end-to-end

`AppConfigDto.projectId` is **renamed** `gcpProjectId` (not duplicated — zero
consumers on main, §3; parallel streams B/C already code
`config?.gcpProjectId ?? 'mock-project'` defensively, which this rename makes real at
merge). `ConfigController` is positional — no change; `ConfigControllerTest`
`EXPECTED_FIELDS` updates; a new `@SpringBootTest(properties =
"etl360.gcp.project-id=…")` integration test proves property→response (the
`${ETL360_GCP_PROJECT:…}` placeholder at `application.yml:10` proves env→property).
`types.gen.ts` regenerated per repo convention (running backend + `make generate-api`),
never hand-extended. At rebase time, grep for any stream-introduced `projectId` reads.

## 7. README HOW-TO (gated task)

New section "Run the 360 suite on your own data": `git pull` →
`cp config.example.json config.json` → fill 4 data fields → `make dev`. Includes the
config field table (§4 companion) and compact expected-layout blocks, each from §3
ground truth: `xmltobq/<LAYER>/m_NAME.xml` with the parser's `m_NAME/` output dir
(`_ETL_m_NAME.json` recipes + `<TABLE>.json` DDL) next to it, layers
`STG ODS DWH CDM RDM QDM ETL OUTPUT`; composer
`inputs/<YYYY_MM_DD>/b15_application_end_with_recipe_null_status.csv` + column list;
`DWH_CONTROL/LAYER_TO_LAYER/<LAYER>/statements.sql` + one real SCALAMATICA row.
DRY: diagrams live in `docs/visual-guide.md` only — the README links, never duplicates.

## 8. Visual guide + screenshots

`docs/visual-guide.md`: four mermaid diagrams — suite architecture
(frontend↔backend↔parser↔data roots↔GCP links), data-flow per tab (tab → endpoints →
roots), config.json resolution flow, SDD/TDD harness loop — plus a Screenshots section
embedding `docs/img/*.png`. Capture list (7): `tab1-viewer.png`, `tab2-modifier.png`,
`tab3-operational.png`, `tab4-dag.png`, `sidebar-collapsed.png`,
`modifier-editing.png`, `operational-preview-overlay.png`. Capture happens in the
final gated task against the RUNNING merged app, via macOS `screencapture` on a Chrome
window (or in-browser automation if available); **honestly environment-dependent** —
if headless/automated capture is impossible in the executing environment, the task
prints a numbered manual checklist for the human and verifies the delivered files
(`file` reports PNG, non-zero size) before embedding. Screenshots are committed.

## 9. Reusable .claude harness

- **Skills** (superpowers:writing-skills conventions — `name` + third-person
  "Use when…" description ≤1024 chars, no workflow summary in the description):
  - `.claude/skills/sdd-cycle/SKILL.md` — how THIS repo runs
    spec→plan→per-task-TDD→review→fix-loop→gates→acceptance→merge; the
    ledger/checkbox/commit protocol; layer ordering (functional prerequisites →
    data/mock → backend/middleware → GUI → gates); model-tiering guidance.
  - `.claude/skills/tab-rewire/SKILL.md` — the proven mock-tab-to-real recipe:
    adapter-first pure module, fixtures curled from the corpus, RTL+MSW tests, sweep
    gate in `validate_loop.sh`, visual-contract rules, mock-retirement ledger.
  - `mock-etl-data` is **registered by reference** (Stream B authors it) in
    `docs/harness.md` — never duplicated here.
- **Agents** (`.claude/agents/`, Claude Code project-agent format: YAML frontmatter
  `name`/`description`/`tools`, body = system prompt): `implementer.md` (brief-driven,
  RED/GREEN evidence verbatim, declared deviations, report contract) and
  `task-reviewer.md` (read-only tools, fidelity/TDD-honesty/hard-rules/quality checks,
  APPROVE-or-FIX output format with `file:line` evidence).
- **`docs/harness.md`** (chosen over `.claude/README.md` — `docs/` is the repo's
  documented reference tree per CLAUDE.md's layout table; skills point here, DRY):
  the common skills table, the subagents, the loop layering, how
  `make validate-loop`/`make test`/`make check` compose, and a "starting a new
  sub-project" checklist.

## 10. CLAUDE.md practices + ADR 0009

CLAUDE.md gains a short "Working practices" pointer section (harness.md + skills), a
`config.json` line under Build & run, and a dev.sh behavior note — this stream is the
**single owner** of root CLAUDE.md/README edits (parallel streams were told to keep
off). `docs/adr/0009-config-json-entrypoint.md` records the entrypoint + env layering
decision (MADR-lite, ≤30 lines, template `docs/adr/0000-template.md`).

## 11. Streams, sequencing & gates

Tasks 1–4 (config.json + dev.sh + ADR; backend `gcpProjectId`; harness skills/agents/
doc; visual-guide mermaid) run immediately on the branch. Tasks 5–7 (README/CLAUDE.md/
.env.example; screenshots; acceptance walk) are **GATED: they REQUIRE all other
streams merged to main and this branch rebased/merged onto that main first — the
controller gates this** (screenshots must show the merged tabs; root-doc edits must
not race parallel streams).

## 12. Acceptance criteria

1. **Fresh-clone simulation:** with `config.json` moved away, `scripts/dev.sh
   --check-config` shows every key `default`/`auto`, and `make dev` boots both
   processes on committed data (health `UP`, operational dates include `2026-07-29`).
2. **Explicit-config parity:** with `cp config.example.json config.json`, the suite
   serves identical data; `--check-config` shows `config.json` sources; the
   documented mode-label flip (`mock`→`real`, §3) is recorded, not hidden.
3. `/api/config` serves the configured `gcpProjectId` (integration-tested + curl).
4. `bash -n scripts/dev.sh` clean; NO_COLOR and non-TTY output are ANSI-free.
5. README HOW-TO, `docs/visual-guide.md` (4 diagrams + 7 committed screenshots),
   `docs/harness.md`, both skills, both agents, ADR 0009, CLAUDE.md practices all in
   place; `.env.example` composer staleness fixed; `.gitignore` bug repaired.
6. `make test`, `make check`, `make validate-loop` green on the merged branch.
