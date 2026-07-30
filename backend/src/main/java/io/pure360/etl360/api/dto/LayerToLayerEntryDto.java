package io.pure360.etl360.api.dto;

import java.util.List;

public record LayerToLayerEntryDto(String layer, String mappingXmlDir, String recipe,
                                   String workflow, String target, int executionOrder,
                                   List<SourceRef> sources, List<String> lookupTables,
                                   List<WriteMode> targetsWriteMode, List<Partition> targetPartition) {
    public record SourceRef(String table, boolean active, int dayOffset) {}
    public record WriteMode(String targetTable, String writeMode) {}
    public record Partition(String targetTable, String partitionType, String partitionKey,
                            String subpartitionKey) {}
}
