# ADR-0020: Lineage is a bounded, unscoped, breadth-first closure

**Status:** Accepted

## Context

"Show all related" shipped as a one-hop neighbour list (spec §6). That answers "what touches
this node". The question an operator has in front of a failed table is "where did this come
from, and what breaks next" — a **path**, not a set. A one-hop list makes you re-open the view
at every step and reassemble the chain in your head, which is the same loss-of-place the
back/forward trail was added to fix.

Two forces pull against each other here. Lineage crosses cluster boundaries by nature: the
recipe feeding your table often runs in another cluster. But ADR-0014 exists precisely to stop
Tab 3 fetching the whole graph, because on a real export that is what made the tab unusable.

## Decision

`GET /api/operational/lineage?node=&limit=` returns one node's transitive upstream **and**
downstream closure, with each node's signed hop distance (negative upstream, `0` seed, positive
downstream).

- **Breadth-first, not depth-first.** The traversal is bounded by a node budget; BFS reaches the
  furthest hops last, so spending the budget cuts the DISTANT lineage and leaves the nearest
  complete. A DFS would exhaust the budget down one arbitrary branch and drop a node one hop
  away — worse than not drawing the view, because the result still looks like a lineage.
- **Traversal state is unbounded; the RESULT is bounded.** Bounding the walk itself leaves
  queued nodes with no recorded hop (the walk needs each node's hop to compute its neighbours').
  The full walk also yields an honest `totalReachable`, so the view says how much it is not
  showing instead of implying completeness.
- **Not cluster-scoped.** Truncating lineage at the current selection would draw a
  complete-looking flow that is not one. This does not reopen ADR-0014: the request is seeded
  from a single node and bounded by node count, so it fetches a *purposeful slice*, never the
  whole graph.
- `limit` defaults to 150, caps at 600; an unknown `node` is a 404 (unlike `/search`'s
  still-typing caller, this caller holds an id this server issued).
- Only edges whose **both** endpoints survived the budget are returned — an edge into a cut node
  would draw an arrow into empty space.

The view lays it out on a **hop-distance** x-axis with the seed centred, not a layer axis:
upstream-vs-downstream is what troubleshooting asks first. Layer stays visible as the chip
colour, from ADR-0017's palette.

## Consequences

- A lineage that crosses clusters is drawn completely, and one that does not fit says so.
- Status still comes from the SCOPED graph, so the flow agrees with the canvas behind it; nodes
  outside the selection render PENDING, which is honest — that snapshot says nothing about them.
- The unscoped `RelationshipService.graph()` is read per lineage request, as `/search` already
  does. If a much larger control schema makes that costly, a persistent adjacency index is the
  next step.

## Alternatives considered

- **Fixed depth (2 hops each way)** — predictable, but cuts a longer chain at an arbitrary
  distance rather than at a stated budget, and cannot say what it dropped.
- **Reuse the loaded scoped graph** — free and instant, but stops at the cluster edge, which is
  exactly where a lineage most needs to keep going.
- **Layer-axis layout** — consistent with the main canvas, but the seed's position varies, so
  "what is upstream of me" stops being readable at a glance.
