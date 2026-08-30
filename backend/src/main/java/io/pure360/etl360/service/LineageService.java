package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.LineageDto;
import io.pure360.etl360.api.dto.RelationshipsDto;
import io.pure360.etl360.service.support.NotFoundException;
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

/**
 * Builds one node's transitive upstream + downstream closure.
 *
 * <p><b>Breadth-first, not depth-first, and that is load-bearing.</b> The traversal is bounded by
 * a node budget; BFS reaches the furthest hops last, so spending the budget cuts the DISTANT
 * lineage and leaves the nearest complete. A DFS would exhaust the budget down one arbitrary
 * branch and silently drop a node one hop away — which is worse than not drawing the view at all,
 * because the result still looks like a lineage.
 *
 * <p>Cycle-safe by a visited set: the L2L graph is not guaranteed acyclic, and a lookup edge can
 * close a loop.
 */
@Service
public class LineageService {

    private final RelationshipService relationships;
    private final ClusterIndexService clusterIndex;

    public LineageService(RelationshipService relationships, ClusterIndexService clusterIndex) {
        this.relationships = relationships;
        this.clusterIndex = clusterIndex;
    }

    /** One step away from a node, and which direction it was. */
    private record Step(String id, int direction) {}

    public LineageDto lineage(String seed, int limit) {
        RelationshipsDto graph = relationships.graph();

        Map<String, RelationshipsDto.NodeDto> byId = new LinkedHashMap<>();
        for (RelationshipsDto.NodeDto n : graph.nodes()) if (n.id() != null) byId.put(n.id(), n);
        if (!byId.containsKey(seed)) {
            throw new NotFoundException("No node '" + seed + "' in the relationships graph");
        }

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
        kept.add(seed);

        while (!queue.isEmpty()) {
            String current = queue.poll();
            int hop = hopById.get(current);
            for (Step step : adjacency.getOrDefault(current, List.of())) {
                if (hopById.containsKey(step.id())) continue;
                hopById.put(step.id(), hop + step.direction());
                if (kept.size() < limit) kept.add(step.id());
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
                e.getValue(), clusters));
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
            hopById.size() > kept.size(), hopById.size());
    }
}
