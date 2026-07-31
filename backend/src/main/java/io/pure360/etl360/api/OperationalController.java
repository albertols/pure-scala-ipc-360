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

    @GetMapping("/summary")
    public OperationalSummaryDto summary() {
        return operational.summary();
    }

    @GetMapping("/{date}")
    public OperationalSnapshotDto snapshot(@PathVariable("date") String date) {
        return operational.snapshot(date);
    }

    public record OperationalDatesDto(List<String> dates, String mode) {}
}
