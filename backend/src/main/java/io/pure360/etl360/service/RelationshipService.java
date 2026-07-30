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
            addNode(nodes, new RelationshipsDto.NodeDto(targetId, "table", entry.target(), entry.layer(),
                null, null, null, null,
                findWriteMode(entry.targetsWriteMode(), entry.target()),
                findPartitionType(entry.targetPartition(), entry.target())));
            edges.add(new RelationshipsDto.EdgeDto(recipeId, targetId, "writes"));

            for (LayerToLayerEntryDto.SourceRef source : entry.sources()) {
                String sourceId = "table:" + source.table();
                addNode(nodes, tableNode(sourceId, source.table(), writerLayerByTable, entry));
                edges.add(new RelationshipsDto.EdgeDto(sourceId, recipeId, "source"));
            }

            for (String lookup : entry.lookupTables()) {
                String lookupId = "table:" + lookup;
                addNode(nodes, tableNode(lookupId, lookup, writerLayerByTable, entry));
                edges.add(new RelationshipsDto.EdgeDto(lookupId, recipeId, "lookup"));
            }
        }

        List<String> layers = entries.stream().map(LayerToLayerEntryDto::layer).distinct().sorted().toList();
        RelationshipsDto.MetaDto meta = new RelationshipsDto.MetaDto(entries.size(), layerToLayer.skippedRows(), layers);
        return new RelationshipsDto(List.copyOf(nodes.values()), List.copyOf(edges), meta);
    }

    private RelationshipsDto.NodeDto tableNode(String id, String tableName,
            Map<String, String> writerLayerByTable, LayerToLayerEntryDto referencingEntry) {
        String layer = writerLayerByTable.getOrDefault(tableName, referencingEntry.layer());
        return new RelationshipsDto.NodeDto(id, "table", tableName, layer, null, null, null, null, null, null);
    }

    private void addNode(Map<String, RelationshipsDto.NodeDto> nodes, RelationshipsDto.NodeDto node) {
        nodes.putIfAbsent(node.id(), node);
    }

    private static String findWriteMode(List<LayerToLayerEntryDto.WriteMode> writeModes, String target) {
        return writeModes.stream().filter(w -> w.targetTable().equals(target))
            .map(LayerToLayerEntryDto.WriteMode::writeMode).findFirst().orElse(null);
    }

    private static String findPartitionType(List<LayerToLayerEntryDto.Partition> partitions, String target) {
        return partitions.stream().filter(p -> p.targetTable().equals(target))
            .map(LayerToLayerEntryDto.Partition::partitionType).findFirst().orElse(null);
    }

    private static String parentDir(String recipePath) {
        int slash = recipePath.lastIndexOf('/');
        return slash < 0 ? "" : recipePath.substring(0, slash);
    }
}
