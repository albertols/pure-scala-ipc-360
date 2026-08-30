# ADR-0019: Operational search joins recipes, tables and clusters server-side

**Status:** Accepted

## Context

ADR-0014 made Tab 3 load only the selected clusters' scoped subgraph, which is what
makes a ~6 700-recipe export usable. It also means the tab cannot answer the first
question an operator asks: *which cluster runs `DWH.DWH_F_CONTR_LTV_RC_D`?* Tab 3's
toolbar input only filters cards already on the canvas, and getting them there requires
already knowing which cluster to pick. Recipe names are in the b15 index, but **table**
names exist only in the L2L relationships graph, which is deliberately never fetched
unscoped — so a client-side search structurally cannot see tables at all.

## Decision

`GET /api/operational/search?q=&limit=` performs the recipe → table → cluster join on
the server, returning each hit with the clusters that reach it: for a recipe, the
clusters it ran in; for a table, the union over every recipe joined to it by an edge in
either direction.

Bounded by construction, so this endpoint cannot re-become the scale problem ADR-0014
solved: `q` shorter than 2 characters returns an empty result, `limit` defaults to 50
and is capped at 200, and an explicit `truncated` flag says when hits were dropped.

A too-short query is **not** an error — the caller is a search box, and erroring on the
first keystroke would flash it red on every use. An over-range `limit` is a caller bug
and does get a 400.

## Consequences

- The top-bar search reaches Tab 3 and works from the no-cluster-selected state, which
  is the state an operator is in when they need it.
- Two searches with two jobs, labelled as such: the top bar searches the whole history;
  Tab 3's toolbar input is relabelled `Filter this canvas…`, which is all it ever did.
- Results are deterministically ordered (recipes then tables, each name-ascending), the
  same guarantee `ClusterIndexService.clustersOf()` already makes.
- The unscoped `RelationshipService.graph()` is read per search request. Acceptable
  today (it is already built for the whole-corpus path and cached upstream); if a much
  larger control schema makes it costly, an inverted name index is the next step.

## Alternatives considered

- **Filter the loaded cluster index client-side** — finds recipes only; tables, the
  hard half of the question, remain invisible.
- **Fetch the whole graph to the client and search it there** — precisely the request
  ADR-0014 exists to prevent.
- **Fold it into `GET /api/operational/clusters`** — overloads an endpoint the tab
  calls unconditionally on load with work only a typing user needs.
