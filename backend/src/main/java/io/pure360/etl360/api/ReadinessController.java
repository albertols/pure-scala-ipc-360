package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.ReadinessDto;
import io.pure360.etl360.service.ReadinessService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Serves the landing page's single aggregate. Holds no logic — see {@link ReadinessService}. */
@RestController
@RequestMapping("/api")
public class ReadinessController {
    private final ReadinessService readiness;

    public ReadinessController(ReadinessService readiness) {
        this.readiness = readiness;
    }

    @GetMapping("/readiness")
    public ReadinessDto readiness() {
        return readiness.readiness();
    }
}
