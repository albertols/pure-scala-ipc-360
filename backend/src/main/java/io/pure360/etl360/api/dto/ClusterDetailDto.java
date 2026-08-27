package io.pure360.etl360.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/** One cluster's recipes, fetched lazily when a pane row is expanded. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ClusterDetailDto(String name, List<String> dates, List<RecipeInClusterDto> recipes) {

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RecipeInClusterDto(String recipeFilename, String layer, List<Integer> dateIdx,
                                     int rows, int ok, int ko, String lastDate, String lastStatus) {}
}
