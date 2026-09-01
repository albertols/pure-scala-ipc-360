# Lineage cluster scope — design

**Date:** 2026-08-31
**Sub-project:** 13
**Status:** approved
**Supersedes** exactly one clause of `docs/adr/0020-lineage-flow.md` — "Not cluster-scoped" —
via a new `docs/adr/0021-lineage-cluster-scope.md`. Every other ADR-0020 decision (breadth-first,
bounded result over bounded traversal, both-endpoints-survive edges, hop-distance x-axis) stands
unchanged. Amends no other ADR.

Ground truth for every claim below is cited as `file:line` against the tree at `a65cb67`.

---

## 1. Why

Sub-project 12 shipped the lineage flow (`2026-08-29-operational-clarity-design.md` §13, §15)
and it was then driven against a **real** IPC export. Four defects followed. Three are
presentation; one is a scale defect that makes the view unusable on real data, and it is the
reason this sub-project needs an ADR rather than a bug fix.

### 1.1 The four defects

| # | Symptom | Root cause | Severity |
|---|---|---|---|
| 1 | The `Details` pane is a fixed width; long names clip | `width: 300` / `width: 264` are literals | medium |
| 2 | The flow is an unreadable wall on a real export | lineage is deliberately unscoped (ADR-0020) | **high** |
| 3 | Dragging a card detaches its arrows | drag offsets are applied to cards only, never to edges | high |
| 4 | The lineage `Details` dock lacks Preview and the GCP links | the dock is a second, thinner panel | medium |

### 1.2 The evidence for defect 2

The reported view seeds on `_ETL_m_DWH_E_LKP_JERARQUIA_GESTORES.json` and reports:

```
101 upstream · 23 downstream · 150 nodes
⚠ showing 150 of 14535 — nearest hops complete
Clusters: cluster-wf-dwh-load-4b53afc6-0420 23 · comparator-a-wf-dwh-load-t-04-20-0420 23
          · comparator-b-wf-dwh-load-t-04-20 18 · … 18 more
```

Two numbers matter. **14 535 reachable nodes** is the whole L2L graph in all but name — the
"purposeful slice" ADR-0020 claimed is, on real data, the corpus. And the cluster the operator
actually has selected in the left rail, `cluster-wf-carga-inf-b681b46e-main`, contributes
**1** node to those 150. The budget is spent almost entirely on clusters the operator did not
ask about, and the one they did ask about is a rounding error in the result.

ADR-0020 rejected scoping for a good reason, restated here in full so this document is honest
about what it is overturning:

> **Not cluster-scoped.** Truncating lineage at the current selection would draw a
> complete-looking flow that is not one.

That objection is sound and this design does not dispute it. What it disputes is the premise
that scoping must be *silent*. §3.3's gateway stubs make every cluster crossing an explicit,
named, clickable node, so the flow never looks complete where it is not. The `⚠ showing 150 of
14535` banner is the counter-example that decides it: an unscoped flow is *also* truncated, at
an arbitrary hop distance, and its truncation is far less legible than a stub that says which
cluster the chain continues into.

---

## 2. Non-goals

- **No corpus change.** No XML, recipe, L2L row or b15 CSV is touched. The `m_CAS_*` family is
  manifest-generated and frozen (root `CLAUDE.md`, "Corpus caveats"); no committed mock floor
  moves in this sub-project.
- **No parser change.** Nothing here touches `parser/`.
- **No restyle.** ADR-0005's visual contract holds. Gateway stubs (§3.3) are a new node *state*
  drawn from ADR-0017's existing palette — no new hex enters the codebase, and
  `theme/semanticColors.ts` remains the only file mapping layer/kind/status to a colour.
- **No new persisted server state.** The scoped endpoint is read-only and derives everything from
  indexes that already exist (`RelationshipService.graph()`, `ClusterIndexService.index()`).
- **The unscoped mode is not removed.** `?cluster` absent keeps today's behaviour byte-for-byte,
  so ADR-0020 stays true for every caller that does not opt in, and the existing
  `LineageContractTest` assertions keep holding without edit.
- **Not a cluster browser.** The switcher (§3.6) offers the *seed's own* clusters. Reaching a
  cluster further away is done by walking a gateway stub, not by a global picker — that is
  `ClusterPane`'s job and it already exists.
- **No auth, no write path, no mutation of run history.**

---

## 3. Cluster scope (defect 2)

### 3.1 Ground truth

`backend/.../service/LineageService.java:46` reads the **whole** unscoped graph and BFSes it
with no membership predicate:

```java
RelationshipsDto graph = relationships.graph();
...
for (Step step : adjacency.getOrDefault(current, List.of())) {
    if (hopById.containsKey(step.id())) continue;
    hopById.put(step.id(), hop + step.direction());
    if (kept.size() < limit) kept.add(step.id());
    queue.add(step.id());
}
```

Cluster membership is attached **after** the walk, and only to recipes
(`LineageService.java:99-100`):

```java
List<String> clusters = "recipe".equals(n.kind())
    ? clusterIndex.clustersOf(name) : List.of();
```

So a table carries no cluster at all today. That is the fact that decides §3.2's membership rule:
a literal "node whose `clusters` contains C" filter would return recipes and **zero edges**,
because recipes only ever connect to each other *through* tables.

The recipe↔table↔cluster join that this design needs already exists — inline, in the wrong
place: `backend/.../api/ClusterController.java:224-256` (`tableHits`) builds
`recipeIdsByTableId` from the graph's edges in both directions and unions the adjacent recipes'
clusters. ADR-0019 built it for `/search`.

### 3.2 Membership

For a cluster `C`, the scoped subgraph is:

```
scope(C) = { seed }
         ∪ { r : r.kind = recipe ∧ C ∈ clustersOf(r.name) }
         ∪ { t : t.kind = table  ∧ ∃ edge(t, r) ∨ edge(r, t), r ∈ recipes(C) }
```

Edges are every graph edge with both endpoints in `scope(C)`, which preserves ADR-0020's
"an edge into a cut node would draw an arrow into empty space" rule verbatim.

The BFS is unchanged except that it refuses to *leave* `scope(C)`: a neighbour outside it is
recorded as a gateway (§3.3) and never enqueued. Hop numbering, the budget, `truncated` and
`totalReachable` all keep their ADR-0020 meanings, now measured over the scoped closure.

**The seed is always in scope, unconditionally.** If an operator explicitly asks for a cluster
the seed has no relationship to, the honest answer is the seed alone plus its gateway stubs —
a flow that says "nothing here, but here is where this node does live". A 400 would dead-end
the UI at exactly the moment the operator is lost, which is the state this view exists to fix.

### 3.3 Gateway stubs

A **gateway** is a node outside `scope(C)` that shares an edge with one inside it — usually a
recipe touching an in-scope table, but a table can be the gateway too when the seed itself is a
recipe outside `C`. It is returned as a node with `gateway: true`, carrying its own `clusters[]`,
and the BFS **terminates there** — its own neighbours are never walked.

Gateways are what make this design compatible with ADR-0020's objection. The flow does not
quietly stop at the cluster edge; it draws the edge, names the recipe on the far side, names the
cluster that recipe runs in, and offers to go there. Nothing about the result "looks complete"
where it is not.

Gateways count against `limit` like any other node — they are drawn, so they cost budget. They
sit in a real hop column, so `lineageLayout.ts` needs no change to place them.

### 3.4 Endpoint

`GET /api/operational/lineage?node=&limit=&cluster=&prefer=`

| param | value | meaning |
|---|---|---|
| `node` | node id | unchanged; unknown id is still a 404 |
| `limit` | 1‥600, default 150 | unchanged |
| `cluster` | *absent* | **unscoped — today's response, byte-for-byte** |
| | `<name>` | scope to that cluster |
| | `auto` | the server resolves it (§3.5) |
| `prefer` | comma-separated names | read **only** when `cluster=auto`; ignored otherwise |

An unknown `<name>` is a 400, not a 404: unlike `node`, a cluster name can reach this endpoint
from a URL an operator typed or edited, and the message names what was not found.

`LineageDto` gains three fields:

```
activeCluster    string|null   the cluster actually scoped to; null when unscoped
clusterOptions   [{ name, recipes }]   the SEED's own candidate clusters, for the switcher
nodes[].gateway  boolean               absent/false for an in-scope node
```

`clusterOptions` is the seed's candidates only — its own clusters if it is a recipe, or the
union of its adjacent recipes' clusters if it is a table — ordered by recipe count descending
then name. `recipes` is the cluster's **own** size in the b15 index
(`ClusterIndexService.ClusterEntry.recipes.size()`), not a count within this lineage: it is a
stable property of the cluster, so §3.5's "largest" tie-break does not shift with the budget or
with where the operator happened to seed. It is deliberately **not** "every cluster the lineage touches" (the 21-entry list in
§1.2): reaching a distant cluster is a gateway walk, and a 21-item switcher would reintroduce
the wall in the chrome instead of the canvas.

Determinism is a contract, as it is for `clustersOf()` and `/search`: identical requests answer
identically across restarts, so every ordering above is total.

### 3.5 Resolving `auto`

1. Compute the seed's candidates (as in `clusterOptions`).
2. Return the first candidate that also appears in `prefer` — Tab 3's left-rail selection, so
   the flow opens agreeing with the canvas behind it.
3. Otherwise return the first candidate — the seed's largest cluster.
4. If the seed has no candidates at all, `activeCluster` is `null` and the response is
   **unscoped**. A node in no cluster cannot be scoped by one, and refusing to draw anything
   would be strictly worse than today.

The client cannot do this itself. A table's cluster membership lives only in the L2L graph
joined against the b15 index, which ADR-0014 exists to stop the client fetching unscoped — the
same argument ADR-0019 made for `/search`, and it applies unchanged here.

### 3.6 The view

`LineageFlow.tsx`'s `Clusters:` strip (`LineageFlow.tsx:273-311`) changes job: from a passive
census of everything the lineage touched, to the **switcher** over `clusterOptions`. The active
cluster leads and is outlined; the rest are one click away.

Clicking a switcher entry, or a gateway stub, sets the active cluster and re-seeds — a gateway
click re-seeds on that gateway recipe, since that is the node the operator pointed at. While the
refetch is in flight the canvas is replaced by:

```
Loading from cluster: <name>…
```

This is the user's literal request and it earns its place: a cluster switch is not a filter, it
is a different graph, and a spinner over stale nodes would imply otherwise.

`RelatedOverlay.tsx:55` currently colours the flow from `useScopedRelationships(clusters)` — the
left-rail selection. It changes to the **active cluster**, so status, edges and preview
resolution all describe the nodes actually on screen. Gateway stubs sit outside that graph and
render `PENDING`, which is honest for the same reason ADR-0020 gave: this snapshot says nothing
about them.

### 3.7 Where the join lives

`tableHits`'s `recipeIdsByTableId` construction (`ClusterController.java:229-241`) moves to
`backend/.../service/support/TableClusters.java`, and both `/search` and `/lineage` read it.
Copying it into `LineageService` would create a second source for a corpus-shaped fact, which is
the failure mode root `CLAUDE.md` names repeatedly (`LAYER_RANK`, `semanticColors.ts`,
`B15Status`). `/search`'s observable behaviour must not change: the extraction is proven by the
existing search tests passing untouched.

### 3.8 Why not scope on the client

The client holds at most `limit` nodes — 150 of 14 535 in §1.2. Filtering those by cluster would
return whatever fraction of cluster `C` happened to fall inside the nearest 150 hops of the
*unscoped* walk, which is not `scope(C)` and has no stable relationship to it. Worse, it would
be indistinguishable from a complete answer. Scoping must move the budget, which means it must
happen where the walk happens.

---

## 4. Edge anchoring under drag (defect 3)

### 4.1 Ground truth

`LineageFlow.tsx:114-117` applies drag offsets to cards:

```ts
const at = (p: PlacedNode) => {
  const o = offsets[p.id]
  return { x: p.x + (o?.dx ?? 0), y: p.y + (o?.dy ?? 0) }
}
```

`LineageFlow.tsx:383-388` draws edges from the layout's **precomputed** points, which `at()`
never touches:

```ts
{layout.edges.map((e, i) => {
  ...
  const shifted = e.points.map(p => ({ x: p.x + RAIL_W, y: p.y }))
```

`e.points` is fixed at layout time by `lineageLayout.ts:266-283`'s `anchor()`, from the default
positions. So a dragged card moves and its arrows stay behind — exactly the reported symptom.

### 4.2 Design

A new **pure** function in `lineageLayout.ts`:

```ts
export function applyOffsets(
  layout: LineageLayout,
  offsets: Record<string, { dx: number; dy: number }>,
): LineageLayout
```

It returns a new layout with offset node positions and, for every edge, first and last points
re-anchored off the moved endpoints — reusing the same `anchor()` rule (right edge for `out`,
left edge for `in`, vertical centre) so a dragged card's arrow meets it exactly where an
undragged one does.

It belongs in `lineageLayout.ts`, not in the component, because that file is where every
geometric claim in this view is unit-tested against the corpus, and because `applyOffsets({})`
must be identity — which is what keeps `reset layout` (`LineageFlow.tsx:263`) exactly
`layoutLineage`'s output, as ADR-0020's "the default has to be excellent on its own" requires.

### 4.3 Why interior waypoints stay put

An edge spanning more than one column travels a reserved lane through dummy nodes
(`lineageLayout.ts:128-161`) — 50 of 81 real lineages have one, and the lanes exist so a long
edge does not vanish behind the cards in between. Re-anchoring the endpoints while leaving the
interior waypoints alone can bend such an edge oddly if a card is dragged far. Dropping the
waypoints instead would straighten it — back through those cards, re-creating the exact defect
routing was built to fix. The bend is the cheaper cost, and it is the honest one: the arrow
still lands on the card.

---

## 5. Details parity (defect 4)

### 5.1 Ground truth

Two panels render the same idea with different content:

| | Tab 3 panel (`ETLOperational.tsx:1216-1361`) | lineage dock (`LineageFlow.tsx:516-581`) |
|---|---|---|
| card | `OperationalCard` + runs + `RunPicker` | `OperationalCard`, no runs |
| clusters | — | listed |
| hop | — | listed |
| ⌖ centre lineage | — | yes |
| Related list + ◀ ▶ | yes | — |
| Preview | yes | **no** |
| GCP links ×3 | yes | **no** |

### 5.2 One shared component

`frontend/src/components/shared/NodeDetails.tsx`, rendered by both hosts. It carries the card
with run history and picker, ⌖ centre-lineage, clusters, hop, the Preview button and the three
GCP links. Host-specific pieces are props, not forks: Tab 3 passes the `Related` list and
`Show all related ↗`; the lineage dock passes `onReseed` for ⌖ and the hop line.

This is the same anti-drift argument `RelatedOverlay` already makes for its own two render sites
(`RelatedOverlay.tsx:15-17`: "They cannot drift because they are the same component"). The
`Related (n)` list is deliberately **not** in the dock: the flow the operator is looking at
already is that list, in a better form.

### 5.3 Where the dock's data comes from

- **Runs** — `useRuns` (`api/clusterQueries.ts`) already chunks and merges; the dock calls it for
  its one selected recipe.
- **GCP hrefs** — `api/gcpLinks.ts`'s builders, which remain the only file that builds a console
  URL (ADR-0015). The dock anchors them on the selected run exactly as
  `ETLOperational.tsx:926-943` does.
- **Preview** — `resolvePreview` (`ETLOperational.tsx:68-82`) moves into the shared module
  alongside `NodeDetails`; it needs the relationships edges and `nodeById` for `mappingPath`,
  both of which `RelatedOverlay` already holds from `useScopedRelationships`.

§3.6's switch of that hook to the **active** cluster is what makes this work: every in-scope node
on the canvas is in that graph, so Preview resolves. A gateway stub is not, so its Preview button
renders disabled — correct, and visibly so.

---

## 6. Resizable Details panes (defect 1)

### 6.1 Ground truth

`ETLOperational.tsx:1221` — `width: 300`. `LineageFlow.tsx:520` — `width: 264`. Both literals,
neither resizable. The reported clipping (`PARTNER_DATA_4433_1…`) is the 264 one.

### 6.2 Design

One hook and one splitter in `components/shared/`, used twice:

```ts
useDockWidth(storageKey: string, dflt: number, min: number, max: number)
```

modelled directly on `tab2/useResizableLayout.ts`: validated read (a stored non-finite value
falls back to the default rather than flowing into a CSS width), clamp on write, `try/catch`
around every storage call so private mode degrades to in-memory. Keys
`etl360.tab3.detailsW` and `etl360.tab3.lineageDetailsW` — separate, because the lineage dock
also renders standalone at `?related=` where the tab's panel does not exist.

Drag math follows the idiom `EditorLayout.tsx:60-70` documents: capture the start width at
`pointerdown` and recompute from that fixed start plus the accumulated delta — never from the
previous move's already-clamped result, so a drag past the floor and back does not drift. Move
and up listeners go on `window`, because a 4px splitter is trivially outrun by a fast pointer.

---

## 7. Testing

**Backend.** `LineageContractTest` keeps all ten existing tests **unedited** — that is the proof
the unscoped default is unchanged — and gains:

- membership: every returned non-gateway recipe is in `C`; every returned table is adjacent to
  one that is
- gateways are terminal: every edge incident to a gateway has its other endpoint in scope, so
  no returned path leaves the cluster and comes back
- `cluster=auto` honours `prefer` when the seed belongs to it, falls back to the largest when it
  does not
- the seed is always present, including for a cluster it has no relationship to
- an unknown `cluster` is a 400; an unknown `node` is still a 404
- determinism: the same scoped request twice is byte-identical

`/search`'s existing tests must pass untouched after the `TableClusters` extraction (§3.7).

**Frontend.**

- `lineageLayout.test.ts` — `applyOffsets({})` is identity; a dragged node's outgoing edge's
  first point **equals** its new right-edge anchor, and its incoming edge's last point equals its
  new left-edge anchor. This test fails against `a65cb67`, which is the point.
- `LineageFlow.test.tsx` — the switcher renders `clusterOptions` with the active one first;
  clicking one shows `Loading from cluster: <name>`; a gateway stub renders distinctly and its
  click re-seeds and re-scopes.
- `NodeDetails.test.tsx` — Preview disabled without a `recipePath`; all three GCP hrefs come from
  the builders; the `Related` list appears only when the host passes it.
- `useDockWidth.test.ts` — default when storage is empty, clamp to min/max, non-finite stored
  value ignored, storage throwing does not break the hook.

**Gates.** `make check` (`tsc --noEmit` + `pnpm format:check`), `make test`, and
`make validate-loop` — whose lineage block (`scripts/validate_loop.sh:151-183`) gains scoped
curls asserting that a scoped result is a strict subset of the unscoped one, that gateways are
present and terminal, and that the unscoped response is unchanged.

**Browser.** An acceptance walk with the Chrome plugin, per §8.

---

## 8. Acceptance criteria

1. Opening "Show all related" on the §1.2 seed draws a flow scoped to
   `cluster-wf-carga-inf-b681b46e-main` (the left-rail selection), not 150 nodes across 21
   clusters.
2. Every cluster crossing is a visible gateway stub naming its recipe and its cluster.
3. Clicking a gateway shows `Loading from cluster: <name>` and then draws that cluster's flow,
   seeded on the clicked recipe.
4. The switcher lists the seed's clusters, active one first, and switching works.
5. Dragging any card keeps every one of its arrows attached, at both ends; `reset layout`
   restores the computed default exactly.
6. The lineage `Details` dock shows run history, ⌖ centre-lineage, clusters, hop, Preview and
   all three GCP links.
7. Both `Details` panes drag to a new width, clamp at their floor, and survive a reload.
8. `GET /api/operational/lineage?node=…` with no `cluster` returns exactly what `a65cb67`
   returns.
9. `make check`, `make test` and `make validate-loop` all pass from a clean build.

---

## 9. Artifacts

| Artifact | Path |
|---|---|
| This spec | `docs/superpowers/specs/2026-08-31-lineage-cluster-scope-design.md` |
| Plan | `docs/superpowers/plans/2026-08-31-lineage-cluster-scope.md` |
| ADR | `docs/adr/0021-lineage-cluster-scope.md` |
| Backend | `service/LineageService.java`, `service/support/TableClusters.java`, `api/ClusterController.java`, `api/dto/LineageDto.java` |
| Frontend | `components/tab3/LineageFlow.tsx`, `components/tab3/lineageLayout.ts`, `components/tab3/RelatedOverlay.tsx`, `components/tab3/ETLOperational.tsx`, `components/shared/NodeDetails.tsx`, `components/shared/useDockWidth.ts` |
| API client | `api/clusterQueries.ts` |
| Gate | `scripts/validate_loop.sh` |

---

## 10. Deviations

1. **§3.3 gateway definition widened during Task 2** (already folded into §3.3's text, commit
   `745d923`): a gateway is any node outside `scope(C)` sharing an edge with one inside it — a
   table can be the gateway when the seed is an out-of-cluster recipe. The alternative was
   out-of-cluster tables leaking in unmarked. Gateway tables carry `clusters[]` for the stub.
2. **Three fixture-derived test literals moved with the gateway** (plan Task 10, Ruling M): the
   plan promised the new test fixture would not disturb existing tests, but three assertions in
   `LineageFlow.test.tsx` derive from the served response, not the `NODES`/`EDGES` constants —
   the header up/down counts, the "N of M" truncation line, and the DOM edge count. A gateway is
   a drawn node with a drawn edge, so those literals legitimately grew by one.
3. **`RelatedOverlay`'s re-seed effect keeps the reported active cluster** (Task 12 fix round,
   Ruling N): resetting `active` to `null` on `nodeId` change permanently clobbered a
   same-commit cached resolution (child effects fire before the parent's; a fresh-cached
   TanStack v5 key resolves synchronously), silently reverting the status scope to the left-rail
   selection. Only `cluster` resets to `'auto'`; `LineageFlow`'s report is the single source of
   truth for `active`. Regression-tested against the unfixed code.
4. **§8's acceptance walk ran against the committed mock, not a real export** (Task 14, below):
   §8.1's `cluster-wf-carga-inf-b681b46e-main` and the 150-of-14535 numbers come from the
   user's own IPC export, which this repo does not carry. The scoping mechanism was verified on
   the mock's `cluster-wf-cas-core-4002` / `cluster-wf-cas-out-4003`; the real-export walk
   remains for the user's environment.

## 11. Acceptance walk results (2026-09-01)

Walked in Chrome against `make dev` (backend `:8080` mock/mock modes, frontend `:8443`), branch
tree at `cf4a4d6`. Criteria from §8, in order:

1. **PASS (mock substitution — deviation 4).** Selecting `cluster-wf-cas-core-4002` in the left
   rail and opening `Show all related ↗` on `_ETL_m_CAS_DWH_EVENTS_FACT.json` drew a flow of
   `5 upstream · 8 downstream · 15 nodes` — the scoped subgraph, not the seed's 26-node unscoped
   closure (and not the corpus).
2. **PASS.** Every crossing rendered as a dashed gateway stub naming both parts, e.g.
   `_ETL_m_CAS_ODS_REFS.json ↳ cluster-wf-cas-load-4001`; on the table seed the 5 stubs named
   two different clusters (3 → `cas-load-4001`, 2 → `cas-out-4003`).
3. **PASS.** Clicking the `_ETL_m_CAS_ODS_REFS.json` gateway re-seeded the flow onto that recipe
   in `cluster-wf-cas-load-4001` (`3 upstream · 2 downstream · 6 nodes`, switcher chip moved).
   The `Loading from cluster: <name>` transient resolves sub-100ms against a localhost mock and
   was not visually captured; the exact text and state are pinned by the Task 11 unit test.
4. **PASS.** On seed `CAS_DWH_EVENTS_FACT` the switcher listed both of the seed's clusters,
   active first and marked (`data-active`); clicking `cluster-wf-cas-out-4003` redrew the flow
   (`1 upstream · 4 downstream · 6 nodes`), re-sorted it to first, and the gateways flipped to
   point back into `cas-core-4002`.
5. **PASS.** Dragging the QDM recipe card re-anchored exactly its two edges (SVG path `d`
   changed for those, unchanged for the rest) with both ends attached; `reset layout` restored
   all 5 edge paths byte-identical to the pre-drag computed layout and the button disappeared.
6. **PASS.** The lineage dock showed run history (per-day bars + `Choose run`), `⌖ center
   lineage here`, `Clusters`, `hop +1 downstream`, `Open preview↗`, and all three GCP links
   (`Open in BigQuery↗`, `Monitoring Dashboard↗`, `Cloud Logging↗`) plus per-run
   `job_id ↗`/`Logging ↗`. URLs confirmed by reading the anchors' hrefs (Dataproc job
   `application_1774840777_13005`, project `db-dev-example-project`, region
   `europe-southwest1`); external navigation to Google's console was not completed — the mock
   project would dead-end at its login/permission wall, and ADR-0015's builder is unit-tested.
7. **PASS.** Dragging both splitters persisted `etl360.tab3.detailsW=360` and
   `etl360.tab3.lineageDetailsW=344`; after a full page reload both panes rendered with exactly
   those inline widths.
8. **PASS.** `curl 'localhost:8080/api/operational/lineage?node=table:CAS_DWH_EVENTS_FACT'`
   returned every ADR-0020 key unchanged (26 nodes, 28 edges, `truncated: false`), zero
   `gateway` marks, `activeCluster: null`, plus the additive `clusterOptions`. Byte-level
   identity of the pre-existing fields is carried by `LineageContractTest`'s 10 unedited tests
   and the validate-loop superset assertion.
9. **PASS.** `make check && make test && make validate-loop` all passed from a clean build at
   this tree (Task 13 step 6; validate-loop independently re-run by the Task 13 reviewer,
   including `[validate-loop] lineage scoped to cluster-wf-cas-core-4002: 15 nodes, 5 gateways`
   with all committed-mock floors unchanged). Re-run once more as Task 15's final gate.

Observation (no criterion failed): React's dev build logs a border shorthand/longhand warning
for `shared/OperationalCard.tsx:74-76` (`border` + `borderLeft*` status edge). Pre-existing —
introduced by sub-project 10's `bb4cab9`, unrelated to this branch.
