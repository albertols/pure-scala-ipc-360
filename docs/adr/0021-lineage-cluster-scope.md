# ADR-0021: The lineage is cluster-scoped, and every crossing is named

**Status:** Accepted. Supersedes the "Not cluster-scoped" decision of ADR-0020; every other
ADR-0020 decision stands.

## Context

ADR-0020 refused to scope the lineage:

> **Not cluster-scoped.** Truncating lineage at the current selection would draw a
> complete-looking flow that is not one.

That reasoning is sound and this ADR does not dispute it. What changed is evidence. On a real
IPC export, one seed reports `101 upstream · 23 downstream · 150 nodes` and
`⚠ showing 150 of 14535`, spread over 21 clusters — of which the operator's SELECTED cluster
contributed one node. The "purposeful slice" ADR-0020 promised is, at that scale, the corpus.

An unscoped flow is therefore also truncated — at an arbitrary hop distance — and its truncation
is far less legible than a boundary that names itself.

## Decision

`GET /api/operational/lineage` takes `cluster` (absent = unscoped, `auto` = server-resolved, or a
name) and `prefer` (the caller's selection, read only under `auto`).

- **Scope is `{seed} + recipes(C) + every table adjacent to one of them`.** b15 groups recipe
  runs, so a table has no cluster of its own; a literal "node whose clusters contain C" filter
  would return recipes and zero edges, because recipes only ever connect through tables.
- **Gateways answer ADR-0020's objection.** A recipe outside C touching an in-scope table is
  returned with `gateway: true`, drawn as a stub naming its recipe and its cluster, and never
  walked through. The flow does not quietly stop at the cluster edge — it says where the chain
  continues and offers to go there. Nothing looks complete where it is not.
- **The seed is always in scope.** Asking for a cluster the seed has no relationship to yields
  the seed plus its gateways rather than a 400, because a 400 dead-ends the UI exactly when the
  operator is lost.
- **Unscoped stays the default.** With no `cluster`, the response is what ADR-0020 specified,
  byte for byte. All ten of `LineageContractTest`'s original tests pass unedited.
- **`clusterOptions` is the SEED's clusters**, not every cluster the lineage touches. Reaching a
  distant cluster is a gateway walk; a 21-item switcher would move the wall from the canvas into
  the chrome.
- The recipe↔table join this needs already existed inline in `ClusterController` for ADR-0019's
  `/search`. It is now `service/support/TableClusters.java`, read by both — never copied.

## Consequences

- The flow is legible on a real export, and its boundary is a named, clickable node.
- Status, edges and preview follow the ACTIVE cluster, so a card's OK/KO describes the cluster
  being drawn rather than the one selected in the left rail.
- Scoping cannot be done client-side: the client holds at most `limit` nodes, and filtering those
  by cluster returns whatever fraction of C fell inside the nearest hops of the unscoped walk —
  not the scope, and indistinguishable from a complete answer.

## Alternatives considered

- **Client-side filter of the unscoped response** — free, and wrong for the reason above.
- **Hide out-of-cluster neighbours entirely** — the cleanest canvas, and precisely the
  complete-looking-but-incomplete flow ADR-0020 refused.
- **Render the far-side recipes in full instead of as stubs** — shows more, but each drags in its
  own clusters and re-imports the sprawl being fixed.
