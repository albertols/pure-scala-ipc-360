package io.pure360.etl360.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record OperationalSummaryDto(List<String> dates, List<RecipeSummaryDto> recipes) {
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RecipeSummaryDto(String recipeFilename, String layer, String latestDate,
        String latestStatus, int okCount, int koCount, List<HistoryEntryDto> history,
        Double avgDurationMin, Double p50DurationMin, Double p95DurationMin,
        String lastJobId, String lastClusterName) {}
    public record HistoryEntryDto(String date, String status, Double durationMin) {}
}
