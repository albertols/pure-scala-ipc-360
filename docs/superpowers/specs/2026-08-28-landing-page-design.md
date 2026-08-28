# ETL 360 Landing Page — Readiness, Mascot, Architecture — Design (sub-project 11)

**Date:** 2026-08-28 · **Branch:** `feat/etl360-landing` · **Status:** approved by user (session 2026-08-28)

## 1. Goal & context

Opening `http://localhost:8443` drops the user straight onto Tab 1's file tree. There is no
introduction, no statement of what the suite is, and — more practically — no single place that
answers "is this thing pointed at my data, and is it working?" That question currently requires
opening Tab 3 and reading the `DataRootsPanel` in an empty state (ADR-0013), i.e. discovering the
diagnosis only after hitting the symptom.

This sub-project adds a landing page that answers it on arrival, and does so with some personality:
the project's mascot is the readiness indicator, not decoration beside one.

This is Feature 1 of the two the user raised on 2026-08-27. Feature 2 (cluster-scoped operational
loading, sub-project 10) shipped first by the user's choice, and that ordering pays off here: the
counts this page needs now come from endpoints that are cheap, because bounding them was that
sub-project's whole purpose.

## 2. Non-goals

- **No router.** `frontend/package.json` runtime dependencies stay exactly `@tanstack/react-query`,
  `react`, `react-dom`. The landing page is a `view` state in `App.tsx`, in the same spirit as the
  existing `?focus=` single-parameter idiom — not a routing system.
- **No animation, charting, or diagram library.** Animation is CSS keyframes; the architecture
  diagram is hand-authored SVG. Nothing is rendered from mermaid at runtime or at build time.
- **No GitHub API.** `gh` is not installed on the target machine and the API is not reachable from
  the app. "Feature progress and backlog" is sourced from the repository itself, which is the
  honest source anyway: the plan checkboxes are the project's own progress ledger (`CLAUDE.md`,
  working practices).
- **No changes to the four tabs' internals.** Only `App.tsx` gains the view switch.
- **No new backend data.** `/api/readiness` aggregates values other services already compute; it
  introduces no new parsing of the corpus, the control schema, or b15.
- **No parser changes.** No file under `parser/src/main/scala` is modified.

## 3. Ground truth

Measured in this repo on 2026-08-28, not assumed.

| Fact | Value | Source |
|---|---|---|
| Corpus counts available | `xmlCount`, `recipeCount`, `ddlCount`, `dirCount`, `layers[]` | `SummaryDto`, served by `GET /api/summary` |
| Operational totals available | `clusters`, `recipes`, `dates`, `rows` + `mode` | `ClusterIndexDto.TotalsDto`, `GET /api/operational/clusters` (3.7 KB on the mock) |
| Data-root diagnosis available | per-root `resolved`, `tier`, `status`, `hint` + overall `status` | `DiagnosticsDto`, `GET /api/diagnostics` (ADR-0013) |
| DAG/workflow count | **not** currently served anywhere | — |
| `workflow` lives on | `LayerToLayerEntryDto.workflow` | control-schema column 4 |
| Distinct workflows in the committed mock | **23** | `grep -ho "'wf_[A-Za-z_]*'" mock/DWH_CONTROL/LAYER_TO_LAYER/*/statements.sql \| sort -u \| wc -l` |
| `LayerToLayerService.entries()` cost | mtime-cached; no graph build | `LayerToLayerService` |
| Plan checkboxes in repo | **601** total, **596** done, **5** open | `cat docs/superpowers/plans/*.md \| grep -c '^- \['` |
| ADRs in repo | **16** | `ls docs/adr/0*.md \| wc -l` |
| Future-tab stubs already declared | **2** (`ETL Tuner`, `ETL Agents`) | `FUTURE_TABS` in `App.tsx` |
| Repo-root resolution helper | `RepoRoot.resolve(Path startDir)` (static) | `backend/.../config/RepoRoot.java` |
| Mascot source image | 1024×1024 PNG, **1,769,197 B** | `sips -g pixelWidth -g pixelHeight` |
| Frontend bundle today | 448 KB (124 KB gzipped) | `pnpm build` |
| Image tooling on this machine | **`sips` only** — no `cwebp`, ImageMagick, Pillow, `pngquant` | `command -v` sweep |
| Mascot at 600px, JPEG q80 | **151,095 B** (no alpha channel) | `sips -Z 600 -s format jpeg` |
| Mascot at 600px, PNG | 671,694 B (alpha-capable) | same |
| Design tokens available | `--blue --green --teal --purple --yellow --orange --pink --red --cyan` + surfaces/text | `frontend/src/index.css` |
| Existing sanctioned animation | exactly one `@keyframes` (`spinner-rotate`) | `index.css:77`; ADR-0005 calls it "an animation utility, not a new design token" |

**Two consequences of the tooling facts**, which shaped §5 and must not be re-litigated later:

1. **WebP is not producible here.** PNG-with-alpha at a usable size (672 KB) is heavier than the
   entire current bundle. JPEG at 151 KB is the only viable format, and JPEG has no alpha.
2. **The source image is a complete scene, not a cut-out sprite** — mascot, cypress avenue, sky,
   grass. Compositing it onto hand-drawn vector scenery would layer a photograph over vector art.

## 4. What the user asked for, and where each part lands

| Request | Section |
|---|---|
| "introduction / landing page … before we jump into the main Tabs view" | §6, §8 |
| animated mascot, pruning → relaxed with jacuzzi and bubbles | §5 |
| "General paths and config.json" | §6.4 |
| counts of `_ETL_*.json`, `.xml`, operational days, recipes, number of DAGs | §4.1, §6.1 |
| "brief introduction what's expected from each tab" | §6.2 |
| "feature progress, backlog … according to the github repository" | §6.3 (repo-sourced — see §2) |
| clickable architecture diagram with icons, reused in the README | §7 |
| "click and go", impactful transition, same style and palette | §8, §9 |

### 4.1 The DAG count is the only genuinely new number

Every other statistic is already served. `dags.workflows` is the count of distinct non-blank
`workflow` values across `LayerToLayerService.entries()` — **23** on the committed mock.

This matters: Tab 4 derives its DAG clusters from `workflow` on the *full* relationships graph
(`toDagClusters`). Computing the count that way would pull the entire graph — the payload
sub-project 10 exists to bound. Counting from `entries()` instead is a mtime-cached map scan with
no node or edge construction.

## 5. The mascot scene

**Approach (user decision, 2026-08-28):** the user's image is the hero **backdrop**; the mood is
carried by animated SVG overlays and a CSS colour grade rendered *over* it.

**Asset.** `sips -Z 600` then `-s format jpeg -s formatOptions 80`, committed to
`frontend/src/assets/mascot-hero.jpg` at ~151 KB. Vite handles the import. The 1.77 MB original is
never committed.

**Motion.** A slow ken-burns drift (`transform: scale()` + `translate()`, ~20 s loop) so the hero
breathes rather than sitting static. Over it, an inline SVG overlay whose contents depend on
readiness:

| `readiness.status` | Overlay | Grade |
|---|---|---|
| `ok` | rising bubbles, curling steam | warm, saturated |
| `degraded` | falling twigs, a shear glint | cooler, desaturated, harder vignette |

Both overlays are SVG shapes animated with CSS keyframes, following the precedent ADR-0005 set for
`spinner-rotate`. All colours come from existing tokens; the grade is a CSS `filter`
(`saturate`/`hue-rotate`/`brightness`), not a new palette.

**The limitation, stated plainly:** the character's **pose does not change between moods** — he is
baked into the photograph. The mood reads through the environment and the grade. The alternative
(a pure-SVG redraw, in which his stance changes) was offered and declined in favour of keeping the
user's own image. Do not "fix" this later by silently substituting drawn art.

**Reduced motion.** Under `prefers-reduced-motion: reduce`, the ken-burns loop and every overlay
animation stop and hold a static frame. The mood distinction (overlay contents and grade) remains,
because it carries information.

## 6. The page

Five components, each with one responsibility, all reading one payload.

### 6.1 `StatsGrid`
Corpus counts (XMLs, recipes, DDLs, layers), operational totals (clusters, recipes, days, b15 rows)
and the DAG count. Large numerals in `--text`, labels in `--text-muted`, `Intl.NumberFormat` for
thousands separators. This is the "prelude of what's coming".

### 6.2 `TabPreview`
One card per tab — name, accent colour, and one line on what it does — plus the two `FUTURE_TABS`
stubs rendered as "coming soon". **Sourced from the `TABS`/`FUTURE_TABS` arrays already declared in
`App.tsx`**, lifted into a shared module rather than duplicated, so the landing page cannot drift
from the tab strip.

### 6.3 `ProgressStrip`
`tasksDone / tasksTotal`, ADR count, and a shipped-vs-planned split. Presented as progress, not as
a percentage-complete claim about the product.

### 6.4 `EnvironmentPanel`
The resolved absolute path and tier for each data root, plus the GCP project and region from
`/api/config` — the user's "show the current config.json used". Reuses `DataRootsPanel`'s existing
presentation idiom rather than inventing a second one. When a root is unhealthy, its `hint` from
`/api/diagnostics` is shown, which is the same string ADR-0013 already surfaces in Tab 3.

### 6.5 `ArchitectureDiagram`
See §7.

## 7. Architecture diagram

Hand-authored inline SVG depicting the real pipeline — IPC Powermart XML → `parser/` (Scala) →
recipes/DDL JSON → `backend/` (Spring Boot, in-JVM parser per ADR-0001) → `frontend/` (React), with
the data roots (corpus, DWH_CONTROL, composer) and the GCP surfaces (BigQuery, Dataproc, Cloud
Logging) the app links into. Icons are drawn as SVG paths in the existing palette.

- **In the app:** embedded inline so its regions are real `<button>`s. Clicking a region enters the
  app **on the tab that owns it** (e.g. the recipes node → Tab 2, the b15/composer node → Tab 3).
- **In the docs:** the same artwork committed as `docs/img/etl360-architecture.svg` and referenced
  from `README.md`. GitHub renders SVG natively, so no raster export and no build step.
- `docs/architecture.md`'s existing mermaid diagrams stay as they are — they are the precise
  reference; this is the illustrated overview. The spec does not replace one with the other.

## 8. Entry, exit, and the transition

`App.tsx` gains `view: 'landing' | 'tabs'`, initialised to `'landing'`.

- `?focus=<recipePath>` continues to bypass the shell entirely, exactly as today — focus mode never
  sees the landing page.
- Entry to the tabs: the primary button, the `Esc` key, or clicking an architecture-diagram region
  (which enters on that region's tab).
- **Always shown on load** (user decision), with skipping made fast rather than remembered. Nothing
  is persisted: there is no "skip intro" flag, which also means there is no persisted value that can
  wedge the first screen — a hazard this codebase has already met once
  (sub-project 10, corrupt `density` white-screening Tab 3).
- The transition is ~400 ms of `opacity` and `transform` only — no layout-affecting properties — and
  is skipped entirely under `prefers-reduced-motion`.

## 9. Visual contract

Additive, under ADR-0005. Existing tokens only; no new design token. The landing page is a new
surface, and its sanctioned departures are:

1. **A full-viewport hero image** — the first raster asset in the app.
2. **Animated SVG overlays and a ken-burns drift** — new `@keyframes`, following the `spinner-rotate`
   precedent that animation utilities are not design tokens.
3. **A CSS `filter` colour grade** on the hero, driven by readiness.
4. **An illustrated architecture diagram** with icon artwork, which no existing surface has.

## 10. API changes

| Method | Path | Change |
|---|---|---|
| GET | `/api/readiness` | **new** — one aggregate: `status`, `corpus`, `operational`, `dags`, `roots`, `progress` |

```
{ "status": "ok" | "degraded",
  "corpus":      { "xml": 81, "recipes": 86, "ddl": 212, "dirs": 119, "layers": ["CDM","DWH",…] },
  "operational": { "clusters": 21, "recipes": 30, "days": 14, "rows": 417, "mode": "mock" },
  "dags":        { "workflows": 23 },
  "roots":       [ { "name": "corpus", "resolved": "…", "tier": "real", "status": "ok",
                     "hint": null } ],
  "progress":    { "tasksDone": 596, "tasksTotal": 601, "adrs": 16,
                   "shipped": [ … ], "planned": [ … ] } }
```

`status` is derived from `DiagnosticsService`'s existing overall status — the landing page does not
compute a second opinion about health. `progress` is **nullable**: see §11.

`frontend/src/api/types.gen.ts` is regenerated via `make generate-api`, never hand-edited.

## 11. Backend structure

- **`ReadinessController`** — `GET /api/readiness`, DTO assembly only.
- **`ReadinessService`** — composes `CorpusService.summary()`, `ClusterIndexService.index().totals()`,
  `DiagnosticsService`, and the workflow count from `LayerToLayerService.entries()`. Calls
  `ClusterIndexService.index()` **once** per request: `index()` invokes `B15Reader.fingerprint()`, a
  stat sweep per dated export, and a repeated call is a mistake sub-project 10 already made and fixed
  (ADR-0014).
- **`ProgressScanner`** — globs `docs/superpowers/plans/*.md` counting `- [x]` / `- [ ]`, and counts
  `docs/adr/0*.md`, resolving `docs/` against `RepoRoot.resolve(...)`. Cached on a directory
  fingerprint (mtime + size), the idiom `B15Reader` and `DomService` already use.

  **It must return `null` rather than throwing when `docs/` is absent.** A packaged deployment need
  not ship documentation, and a landing page that 500s because `docs/` is missing would be absurd —
  the page renders every other section and simply omits progress.

## 12. Gates & testing

**Backend (JUnit)**
- `ReadinessServiceTest` — counts against the committed corpus and mock (81/86/212 corpus,
  21/30/14/417 operational, **23** workflows); `status` mirrors `DiagnosticsService`; `index()` is
  called exactly once per request.
- `ProgressScannerTest` — counts `- [x]`/`- [ ]` across a temp docs tree; **returns `null` for an
  absent `docs/`**; fingerprint invalidation when a plan file changes.
- `ReadinessControllerTest` — shape, `200`, and that a degraded diagnostics state produces
  `status: "degraded"` with the failing root's `hint` present.

**Frontend (vitest)**
- `Landing.test.tsx` — stats render from the payload; the mascot overlay flips with `status` **in
  both directions**; a degraded payload names the failing root and shows its hint; Enter, `Esc` and
  a diagram-region click each reach the tabs, the last on the region's own tab.
- `reducedMotion.test.ts` — asserts every animated landing class has a rule inside a
  `@media (prefers-reduced-motion: reduce)` block.

  > **Corrected during planning.** This originally read "under `prefers-reduced-motion: reduce`
  > no animation classes are applied". That test cannot exist: reduced motion is handled in CSS,
  > not by a JS branch, so the classes are always applied and the media query disables them — the
  > more robust design, since it responds to the OS setting changing at runtime with no re-render.
  > jsdom computes no media queries, so a component test observes nothing. The regression that can
  > actually happen is someone adding a keyframe without its counterpart, and that is what the test
  > pins. The rendered result is confirmed in the browser pass.
- `ArchitectureDiagram.test.tsx` — every clickable region maps to a real `TabId`.
- `readinessQueries.test.ts` — hook shape and error state.
- `App.test.tsx` — landing is the initial view; `?focus=` bypasses it entirely.

**Sweeps**
- `make validate-loop` gains a `/api/readiness` curl asserting the committed-mock floors (corpus
  81/86/212, operational 21/30/14/417, **23** workflows) — a real floor beside the existing ones.

**Browser acceptance**
A Chrome pass over the rendered result: both mascot moods (forced by pointing a data root at a
non-existent path), the transition, diagram clicks, and reduced-motion. Screenshots to `docs/img/`,
captured against the committed mock tiers only.

## 13. ADR

- **ADR-0016 — landing page readiness aggregate.** Why one endpoint rather than four client calls;
  why the DAG count is derived from L2L entries rather than the relationships graph; why the backend
  reads `docs/` for progress and why that read is nullable; and why the mascot is bound to readiness
  rather than looping independently.

## 14. Data-handling rule

The landing page displays **resolved filesystem paths and a GCP project id** — real values from the
user's `config.json` on a real deployment. They are rendered at runtime from the served config and
must never be committed: no path, project id, or hostname from any real environment may appear in a
test, fixture, doc, ADR, screenshot, or commit message. Screenshots for `docs/img/` are captured
against the committed mock tiers only, and reviewed for identifiers before committing — the same
rule sub-project 10 followed.
