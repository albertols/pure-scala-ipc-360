package io.pure360.etl360.api;

import io.pure360.etl360.config.DataRoots;
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
    private final DataRoots dataRoots;

    public HealthController(Etl360Properties props, CorpusService corpusService, DataRoots dataRoots) {
        this.props = props;
        this.corpusService = corpusService;
        this.dataRoots = dataRoots;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        var corpus = props.resolvedCorpusRoot();
        return Map.of(
            "status", "UP",
            "corpusRoot", corpus.toString(),
            "corpusPresent", Files.isDirectory(corpus),
            "xmlCount", corpusService.xmlCount(),
            "recipeCount", corpusService.recipeCount(),
            "dwhControlMode", dataRoots.dwhControlMode(),
            "composerMode", dataRoots.composerMode());
    }
}
