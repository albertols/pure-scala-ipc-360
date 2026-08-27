package io.pure360.etl360.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import java.util.Map;

/**
 * Run history by recipe, newest-first. The single source both Tab 3's cards and Tab 4's Operational
 * State read, replacing the per-date snapshot fan-out. {@code appStartIso} is what the Cloud
 * Logging deep link's cursorTimestamp is derived from.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record RunsDto(int limit, Map<String, List<RunDto>> byRecipe) {

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RunDto(String date, String clusterName, String jobId, String appStartIso,
                         Double durationMin, String status, String message) {}
}
