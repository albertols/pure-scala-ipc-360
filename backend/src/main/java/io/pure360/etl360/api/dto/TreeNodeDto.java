package io.pure360.etl360.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record TreeNodeDto(String name, String path, String kind, String layer,
                          Long sizeBytes, String modifiedAt, String mappingPath,
                          Boolean hasRecipe, Boolean hasDdl, List<TreeNodeDto> children) {}
