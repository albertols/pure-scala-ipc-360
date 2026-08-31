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
