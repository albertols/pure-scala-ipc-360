package io.pure360.etl360.api;

import io.pure360.etl360.config.Etl360Properties;
import io.pure360.etl360.service.CorpusService;
import org.springframework.web.bind.annotation.*;
import java.nio.file.Files;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class HealthController {
    private final Etl360Properties props;
    private final CorpusService corpusService;

    public HealthController(Etl360Properties props, CorpusService corpusService) {
        this.props = props;
        this.corpusService = corpusService;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        var corpus = props.resolvedCorpusRoot();
        return Map.of(
            "status", "UP",
            "corpusRoot", corpus.toString(),
            "corpusPresent", Files.isDirectory(corpus),
            "xmlCount", corpusService.xmlCount(),
            "recipeCount", corpusService.recipeCount());
    }
}
