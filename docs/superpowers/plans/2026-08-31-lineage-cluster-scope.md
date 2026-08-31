# Lineage Cluster Scope — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four Tab 3 lineage defects a real IPC export exposed — an unreadable unscoped flow (150 of 14 535 nodes across 21 clusters), arrows that detach when a card is dragged, fixed-width `Details` panes, and a lineage `Details` dock missing Preview and the GCP links.

**Architecture:** Backend first, because cluster scoping has to move the traversal budget and therefore cannot happen on the client. The recipe↔table↔cluster join already exists inline in `ClusterController` and is extracted to one support class both `/search` and `/lineage` read. Then the pure frontend geometry (`applyOffsets`), then two shared components (`NodeDetails`, `useDockWidth`/`DockSplitter`) each landing before their hosts adopt them, then the scoped flow's chrome, then gates, docs and a browser walk.

**Tech Stack:** Spring Boot 3.3 / Java 17 (backend), React 19 / TypeScript / Vite (frontend), JUnit 5 + AssertJ + MockMvc, Vitest + Testing Library + msw, `make check` / `make test` / `make validate-loop`.

**Spec:** `docs/superpowers/specs/2026-08-31-lineage-cluster-scope-design.md`

## Global Constraints

- **Never `git add -A`.** Stage explicit paths only — the working tree carries user-local untracked files (`_layout_*.json` sidecars, `scripts/dev`, `.claude/settings.json`).
- **No corpus file changes.** `parser/src/main/resources/xmltobq/**` and `backend/src/main/resources/mock/**` are untouched by every task in this plan. `m_CAS_*` data is manifest-generated and frozen.
- **No committed mock floor moves.** `make validate-loop` must still assert `21 clusters · 30 recipes · 14 dates · 417 rows` and readiness `81 XML · 86 recipes · 212 DDL` / `22` workflows, unchanged.
- **No parser change.** Nothing in `parser/` is touched.
- **No restyle.** ADR-0005's visual contract holds. Gateway stubs are a new node *state* drawn from ADR-0017's existing palette — no new hex enters the codebase, and `frontend/src/theme/semanticColors.ts` stays the only file mapping a layer, kind or status to a colour.
- **The unscoped mode is unchanged.** `GET /api/operational/lineage` with no `cluster` param must return what `a65cb67` returns. **All ten existing `LineageContractTest` tests must pass unedited** — that is the proof.
- **`/search` is unchanged.** Task 1 is a pure extraction; its existing contract tests must pass unedited.
- **Determinism is a contract.** Every new ordering (clusterOptions, scope sets, gateway lists) is total, so the same request answers identically across restarts — the guarantee `ClusterIndexService.clustersOf()` and `/search` already make.
- **Canonical wire vocabulary is unchanged:** node `kind` is `recipe`|`table`; edge `kind` is `source`|`lookup`|`writes`; status is `SUCCESS`|`FAILED`|`""`.
- **Storage keys:** `etl360.tab3.detailsW` (Tab 3 panel), `etl360.tab3.lineageDetailsW` (lineage dock).
- **Dock bounds:** Tab 3 panel `default 300, min 240, max 720`. Lineage dock `default 264, min 220, max 640`.
- **Tick this plan's checkboxes and stage this file in each task's commit** — the commit history is the resumability record.
- Verify frontend with `cd frontend && pnpm test && npx tsc --noEmit`; backend with `mvn -q -am -pl backend test`.

---

## File Structure

**Backend — create:**
| Path | Responsibility |
|---|---|
| `backend/src/main/java/io/pure360/etl360/service/support/TableClusters.java` | The one recipe↔table adjacency join, read by `/search` and `/lineage` |
| `backend/src/test/java/io/pure360/etl360/service/TableClustersTest.java` | Join unit tests over a hand-built graph |
| `backend/src/test/java/io/pure360/etl360/service/LineageScopeTest.java` | Scoped-closure unit tests at the service level |

**Backend — modify:**
| Path | Change |
|---|---|
| `api/dto/LineageDto.java` | `activeCluster`, `clusterOptions`, `nodes[].gateway` |
| `service/LineageService.java` | Scoped BFS, gateway stubs, `auto` resolution |
| `api/ClusterController.java` | `cluster` / `prefer` params; `tableHits` reads `TableClusters` |
| `src/test/java/io/pure360/etl360/LineageContractTest.java` | Scoped cases appended; existing ten untouched |

**Frontend — create:**
| Path | Responsibility |
|---|---|
| `frontend/src/components/shared/useDockWidth.tsx` | Validated, clamped, persisted dock width + `DockSplitter` |
| `frontend/src/components/shared/useDockWidth.test.ts` | Hook tests |
| `frontend/src/components/shared/NodeDetails.tsx` | The one Details body, rendered by Tab 3 and the lineage dock |
| `frontend/src/components/shared/NodeDetails.test.tsx` | Details tests |
| `frontend/src/components/shared/nodePreview.ts` | `resolvePreview`, moved out of `ETLOperational` |

**Frontend — modify:**
| Path | Change |
|---|---|
| `components/tab3/lineageLayout.ts` | Module-level `anchorAt`; new pure `applyOffsets` |
| `components/tab3/lineageLayout.test.ts` | `applyOffsets` tests |
| `components/tab3/LineageFlow.tsx` | Renders via `applyOffsets`; gateway stubs; cluster switcher; loading line; dock uses `NodeDetails` + `DockSplitter` |
| `components/tab3/LineageFlow.test.tsx` | Drag-anchoring, stubs, switcher, loading line |
| `components/tab3/RelatedOverlay.tsx` | Owns the active-cluster state; scopes status to it |
| `components/tab3/ETLOperational.tsx` | Panel uses `NodeDetails` + `DockSplitter`; passes `prefer` |
| `api/clusterQueries.ts` | `LineageT.activeCluster`/`clusterOptions`, `LineageNodeT.gateway`, `useLineage(node, limit, cluster, prefer)` |

**Docs / gates:** `docs/adr/0021-lineage-cluster-scope.md`, `docs/architecture.md`, root `CLAUDE.md`, `scripts/validate_loop.sh`.

---

## Task 1: extract the recipe↔table join

Pure extraction. `/search` behaviour must not change — that is what the existing search contract tests prove.

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/service/support/TableClusters.java`
- Create: `backend/src/test/java/io/pure360/etl360/service/TableClustersTest.java`
- Modify: `backend/src/main/java/io/pure360/etl360/api/ClusterController.java:224-256`

**Interfaces:**
- Produces: `TableClusters.of(RelationshipsDto graph)` → instance; `Set<String> recipeIdsFor(String tableId)`; `Set<String> tableIds()`; `List<String> clustersFor(String tableId, Map<String, List<String>> clustersByRecipe)` (name-ascending).
- Consumed by: Task 2 (`LineageService`), and `ClusterController.tableHits` in this task.

- [x] **Step 0: Branch**

```bash
git checkout -b feat/etl360-lineage-cluster-scope
```

Task 15 merges this branch; every task below commits onto it.

- [x] **Step 1: Write the failing test**

```java
package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.RelationshipsDto;
import io.pure360.etl360.service.support.TableClusters;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The recipe<->table adjacency join, which a table's cluster membership is derived from: b15
 * groups RECIPE runs, so a table has no cluster of its own and must inherit every one of the
 * recipes that write or read it.
 */
class TableClustersTest {

    private static RelationshipsDto.NodeDto node(String id, String kind, String name) {
        return new RelationshipsDto.NodeDto(id, kind, name, "DWH", null, null, null, null, null, null);
    }

    /** t_in -> r_a -> t_mid -> r_b -> t_out, plus a lookup from t_side into r_a. */
    private static final RelationshipsDto GRAPH = new RelationshipsDto(
        List.of(node("table:IN", "table", "IN"),
                node("recipe:A", "recipe", "_ETL_a.json"),
                node("table:MID", "table", "MID"),
                node("recipe:B", "recipe", "_ETL_b.json"),
                node("table:OUT", "table", "OUT"),
                node("table:SIDE", "table", "SIDE")),
        List.of(new RelationshipsDto.EdgeDto("table:IN", "recipe:A", "source"),
                new RelationshipsDto.EdgeDto("recipe:A", "table:MID", "writes"),
                new RelationshipsDto.EdgeDto("table:MID", "recipe:B", "source"),
                new RelationshipsDto.EdgeDto("recipe:B", "table:OUT", "writes"),
                new RelationshipsDto.EdgeDto("table:SIDE", "recipe:A", "lookup")),
        new RelationshipsDto.MetaDto(0, 0, List.of()));

    @Test
    void joinsATableToTheRecipesOnBOTHSidesOfIt() {
        TableClusters joins = TableClusters.of(GRAPH);
        // MID is written by A and read by B — an operator troubleshooting it wants both.
        assertThat(joins.recipeIdsFor("table:MID")).containsExactlyInAnyOrder("recipe:A", "recipe:B");
        assertThat(joins.recipeIdsFor("table:IN")).containsExactly("recipe:A");
        assertThat(joins.recipeIdsFor("table:SIDE")).containsExactly("recipe:A");
    }

    @Test
    void anUnknownTableJoinsToNothing() {
        assertThat(TableClusters.of(GRAPH).recipeIdsFor("table:NOPE")).isEmpty();
    }

    @Test
    void listsEveryTableThatHasAtLeastOneRecipe() {
        assertThat(TableClusters.of(GRAPH).tableIds())
            .containsExactlyInAnyOrder("table:IN", "table:MID", "table:OUT", "table:SIDE");
    }

    @Test
    void unionsTheAdjacentRecipesClustersNameAscending() {
        Map<String, List<String>> clustersByRecipe = Map.of(
            "_ETL_a.json", List.of("cl-z", "cl-a"),
            "_ETL_b.json", List.of("cl-m"));
        assertThat(TableClusters.of(GRAPH).clustersFor("table:MID", clustersByRecipe))
            .containsExactly("cl-a", "cl-m", "cl-z");
    }
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `mvn -q -am -pl backend test -Dtest=TableClustersTest`
Expected: compile failure — `package io.pure360.etl360.service.support.TableClusters does not exist`.

- [x] **Step 3: Write the implementation**

```java
package io.pure360.etl360.service.support;

import io.pure360.etl360.api.dto.RelationshipsDto;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * The recipe&lt;-&gt;table adjacency of a relationships graph, and the cluster membership derived
 * from it.
 *
 * <p>b15 groups RECIPE runs, so a table carries no cluster of its own; it inherits every cluster
 * of every recipe that writes or reads it. Both {@code /api/operational/search} (ADR-0019) and
 * the scoped lineage (ADR-0021) need exactly this join, so it lives here once rather than being
 * copied — the same "never a second source for a corpus-shaped fact" rule that governs
 * {@code LAYER_RANK}, {@code semanticColors.ts} and {@code B15Status}.
 */
public final class TableClusters {

    private final Map<String, Set<String>> recipeIdsByTableId;
    private final Map<String, RelationshipsDto.NodeDto> byId;

    private TableClusters(Map<String, Set<String>> recipeIdsByTableId,
                          Map<String, RelationshipsDto.NodeDto> byId) {
        this.recipeIdsByTableId = recipeIdsByTableId;
        this.byId = byId;
    }

    public static TableClusters of(RelationshipsDto graph) {
        Map<String, RelationshipsDto.NodeDto> byId = new LinkedHashMap<>();
        for (RelationshipsDto.NodeDto n : graph.nodes()) if (n.id() != null) byId.put(n.id(), n);

        Map<String, Set<String>> joins = new LinkedHashMap<>();
        for (RelationshipsDto.EdgeDto e : graph.edges()) {
            RelationshipsDto.NodeDto from = byId.get(e.from());
            RelationshipsDto.NodeDto to = byId.get(e.to());
            if (from == null || to == null) continue;
            // Both directions: a table is reachable from the recipe that WRITES it and from every
            // recipe that READS it.
            if ("recipe".equals(from.kind()) && "table".equals(to.kind())) {
                joins.computeIfAbsent(to.id(), x -> new LinkedHashSet<>()).add(from.id());
            } else if ("table".equals(from.kind()) && "recipe".equals(to.kind())) {
                joins.computeIfAbsent(from.id(), x -> new LinkedHashSet<>()).add(to.id());
            }
        }
        return new TableClusters(joins, byId);
    }

    /** Recipe node ids adjacent to {@code tableId}. Empty for an unknown or isolated table. */
    public Set<String> recipeIdsFor(String tableId) {
        return recipeIdsByTableId.getOrDefault(tableId, Set.of());
    }

    /** Every table id with at least one adjacent recipe. */
    public Set<String> tableIds() {
        return recipeIdsByTableId.keySet();
    }

    /**
     * The clusters reaching {@code tableId}, name-ascending. The ordering is a wire contract, not
     * cosmetic: an unordered list would make the same request answer differently across restarts.
     */
    public List<String> clustersFor(String tableId, Map<String, List<String>> clustersByRecipe) {
        Set<String> out = new TreeSet<>();
        for (String recipeId : recipeIdsFor(tableId)) {
            RelationshipsDto.NodeDto recipe = byId.get(recipeId);
            if (recipe != null && recipe.name() != null) {
                out.addAll(clustersByRecipe.getOrDefault(recipe.name(), List.of()));
            }
        }
        return List.copyOf(out);
    }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `mvn -q -am -pl backend test -Dtest=TableClustersTest`
Expected: PASS, 4 tests.

- [x] **Step 5: Rewrite `ClusterController.tableHits` to read it**

Replace the body of `tableHits` (`ClusterController.java:224-256`) with:

```java
    private List<SearchHitsDto.HitDto> tableHits(String needle, Map<String, List<String>> clustersByRecipe) {
        RelationshipsDto graph = relationships.graph();
        TableClusters joins = TableClusters.of(graph);

        Map<String, SearchHitsDto.HitDto> matched = new java.util.TreeMap<>();
        for (RelationshipsDto.NodeDto node : graph.nodes()) {
            if (!"table".equals(node.kind()) || node.name() == null) continue;
            if (!node.name().toLowerCase(Locale.ROOT).contains(needle)) continue;
            matched.putIfAbsent(node.name(), new SearchHitsDto.HitDto("table", node.name(),
                node.layer() == null || node.layer().isEmpty() ? UNKNOWN_LAYER : node.layer(),
                joins.clustersFor(node.id(), clustersByRecipe)));
        }
        return List.copyOf(matched.values());
    }
```

Add `import io.pure360.etl360.service.support.TableClusters;`. Remove the now-unused `LinkedHashSet` / `TreeSet` imports **only if** no other method in the file still uses them (`search` uses `TreeSet`, so keep that one).

- [x] **Step 6: Prove `/search` did not change**

Run: `mvn -q -am -pl backend test -Dtest='OperationalSearchContractTest,TableClustersTest'`
Expected: PASS, `OperationalSearchContractTest` **unedited**.

- [x] **Step 7: Commit**

```bash
git add backend/src/main/java/io/pure360/etl360/service/support/TableClusters.java \
        backend/src/test/java/io/pure360/etl360/service/TableClustersTest.java \
        backend/src/main/java/io/pure360/etl360/api/ClusterController.java \
        docs/superpowers/plans/2026-08-31-lineage-cluster-scope.md
git commit -m "refactor(backend): one recipe<->table join for /search and lineage"
```

---
## Task 2: scoped lineage closure

Spec §3.2, §3.3, §3.5. Service level only — the endpoint still exposes nothing new, so the ten
existing contract tests keep passing untouched.

**Files:**
- Modify: `backend/src/main/java/io/pure360/etl360/api/dto/LineageDto.java`
- Modify: `backend/src/main/java/io/pure360/etl360/service/LineageService.java`
- Create: `backend/src/test/java/io/pure360/etl360/service/LineageScopeTest.java`

**Interfaces:**
- Consumes: `TableClusters.of/recipeIdsFor/tableIds` (Task 1); `ClusterIndexService.index()` → `Index.clustersByRecipe()` (`Map<String,List<String>>`), `Index.byCluster()` (`Map<String,ClusterEntry>`, `ClusterEntry.recipes()` name-ascending).
- Produces: `LineageService.lineage(String seed, int limit, String clusterSpec, List<String> prefer)` → `LineageDto`; the 2-arg `lineage(String, int)` overload delegating with `(null, List.of())`. `LineageDto.ClusterOptionDto(String name, int recipes)`. `LineageDto.LineageNodeDto` gains a trailing `boolean gateway`. Constant `LineageService.AUTO = "auto"`.
- Consumed by: Task 3 (controller), Task 10 (TS types mirror this shape).

- [x] **Step 1: Write the failing test**

```java
package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.LineageDto;
import io.pure360.etl360.service.support.InvalidRequestException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The scoped closure, at the service level. ADR-0021 supersedes ADR-0020's "not cluster-scoped"
 * clause by making the boundary EXPLICIT: the flow stops at the cluster edge, but every crossing
 * is a named gateway. These tests are what hold that promise.
 */
@SpringBootTest
class LineageScopeTest {

    /** A CAS table with recipes on both sides of it in the committed mock. */
    private static final String SEED = "table:CAS_DWH_EVENTS_FACT";

    @Autowired LineageService lineage;
    @Autowired ClusterIndexService index;

    private LineageDto scoped(String cluster) {
        return lineage.lineage(SEED, 600, cluster, List.of());
    }

    private static Set<String> ids(LineageDto d) {
        return d.nodes().stream().map(LineageDto.LineageNodeDto::id).collect(Collectors.toSet());
    }

    private String aClusterOfTheSeed() {
        List<LineageDto.ClusterOptionDto> opts = lineage.lineage(SEED, 600, null, List.of()).clusterOptions();
        assertThat(opts).as("the seed must reach at least one cluster in the committed mock").isNotEmpty();
        return opts.get(0).name();
    }

    @Test
    void unscopedReportsNoActiveCluster() {
        LineageDto d = lineage.lineage(SEED, 600, null, List.of());
        assertThat(d.activeCluster()).isNull();
        assertThat(d.nodes()).allSatisfy(n -> assertThat(n.gateway()).isFalse());
    }

    @Test
    void everyScopedRecipeBelongsToTheCluster() {
        String c = aClusterOfTheSeed();
        for (LineageDto.LineageNodeDto n : scoped(c).nodes()) {
            if (!"recipe".equals(n.kind()) || n.gateway()) continue;
            assertThat(index.clustersOf(n.name())).as("recipe %s", n.name()).contains(c);
        }
    }

    @Test
    void aScopedResultIsAStrictSubsetOfTheUnscopedOne() {
        String c = aClusterOfTheSeed();
        Set<String> all = ids(lineage.lineage(SEED, 600, null, List.of()));
        assertThat(all).containsAll(ids(scoped(c)));
    }

    @Test
    void gatewaysAreTerminal() {
        String c = aClusterOfTheSeed();
        LineageDto d = scoped(c);
        Set<String> gateways = d.nodes().stream().filter(LineageDto.LineageNodeDto::gateway)
            .map(LineageDto.LineageNodeDto::id).collect(Collectors.toSet());
        // No returned path leaves the cluster and comes back: every edge touching a gateway has
        // its other endpoint in scope.
        d.edges().forEach(e -> assertThat(gateways.contains(e.from()) && gateways.contains(e.to()))
            .as("edge %s -> %s joins two gateways", e.from(), e.to()).isFalse());
    }

    @Test
    void theSeedIsAlwaysPresent() {
        String c = aClusterOfTheSeed();
        assertThat(ids(scoped(c))).contains(SEED);
    }

    @Test
    void autoPrefersTheCallersSelectionWhenTheSeedBelongsToIt() {
        List<LineageDto.ClusterOptionDto> opts =
            lineage.lineage(SEED, 600, null, List.of()).clusterOptions();
        // The LAST option is by construction not the one `auto` picks unaided (options are
        // count-descending), so honouring `prefer` is observable.
        String tail = opts.get(opts.size() - 1).name();
        assertThat(lineage.lineage(SEED, 600, LineageService.AUTO, List.of(tail)).activeCluster())
            .isEqualTo(tail);
    }

    @Test
    void autoFallsBackToTheLargestWhenThePreferenceDoesNotApply() {
        List<LineageDto.ClusterOptionDto> opts =
            lineage.lineage(SEED, 600, null, List.of()).clusterOptions();
        assertThat(lineage.lineage(SEED, 600, LineageService.AUTO, List.of("no-such-cluster"))
            .activeCluster()).isEqualTo(opts.get(0).name());
    }

    @Test
    void clusterOptionsAreCountDescendingThenName() {
        List<LineageDto.ClusterOptionDto> opts =
            lineage.lineage(SEED, 600, null, List.of()).clusterOptions();
        for (int i = 0; i + 1 < opts.size(); i++) {
            LineageDto.ClusterOptionDto a = opts.get(i), b = opts.get(i + 1);
            assertThat(a.recipes() > b.recipes()
                || (a.recipes() == b.recipes() && a.name().compareTo(b.name()) <= 0)).isTrue();
        }
    }

    @Test
    void anUnknownClusterIsARejectedRequest() {
        assertThatThrownBy(() -> scoped("no-such-cluster"))
            .isInstanceOf(InvalidRequestException.class)
            .hasMessageContaining("no-such-cluster");
    }

    @Test
    void isDeterministicAcrossCalls() {
        String c = aClusterOfTheSeed();
        assertThat(scoped(c)).isEqualTo(scoped(c));
    }
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `mvn -q -am -pl backend test -Dtest=LineageScopeTest`
Expected: compile failure — `lineage(String,int,String,List)` and `activeCluster()` do not exist.

- [x] **Step 3: Widen `LineageDto`**

Replace `backend/src/main/java/io/pure360/etl360/api/dto/LineageDto.java` with:

```java
package io.pure360.etl360.api.dto;

import java.util.List;

/**
 * One node's transitive upstream AND downstream closure — the lineage a failed table's operator
 * actually needs, rather than the one-hop neighbour set.
 *
 * <p>Bounded by node count and seeded from a single node, so it fetches a purposeful slice and
 * never the whole graph (ADR-0020).
 *
 * <p>Optionally CLUSTER-SCOPED (ADR-0021). ADR-0020 refused scoping because truncating at the
 * selection would draw a complete-looking flow that is not one; that objection is answered by
 * {@link LineageNodeDto#gateway()}, which makes every cluster crossing an explicit, named,
 * clickable node. With no {@code cluster} the response is unscoped and identical to ADR-0020's.
 *
 * @param activeCluster   the cluster actually scoped to, or {@code null} when unscoped.
 * @param clusterOptions  the SEED's own candidate clusters, count-descending then name — the
 *                        switcher's contents. Deliberately not "every cluster the lineage
 *                        touches": reaching a distant cluster is a gateway walk.
 * @param totalReachable  how many nodes the closure actually contains, whether or not they fit in
 *                        {@code nodes} — so the view can say how much it is NOT showing instead of
 *                        implying completeness.
 */
public record LineageDto(String seed, List<LineageNodeDto> nodes,
                         List<RelationshipsDto.EdgeDto> edges,
                         boolean truncated, int totalReachable,
                         String activeCluster, List<ClusterOptionDto> clusterOptions) {

    /**
     * @param hop signed distance from the seed: negative upstream, {@code 0} for the seed itself,
     *            positive downstream. This is the view's x-axis, which is why it is computed here
     *            (during the traversal that actually knows the direction) rather than re-derived
     *            client-side from the edges.
     * @param gateway true for a recipe OUTSIDE the active cluster that touches a table inside it.
     *            The traversal stops there; it is drawn as a stub naming its cluster, so the flow
     *            never looks complete where it is not. Always {@code false} when unscoped.
     */
    public record LineageNodeDto(String id, String kind, String name, String layer, int hop,
                                 List<String> clusters, boolean gateway) {}

    /** @param recipes the cluster's OWN size in the b15 index, not a count within this lineage —
     *                 a stable property, so the "largest" tie-break cannot shift with the budget. */
    public record ClusterOptionDto(String name, int recipes) {}
}
```

- [x] **Step 4: Rewrite `LineageService`**

Replace `backend/src/main/java/io/pure360/etl360/service/LineageService.java` with:

```java
package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.LineageDto;
import io.pure360.etl360.api.dto.RelationshipsDto;
import io.pure360.etl360.service.support.InvalidRequestException;
import io.pure360.etl360.service.support.NotFoundException;
import io.pure360.etl360.service.support.TableClusters;
import org.springframework.stereotype.Service;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Builds one node's transitive upstream + downstream closure, optionally scoped to one b15
 * cluster.
 *
 * <p><b>Breadth-first, not depth-first, and that is load-bearing.</b> The traversal is bounded by
 * a node budget; BFS reaches the furthest hops last, so spending the budget cuts the DISTANT
 * lineage and leaves the nearest complete. A DFS would exhaust the budget down one arbitrary
 * branch and silently drop a node one hop away — which is worse than not drawing the view at all,
 * because the result still looks like a lineage.
 *
 * <p><b>Scoping (ADR-0021).</b> On a real export the unscoped closure is the whole graph — 14 535
 * reachable nodes, of which the operator's selected cluster contributed one. Scoping confines the
 * walk to {@code recipes(C) + the tables they touch}, so the budget is spent inside the cluster.
 * ADR-0020's objection to scoping — that it would draw a complete-looking flow that is not one —
 * is answered by GATEWAYS: a recipe outside C that touches an in-scope table is returned, marked,
 * and never walked through, so every crossing is visible and named. With no cluster the behaviour
 * is byte-identical to ADR-0020's.
 *
 * <p>Cycle-safe by a visited set: the L2L graph is not guaranteed acyclic, and a lookup edge can
 * close a loop.
 */
@Service
public class LineageService {

    /** {@code cluster=auto}: let the server resolve the seed's cluster (spec §3.5). */
    public static final String AUTO = "auto";

    private final RelationshipService relationships;
    private final ClusterIndexService clusterIndex;

    public LineageService(RelationshipService relationships, ClusterIndexService clusterIndex) {
        this.relationships = relationships;
        this.clusterIndex = clusterIndex;
    }

    /** One step away from a node, and which direction it was. */
    private record Step(String id, int direction) {}

    /** Unscoped — ADR-0020's original contract, kept so existing callers are untouched. */
    public LineageDto lineage(String seed, int limit) {
        return lineage(seed, limit, null, List.of());
    }

    public LineageDto lineage(String seed, int limit, String clusterSpec, List<String> prefer) {
        RelationshipsDto graph = relationships.graph();

        Map<String, RelationshipsDto.NodeDto> byId = new LinkedHashMap<>();
        for (RelationshipsDto.NodeDto n : graph.nodes()) if (n.id() != null) byId.put(n.id(), n);
        if (!byId.containsKey(seed)) {
            throw new NotFoundException("No node '" + seed + "' in the relationships graph");
        }

        ClusterIndexService.Index index = clusterIndex.index();
        TableClusters joins = TableClusters.of(graph);

        List<LineageDto.ClusterOptionDto> options = clusterOptions(seed, byId, joins, index);
        String active = resolveActive(clusterSpec, options, prefer, index);
        // Null scope = no membership predicate = ADR-0020's unscoped walk.
        Set<String> scope = active == null ? null : scopeOf(active, seed, byId, joins, index);

        // Adjacency in BOTH directions, each entry remembering whether following it walks
        // downstream (+1, along an edge) or upstream (-1, against one).
        Map<String, List<Step>> adjacency = new HashMap<>();
        for (RelationshipsDto.EdgeDto e : graph.edges()) {
            if (e.from() == null || e.to() == null) continue;
            if (!byId.containsKey(e.from()) || !byId.containsKey(e.to())) continue;
            adjacency.computeIfAbsent(e.from(), k -> new ArrayList<>()).add(new Step(e.to(), +1));
            adjacency.computeIfAbsent(e.to(), k -> new ArrayList<>()).add(new Step(e.from(), -1));
        }
        // Deterministic neighbour order: the same request must answer identically across restarts,
        // the same guarantee ClusterIndexService.clustersOf() makes for its own list.
        for (List<Step> steps : adjacency.values()) steps.sort(Comparator.comparing(Step::id));

        // BFS. `hop` accumulates the direction travelled, so a node reached by walking two edges
        // backwards is -2 and one reached forwards then forwards is +2.
        //
        // TRAVERSAL state (`hopById`) is deliberately unbounded while the RESULT (`kept`) is
        // bounded. Bounding the traversal itself would leave queued nodes with no recorded hop,
        // and the walk needs every node's hop to compute its neighbours'. The budget therefore
        // limits what is RETURNED, and the full walk still yields an honest `totalReachable`.
        Map<String, Integer> hopById = new LinkedHashMap<>();
        Deque<String> queue = new ArrayDeque<>();
        hopById.put(seed, 0);
        queue.add(seed);

        // Insertion-ordered, so "the first `limit` nodes BFS reached" is exactly "the nearest".
        Set<String> kept = new LinkedHashSet<>();
        Set<String> gateways = new LinkedHashSet<>();
        kept.add(seed);

        while (!queue.isEmpty()) {
            String current = queue.poll();
            int hop = hopById.get(current);
            for (Step step : adjacency.getOrDefault(current, List.of())) {
                if (hopById.containsKey(step.id())) continue;
                hopById.put(step.id(), hop + step.direction());
                if (kept.size() < limit) kept.add(step.id());
                // A node outside the scope is a GATEWAY: drawn, named, and never walked through.
                // Not enqueuing it is what bounds the scoped closure to one cluster.
                if (scope != null && !scope.contains(step.id())) {
                    gateways.add(step.id());
                    continue;
                }
                queue.add(step.id());
            }
        }

        List<LineageDto.LineageNodeDto> nodes = new ArrayList<>();
        for (Map.Entry<String, Integer> e : hopById.entrySet()) {
            if (!kept.contains(e.getKey())) continue;
            RelationshipsDto.NodeDto n = byId.get(e.getKey());
            String name = n.name() == null ? "" : n.name();
            List<String> clusters = "recipe".equals(n.kind())
                ? clusterIndex.clustersOf(name) : List.of();
            nodes.add(new LineageDto.LineageNodeDto(n.id(), n.kind(), name,
                n.layer() == null || n.layer().isEmpty() ? "UNKNOWN" : n.layer(),
                e.getValue(), clusters, gateways.contains(n.id())));
        }
        nodes.sort(Comparator.comparingInt(LineageDto.LineageNodeDto::hop)
            .thenComparing(LineageDto.LineageNodeDto::name));

        // Only edges whose BOTH endpoints survived the budget — an edge into a cut node would
        // draw an arrow into empty space.
        List<RelationshipsDto.EdgeDto> edges = new ArrayList<>();
        for (RelationshipsDto.EdgeDto e : graph.edges()) {
            if (kept.contains(e.from()) && kept.contains(e.to())) {
                edges.add(new RelationshipsDto.EdgeDto(e.from(), e.to(), e.kind()));
            }
        }

        return new LineageDto(seed, List.copyOf(nodes), List.copyOf(edges),
            hopById.size() > kept.size(), hopById.size(), active, options);
    }

    /**
     * The seed's own candidate clusters: its own if it is a recipe, or the union of its adjacent
     * recipes' if it is a table. Count-descending then name — a total order, so the same request
     * answers identically across restarts and {@link #AUTO}'s "largest" is unambiguous.
     */
    private List<LineageDto.ClusterOptionDto> clusterOptions(
            String seed, Map<String, RelationshipsDto.NodeDto> byId, TableClusters joins,
            ClusterIndexService.Index index) {
        RelationshipsDto.NodeDto node = byId.get(seed);
        Set<String> names = new TreeSet<>();
        if ("recipe".equals(node.kind()) && node.name() != null) {
            names.addAll(index.clustersByRecipe().getOrDefault(node.name(), List.of()));
        } else {
            names.addAll(joins.clustersFor(seed, index.clustersByRecipe()));
        }
        List<LineageDto.ClusterOptionDto> out = new ArrayList<>();
        for (String name : names) {
            ClusterIndexService.ClusterEntry entry = index.byCluster().get(name);
            out.add(new LineageDto.ClusterOptionDto(name, entry == null ? 0 : entry.recipes().size()));
        }
        out.sort(Comparator.comparingInt(LineageDto.ClusterOptionDto::recipes).reversed()
            .thenComparing(LineageDto.ClusterOptionDto::name));
        return List.copyOf(out);
    }

    /** Spec §3.5. Null spec = unscoped; {@link #AUTO} = prefer the caller's selection, else the
     *  seed's largest; anything else must name a cluster that exists. */
    private String resolveActive(String spec, List<LineageDto.ClusterOptionDto> options,
                                 List<String> prefer, ClusterIndexService.Index index) {
        if (spec == null || spec.isBlank()) return null;
        if (AUTO.equals(spec)) {
            // A node in no cluster cannot be scoped by one; returning the unscoped flow beats
            // refusing to draw anything.
            for (LineageDto.ClusterOptionDto o : options) if (prefer.contains(o.name())) return o.name();
            return options.isEmpty() ? null : options.get(0).name();
        }
        if (!index.byCluster().containsKey(spec)) {
            throw new InvalidRequestException("No cluster '" + spec + "' in the b15 index");
        }
        return spec;
    }

    /** Spec §3.2: {@code {seed} + recipes(C) + every table adjacent to one of them}. */
    private Set<String> scopeOf(String cluster, String seed,
                                Map<String, RelationshipsDto.NodeDto> byId, TableClusters joins,
                                ClusterIndexService.Index index) {
        Set<String> recipeIds = new LinkedHashSet<>();
        for (RelationshipsDto.NodeDto n : byId.values()) {
            if (!"recipe".equals(n.kind()) || n.name() == null) continue;
            if (index.clustersByRecipe().getOrDefault(n.name(), List.of()).contains(cluster)) {
                recipeIds.add(n.id());
            }
        }
        Set<String> scope = new LinkedHashSet<>();
        // The seed is ALWAYS in scope. Asking for a cluster the seed has no relationship to yields
        // the seed plus its gateways — "nothing here, but here is where this node does live" —
        // rather than a 400 that dead-ends the UI exactly when the operator is lost.
        scope.add(seed);
        scope.addAll(recipeIds);
        for (String tableId : joins.tableIds()) {
            for (String recipeId : joins.recipeIdsFor(tableId)) {
                if (recipeIds.contains(recipeId)) { scope.add(tableId); break; }
            }
        }
        return scope;
    }
}
```

- [x] **Step 5: Run the new tests and the untouched contract tests**

Run: `mvn -q -am -pl backend test -Dtest='LineageScopeTest,LineageContractTest'`
Expected: PASS. `LineageContractTest` is **unedited** — that is the proof the unscoped default
did not move.

- [x] **Step 6: Commit**

```bash
git add backend/src/main/java/io/pure360/etl360/api/dto/LineageDto.java \
        backend/src/main/java/io/pure360/etl360/service/LineageService.java \
        backend/src/test/java/io/pure360/etl360/service/LineageScopeTest.java \
        docs/superpowers/plans/2026-08-31-lineage-cluster-scope.md
git commit -m "feat(backend): cluster-scoped lineage closure with gateway stubs"
```

---

## Task 3: the endpoint's `cluster` and `prefer` params

Spec §3.4.

**Files:**
- Modify: `backend/src/main/java/io/pure360/etl360/api/ClusterController.java:162-170`
- Modify: `backend/src/test/java/io/pure360/etl360/LineageContractTest.java` (append only)

**Interfaces:**
- Consumes: `LineageService.lineage(seed, limit, clusterSpec, prefer)`, `LineageService.AUTO` (Task 2).
- Produces: `GET /api/operational/lineage?node=&limit=&cluster=&prefer=`.

- [ ] **Step 1: Write the failing test (append to `LineageContractTest`, edit nothing above it)**

```java
    // ── ADR-0021: cluster scope ───────────────────────────────────────────────

    private JsonNode scoped(String cluster) throws Exception {
        String body = mvc.perform(get("/api/operational/lineage")
                .param("node", SEED).param("limit", "600").param("cluster", cluster))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return mapper.readTree(body);
    }

    private String firstOption() throws Exception {
        JsonNode d = lineage(SEED, "600");
        assertThat(d.get("clusterOptions")).as("seed reaches a cluster").isNotEmpty();
        return d.get("clusterOptions").get(0).get("name").asText();
    }

    @Test
    void unscopedCarriesANullActiveClusterAndTheSeedsOptions() throws Exception {
        JsonNode d = lineage(SEED, "600");
        assertThat(d.get("activeCluster").isNull()).isTrue();
        d.get("clusterOptions").forEach(o -> {
            assertThat(o.get("name").asText()).isNotBlank();
            assertThat(o.get("recipes").asInt()).isGreaterThan(0);
        });
    }

    @Test
    void aScopedCallReportsTheClusterItScopedTo() throws Exception {
        String c = firstOption();
        assertThat(scoped(c).get("activeCluster").asText()).isEqualTo(c);
    }

    @Test
    void aScopedCallIsSmallerThanOrEqualToTheUnscopedOne() throws Exception {
        String c = firstOption();
        assertThat(scoped(c).get("nodes").size())
            .isLessThanOrEqualTo(lineage(SEED, "600").get("nodes").size());
    }

    @Test
    void everyScopedEdgeEndpointIsStillAReturnedNode() throws Exception {
        JsonNode d = scoped(firstOption());
        Set<String> ids = new HashSet<>();
        d.get("nodes").forEach(n -> ids.add(n.get("id").asText()));
        d.get("edges").forEach(e -> {
            assertThat(ids).as("edge from").contains(e.get("from").asText());
            assertThat(ids).as("edge to").contains(e.get("to").asText());
        });
    }

    @Test
    void autoResolvesAClusterWithoutTheCallerNamingOne() throws Exception {
        String body = mvc.perform(get("/api/operational/lineage")
                .param("node", SEED).param("cluster", "auto"))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(mapper.readTree(body).get("activeCluster").asText()).isEqualTo(firstOption());
    }

    @Test
    void autoHonoursPrefer() throws Exception {
        JsonNode opts = lineage(SEED, "600").get("clusterOptions");
        String tail = opts.get(opts.size() - 1).get("name").asText();
        String body = mvc.perform(get("/api/operational/lineage")
                .param("node", SEED).param("cluster", "auto").param("prefer", "nope," + tail))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(mapper.readTree(body).get("activeCluster").asText()).isEqualTo(tail);
    }

    @Test
    void anUnknownClusterIs400() throws Exception {
        mvc.perform(get("/api/operational/lineage").param("node", SEED).param("cluster", "nope"))
           .andExpect(status().isBadRequest());
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mvn -q -am -pl backend test -Dtest=LineageContractTest`
Expected: FAIL — `activeCluster` is absent from the response because the controller never passes
`cluster` through, and `cluster=nope` returns 200.

- [ ] **Step 3: Widen the endpoint**

Replace the `lineage` handler (`ClusterController.java:162-170`) with:

```java
    /**
     * One node's transitive upstream AND downstream closure — see {@link LineageDto}, ADR-0020 and
     * ADR-0021.
     *
     * <p>Unlike {@code /search}, an unknown {@code node} IS a 404: the caller here has a node id
     * in hand (it came from a graph this server served), so a miss means something is genuinely
     * wrong rather than that the user is still typing.
     *
     * <p>{@code cluster} is absent for the unscoped closure (ADR-0020's contract, unchanged),
     * {@code auto} to let the server resolve the seed's cluster, or a name. An unknown NAME is a
     * 400 rather than a 404 because — unlike {@code node} — a cluster name can reach this endpoint
     * from a URL an operator typed. {@code prefer} is the caller's current selection and is read
     * only when {@code cluster=auto}.
     */
    @GetMapping("/lineage")
    public LineageDto lineage(@RequestParam("node") String node,
                              @RequestParam(name = "limit", defaultValue = "" + LINEAGE_DEFAULT_LIMIT) int limit,
                              @RequestParam(name = "cluster", required = false) String cluster,
                              @RequestParam(name = "prefer", required = false) String prefer) {
        if (limit < 1 || limit > LINEAGE_MAX_LIMIT) {
            throw new InvalidRequestException(
                "limit must be between 1 and " + LINEAGE_MAX_LIMIT + ", got " + limit);
        }
        List<String> preferred = prefer == null || prefer.isBlank() ? List.of()
            : java.util.Arrays.stream(prefer.split(",")).map(String::trim)
                .filter(s -> !s.isEmpty()).toList();
        return lineage.lineage(node, limit, cluster, preferred);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mvn -q -am -pl backend test -Dtest=LineageContractTest`
Expected: PASS — all ten original tests plus the seven appended ones.

- [ ] **Step 5: Run the whole backend suite**

Run: `mvn -q -am -pl backend test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/io/pure360/etl360/api/ClusterController.java \
        backend/src/test/java/io/pure360/etl360/LineageContractTest.java \
        docs/superpowers/plans/2026-08-31-lineage-cluster-scope.md
git commit -m "feat(api): lineage takes cluster and prefer"
```

---
## Task 4: `applyOffsets` — the pure geometry for drag

Spec §4. Defect 3, part 1. No component change yet; this is the engine and its tests.

**Files:**
- Modify: `frontend/src/components/tab3/lineageLayout.ts:266-284`
- Modify: `frontend/src/components/tab3/lineageLayout.test.ts` (append only)

**Interfaces:**
- Produces: `anchorAt(p: PlacedNode, side: 'out' | 'in') → { x: number; y: number }` (module-level, replacing the closure inside `layoutLineage`); `applyOffsets(layout: LineageLayout, offsets: Record<string, { dx: number; dy: number }>) → LineageLayout`.
- Consumed by: Task 5 (`LineageFlow`).

- [ ] **Step 1: Write the failing test (append to `lineageLayout.test.ts`)**

```ts
describe('applyOffsets', () => {
  // a --writes--> b, adjacent columns, so the edge has exactly two points and both are real.
  const simple = () => layoutLineage([n('a', 0, 'STG'), n('b', 1, 'DWH')], [e('a', 'b')])

  it('is identity when nothing has been dragged', () => {
    const base = simple()
    expect(applyOffsets(base, {})).toEqual(base)
  })

  it('moves the card', () => {
    const base = simple()
    const a0 = base.nodes.find(p => p.id === 'a')!
    const moved = applyOffsets(base, { a: { dx: 40, dy: 25 } })
    const a1 = moved.nodes.find(p => p.id === 'a')!
    expect(a1.x).toBe(a0.x + 40)
    expect(a1.y).toBe(a0.y + 25)
  })

  it('re-anchors the OUTGOING edge onto the dragged card', () => {
    // This is the defect: the card moved and the arrow stayed behind.
    const moved = applyOffsets(simple(), { a: { dx: 40, dy: 25 } })
    const a = moved.nodes.find(p => p.id === 'a')!
    expect(moved.edges[0]!.points[0]).toEqual({
      x: a.x + LINEAGE_FOOTPRINT.width,
      y: a.y + LINEAGE_FOOTPRINT.height / 2,
    })
  })

  it('re-anchors the INCOMING edge onto the dragged card', () => {
    const moved = applyOffsets(simple(), { b: { dx: -12, dy: 60 } })
    const b = moved.nodes.find(p => p.id === 'b')!
    const pts = moved.edges[0]!.points
    expect(pts[pts.length - 1]).toEqual({
      x: b.x,
      y: b.y + LINEAGE_FOOTPRINT.height / 2,
    })
  })

  it('leaves interior lane waypoints where the layout put them', () => {
    // A long edge travels a reserved lane through dummies. Dropping those waypoints would
    // straighten it back through the cards routing exists to avoid.
    const base = layoutLineage(
      [n('a', 0, 'STG'), n('m', 1, 'STG'), n('z', 2, 'DWH')],
      [e('a', 'z'), e('a', 'm')],
    )
    const long = base.edges.find(x => x.from === 'a' && x.to === 'z')!
    expect(long.points.length).toBeGreaterThan(2)
    const moved = applyOffsets(base, { a: { dx: 30, dy: 0 } })
    const movedLong = moved.edges.find(x => x.from === 'a' && x.to === 'z')!
    expect(movedLong.points.slice(1, -1)).toEqual(long.points.slice(1, -1))
  })

  it('does not mutate the layout it was given', () => {
    const base = simple()
    const before = JSON.parse(JSON.stringify(base))
    applyOffsets(base, { a: { dx: 40, dy: 25 } })
    expect(base).toEqual(before)
  })
})
```

Add `applyOffsets` to the existing import block at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- lineageLayout`
Expected: FAIL — `applyOffsets is not a function` / TS error on the import.

- [ ] **Step 3: Hoist `anchor` to module scope**

In `lineageLayout.ts`, delete the local `anchor` closure inside `layoutLineage`
(`lineageLayout.ts:266-273`) and add this above `layoutLineage`:

```ts
/** Where an edge meets a card: the right edge leaving it, the left edge entering it, vertically
 *  centred. A dummy is a lane waypoint, so an edge passes through its centre.
 *
 *  Module-level because `applyOffsets` must re-anchor a dragged card by exactly the same rule
 *  `layoutLineage` used — two copies would drift and the arrow would land beside the card. */
export function anchorAt(p: PlacedNode, side: 'out' | 'in'): { x: number; y: number } {
  if (p.isDummy) return { x: p.x, y: p.y + DUMMY_HEIGHT / 2 }
  return {
    x: side === 'out' ? p.x + LINEAGE_FOOTPRINT.width : p.x,
    y: p.y + LINEAGE_FOOTPRINT.height / 2,
  }
}
```

Inside `layoutLineage`, replace the deleted closure's call sites by keeping a thin local:

```ts
  const anchor = (id: string, side: 'out' | 'in') => anchorAt(posById.get(id)!, side)
```

- [ ] **Step 4: Write `applyOffsets` at the end of `lineageLayout.ts`**

```ts
/**
 * Drag offsets applied to a computed layout — cards AND the edge endpoints anchored to them.
 *
 * Dragging is an ADD-ON: offsets are never fed back into `layoutLineage`, so `applyOffsets(l, {})`
 * is `l` and "reset layout" returns exactly what the layout engine computed. The default has to
 * be excellent on its own.
 *
 * Only the FIRST and LAST point of an edge move. The points between are dummy lane waypoints
 * reserved so a long edge does not vanish behind the cards it spans (50 of 81 real lineages have
 * one); dropping them would straighten the edge back through those cards, re-creating the exact
 * defect routing exists to fix. A far drag therefore bends such an edge — the cheaper cost, and
 * the honest one: the arrow still lands on the card.
 */
export function applyOffsets(
  layout: LineageLayout,
  offsets: Record<string, { dx: number; dy: number }>,
): LineageLayout {
  if (Object.keys(offsets).length === 0) return layout

  const nodes = layout.nodes.map(p => {
    const o = offsets[p.id]
    return o && (o.dx !== 0 || o.dy !== 0) ? { ...p, x: p.x + o.dx, y: p.y + o.dy } : p
  })
  const posById = new Map(nodes.map(p => [p.id, p]))

  const edges = layout.edges.map(edge => {
    const from = posById.get(edge.from)
    const to = posById.get(edge.to)
    if (!from && !to) return edge
    const points = [...edge.points]
    if (from) points[0] = anchorAt(from, 'out')
    if (to) points[points.length - 1] = anchorAt(to, 'in')
    return { ...edge, points }
  })

  return { ...layout, nodes, edges }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && pnpm test -- lineageLayout`
Expected: PASS — the pre-existing layout tests plus the six new ones.

- [ ] **Step 6: Commit**

```bash
cd frontend && pnpm format && cd ..
git add frontend/src/components/tab3/lineageLayout.ts \
        frontend/src/components/tab3/lineageLayout.test.ts \
        docs/superpowers/plans/2026-08-31-lineage-cluster-scope.md
git commit -m "feat(tab3): applyOffsets re-anchors edges onto dragged cards"
```

---

## Task 5: the flow draws through `applyOffsets`

Defect 3, part 2. Wiring only — the geometry is already proven.

**Files:**
- Modify: `frontend/src/components/tab3/LineageFlow.tsx:100-118,383-390,415-460`
- Modify: `frontend/src/components/tab3/LineageFlow.test.tsx` (append only)

**Interfaces:**
- Consumes: `applyOffsets` (Task 4).
- Produces: nothing new; `LineageFlow`'s props are unchanged.

- [ ] **Step 1: Write the failing test (append to `LineageFlow.test.tsx`)**

```ts
describe('dragging keeps the arrows attached', () => {
  it('moves an edge endpoint with the card it is anchored to', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    const seed = await screen.findByTestId('lineage-seed')

    const edgeD = () =>
      Array.from(document.querySelectorAll('path[data-lineage-edge]')).map(p =>
        p.getAttribute('d'),
      )
    const before = edgeD()

    fireEvent.pointerDown(seed, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(window, { clientX: 190, clientY: 160 })
    fireEvent.pointerUp(window)

    await waitFor(() => expect(edgeD()).not.toEqual(before))

    // Precise claim, not merely "something changed": the outgoing edge starts at the card's
    // new right-edge anchor.
    const base = layoutLineage(NODES, EDGES)
    const p = base.nodes.find(x => x.id === 'seed')!
    const x = p.x + 90 + RAIL_W + LINEAGE_FOOTPRINT.width
    const y = p.y + 60 + LINEAGE_FOOTPRINT.height / 2
    expect(edgeD().some(d => d?.startsWith(`M${x} ${y}`))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- LineageFlow`
Expected: FAIL — the edge `d` attributes are unchanged after the drag, because edges are drawn
from `layout.edges` and never see the offsets.

- [ ] **Step 3: Render from the offset layout**

In `LineageFlow.tsx`, immediately after the existing `layout` memo, add:

```ts
  // Cards AND edges are drawn from the OFFSET layout, so an arrow stays attached to the card it
  // points at. `applyOffsets({})` is identity, so `reset layout` is exactly `layoutLineage`.
  const view = useMemo(() => (layout ? applyOffsets(layout, offsets) : null), [layout, offsets])
```

Delete the `at()` helper (`LineageFlow.tsx:114-117`). Then:

- change the empty guard to `if (data.nodes.length === 0 || !layout || !view) {`
- replace every remaining `layout.` inside the returned JSX with `view.` (`view.bands`,
  `view.width`, `view.height`, `view.edges`, `view.nodes`)
- in the node map, replace `const pos = at(p)` with `const pos = p`
- leave `seedX` reading `layout` (not `view`): the initial scroll-to-seed must centre the
  COMPUTED position, not one the operator has since dragged away.

Import `applyOffsets` alongside `layoutLineage` from `./lineageLayout`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm test -- LineageFlow`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
cd frontend && pnpm format && cd ..
git add frontend/src/components/tab3/LineageFlow.tsx \
        frontend/src/components/tab3/LineageFlow.test.tsx \
        docs/superpowers/plans/2026-08-31-lineage-cluster-scope.md
git commit -m "fix(tab3): arrows follow dragged lineage cards"
```

---
## Task 6: `useDockWidth` + `DockSplitter`

Spec §6. Defect 1, part 1. Shared module and its tests; no host adopts it yet.

**Files:**
- Create: `frontend/src/components/shared/useDockWidth.tsx` (JSX — `DockSplitter` lives here too)
- Create: `frontend/src/components/shared/useDockWidth.test.ts`

**Interfaces:**
- Produces: `useDockWidth(storageKey: string, bounds: { dflt: number; min: number; max: number }) → { width: number; setWidth: (px: number) => void; reset: () => void }`; `DockSplitter({ width, onResize, testId }: { width: number; onResize: (px: number) => void; testId?: string })`.
- Consumed by: Task 7 (both `Details` panes).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDockWidth } from './useDockWidth'

const KEY = 'etl360.test.dockW'
const BOUNDS = { dflt: 300, min: 240, max: 720 }

describe('useDockWidth', () => {
  beforeEach(() => localStorage.clear())

  it('starts at the default when nothing is stored', () => {
    const { result } = renderHook(() => useDockWidth(KEY, BOUNDS))
    expect(result.current.width).toBe(300)
  })

  it('restores a stored width', () => {
    localStorage.setItem(KEY, '480')
    const { result } = renderHook(() => useDockWidth(KEY, BOUNDS))
    expect(result.current.width).toBe(480)
  })

  it('clamps a stored width that is out of bounds', () => {
    // Clamp on READ, not only on write: a bound can move between releases, and a value
    // stored under the old one would otherwise break the layout on every reload with no
    // in-app way out.
    localStorage.setItem(KEY, '5000')
    expect(renderHook(() => useDockWidth(KEY, BOUNDS)).result.current.width).toBe(720)
    localStorage.setItem(KEY, '10')
    expect(renderHook(() => useDockWidth(KEY, BOUNDS)).result.current.width).toBe(240)
  })

  it('ignores a stored value that is not a finite number', () => {
    // A hand-edited or schema-changed blob would otherwise flow straight into a CSS width.
    for (const bad of ['wide', 'NaN', '{"w":1}', '']) {
      localStorage.setItem(KEY, bad)
      expect(renderHook(() => useDockWidth(KEY, BOUNDS)).result.current.width).toBe(300)
    }
  })

  it('persists and clamps a new width', () => {
    const { result } = renderHook(() => useDockWidth(KEY, BOUNDS))
    act(() => result.current.setWidth(999))
    expect(result.current.width).toBe(720)
    expect(localStorage.getItem(KEY)).toBe('720')
  })

  it('reset drops the stored value and returns to the default', () => {
    const { result } = renderHook(() => useDockWidth(KEY, BOUNDS))
    act(() => result.current.setWidth(500))
    act(() => result.current.reset())
    expect(result.current.width).toBe(300)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('survives storage being unavailable', () => {
    const real = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('quota')
    }
    try {
      const { result } = renderHook(() => useDockWidth(KEY, BOUNDS))
      act(() => result.current.setWidth(420))
      // Degrades to in-memory rather than throwing into the render tree.
      expect(result.current.width).toBe(420)
    } finally {
      Storage.prototype.setItem = real
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- useDockWidth`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import { useCallback, useRef, useState } from 'react'

/**
 * A persisted, clamped width for a docked side panel.
 *
 * Modelled on `tab2/useResizableLayout.ts`, whose three defensive properties are the point:
 * a stored value that is not a finite number is IGNORED (a hand-edited or schema-changed blob
 * would otherwise flow straight into a CSS width); bounds are applied on READ as well as write
 * (a bound can move between releases, and a value stored under the old one would break the
 * layout on every reload with no in-app way out); and every storage call is guarded, so private
 * mode or an enterprise policy degrades to an in-memory width instead of throwing into render.
 */
export interface DockBounds {
  dflt: number
  min: number
  max: number
}

const clamp = (px: number, b: DockBounds) => Math.min(b.max, Math.max(b.min, px))

function read(key: string, b: DockBounds): number {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return b.dflt
    const value = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(value)) return b.dflt
    return clamp(value, b)
  } catch {
    return b.dflt
  }
}

export function useDockWidth(
  storageKey: string,
  bounds: DockBounds,
): { width: number; setWidth: (px: number) => void; reset: () => void } {
  const [width, setWidthState] = useState(() => read(storageKey, bounds))

  const setWidth = useCallback(
    (px: number) => {
      const next = clamp(px, bounds)
      setWidthState(next)
      try {
        localStorage.setItem(storageKey, String(next))
      } catch {
        // Storage disabled — the width still applies for this session.
      }
    },
    [storageKey, bounds.min, bounds.max],
  )

  const reset = useCallback(() => {
    setWidthState(bounds.dflt)
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // Nothing to clear.
    }
  }, [storageKey, bounds.dflt])

  return { width, setWidth, reset }
}

/**
 * The 4px grab strip on a right-hand dock's left edge.
 *
 * The drag math is `EditorLayout`'s idiom and both halves of it matter: the start width is
 * captured once at pointerdown and every move recomputes from that fixed start plus the
 * accumulated delta — never from the previous move's already-clamped result, so a drag past the
 * floor and back does not drift. The move/up listeners go on `window`, because a 4px strip is
 * trivially outrun by a fast pointer, which would otherwise strand the gesture.
 */
export function DockSplitter({
  width,
  onResize,
  testId = 'dock-splitter',
}: {
  width: number
  onResize: (px: number) => void
  testId?: string
}): React.ReactElement {
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; w: number } | null>(null)

  const beginDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    start.current = { x: e.clientX, w: width }
    setDragging(true)
    const move = (ev: PointerEvent) => {
      const s = start.current
      if (!s) return
      // The dock is on the RIGHT, so dragging left grows it.
      onResize(s.w - (ev.clientX - s.x))
    }
    const up = () => {
      start.current = null
      setDragging(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      data-testid={testId}
      data-splitter="dock"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize details panel"
      onPointerDown={beginDrag}
      style={{
        width: 4,
        flexShrink: 0,
        cursor: 'col-resize',
        background: dragging ? '#4f9cf9' : 'var(--border)',
      }}
    />
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm test -- useDockWidth`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
cd frontend && pnpm format && cd ..
git add frontend/src/components/shared/useDockWidth.tsx \
        frontend/src/components/shared/useDockWidth.test.ts \
        docs/superpowers/plans/2026-08-31-lineage-cluster-scope.md
git commit -m "feat(shared): persisted, clamped dock width with a splitter"
```

---

## Task 7: both `Details` panes resize

Defect 1, part 2.

**Files:**
- Modify: `frontend/src/components/tab3/ETLOperational.tsx:1216-1232`
- Modify: `frontend/src/components/tab3/LineageFlow.tsx:516-524`
- Modify: `frontend/src/components/tab3/ETLOperational.test.tsx` (append only)

**Interfaces:**
- Consumes: `useDockWidth`, `DockSplitter` (Task 6).

- [ ] **Step 1: Write the failing test (append to `ETLOperational.test.tsx`)**

```tsx
describe('the details panel resizes', () => {
  it('drags to a new width and persists it', async () => {
    localStorage.removeItem('etl360.tab3.detailsW')
    renderTab()
    // Same idiom the surrounding tests use to open the panel.
    fireEvent.click(await screen.findByText('_ETL_m_CAS_T.json'))

    const panel = await screen.findByTestId('details-panel')
    expect(panel).toHaveStyle({ width: '300px' })

    fireEvent.pointerDown(screen.getByTestId('details-splitter'), { clientX: 800 })
    fireEvent.pointerMove(window, { clientX: 700 })
    fireEvent.pointerUp(window)

    await waitFor(() => expect(panel).toHaveStyle({ width: '400px' }))
    expect(localStorage.getItem('etl360.tab3.detailsW')).toBe('400')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- ETLOperational`
Expected: FAIL — `details-splitter` is not in the document.

- [ ] **Step 3: Wire the Tab 3 panel**

In `ETLOperational.tsx`, add the imports:

```ts
import { useDockWidth, DockSplitter } from '../shared/useDockWidth'
```

Add, next to the other hooks near the top of the component body:

```ts
  const detailsDock = useDockWidth('etl360.tab3.detailsW', { dflt: 300, min: 240, max: 720 })
```

Then wrap the detail side panel — replace `{selectedCard && (` … `<div data-testid="details-panel" style={{ width: 300, …`:

```tsx
        {selectedCard && (
          <>
            <DockSplitter
              testId="details-splitter"
              width={detailsDock.width}
              onResize={detailsDock.setWidth}
            />
            <div
              data-testid="details-panel"
              style={{
                width: detailsDock.width,
                flexShrink: 0,
                background: 'var(--surface)',
                borderLeft: '1px solid var(--border)',
                overflow: 'auto',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
```

and close it with `</div></>)` where the panel's `</div>)}` currently is.

- [ ] **Step 4: Wire the lineage dock**

In `LineageFlow.tsx`, add the same import and:

```ts
  const dock = useDockWidth('etl360.tab3.lineageDetailsW', { dflt: 264, min: 220, max: 640 })
```

Replace `{selectedNode && (` … `width: 264,` with:

```tsx
        {selectedNode && (
          <>
            <DockSplitter
              testId="lineage-details-splitter"
              width={dock.width}
              onResize={dock.setWidth}
            />
            <div
              data-testid="lineage-details"
              style={{
                width: dock.width,
                flexShrink: 0,
                overflow: 'auto',
                borderLeft: '1px solid var(--border)',
                paddingLeft: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
```

and close it with `</div></>)`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && pnpm test -- 'ETLOperational|LineageFlow' && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
cd frontend && pnpm format && cd ..
git add frontend/src/components/tab3/ETLOperational.tsx \
        frontend/src/components/tab3/ETLOperational.test.tsx \
        frontend/src/components/tab3/LineageFlow.tsx \
        docs/superpowers/plans/2026-08-31-lineage-cluster-scope.md
git commit -m "feat(tab3): both details panes drag to width"
```

---
## Task 8: `NodeDetails` — the one Details body

Spec §5. Defect 4, part 1. New shared component + `resolvePreview` moved out; no host adopts it
yet.

**Files:**
- Create: `frontend/src/components/shared/nodePreview.ts`
- Create: `frontend/src/components/shared/NodeDetails.tsx`
- Create: `frontend/src/components/shared/NodeDetails.test.tsx`

**Interfaces:**
- Consumes: `OperationalCard`, `pickDefaultRun` (`shared/RunPicker`), `GCPIcon`, `buildLoggingUrl`/`buildDataprocClusterUrl`/`buildBigQueryUrl` (`api/gcpLinks`).
- Produces:
  - `resolvePreview(card: CardData, edges: OperationalEdge[], nodeById: Map<string, NodeDto>) → { recipePath: string | null; mappingPath: string | null }` (moved verbatim from `ETLOperational.tsx:68-82`).
  - `NodeDetails(props)` where props are `{ card: CardData; runs?: RunT[]; selectedRunDate?: string | null; onSelectRun?: (run: RunT) => void; config?: AppConfig; previewTarget: { recipePath: string | null; mappingPath: string | null }; onPreview: () => void; fallbackClusterName?: string; clusters?: string[]; hopLabel?: string | null; onCenterLineage?: () => void; related?: ReactNode; onClose: () => void }`.
- Consumed by: Task 9 (both hosts).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NodeDetails } from './NodeDetails'
import type { OperationalCard as CardData } from '../../types'

const CARD: CardData = {
  id: 'table:ODS.MIDDLE',
  kind: 'table',
  name: 'ODS.MIDDLE',
  layer: 'ODS',
  status: 'OK',
  lastRun: '2026-08-30T04:00:00Z',
  history: [],
  stats: { avg_time_s: 0, p50: 0, p95: 0, p99: 0, avg_count: 0 },
  relations: [],
}

const NOOP = () => {}
const TARGET = { recipePath: 'DWH/m_X/_ETL_m_X.json', mappingPath: 'DWH/m_X' }

describe('NodeDetails', () => {
  it('offers Preview and all three GCP links', () => {
    render(
      <NodeDetails card={CARD} previewTarget={TARGET} onPreview={NOOP} onClose={NOOP} />,
    )
    expect(screen.getByText('Open preview')).toBeEnabled()
    expect(screen.getByText('Open in BigQuery')).toBeInTheDocument()
    expect(screen.getByText('Monitoring Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Cloud Logging')).toBeInTheDocument()
  })

  it('disables Preview when no recipe path resolves', () => {
    render(
      <NodeDetails
        card={CARD}
        previewTarget={{ recipePath: null, mappingPath: null }}
        onPreview={NOOP}
        onClose={NOOP}
      />,
    )
    expect(screen.getByText('Open preview').closest('button')).toBeDisabled()
  })

  it('shows the hop line and the centre control only when the host asks for them', () => {
    const onCentre = vi.fn()
    const { rerender } = render(
      <NodeDetails card={CARD} previewTarget={TARGET} onPreview={NOOP} onClose={NOOP} />,
    )
    expect(screen.queryByLabelText('Center lineage here')).toBeNull()

    rerender(
      <NodeDetails
        card={CARD}
        previewTarget={TARGET}
        onPreview={NOOP}
        onClose={NOOP}
        hopLabel="hop -1 upstream"
        onCenterLineage={onCentre}
      />,
    )
    fireEvent.click(screen.getByLabelText('Center lineage here'))
    expect(onCentre).toHaveBeenCalled()
    expect(screen.getByText('hop -1 upstream')).toBeInTheDocument()
  })

  it('renders the host-supplied related block, and nothing when there is none', () => {
    const { rerender } = render(
      <NodeDetails card={CARD} previewTarget={TARGET} onPreview={NOOP} onClose={NOOP} />,
    )
    expect(screen.queryByTestId('related-block')).toBeNull()
    rerender(
      <NodeDetails
        card={CARD}
        previewTarget={TARGET}
        onPreview={NOOP}
        onClose={NOOP}
        related={<div data-testid="related-block">4 relations</div>}
      />,
    )
    expect(screen.getByTestId('related-block')).toBeInTheDocument()
  })

  it('lists the clusters it is given', () => {
    render(
      <NodeDetails
        card={CARD}
        previewTarget={TARGET}
        onPreview={NOOP}
        onClose={NOOP}
        clusters={['cluster-a', 'cluster-b']}
      />,
    )
    expect(screen.getByText('cluster-a')).toBeInTheDocument()
    expect(screen.getByText('cluster-b')).toBeInTheDocument()
  })

  it('closes', () => {
    const onClose = vi.fn()
    render(
      <NodeDetails card={CARD} previewTarget={TARGET} onPreview={NOOP} onClose={onClose} />,
    )
    fireEvent.click(screen.getByLabelText('Close details'))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- NodeDetails`
Expected: FAIL — module not found.

- [ ] **Step 3: Move `resolvePreview` into `shared/nodePreview.ts`**

Cut `resolvePreview` verbatim from `ETLOperational.tsx:68-82` into a new file:

```ts
import type { OperationalCard as CardData } from '../../types'
import type { OperationalEdge } from '../../api/relationshipsAdapter'
import type { NodeDto } from '../../api/queries'

/** The recipe a card previews: itself if it IS a recipe, otherwise the recipe that WRITES it. */
export function resolvePreview(
  card: CardData,
  edges: OperationalEdge[],
  nodeById: Map<string, NodeDto>,
): { recipePath: string | null; mappingPath: string | null } {
  const recipeId =
    card.kind === 'recipe'
      ? card.id
      : edges.find(e => e.kind === 'writes' && e.toId === card.id)?.fromId
  const node = recipeId ? nodeById.get(recipeId) : undefined
  const mappingPath = node?.mappingPath ?? null
  const name = node?.name ?? null
  if (!mappingPath || !name) return { recipePath: null, mappingPath }
  return { recipePath: `${mappingPath}/${name}`, mappingPath }
}
```

If the `OperationalEdge` / `NodeDto` import paths in `ETLOperational.tsx` differ, copy the ones
that file already uses rather than guessing. Import `resolvePreview` back into
`ETLOperational.tsx` from `'../shared/nodePreview'` so it still compiles.

- [ ] **Step 4: Write `NodeDetails.tsx`**

Move `PreviewButton` and `GCPLink` verbatim from `ETLOperational.tsx:1406-1473` into this file
(keeping their comments) and delete them from `ETLOperational.tsx`. Then:

```tsx
/**
 * The Details body, rendered by BOTH Tab 3's side panel and the lineage dock.
 *
 * One component on purpose: the dock shipped as a second, thinner panel and immediately drifted —
 * it never gained Preview or the GCP links, so an operator inspecting a node inside the lineage
 * had to close the whole overlay to reach them. This is the same anti-drift argument
 * `RelatedOverlay` makes for its window/tab pair.
 *
 * The host owns the sized container and the splitter; this renders the CONTENT only. Host-specific
 * pieces are props, not forks: Tab 3 passes `related` (its ◀ ▶ trail and neighbour list), the dock
 * passes `hopLabel` and `onCenterLineage`. The dock deliberately gets no `related` — the flow it
 * sits beside already IS that list, in a better form.
 */
export function NodeDetails({
  card,
  runs = [],
  selectedRunDate = null,
  onSelectRun,
  config,
  previewTarget,
  onPreview,
  fallbackClusterName = '',
  clusters = [],
  hopLabel = null,
  onCenterLineage,
  related = null,
  onClose,
}: {
  card: CardData
  runs?: RunT[]
  selectedRunDate?: string | null
  onSelectRun?: (run: RunT) => void
  config?: AppConfig
  previewTarget: { recipePath: string | null; mappingPath: string | null }
  onPreview: () => void
  /** Used for the Dataproc link when no run is selected — the host knows the card's last cluster. */
  fallbackClusterName?: string
  clusters?: string[]
  hopLabel?: string | null
  onCenterLineage?: () => void
  related?: ReactNode
  onClose: () => void
}) {
  // Every URL comes from `gcpLinks.ts`'s builders over the served templates (ADR-0015) — anchored
  // on the SELECTED run (its job id and its `app_start_iso` cursor) when one exists, degrading to
  // the card's own last job id when the run history is unavailable.
  const selectedRun = pickDefaultRun(runs, selectedRunDate)
  const linkJobId = selectedRun?.jobId || card.jobId || ''
  const clusterName = selectedRun?.clusterName || fallbackClusterName
  const loggingHref = buildLoggingUrl(config, {
    jobId: linkJobId,
    cursorTimestamp: selectedRun?.appStartIso ?? '',
  })
  const monitoringHref = buildDataprocClusterUrl(config, { clusterName })
  const bigQueryHref = buildBigQueryUrl(config)

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f8', flex: 1 }}>Details</span>
        <button
          aria-label="Close details"
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#4a5570', cursor: 'pointer' }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 2l9 9M11 2L2 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <OperationalCard
        card={card}
        selected
        runs={runs}
        selectedRunDate={selectedRunDate}
        onSelectRun={onSelectRun}
        config={config}
      />

      {onCenterLineage && (
        <button
          aria-label="Center lineage here"
          onClick={onCenterLineage}
          style={{
            padding: '5px 8px',
            borderRadius: 4,
            fontSize: 10,
            width: '100%',
            cursor: 'pointer',
            background: 'var(--surface-3)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          ⌖ center lineage here
        </button>
      )}

      {related}

      {clusters.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 8 }}>Clusters</div>
          {clusters.map(c => (
            <div
              key={c}
              style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                fontFamily: 'JetBrains Mono, monospace',
                padding: '2px 0',
              }}
            >
              {c}
            </div>
          ))}
        </div>
      )}

      {hopLabel && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{hopLabel}</div>}

      <div>
        <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 8 }}>Preview</div>
        <PreviewButton enabled={!!previewTarget.recipePath} onClick={onPreview} />
      </div>

      <div>
        <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 8 }}>GCP Quick Links</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <GCPLink icon="bigquery" label="Open in BigQuery" href={bigQueryHref} />
          <GCPLink icon="monitoring" label="Monitoring Dashboard" href={monitoringHref} />
          <GCPLink icon="logging" label="Cloud Logging" href={loggingHref} />
        </div>
      </div>
    </>
  )
}
```

Imports this file needs:

```ts
import type { ReactNode } from 'react'
import type { OperationalCard as CardData } from '../../types'
import type { AppConfig } from '../../api/queries'
import type { RunT } from '../../api/clusterQueries'
import { OperationalCard } from './OperationalCard'
import { pickDefaultRun } from './RunPicker'
import { GCPIcon } from './GCPIcon'
import { buildLoggingUrl, buildDataprocClusterUrl, buildBigQueryUrl } from '../../api/gcpLinks'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && pnpm test -- NodeDetails && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
cd frontend && pnpm format && cd ..
git add frontend/src/components/shared/NodeDetails.tsx \
        frontend/src/components/shared/NodeDetails.test.tsx \
        frontend/src/components/shared/nodePreview.ts \
        frontend/src/components/tab3/ETLOperational.tsx \
        docs/superpowers/plans/2026-08-31-lineage-cluster-scope.md
git commit -m "feat(shared): one NodeDetails body for both panes"
```

---

## Task 9: both hosts render `NodeDetails`

Defect 4, part 2. This is where the lineage dock actually gains Preview and the GCP links.

**Files:**
- Modify: `frontend/src/components/tab3/ETLOperational.tsx` (details panel body)
- Modify: `frontend/src/components/tab3/LineageFlow.tsx` (dock body)
- Modify: `frontend/src/components/tab3/LineageFlow.test.tsx` (append only)

**Interfaces:**
- Consumes: `NodeDetails`, `resolvePreview` (Task 8).
- Produces: `LineageFlow` gains optional props `nodeDetailsExtras?: { edges: OperationalEdge[]; nodeById: Map<string, NodeDto>; config?: AppConfig }` — supplied by `RelatedOverlay` so the dock can resolve a preview target and build GCP links.

- [ ] **Step 1: Write the failing test (append to `LineageFlow.test.tsx`)**

```tsx
describe('the lineage dock is the full Details panel', () => {
  it('shows Preview and the GCP links for a selected node', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    fireEvent.click(await screen.findByTestId('lineage-seed'))

    const dock = await screen.findByTestId('lineage-details')
    expect(within(dock).getByText('Open preview')).toBeInTheDocument()
    expect(within(dock).getByText('Open in BigQuery')).toBeInTheDocument()
    expect(within(dock).getByText('Monitoring Dashboard')).toBeInTheDocument()
    expect(within(dock).getByText('Cloud Logging')).toBeInTheDocument()
  })

  it('keeps the hop line and the centre control', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    fireEvent.click(await screen.findByTestId('lineage-seed'))
    const dock = await screen.findByTestId('lineage-details')
    expect(within(dock).getByText(/hop 0 \(seed\)/)).toBeInTheDocument()
    expect(within(dock).getByLabelText('Center lineage here')).toBeInTheDocument()
  })

  it('does NOT duplicate the flow as a Related list', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    fireEvent.click(await screen.findByTestId('lineage-seed'))
    const dock = await screen.findByTestId('lineage-details')
    expect(within(dock).queryByText(/^Related/)).toBeNull()
  })
})
```

Add `within` to the `@testing-library/react` import at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- LineageFlow`
Expected: FAIL — "Open preview" is not in the dock.

- [ ] **Step 3: Replace the Tab 3 panel body**

In `ETLOperational.tsx`, replace everything **inside** `<div data-testid="details-panel">` (the
header, `OperationalCard`, related block, Preview block and GCP block) with:

```tsx
              <NodeDetails
                card={selectedCard}
                runs={selectedRuns}
                selectedRunDate={view.selectedRunDate}
                onSelectRun={run => setOperationalView({ selectedRunDate: run.date ?? null })}
                config={cfg.data}
                previewTarget={previewTarget}
                onPreview={() => setPreview(previewTarget)}
                fallbackClusterName={
                  summary.data?.recipes?.find(r => r.recipeFilename === selectedCard.name)
                    ?.lastClusterName ?? ''
                }
                related={relatedBlock}
                onClose={() => setOperationalView({ selectedNode: null })}
              />
```

Hoist the existing related block (the ◀ ▶ buttons, the `Related (n)` label, the
`Show all related ↗` anchor and the `related-card` list) verbatim into a
`const relatedBlock = (…)` just above the `return`. Delete the now-dead
`loggingHref` / `monitoringHref` / `bigQueryHref` / `selectedRun` / `linkJobId` / `clusterName`
locals (`ETLOperational.tsx:929-943`) — `NodeDetails` computes them — and drop the now-unused
`buildLoggingUrl` / `buildDataprocClusterUrl` / `buildBigQueryUrl` / `pickDefaultRun` /
`GCPIcon` imports.

- [ ] **Step 4: Replace the lineage dock body**

In `LineageFlow.tsx`, replace everything inside `<div data-testid="lineage-details">` with:

```tsx
              <NodeDetails
                card={toCard(selectedNode, statusById[selectedNode.id] ?? 'PENDING')}
                config={extras?.config}
                previewTarget={
                  extras
                    ? resolvePreview(
                        toCard(selectedNode, statusById[selectedNode.id] ?? 'PENDING'),
                        extras.edges,
                        extras.nodeById,
                      )
                    : { recipePath: null, mappingPath: null }
                }
                onPreview={() => onPreview?.(selectedNode.id)}
                clusters={selectedNode.clusters}
                hopLabel={`hop ${
                  selectedNode.hop === 0
                    ? '0 (seed)'
                    : selectedNode.hop > 0
                      ? `+${selectedNode.hop} downstream`
                      : `${selectedNode.hop} upstream`
                }`}
                onCenterLineage={() => onReseed?.(selectedNode.id)}
                onClose={() => setSelected(null)}
              />
```

Add the props `extras?: { edges: OperationalEdge[]; nodeById: Map<string, NodeDto>; config?: AppConfig }`
and `onPreview?: (nodeId: string) => void` to `LineageFlow`'s signature, both optional so the
existing tests keep rendering `<LineageFlow nodeId="seed" />` unchanged.

- [ ] **Step 5: Feed the dock from `RelatedOverlay`**

In `RelatedOverlay.tsx`, build the extras from the scoped graph it already holds and pass them
plus a preview handler through:

```tsx
  const nodeById = useMemo(
    () => new Map((rel.data?.nodes ?? []).map(n => [n.id, n])),
    [rel.data],
  )
  const cfg = useAppConfig()
```

```tsx
        <LineageFlow
          nodeId={nodeId}
          statusById={statusById}
          selectedClusters={clusters}
          extras={{ edges: graph?.edges ?? [], nodeById, config: cfg.data }}
          onPreview={onPreview}
          onSelect={onFocus}
          onReseed={onReseed ?? onFocus}
        />
```

Add `onPreview?: (nodeId: string) => void` to `RelatedOverlay`'s props and have
`ETLOperational.tsx` pass one that resolves the target and calls `setPreview` — the same
`resolvePreview(card, graph.edges, nodeById)` it already uses for its own panel. `useAppConfig`
is the config hook `ETLOperational.tsx:479` already uses; import it from `api/queries`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && pnpm test && npx tsc --noEmit`
Expected: PASS across the whole frontend suite, no type errors.

- [ ] **Step 7: Commit**

```bash
cd frontend && pnpm format && cd ..
git add frontend/src/components/tab3/ETLOperational.tsx \
        frontend/src/components/tab3/LineageFlow.tsx \
        frontend/src/components/tab3/LineageFlow.test.tsx \
        frontend/src/components/tab3/RelatedOverlay.tsx \
        docs/superpowers/plans/2026-08-31-lineage-cluster-scope.md
git commit -m "feat(tab3): the lineage dock gains preview and the GCP links"
```

---
## Task 10: the API client learns about scope, and gateways render

Spec §3.4, §3.3. Defect 2, part 1.

**Files:**
- Modify: `frontend/src/api/clusterQueries.ts:146-180`
- Modify: `frontend/src/components/tab3/LineageFlow.tsx` (node map)
- Modify: `frontend/src/components/tab3/LineageFlow.test.tsx`

**Interfaces:**
- Produces: `LineageNodeT` gains `gateway?: boolean`; `LineageT` gains `activeCluster: string | null` and `clusterOptions: { name: string; recipes: number }[]`; `useLineage(nodeId: string | null, limit?: number, cluster?: string | null, prefer?: string[])`.
- Consumed by: Task 11 (switcher), Task 12 (`RelatedOverlay`).

- [ ] **Step 1: Write the failing test**

First extend the fixture at the top of `LineageFlow.test.tsx`. `NODES` and `EDGES` stay exactly
as they are — the existing tests count on them — and the gateway is added alongside, so
`NODES.length + 1` below is a real assertion rather than a tautology:

```tsx
// A recipe in ANOTHER cluster that reads t_out — the boundary. Kept out of NODES so the
// existing fixtures and their tests are untouched.
const GATEWAY: LineageNodeT = {
  id: 'r_far',
  kind: 'recipe',
  name: '_ETL_far.json',
  layer: 'CDM',
  hop: 3,
  clusters: ['cl-far'],
  gateway: true,
}
const GATEWAY_EDGE = { from: 't_out', to: 'r_far', kind: 'source' as const }
```

and change the `LINEAGE` constant the msw handler serves to:

```tsx
const LINEAGE: LineageT = {
  seed: 'seed',
  nodes: [...NODES, GATEWAY],
  edges: [...EDGES, GATEWAY_EDGE],
  truncated: false,
  totalReachable: 8,
  activeCluster: 'cl-a',
  clusterOptions: [
    { name: 'cl-a', recipes: 3 },
    { name: 'cl-far', recipes: 1 },
  ],
}
```

The `empty` handler in the same file needs `activeCluster: null` and `clusterOptions: []` added
for the same reason. Task 11's switcher tests reuse this fixture, so `cl-a` must be first and
`cl-far` second.

Then append:

```tsx
describe('cluster scope', () => {
  it('draws an out-of-cluster recipe as a stub, not a full card', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    const stub = await screen.findByTestId('lineage-gateway')
    // The stub names the recipe AND the cluster the chain continues into — that is what stops
    // the flow looking complete where it is not.
    expect(stub).toHaveTextContent('_ETL_far.json')
    expect(stub).toHaveTextContent('cl-far')
    // It is a stub: no OperationalCard status pill inside it.
    expect(within(stub).queryByText('PENDING')).toBeNull()
  })

  it('still counts the stub as a node', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    const summary = await screen.findByTestId('lineage-summary')
    expect(summary).toHaveTextContent(`${NODES.length + 1} nodes`)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- LineageFlow`
Expected: FAIL — `lineage-gateway` is not in the document.

- [ ] **Step 3: Widen the client types and hook**

In `clusterQueries.ts`:

```ts
/** One node on a lineage; `hop` is signed — negative upstream, 0 the seed, positive downstream. */
export interface LineageNodeT {
  id: string
  kind: 'recipe' | 'table'
  name: string
  layer: string
  hop: number
  clusters: string[]
  /** True for a recipe OUTSIDE the active cluster that touches a table inside it. The traversal
   *  stopped there; it is drawn as a stub naming its cluster. Always false when unscoped. */
  gateway?: boolean
}

export interface LineageT {
  seed: string
  nodes: LineageNodeT[]
  edges: { from: string; to: string; kind: 'source' | 'lookup' | 'writes' }[]
  truncated: boolean
  totalReachable: number
  /** The cluster actually scoped to, or null when unscoped. */
  activeCluster: string | null
  /** The SEED's own candidate clusters, count-descending then name — the switcher's contents. */
  clusterOptions: { name: string; recipes: number }[]
}
```

```ts
/**
 * One node's transitive lineage, optionally scoped to one b15 cluster.
 *
 * ADR-0020 shipped this unscoped, and on a real export that meant 150 drawn nodes out of 14 535
 * reachable ones across 21 clusters. ADR-0021 scopes it and keeps ADR-0020's reasoning by making
 * the boundary explicit: a cluster crossing is a GATEWAY stub naming where the chain continues,
 * never a silent stop. `cluster` is `null` for the unscoped closure, `'auto'` to let the server
 * resolve the seed's cluster, or a name; `prefer` is the caller's current selection and is read
 * only when `cluster === 'auto'`.
 */
export const useLineage = (
  nodeId: string | null,
  limit: number = LINEAGE_DEFAULT_LIMIT,
  cluster: string | null = null,
  prefer: string[] = [],
) =>
  useQuery({
    queryKey: ['lineage', nodeId, limit, cluster, prefer.join(',')],
    queryFn: () => {
      const params = new URLSearchParams({ node: nodeId!, limit: String(limit) })
      if (cluster) params.set('cluster', cluster)
      if (cluster === 'auto' && prefer.length > 0) params.set('prefer', prefer.join(','))
      return apiGet<LineageT>(`/operational/lineage?${params}`)
    },
    staleTime: STALE_MS,
    enabled: !!nodeId,
  })
```

- [ ] **Step 4: Render the stub**

In `LineageFlow.tsx`'s node map, branch before `<OperationalCard>`:

```tsx
                    {n.gateway ? (
                      <div
                        data-testid="lineage-gateway"
                        style={{
                          border: `1px dashed ${kindPalette('recipe').accent}`,
                          borderRadius: 6,
                          background: 'var(--surface-2)',
                          padding: '6px 8px',
                          opacity: 0.72,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            fontFamily: 'JetBrains Mono, monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {n.name}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                          {`↳ ${n.clusters[0] ?? 'other cluster'}`}
                        </div>
                      </div>
                    ) : (
                      <OperationalCard
                        card={toCard(n, statusById[n.id] ?? 'PENDING')}
                        density="compact"
                      />
                    )}
```

No new colour: `kindPalette('recipe').accent` is ADR-0017's existing recipe hue, and
`semanticColors.ts` stays the only file that maps a kind to one.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && pnpm test -- 'LineageFlow|clusterQueries' && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd frontend && pnpm format && cd ..
git add frontend/src/api/clusterQueries.ts \
        frontend/src/components/tab3/LineageFlow.tsx \
        frontend/src/components/tab3/LineageFlow.test.tsx \
        docs/superpowers/plans/2026-08-31-lineage-cluster-scope.md
git commit -m "feat(tab3): gateway stubs mark every cluster crossing"
```

---

## Task 11: the cluster switcher and "Loading from cluster"

Spec §3.6. Defect 2, part 2.

**Files:**
- Modify: `frontend/src/components/tab3/LineageFlow.tsx:273-311` (the `Clusters:` strip) and the flow body
- Modify: `frontend/src/components/tab3/LineageFlow.test.tsx`

**Interfaces:**
- Consumes: `useLineage(nodeId, limit, cluster, prefer)`, `LineageT.activeCluster`/`clusterOptions` (Task 10).
- Produces: `LineageFlow` gains props `cluster?: string | null`, `onClusterChange?: (name: string) => void`, `onActiveCluster?: (name: string | null) => void`.
- Consumed by: Task 12 (`RelatedOverlay` owns the state).

- [ ] **Step 1: Write the failing test (append to `LineageFlow.test.tsx`)**

```tsx
describe('the cluster switcher', () => {
  it('lists the seed clusters with the active one first and marked', async () => {
    render(<LineageFlow nodeId="seed" cluster="cl-a" />, { wrapper })
    const strip = await screen.findByTestId('lineage-clusters')
    const chips = within(strip).getAllByTestId('lineage-cluster-chip')
    expect(chips[0]).toHaveTextContent('cl-a')
    expect(chips[0]).toHaveAttribute('data-active', 'true')
  })

  it('reports a switch to the host', async () => {
    const picked: string[] = []
    render(
      <LineageFlow nodeId="seed" cluster="cl-a" onClusterChange={c => picked.push(c)} />,
      { wrapper },
    )
    const strip = await screen.findByTestId('lineage-clusters')
    fireEvent.click(within(strip).getAllByTestId('lineage-cluster-chip')[1]!)
    expect(picked).toEqual(['cl-far'])
  })

  it('clicking a gateway switches to its cluster and re-seeds on it', async () => {
    const picked: string[] = []
    const seeded: string[] = []
    render(
      <LineageFlow
        nodeId="seed"
        cluster="cl-a"
        onClusterChange={c => picked.push(c)}
        onReseed={id => seeded.push(id)}
      />,
      { wrapper },
    )
    fireEvent.click(await screen.findByTestId('lineage-gateway'))
    expect(picked).toEqual(['cl-far'])
    expect(seeded).toEqual(['r_far'])
  })

  it('says which cluster it is loading while the switch is in flight', async () => {
    // A cluster switch is not a filter — it is a different graph. A spinner over stale nodes
    // would imply otherwise.
    const { rerender } = render(<LineageFlow nodeId="seed" cluster="cl-a" />, { wrapper })
    await screen.findByTestId('lineage-seed')
    rerender(<LineageFlow nodeId="seed" cluster="cl-far" />)
    expect(await screen.findByTestId('lineage-switching')).toHaveTextContent(
      'Loading from cluster: cl-far',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- LineageFlow`
Expected: FAIL — `lineage-cluster-chip` and `lineage-switching` are not in the document.

- [ ] **Step 3: Take the cluster props and thread them into the query**

In `LineageFlow.tsx`'s signature add:

```ts
  cluster = null,
  onClusterChange,
  onActiveCluster,
```

with types `cluster?: string | null`, `onClusterChange?: (name: string) => void`,
`onActiveCluster?: (name: string | null) => void`, and change the query to:

```ts
  const lineage = useLineage(nodeId, limit, cluster, selectedClusters)
```

Report the resolution back to the host:

```ts
  const active = lineage.data?.activeCluster ?? null
  useEffect(() => {
    onActiveCluster?.(active)
  }, [active])
```

- [ ] **Step 4: Replace the `Clusters:` strip with the switcher**

Replace the whole `{clusters.length > 0 && (…)}` block with:

```tsx
        {data.clusterOptions.length > 0 && (
          <div
            data-testid="lineage-clusters"
            style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}
          >
            <span style={{ fontSize: 10, color: '#4a5570' }}>Cluster:</span>
            {[...data.clusterOptions]
              // Active first: the switcher's job is to say where you ARE before offering
              // where you could go.
              .sort((a, b) => Number(b.name === active) - Number(a.name === active))
              .map(o => {
                const isActive = o.name === active
                return (
                  <button
                    key={o.name}
                    data-testid="lineage-cluster-chip"
                    data-active={isActive ? 'true' : undefined}
                    onClick={() => onClusterChange?.(o.name)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 10,
                      padding: '1px 7px',
                      borderRadius: 999,
                      cursor: 'pointer',
                      fontFamily: 'JetBrains Mono, monospace',
                      background: isActive ? 'var(--surface-3)' : 'transparent',
                      border: `1px solid ${isActive ? 'var(--border)' : 'var(--border-subtle)'}`,
                      color: isActive ? 'var(--text)' : 'var(--text-dim)',
                    }}
                  >
                    {o.name}
                    <span style={{ color: 'var(--text-muted)' }}>{o.recipes}</span>
                  </button>
                )
              })}
          </div>
        )}
```

Delete the now-dead `clusterCounts` / `clusters` locals above the return.

- [ ] **Step 5: Gateway click switches and re-seeds**

In the node map's click handler:

```tsx
                    onClick={() => {
                      if (n.gateway) {
                        // Walking a gateway is the "traceback": go to that cluster, seeded on the
                        // recipe the operator pointed at.
                        const target = n.clusters[0]
                        if (target) onClusterChange?.(target)
                        onReseed?.(n.id)
                        return
                      }
                      setSelected(n.id)
                      onSelect?.(n.id)
                    }}
```

- [ ] **Step 6: The switching state**

Add above the loading guard:

```ts
  // A cluster switch is a different graph, not a filter, so the canvas is replaced rather than
  // spinner-ed over: showing stale nodes under a spinner would imply they belong to the cluster
  // being loaded.
  const switching = cluster !== null && cluster !== 'auto' && active !== null && cluster !== active
  if (switching || (lineage.isFetching && !lineage.data)) {
    return (
      <div
        data-testid="lineage-switching"
        style={{ padding: 16, fontSize: 12, color: 'var(--text-dim)' }}
      >
        {cluster && cluster !== 'auto'
          ? `Loading from cluster: ${cluster}…`
          : 'Tracing the lineage…'}
      </div>
    )
  }
```

and delete the old `if (lineage.isLoading)` block it replaces.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && pnpm test -- LineageFlow && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd frontend && pnpm format && cd ..
git add frontend/src/components/tab3/LineageFlow.tsx \
        frontend/src/components/tab3/LineageFlow.test.tsx \
        docs/superpowers/plans/2026-08-31-lineage-cluster-scope.md
git commit -m "feat(tab3): cluster switcher and an honest loading line"
```

---

## Task 12: the overlay owns the active cluster

Spec §3.6's last paragraph. Defect 2, part 3 — this is what makes status, edges and preview agree
with the nodes actually on screen.

**Files:**
- Modify: `frontend/src/components/tab3/RelatedOverlay.tsx`
- Modify: `frontend/src/components/tab3/RelatedOverlay.test.tsx`

**Interfaces:**
- Consumes: `LineageFlow`'s `cluster` / `onClusterChange` / `onActiveCluster` (Task 11).

- [ ] **Step 1: Write the failing test (append to `RelatedOverlay.test.tsx`)**

```tsx
it('scopes the status graph to the ACTIVE cluster, not the left-rail selection', async () => {
  const scopedFor: string[] = []
  server.use(
    http.get('/api/relationships', ({ request }) => {
      scopedFor.push(new URL(request.url).searchParams.get('clusters') ?? '')
      return HttpResponse.json(GRAPH)
    }),
  )
  render(<RelatedOverlay nodeId="seed" clusters={['cl-selected']} />, { wrapper })
  await screen.findByTestId('lineage-seed')
  // The lineage resolved to cl-a; the status overlay must follow it, otherwise a card's OK/KO
  // describes a cluster that is not the one being drawn.
  await waitFor(() => expect(scopedFor).toContain('cl-a'))
})
```

Reuse whatever msw server, `GRAPH` fixture and `wrapper` the existing `RelatedOverlay.test.tsx`
already defines; do not add a second harness.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- RelatedOverlay`
Expected: FAIL — only `cl-selected` was ever requested.

- [ ] **Step 3: Own the state**

In `RelatedOverlay.tsx`:

```ts
  // `auto` on open: the server picks the operator's selected cluster when the seed belongs to one
  // of them, else the seed's largest (spec §3.5). It cannot be resolved here — a table's cluster
  // membership lives only in the L2L graph joined against the b15 index, which ADR-0014 exists to
  // stop this client fetching unscoped.
  const [cluster, setCluster] = useState<string | null>('auto')
  const [active, setActive] = useState<string | null>(null)

  // Re-seeding on another node starts the resolution over.
  useEffect(() => {
    setCluster('auto')
    setActive(null)
  }, [nodeId])
```

Change the status fetch to follow the active cluster:

```ts
  // Status, edges and preview all describe the nodes actually on screen. Before ADR-0021 this
  // read the left-rail selection, which after a gateway walk described a different cluster
  // entirely.
  const scope = active ? [active] : clusters
  const rel = useScopedRelationships(scope)
  const summary = useOperationalSummary(scope.length > 0, scope)
```

and pass the props through:

```tsx
        <LineageFlow
          nodeId={nodeId}
          statusById={statusById}
          selectedClusters={clusters}
          cluster={cluster}
          onClusterChange={setCluster}
          onActiveCluster={setActive}
          extras={{ edges: graph?.edges ?? [], nodeById, config: cfg.data }}
          onPreview={onPreview}
          onSelect={onFocus}
          onReseed={onReseed ?? onFocus}
        />
```

Update the component's doc comment: `clusters` is now the *preference* fed to `auto`, and the
status scope follows the active cluster.

- [ ] **Step 4: Run the whole frontend suite**

Run: `cd frontend && pnpm test && npx tsc --noEmit && pnpm format:check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/tab3/RelatedOverlay.tsx \
        frontend/src/components/tab3/RelatedOverlay.test.tsx \
        docs/superpowers/plans/2026-08-31-lineage-cluster-scope.md
git commit -m "feat(tab3): status follows the lineage's active cluster"
```

---
## Task 13: ADR-0021, the gate, and the docs

**Files:**
- Create: `docs/adr/0021-lineage-cluster-scope.md`
- Modify: `docs/adr/0020-lineage-flow.md` (status line only)
- Modify: `scripts/validate_loop.sh` (the lineage block, `scripts/validate_loop.sh:151-183`)
- Modify: `docs/architecture.md` (endpoint table), root `CLAUDE.md`

**Interfaces:**
- Consumes: the endpoint from Task 3, the view from Tasks 10–12.

- [ ] **Step 1: Write ADR-0021**

```markdown
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
```

- [ ] **Step 2: Mark ADR-0020 superseded in part**

Change ADR-0020's status line to:

```markdown
**Status:** Accepted. Its "Not cluster-scoped" decision is superseded by
`0021-lineage-cluster-scope.md`; every other decision here stands, and the unscoped mode remains
the endpoint's default.
```

- [ ] **Step 3: Extend the `validate-loop` lineage block**

Append after the existing `unknown lineage node should be 404` check in
`scripts/validate_loop.sh`:

```bash
# ADR-0021. Scoped lineage: a strict subset, with every crossing named rather than silent.
CL=$(curl -sf "localhost:8080/api/operational/lineage?node=table:$SEED" \
  | python3 -c 'import json,sys; o=json.load(sys.stdin)["clusterOptions"]; print(o[0]["name"] if o else "")')
[ -n "$CL" ] || fail "lineage seed reaches no cluster — the scope test cannot run"
curl -sf "localhost:8080/api/operational/lineage?node=table:$SEED&limit=600&cluster=$CL" | python3 -c "
import json, sys
d = json.load(sys.stdin)
ids = {n['id'] for n in d['nodes']}
assert d['activeCluster'] == '$CL', 'activeCluster disagrees with the request'
assert 'table:$SEED' in ids, 'the seed must always be in scope'
gw = {n['id'] for n in d['nodes'] if n.get('gateway')}
for e in d['edges']:
    assert e['from'] in ids and e['to'] in ids, 'edge endpoint outside the returned nodes'
    # Terminal: no returned path leaves the cluster and comes back.
    assert not (e['from'] in gw and e['to'] in gw), 'two gateways joined by an edge'
for n in d['nodes']:
    if n.get('gateway'):
        assert n['clusters'], 'a gateway must name the cluster it continues into'
print(f\"[validate-loop] lineage scoped to {d['activeCluster']}: {len(ids)} nodes, {len(gw)} gateways\")
" || fail "lineage cluster scope"
# The unscoped response must be a SUPERSET — scoping narrows, it never invents.
python3 - <<'PYEOF' || fail "scoped lineage is not a subset of the unscoped one"
import json, urllib.request, os
seed = os.environ["SEED"]; cl = os.environ["CL"]
get = lambda q: json.load(urllib.request.urlopen(
    f"http://localhost:8080/api/operational/lineage?node=table:{seed}&limit=600{q}"))
allids = {n["id"] for n in get("")["nodes"]}
sub = {n["id"] for n in get(f"&cluster={cl}")["nodes"]}
assert sub <= allids, sorted(sub - allids)[:5]
PYEOF
curl -s -o /dev/null -w '%{http_code}' "localhost:8080/api/operational/lineage?node=table:$SEED&cluster=nope" \
  | grep -q 400 || fail "unknown lineage cluster should be 400"
```

Add `export SEED CL` immediately after `CL` is computed, so the heredoc's Python can read them.

- [ ] **Step 4: Run the gate**

Run: `make validate-loop`
Expected: PASS, including the new `lineage scoped to …` line. The committed-mock floors
(`21 clusters · 30 recipes · 14 dates · 417 rows`, readiness `81 XML · 86 recipes · 212 DDL`,
`22` workflows) must be unchanged.

- [ ] **Step 5: Update the docs**

- `docs/architecture.md` — in the endpoint table, extend the `/api/operational/lineage` row's
  params to `node, limit, cluster, prefer` and note the scoped mode with a pointer to ADR-0021.
- Root `CLAUDE.md` — in the Testing section's `GET /api/operational/lineage` paragraph, add that
  it is optionally cluster-scoped (ADR-0021), that gateways make every crossing explicit, and
  that the unscoped mode is unchanged. Add `0021` to the `docs/adr/0001`–`0020` range in "More".
  Add `frontend/src/components/shared/NodeDetails.tsx` as the one Details body for Tab 3's panel
  and the lineage dock.

- [ ] **Step 6: Full gate sweep**

Run: `make check && make test && make validate-loop`
Expected: all three PASS from a clean build.

- [ ] **Step 7: Commit**

```bash
git add docs/adr/0021-lineage-cluster-scope.md docs/adr/0020-lineage-flow.md \
        docs/architecture.md CLAUDE.md scripts/validate_loop.sh \
        docs/superpowers/plans/2026-08-31-lineage-cluster-scope.md
git commit -m "docs(adr): ADR-0021 cluster-scoped lineage; gate the scope"
```

---

## Task 14: browser acceptance walk

Spec §8. Every claim in this plan that a test cannot make — that the flow is *readable* — is
settled here, in a browser, against the user's real export.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-31-lineage-cluster-scope-design.md` (append §11 results)

- [ ] **Step 1: Boot the suite**

Run: `make dev` (backend :8080, frontend :8443). Wait for both to answer.

- [ ] **Step 2: Drive Tab 3 with the Chrome plugin**

Load the `claude-in-chrome` skill first, then `tabs_context_mcp` before creating any tab. Walk the
nine acceptance criteria from spec §8, in order, capturing a screenshot for each:

1. Open Tab 3, select a cluster in the left rail, select a node, click `Show all related ↗` —
   the flow is scoped, not 150 nodes across 21 clusters.
2. Gateway stubs are visible and name both recipe and cluster.
3. Click a gateway — `Loading from cluster: <name>` appears, then that cluster's flow, seeded on
   the clicked recipe.
4. The switcher lists the seed's clusters with the active one first; switching works.
5. Drag several cards, including one with a long routed edge — every arrow stays attached at both
   ends. Click `reset layout` — the computed default returns exactly.
6. Select a node in the dock — run history, ⌖, clusters, hop, Preview and all three GCP links are
   present. Click one GCP link and confirm the URL.
7. Drag both `Details` splitters, reload the page — both widths survive.
8. `curl 'localhost:8080/api/operational/lineage?node=<id>'` — unchanged shape plus
   `activeCluster: null`.
9. Re-run `make check && make test && make validate-loop`.

- [ ] **Step 3: Record the results**

Append a `## 11. Acceptance walk results (2026-08-31)` section to the spec: one line per criterion
with PASS/FAIL and what was observed. A FAIL becomes a new task in this plan, not a footnote.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-31-lineage-cluster-scope-design.md \
        docs/superpowers/plans/2026-08-31-lineage-cluster-scope.md
git commit -m "docs(spec): sub-project 13 acceptance walk results"
```

---

## Task 15: merge

- [ ] **Step 1: Confirm the ledger is closed**

Every checkbox in this plan is ticked, and spec §10 records any deviation with its reason.

- [ ] **Step 2: Final gate from a clean build**

Run: `make check && make test && make validate-loop`
Expected: all PASS. Paste the actual output into the merge commit body — evidence, not assertion.

- [ ] **Step 3: Merge**

```bash
git checkout main
git merge --no-ff feat/etl360-lineage-cluster-scope \
  -m "Merge branch 'feat/etl360-lineage-cluster-scope' into main — cluster-scoped lineage (ADR-0021)"
```

- [ ] **Step 4: Close the ledger**

```bash
git add docs/superpowers/plans/2026-08-31-lineage-cluster-scope.md
git commit -m "docs(plan): sub-project 13 merged — ledger closed"
```
