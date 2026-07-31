# Visual Guide

What ETL 360 looks like and how its pieces fit together: four diagrams — suite
architecture, per-tab data flow, `config.json` resolution, and the SDD/TDD harness
loop — followed by screenshots of the running app.

This doc owns the diagrams; nothing else in the repo duplicates them. The root
`README.md` links here for the visual overview, and `docs/harness.md` links here (its
§4, "Loop layering") for the harness-loop diagram instead of drawing its own.

## §1 Suite architecture

```mermaid
flowchart LR
  subgraph Browser [":8443 (Vite dev server)"]
    FE["React 19 GUI — 4 tabs"]
  end
  FE -- "/api/* (vite proxy)" --> BE["Spring Boot backend :8080"]
  BE -- "in-JVM calls" --> P["Scala 2.12 parser"]
  BE --> C[("xmltobqPath — IPC XML + recipes + DDL")]
  BE --> D[("dwhControlRoot — LAYER_TO_LAYER/statements.sql")]
  BE --> K[("composerRoot — b15 CSV history")]
  FE -. "deep links (gcpProjectId)" .-> G["GCP console — Dataproc / Logging"]
```

The frontend never talks to the parser or the data roots directly — everything goes
through the backend's read-only REST API. `gcpProjectId` (from `config.json`) only
ever builds outbound deep links into the GCP console; it isn't a credential the suite
uses to call GCP itself.

## §2 Data flow per tab

```mermaid
flowchart TD
  T1["Tab 1 IPC ETL Viewer"] --> E1["/api/mappings/model + /dom"]
  T2["Tab 2 ETL Modifier"] --> E2["/api/recipes (GET/PUT/validate/history)"]
  T3["Tab 3 ETL Operational"] --> E3["/api/relationships + /api/operational/*"]
  T4["Tab 4 ETL DAG"] --> E4["/api/relationships"]
  E1 --> R1[("xmltobqPath")]
  E2 --> R1
  E3 --> R2[("dwhControlRoot")] 
  E3 --> R3[("composerRoot")]
  E4 --> R2
```

Each tab owns a distinct slice of the API; `/api/relationships` is the one endpoint two
tabs (3 and 4) share, and `xmltobqPath` is the one data root two endpoints (mappings
and recipes) share.

## §3 config.json resolution (per ADR-0009)

```mermaid
flowchart TD
  A["make dev → scripts/dev.sh"] --> B["source .env (if present)"]
  B --> C{"per ETL360_* key"}
  C -->|"env set"| E["keep (source: env)"]
  C -->|"config.json non-empty"| F["export (source: config.json)"]
  C -->|"neither"| G["application.yml default"]
  A --> H{"javaHome / nodeBin"}
  H -->|"config.json"| I["use — outranks ambient env"]
  H -->|"env / auto-detect"| J["JAVA_HOME · java_home probe ≥17 · JBR / toolchain glob · PATH"]
  E & F & G --> K["Spring reads ${ETL360_*:default} → DataRoots real/mock/absent"]
```

Two independent resolution orders, both driven from the same `scripts/dev.sh` entry
point: data-root env vars layer `env > config.json > application.yml default`, while
toolchain paths (`javaHome`/`nodeBin`) let `config.json` outrank ambient environment —
a pinned toolchain shouldn't lose to whatever happens to be on `PATH`.

## §4 SDD/TDD harness loop

```mermaid
flowchart LR
  S["brainstorm → spec"] --> PL["plan (checkbox tasks)"]
  PL --> I["implementer: RED → GREEN → commit"]
  I --> R["task-reviewer: APPROVE / FIX"]
  R -->|FIX| I
  R -->|APPROVE| N{"more tasks?"}
  N -->|yes| I
  N -->|no| GA["gates: make test / check / validate-loop"]
  GA --> AC["acceptance walk vs spec"] --> M["merge to main"]
```

The `implementer` → `task-reviewer` fix-loop repeats per task until `APPROVE`; only
once every task in the plan has cleared it do the repo-wide gates and the spec
acceptance walk run, before merge. See `docs/harness.md` for what each stage's
subagent contract and gate actually check.

## Screenshots

The seven screenshots below are captured from the running, merged app (this branch's
gated Task 6, after Tasks 1–5 land) — Chrome at roughly 1440×900, backend and frontend
both booted via `make dev`. Until Task 6 lands, the links below are scaffolding: the
images don't exist in `docs/img/` yet.

## Screenshot: Tab 1 — IPC ETL Viewer

![Tab 1 IPC ETL Viewer](img/tab1-viewer.png)

Tab 1, `CDM/m_DM_INFOHUB_BIZLINK` rendered.

## Screenshot: Tab 2 — ETL Modifier

![Tab 2 ETL Modifier](img/tab2-modifier.png)

Recipe canvas + palette.

## Screenshot: Tab 3 — ETL Operational

![Tab 3 ETL Operational](img/tab3-operational.png)

Tab 3 default view.

## Screenshot: Tab 4 — ETL DAG

![Tab 4 ETL DAG](img/tab4-dag.png)

Tab 4 default view.

## Screenshot: Explorer collapsed

![Explorer collapsed to the slim rail](img/sidebar-collapsed.png)

Any tab, Explorer collapsed to the slim rail.

## Screenshot: ETL Modifier mid-edit

![ETL Modifier mid-edit](img/modifier-editing.png)

Tab 2 mid-edit — SaveBar counting, formula textarea open.

## Screenshot: ETL Operational preview overlay

![ETL Operational preview overlay](img/operational-preview-overlay.png)

Tab 3 with the preview overlay open.
