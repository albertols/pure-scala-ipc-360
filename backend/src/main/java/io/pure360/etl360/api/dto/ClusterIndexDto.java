package io.pure360.etl360.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/**
 * The cluster pane's only startup payload. Per-cluster dates are indices into {@link #dates()}
 * rather than repeated ISO strings — see ClusterIndexService for the sizing rationale. Carries no
 * table count: b15 has no notion of tables.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ClusterIndexDto(String mode, List<String> dates, TotalsDto totals,
                              List<ClusterSummaryDto> clusters) {

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record TotalsDto(int clusters, int recipes, int dates, int rows) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ClusterSummaryDto(String name, int recipeCount, List<Integer> dateIdx,
                                    int rows, int ok, int ko, String lastDate, String lastStatus) {}
}
