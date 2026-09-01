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
 * is answered by GATEWAYS: a node outside C's scope that touches one inside it is returned,
 * marked, and never walked through, so every crossing is visible and named — usually a recipe
 * touching an in-scope table, but a table can be the gateway too when the SEED itself is a recipe
 * outside C. With no cluster the behaviour is byte-identical to ADR-0020's.
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
            boolean isGateway = gateways.contains(n.id());
            // Recipes carry their OWN clusters always. A gateway TABLE carries the clusters it
            // joins to (the same join Task 1 extracted) so its `↳ <cluster>` stub names something;
            // an interior (non-gateway) table stays `[]` — it is inside the active cluster, so the
            // field would be noise.
            List<String> clusters;
            if ("recipe".equals(n.kind())) {
                clusters = clusterIndex.clustersOf(name);
            } else if (isGateway) {
                clusters = joins.clustersFor(n.id(), index.clustersByRecipe());
            } else {
                clusters = List.of();
            }
            nodes.add(new LineageDto.LineageNodeDto(n.id(), n.kind(), name,
                n.layer() == null || n.layer().isEmpty() ? "UNKNOWN" : n.layer(),
                e.getValue(), clusters, isGateway));
        }
        nodes.sort(Comparator.comparingInt(LineageDto.LineageNodeDto::hop)
            .thenComparing(LineageDto.LineageNodeDto::name));

        // Only edges whose BOTH endpoints survived the budget — an edge into a cut node would
        // draw an arrow into empty space. WHEN SCOPED, additionally require at least one endpoint
        // to be IN SCOPE: two gateways can both survive the budget and share an edge, and drawing
        // it would render a path that leaves the cluster and comes back — exactly what "gateways
        // are terminal" forbids. Unscoped (`scope == null`) this second check never fires, so
        // unscoped behaviour is unchanged.
        List<RelationshipsDto.EdgeDto> edges = new ArrayList<>();
        for (RelationshipsDto.EdgeDto e : graph.edges()) {
            if (!kept.contains(e.from()) || !kept.contains(e.to())) continue;
            if (scope != null && !scope.contains(e.from()) && !scope.contains(e.to())) continue;
            edges.add(new RelationshipsDto.EdgeDto(e.from(), e.to(), e.kind()));
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
