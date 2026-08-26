package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.DiagnosticsDto;
import io.pure360.etl360.service.DiagnosticsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read-only self-diagnosis: where every data root resolved to and whether it is usable.
 *
 * <p>Separate from {@code /api/health} on purpose — health is a liveness probe with a stable
 * shape that {@code make validate-loop} curls, while this report is free to grow detail as new
 * silent-failure modes are found.
 */
@RestController
@RequestMapping("/api")
public class DiagnosticsController {
    private final DiagnosticsService diagnostics;

    public DiagnosticsController(DiagnosticsService diagnostics) {
        this.diagnostics = diagnostics;
    }

    @GetMapping("/diagnostics")
    public DiagnosticsDto diagnostics() {
        return diagnostics.report();
    }
}
