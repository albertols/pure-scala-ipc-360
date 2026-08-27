package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.LayerToLayerEntryDto;
import io.pure360.etl360.api.dto.RelationshipsDto;
import org.springframework.stereotype.Service;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Builds the tables+recipes relationship graph consumed by the Tab 5 UI, from the
 * {@link LayerToLayerService} entries and the {@link CorpusService} recipe inventory.
 *
 * Node ids: {@code table:<NAME>} / {@code recipe:<FILE>}. Edges: source-table→recipe
 * ("source"), lookup-table→recipe ("lookup"), recipe→target-table ("writes"). Nodes are
 * deduped by id (first writer wins for metadata); edges are deduped exactly (by from/to/kind).
 *
 * A table's {@code layer}/{@code writeMode}/{@code partitionType} are properties of the
 * physical table, not of whichever entry happens to reference it first — so all three are
 * resolved from pre-built, whole-entries-list lookup maps (built before any node is created)
 * rather than from the single entry that first triggers the node's creation. Without this, a
 * table referenced as a source/lookup by an earlier-processed entry would get its node created
 * with null writeMode/partitionType, and a later entry that actually targets it with real
 * write-mode/partition data would be silently discarded by the node-dedup's first-writer-wins
 * {@code putIfAbsent} — an ordering hazard, not a logic error in the later entry's data.
 *
 * <p><b>Scoping is one hop.</b> {@link #graph(Collection)} builds the core subgraph from the
 * entries whose recipe ran in the requested clusters, then adds the recipes adjacent to the tables
 * that subgraph already holds, flagged {@code neighbor=true} so the UI can dim them. A neighbour
 * contributes nothing but itself and the edges joining it to those tables: its own other tables are
 * two hops out, and following them would pull their writers in behind them.
 *
 * <p><b>Scoping does not narrow those maps.</b> {@link #graph(Collection)} still builds all three
 * from every L2L entry, including the ones it is about to filter out: they describe the physical
 * table, so a table's write mode must not change depending on which clusters happen to be
 * selected. Filtering them alongside the entries would reintroduce exactly the hazard above,
 * only selection-dependent and therefore harder to see.
 */
@Service
public class RelationshipService {
    private final LayerToLayerService layerToLayer;
    private final CorpusService corpus;
    private final ClusterIndexService clusterIndex;

    public RelationshipService(LayerToLayerService layerToLayer, CorpusService corpus,
                               ClusterIndexService clusterIndex) {
        this.layerToLayer = layerToLayer;
        this.corpus = corpus;
        this.clusterIndex = clusterIndex;
    }

    public RelationshipsDto graph() {
        return graph(List.of());
    }

    /**
     * @param clusterNames empty -> the whole graph, byte-identical to the pre-scoping response.
     *        Non-empty -> only recipes that ran in those clusters, plus the 1-hop nodes adjacent to
     *        the tables they touch, flagged {@code neighbor=true}. Unknown names contribute nothing
     *        and are echoed in {@code meta.scopedClusters} rather than raising a 404.
     */
    public RelationshipsDto graph(Collection<String> clusterNames) {
        List<LayerToLayerEntryDto> entries = layerToLayer.entries();
        boolean scoped = clusterNames != null && !clusterNames.isEmpty();

        // Recipe filename (basename) -> corpus-relative path, first match wins.
        Map<String, String> recipePathByFileName = new LinkedHashMap<>();
        for (String path : corpus.allRecipePaths()) {
            String fileName = path.substring(path.lastIndexOf('/') + 1);
            recipePathByFileName.putIfAbsent(fileName, path);
        }

        // Whole-graph physical-table facts. Built from EVERY entry even when scoped: a table's
        // layer/writeMode/partitionType are properties of the table, not of the selection.
        // Table name -> layer of the entry that WRITES it (i.e. targets it), first writer wins;
        // write mode / partition type harvested from every entry's targets_write_mode /
        // target_partition structs across the WHOLE entries list.
        Map<String, String> writerLayerByTable = new LinkedHashMap<>();
        Map<String, String> writeModeByTable = new LinkedHashMap<>();
        Map<String, String> partitionTypeByTable = new LinkedHashMap<>();
        for (LayerToLayerEntryDto entry : entries) {
            writerLayerByTable.putIfAbsent(entry.target(), entry.layer());
            for (LayerToLayerEntryDto.WriteMode wm : entry.targetsWriteMode()) {
                writeModeByTable.putIfAbsent(wm.targetTable(), wm.writeMode());
            }
            for (LayerToLayerEntryDto.Partition p : entry.targetPartition()) {
                partitionTypeByTable.putIfAbsent(p.targetTable(), p.partitionType());
            }
        }

        Map<String, RelationshipsDto.NodeDto> nodes = new LinkedHashMap<>();
        Set<RelationshipsDto.EdgeDto> edges = new LinkedHashSet<>();

        List<LayerToLayerEntryDto> core = entries;
        List<LayerToLayerEntryDto> rest = List.of();
        if (scoped) {
            Set<String> inScope = clusterIndex.recipesIn(clusterNames);
            core = entries.stream().filter(e -> inScope.contains(e.recipe())).toList();
            rest = entries.stream().filter(e -> !inScope.contains(e.recipe())).toList();
        }

        // Core first: addNode's putIfAbsent then keeps a core node from being downgraded to a
        // neighbour by a later, adjacent entry that also references it.
        for (LayerToLayerEntryDto entry : core) {
            addEntry(entry, nodes, edges, recipePathByFileName, writerLayerByTable,
                writeModeByTable, partitionTypeByTable, scoped, false, null);
        }

        int neighborCount = 0;
        if (scoped) {
            Set<String> coreNodeIds = Set.copyOf(nodes.keySet());
            for (LayerToLayerEntryDto entry : rest) {
                if (!touchesAny(entry, coreNodeIds)) continue;
                int before = nodes.size();
                addEntry(entry, nodes, edges, recipePathByFileName, writerLayerByTable,
                    writeModeByTable, partitionTypeByTable, true, true, coreNodeIds);
                neighborCount += nodes.size() - before;
            }
        }

        List<String> layers = core.stream().map(LayerToLayerEntryDto::layer).distinct().sorted().toList();
        RelationshipsDto.MetaDto meta = scoped
            ? new RelationshipsDto.MetaDto(core.size(), layerToLayer.skippedRows(), layers,
                List.copyOf(clusterNames), neighborCount)
            : new RelationshipsDto.MetaDto(entries.size(), layerToLayer.skippedRows(), layers);
        return new RelationshipsDto(List.copyOf(nodes.values()), List.copyOf(edges), meta);
    }

    /** True when any table this entry reads or writes is already a node in the core subgraph. */
    private boolean touchesAny(LayerToLayerEntryDto entry, Set<String> tableIds) {
        if (tableIds.contains("table:" + entry.target())) return true;
        for (LayerToLayerEntryDto.SourceRef s : entry.sources()) {
            if (tableIds.contains("table:" + s.table())) return true;
        }
        for (String lookup : entry.lookupTables()) {
            if (tableIds.contains("table:" + lookup)) return true;
        }
        return false;
    }

    /**
     * @param attachOnlyTo {@code null} for a core entry — it contributes every node and edge it
     *        declares. For a <b>neighbour</b> entry this is the set of node ids the core subgraph
     *        already holds, and the entry contributes only its recipe node plus the edges joining
     *        it to those tables. That restriction IS the one-hop rule: a neighbour recipe's own
     *        other tables sit two hops from the selection, and pulling them in would drag their
     *        writers in behind them at exactly the scale this endpoint exists to bound.
     */
    private void addEntry(LayerToLayerEntryDto entry,
            Map<String, RelationshipsDto.NodeDto> nodes, Set<RelationshipsDto.EdgeDto> edges,
            Map<String, String> recipePathByFileName, Map<String, String> writerLayerByTable,
            Map<String, String> writeModeByTable, Map<String, String> partitionTypeByTable,
            boolean scoped, boolean neighbor, Set<String> attachOnlyTo) {
        String recipeId = "recipe:" + entry.recipe();
        String recipePath = recipePathByFileName.get(entry.recipe());
        boolean hasRecipe = recipePath != null;
        String mappingPath = hasRecipe ? parentDir(recipePath) : null;
        addNode(nodes, new RelationshipsDto.NodeDto(recipeId, "recipe", entry.recipe(), entry.layer(),
            mappingPath, hasRecipe, entry.workflow(), entry.executionOrder(), null, null,
            scoped ? clusterIndex.clustersOf(entry.recipe()) : null,
            neighbor ? Boolean.TRUE : null));

        String targetId = "table:" + entry.target();
        if (attaches(attachOnlyTo, targetId)) {
            addNode(nodes, tableNode(targetId, entry.target(), writerLayerByTable,
                writeModeByTable, partitionTypeByTable, entry));
            edges.add(new RelationshipsDto.EdgeDto(recipeId, targetId, "writes"));
        }

        for (LayerToLayerEntryDto.SourceRef source : entry.sources()) {
            String sourceId = "table:" + source.table();
            if (!attaches(attachOnlyTo, sourceId)) continue;
            addNode(nodes, tableNode(sourceId, source.table(), writerLayerByTable,
                writeModeByTable, partitionTypeByTable, entry));
            edges.add(new RelationshipsDto.EdgeDto(sourceId, recipeId, "source"));
        }

        for (String lookup : entry.lookupTables()) {
            String lookupId = "table:" + lookup;
            if (!attaches(attachOnlyTo, lookupId)) continue;
            addNode(nodes, tableNode(lookupId, lookup, writerLayerByTable,
                writeModeByTable, partitionTypeByTable, entry));
            edges.add(new RelationshipsDto.EdgeDto(lookupId, recipeId, "lookup"));
        }
    }

    private static boolean attaches(Set<String> attachOnlyTo, String tableId) {
        return attachOnlyTo == null || attachOnlyTo.contains(tableId);
    }

    /** Builds a {@code kind:"table"} node whose layer/writeMode/partitionType are resolved from
     * the whole-graph lookup maps (order-independent), falling back to the referencing entry's
     * own layer only when the table is never anyone's write target.
     *
     * <p>Never carries {@code neighbor}: under the one-hop rule a table enters the graph only as
     * part of the core subgraph, so every neighbour node is a recipe. {@code NodeDto.neighbor} is
     * still declared on tables, so widening the rule later needs no wire change. */
    private RelationshipsDto.NodeDto tableNode(String id, String tableName,
            Map<String, String> writerLayerByTable, Map<String, String> writeModeByTable,
            Map<String, String> partitionTypeByTable, LayerToLayerEntryDto referencingEntry) {
        String layer = writerLayerByTable.getOrDefault(tableName, referencingEntry.layer());
        return new RelationshipsDto.NodeDto(id, "table", tableName, layer, null, null, null, null,
            writeModeByTable.get(tableName), partitionTypeByTable.get(tableName));
    }

    private void addNode(Map<String, RelationshipsDto.NodeDto> nodes, RelationshipsDto.NodeDto node) {
        nodes.putIfAbsent(node.id(), node);
    }

    private static String parentDir(String recipePath) {
        int slash = recipePath.lastIndexOf('/');
        return slash < 0 ? "" : recipePath.substring(0, slash);
    }
}
