package io.pure360.etl360.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record RelationshipsDto(List<NodeDto> nodes, List<EdgeDto> edges, MetaDto meta) {
    // @JsonInclude on the outer record does not cascade to nested records — each one that can
    // carry a null field needs its own annotation (see TreeNodeDto/XmlNodeDto precedent).
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record NodeDto(String id, String kind, String name, String layer,
                          String mappingPath, Boolean hasRecipe, String workflow,
                          Integer executionOrder, String writeMode, String partitionType,
                          List<String> clusterNames, Boolean neighbor) {

        /** Pre-scoping arity — every unscoped call site keeps its existing shape. */
        public NodeDto(String id, String kind, String name, String layer, String mappingPath,
                       Boolean hasRecipe, String workflow, Integer executionOrder,
                       String writeMode, String partitionType) {
            this(id, kind, name, layer, mappingPath, hasRecipe, workflow, executionOrder,
                 writeMode, partitionType, null, null);
        }
    }
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record EdgeDto(String from, String to, String kind) {}   // kind: source|lookup|writes
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record MetaDto(int entryCount, int skippedRows, List<String> layers,
                          List<String> scopedClusters, Integer neighborCount) {

        public MetaDto(int entryCount, int skippedRows, List<String> layers) {
            this(entryCount, skippedRows, layers, null, null);
        }
    }
}
