package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.OperationalSnapshotDto;
import io.pure360.etl360.api.dto.OperationalSummaryDto;
import io.pure360.etl360.config.DataRoots;
import io.pure360.etl360.service.OperationalService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/operational")
public class OperationalController {
    private final OperationalService operational;
    private final DataRoots roots;

    public OperationalController(OperationalService operational, DataRoots roots) {
        this.operational = operational;
        this.roots = roots;
    }

    @GetMapping("/dates")
    public OperationalDatesDto dates() {
        return new OperationalDatesDto(operational.dates(), roots.composerMode());
    }

    /**
     * @param clusters absent (or a bare {@code clusters=}) -> the whole history, byte-identical to
     *        the pre-scoping response. Non-empty -> only the recipes those b15 clusters ran, the
     *        same scoping semantics {@code GET /api/relationships?clusters=} already carries.
     */
    @GetMapping("/summary")
    public OperationalSummaryDto summary(
            @RequestParam(name = "clusters", required = false) List<String> clusters) {
        return operational.summary(clusters == null ? List.of() : clusters);
    }

    @GetMapping("/{date}")
    public OperationalSnapshotDto snapshot(@PathVariable("date") String date) {
        return operational.snapshot(date);
    }

    public record OperationalDatesDto(List<String> dates, String mode) {}
}
