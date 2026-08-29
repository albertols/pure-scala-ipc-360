# ADR-0016: One `/api/readiness` aggregate for the landing page

**Status:** Accepted

## Context

The app opened straight onto Tab 1's file tree, with no statement of what the suite is and — more
practically — no single place answering "is this thing pointed at my data, and is it working?"
That question was diagnosable only from Tab 3's `DataRootsPanel` in an empty state (ADR-0013), i.e.
discoverable only after hitting the symptom, not on arrival.

A landing page needs several numbers no single existing endpoint carries together: corpus counts
(`GET /api/summary`), b15 operational totals (`GET /api/operational/clusters`), data-root diagnosis
(`GET /api/diagnostics`), a count of distinct Airflow DAGs, and this repo's own build progress —
nothing served that last one at all.

**Deviation from an earlier draft of this ADR:** "shipped/planned progress" above was written
expecting an itemized shipped-vs-planned split (a `shipped: [...]`/`planned: [...]` pair). What
shipped is a `tasksDone`/`tasksTotal` ratio plus an ADR count (`ReadinessDto.Progress`, §Decision
below) — the backlog is conveyed only as `tasksTotal - tasksDone`, never enumerated. That split was
specified but not built; whether to build it is an open decision for the user, not this branch.

## Decision

**One `GET /api/readiness` aggregate**, assembled by `ReadinessService` from services that already
cache their own work (`CorpusService`, `ClusterIndexService`, `DiagnosticsService`,
`LayerToLayerService`), plus two facts new to this endpoint:

- **The DAG count is `LayerToLayerEntryDto.workflow` distinct-value count**, read from
  `LayerToLayerService.entries()` — **not** derived by grouping the relationships graph the way
  Tab 4's `toDagClusters` does. `entries()` is an mtime-cached map scan with no node/edge
  construction; going through the graph would force materializing the exact payload sub-project 10
  (ADR-0014) exists to bound, just to count workflow names.
- **`progress` comes from `ProgressScanner` reading this repo's own `docs/` tree** — ticked/unticked
  `- [x]`/`- [ ]` checkboxes across `docs/superpowers/plans/*.md`, plus a count of numbered ADRs
  under `docs/adr/` (excluding `0000-template.md`, which is a template, not a decision). `gh` is not
  installed and the GitHub API is unreachable from the app; the plan checkboxes are this project's
  own progress ledger already, by convention (`CLAUDE.md`, Working practices). `ProgressScanner.scan()`
  returns **null**, never throws, when the repo root cannot be resolved (`RepoRoot.resolve` finds no
  `pom.xml`+`parser/` ancestor — true of a packaged deployment that ships only compiled artifacts)
  or `docs/` is absent. `ReadinessService.safeProgress()` additionally guards against any other
  `RuntimeException` `ProgressScanner` might throw (e.g. a plan file deleted mid-scan) — the landing
  page must never 500 because a doc moved.
- **Each `roots[]` entry reports the path that actually SERVED, never the configured path echoed
  back.** For the control schema, that means the mock mirror's path when the mock tier won, not the
  real `dwhControlRoot` that lost — mirroring `DiagnosticsDto`'s own convention (ADR-0013) and
  `DataRootsPanel.tsx`'s `servingPath()`, computed once and reused, not re-derived on the frontend.

**The mascot is bound to `readiness.status`.** The hero image is a single flat photograph — a
cypress-avenue scene the user supplied, not a posable illustration — so mood is carried by an
animated SVG overlay and a CSS colour grade rendered over it, not by swapping the mascot's pose. A
`status` of `"ok"` renders warm and saturated with rising bubbles; anything else — the API's real
`"ko"` (`DiagnosticsService`), or any future third value — renders the mascot's own `degraded`
mood: cooler and desaturated with a harder vignette. (Corrected during the sub-project 11 acceptance
walk: this line originally read `` `ok` renders …; `degraded` renders … ``, implying the API sends
the literal string `"degraded"`. It never has — that word names only the mascot's presentational
mood, `MascotScene`'s `ReadinessStatus`. The frontend's original mapping checked for that exact
string and so silently rendered the relaxed mood for a real `"ko"`, a defect caught in the browser
acceptance walk and fixed by mapping "any non-`ok` status" to `degraded` instead.)

## Consequences

- `progress` is nullable end-to-end: the DTO, the frontend hook, and every consumer must handle
  `null` rather than assume `tasksDone`/`tasksTotal`/`adrs` exist. A deployment without `docs/`
  still renders every other section of the landing page.
- The DAG count can diverge from a number computed by grouping the relationships graph by
  `workflow`, if the two ever disagree — they read the same underlying rows today, but Tab 4's count
  is scoped to whatever subset of the graph is currently loaded (cluster-scoped, ADR-0014) while
  `dags.workflows` is always whole-history. This is intentional, not a bug to reconcile.
- The landing page renders resolved absolute paths and (via `AppConfigDto`) a GCP project id, so its
  screenshots are mock-tier only, same restriction ADR-0015 already places on GCP link screenshots.
- The mascot's pose cannot change between moods — only the overlay and colour grade can. A future
  request for a distinct "degraded" pose would require either a second source photograph or
  revisiting the photograph-backdrop approach entirely.

## Alternatives considered

- **Four client fetches** (summary, clusters, diagnostics, a new DAG-count endpoint) — four loading
  states stacked on the app's first screen, and the DAG count would still need to either read the
  full relationships graph or grow its own bespoke endpoint duplicating `LayerToLayerService`.
- **DAG count from the relationships graph**, the way Tab 4 computes it — pulls the exact
  whole-corpus payload sub-project 10 exists to bound, just to produce one integer.
- **A committed `progress.json`, updated by hand or by a script** — a second source of truth that
  drifts the moment a checkbox is ticked without regenerating it; the plan files are already the
  ledger, so scanning them directly has no staleness window.
- **The GitHub API** — `gh` is not installed on the target machine and the API is not reachable from
  the app in this environment; the repo's own checkboxes are the project's progress record anyway.
- **A persisted "skip intro" flag** — a value that can wedge the first screen if it becomes corrupt,
  the same failure class that once produced a white-screened Tab 3 from a bad persisted `density`
  value. The landing page has no such flag; `?focus=` remains the one documented bypass.
- **A pure-SVG mascot** — offered and declined in favour of the user's own photograph. The
  consequence recorded above (pose cannot change between moods) is the cost of that choice, not an
  oversight.

---
*MADR-lite: keep each ADR ≤ 30 lines. One decision per file. Number sequentially;
never renumber or delete a filed ADR — mark it Superseded instead.*
