# ADR-0014: A b15 cluster index, and scoping over neighbours instead of a second graph endpoint

**Status:** Accepted

## Context

A real export is ~7 000 recipes and ~5 000 tables. `/api/relationships` had no scope
parameter, so Tab 3 always loaded the whole graph; `OperationalService.summary()`
re-parsed the whole b15 history on every request; and Tab 4 fetched every date to
build its run history. None of the three scale past a mock-sized fixture.

## Decision

Build one fingerprint-invalidated index (`ClusterIndexService`) over the whole committed
b15 history — dates, per-cluster recipe membership, and a recipe→runs map — computed
once and reused by the cluster pane, the calendar, the run picker and the relationships
graph. Scope the **existing** `/api/relationships` endpoint with an optional `?clusters=`
parameter rather than adding a second graph endpoint, and include the 1-hop recipes
adjacent to the selected clusters' tables, flagged `neighbor: true` rather than filtered
out. A neighbour contributes only its own recipe node plus the edges into the tables the
core selection already holds — never a table node of its own; that is true one-hop
scoping, not a second entry point into the graph.

## Consequences

- Tab 3 loads one cluster's slice of the graph instead of the whole corpus, and an
  upstream/downstream failure in an adjacent cluster is still visible as a dimmed
  neighbour rather than silently absent.
- `RelationshipService.graph()` hoists `clusterIndex.index()` to exactly once per scoped
  request. `index()` calls `B15Reader.fingerprint()`, a stat sweep of every dated export
  directory; calling it per recipe instead — which is what looking up a recipe's clusters
  one at a time inside the node loop does — turns a scoped request into roughly
  `2 · dates · recipes` syscalls. The unscoped path never touches `ClusterIndexService`
  at all, which is what keeps its response byte-identical to the pre-scoping shape.
- The first request after any b15 change pays an O(total rows) rebuild of the whole
  index; every request after that is O(1) plus the graph walk itself.

## Alternatives considered

- **TTL cache** — wrong in both directions on a live working directory (stale until the
  TTL expires, or re-read needlessly before it). The repo already has a correct idiom
  for this — mtime/fingerprint invalidation, as `DomService` uses for the XML corpus —
  so the b15 index reuses it rather than inventing a second cache policy.
- **A separate `/api/graph/scoped` endpoint** — would fork the graph-building logic into
  two code paths to keep consistent forever after. Scoping the one existing endpoint
  keeps the unscoped bytes provably unchanged (the scoped branch is simply never taken)
  instead of trusting two implementations to agree.
- **Strict cluster scope, no neighbours** — an upstream failure in a table's other writer
  cluster becomes invisible, which is the main thing an operator scoped to one cluster is
  looking for.
- **Full transitive upstream/downstream** — drags in a large slice of the graph for any
  deeply-chained cluster, defeating the point of scoping at all.
- **Per-cluster ISO date lists** — at real scale, ~115k duplicated date strings across
  clusters. Indices into one global date axis instead, shared by every cluster.

---
*MADR-lite: keep each ADR ≤ 30 lines. One decision per file. Number sequentially;
never renumber or delete a filed ADR — mark it Superseded instead.*
