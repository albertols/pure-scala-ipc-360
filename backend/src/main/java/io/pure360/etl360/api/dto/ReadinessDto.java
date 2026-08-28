package io.pure360.etl360.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/**
 * {@code GET /api/readiness}: everything the landing page needs, in one request. Aggregates values
 * other services already cache — it parses no corpus, control schema or b15 data of its own.
 *
 * <p>{@code progress} is nullable by design: a packaged deployment need not ship {@code docs/}, and
 * a scanner that throws mid-scan degrades to null rather than failing the whole page.
 * {@code status} mirrors {@link DiagnosticsDto#status()} rather than forming a second opinion about
 * health, so the landing page and Tab 3's data-root report can never disagree.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ReadinessDto(String status, Corpus corpus, Operational operational, Dags dags,
                           List<Root> roots, Progress progress) {

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Corpus(int xml, int recipes, int ddl, int dirs, List<String> layers) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Operational(int clusters, int recipes, int days, int rows, String mode) {}

    /** Distinct non-blank {@code workflow} values in the control schema — NOT graph-derived. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Dags(int workflows) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Root(String name, String resolved, String tier, String status, String hint) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Progress(int tasksDone, int tasksTotal, int adrs) {}
}
