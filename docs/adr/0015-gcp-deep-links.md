# ADR-0015: One GCP deep-link builder, run-anchored, matrix-safe

**Status:** Accepted

## Context

The b15 rows carried `app_id` and `job_id` with the same value — a redundant field, not
two facts. `OperationalCard` built its Dataproc/Logging console URLs from hardcoded
bases rather than the served config templates, and the Logging URL it produced was
rejected by the console with "Failed to load default log scope": Cloud Logging needs a
`cursorTimestamp` to scope its default view, which nothing supplied.

## Decision

Exactly one link builder module (`frontend/src/api/gcpLinks.ts`) reads the served
`AppConfigDto` templates (`dataprocJobUrl`, `dataprocClusterUrl`, `loggingUrl`,
`bigQueryUrl`), falling back to a byte-mirrored constant only if `/api/config` has not
resolved yet — no component builds a console URL by hand. `app_id` is removed rather
than repaired; `{cursorTimestamp}`/`{duration}` are added to the configurable logging
template, sourced from a run's `app_start_iso` and a configurable
`gcpLoggingDuration` (default `P31D`). One shared `RunPicker` component (Tab 3's cards
and Tab 4's Operational State both use it) decides which execution's timestamp and job
id the links open, so "which run do these links point at" has a single answer across
both tabs.

Two encoding rules in `fillGcpUrl` are load-bearing and must not be "simplified" away:

1. **Matrix-safe encoding.** The Logging URL's `cursorTimestamp`/`duration` placeholders
   land inside a `;key=value` path-matrix segment, not a query string. A blanket
   `encodeURIComponent` turns the RFC-3339 colons in a timestamp into `%3A`, which the
   console does not accept there — those two placeholders keep their literal colons.
2. **Empty-segment collapse.** An unfilled `;cursorTimestamp=` must be removed entirely,
   never emitted bare — that is what lets the link degrade to the job-id-only query
   (the shape that already works) when no run is selected, instead of degrading to a URL
   the console rejects.

Both rules are unit-tested in `gcpLinks.test.ts`.

## Consequences

- A deployment changes its console URLs by editing `application.yml` templates, not
  frontend code.
- `grep -rn "console.cloud.google.com" frontend/src` outside `gcpLinks.ts` and its test
  returns nothing — acceptance criterion 12.
- No real project id, job id, cluster name, or cursor timestamp appears anywhere in this
  ADR, the tests, or the corpus — only placeholder templates (`{project}`, `{jobId}`,
  `{clusterName}`, `{cursorTimestamp}`, `{duration}`).

## Alternatives considered

- **Percent-encode everything uniformly** — simpler, but breaks the Logging URL's matrix
  segment the console actually parses; rejected in favor of a small, explicitly-tested
  exception list.
- **Emit an empty `;cursorTimestamp=` when no run is selected** — keeps the template
  structurally uniform but produces a URL shape the console has already been observed to
  reject; collapsing the segment instead degrades to a shape known to work.
- **A link builder per tab** — Tab 3 and Tab 4 would drift on which run's timestamp wins;
  one shared `RunPicker` avoids a second definition of "the selected run" entirely.

---
*MADR-lite: keep each ADR ≤ 30 lines. One decision per file. Number sequentially;
never renumber or delete a filed ADR — mark it Superseded instead.*
