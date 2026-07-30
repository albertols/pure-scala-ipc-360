package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.LayerToLayerEntryDto;
import io.pure360.etl360.api.dto.RelationshipsDto;
import org.springframework.stereotype.Service;
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
 */
@Service
public class RelationshipService {
    private final LayerToLayerService layerToLayer;
    private final CorpusService corpus;

    public RelationshipService(LayerToLayerService layerToLayer, CorpusService corpus) {
        this.layerToLayer = layerToLayer;
        this.corpus = corpus;
    }

    public RelationshipsDto graph() {
        List<LayerToLayerEntryDto> entries = layerToLayer.entries();

        // Recipe filename (basename) -> corpus-relative path, first match wins.
        Map<String, String> recipePathByFileName = new LinkedHashMap<>();
        for (String path : corpus.allRecipePaths()) {
            String fileName = path.substring(path.lastIndexOf('/') + 1);
            recipePathByFileName.putIfAbsent(fileName, path);
        }

        // Table name -> layer of the entry that WRITES it (i.e. targets it), first writer wins.
        Map<String, String> writerLayerByTable = new LinkedHashMap<>();
        for (LayerToLayerEntryDto entry : entries) {
            writerLayerByTable.putIfAbsent(entry.target(), entry.layer());
        }

        // Table name -> write mode / partition type, harvested from every entry's
        // targets_write_mode / target_partition structs across the WHOLE entries list (not just
        // the entry that happens to create the node first). First writer wins on collisions.
        Map<String, String> writeModeByTable = new LinkedHashMap<>();
        Map<String, String> partitionTypeByTable = new LinkedHashMap<>();
        for (LayerToLayerEntryDto entry : entries) {
            for (LayerToLayerEntryDto.WriteMode wm : entry.targetsWriteMode()) {
                writeModeByTable.putIfAbsent(wm.targetTable(), wm.writeMode());
            }
            for (LayerToLayerEntryDto.Partition p : entry.targetPartition()) {
                partitionTypeByTable.putIfAbsent(p.targetTable(), p.partitionType());
            }
        }

        Map<String, RelationshipsDto.NodeDto> nodes = new LinkedHashMap<>();
        Set<RelationshipsDto.EdgeDto> edges = new LinkedHashSet<>();

        for (LayerToLayerEntryDto entry : entries) {
            String recipeId = "recipe:" + entry.recipe();
            String recipePath = recipePathByFileName.get(entry.recipe());
            boolean hasRecipe = recipePath != null;
            String mappingPath = hasRecipe ? parentDir(recipePath) : null;
            addNode(nodes, new RelationshipsDto.NodeDto(recipeId, "recipe", entry.recipe(), entry.layer(),
                mappingPath, hasRecipe, entry.workflow(), entry.executionOrder(), null, null));

            String targetId = "table:" + entry.target();
            addNode(nodes, tableNode(targetId, entry.target(), writerLayerByTable,
                writeModeByTable, partitionTypeByTable, entry));
            edges.add(new RelationshipsDto.EdgeDto(recipeId, targetId, "writes"));

            for (LayerToLayerEntryDto.SourceRef source : entry.sources()) {
                String sourceId = "table:" + source.table();
                addNode(nodes, tableNode(sourceId, source.table(), writerLayerByTable,
                    writeModeByTable, partitionTypeByTable, entry));
                edges.add(new RelationshipsDto.EdgeDto(sourceId, recipeId, "source"));
            }

            for (String lookup : entry.lookupTables()) {
                String lookupId = "table:" + lookup;
                addNode(nodes, tableNode(lookupId, lookup, writerLayerByTable,
                    writeModeByTable, partitionTypeByTable, entry));
                edges.add(new RelationshipsDto.EdgeDto(lookupId, recipeId, "lookup"));
            }
        }

        List<String> layers = entries.stream().map(LayerToLayerEntryDto::layer).distinct().sorted().toList();
        RelationshipsDto.MetaDto meta = new RelationshipsDto.MetaDto(entries.size(), layerToLayer.skippedRows(), layers);
        return new RelationshipsDto(List.copyOf(nodes.values()), List.copyOf(edges), meta);
    }

    /** Builds a {@code kind:"table"} node whose layer/writeMode/partitionType are resolved from
     * the whole-graph lookup maps (order-independent), falling back to the referencing entry's
     * own layer only when the table is never anyone's write target. */
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
