package io.pure360.etl360.api;

import io.pure360.etl360.config.Etl360Properties;
import org.springframework.web.bind.annotation.*;
import java.nio.file.Files;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class HealthController {
    private final Etl360Properties props;
    public HealthController(Etl360Properties props) { this.props = props; }

    @GetMapping("/health")
    public Map<String, Object> health() {
        var corpus = props.resolvedCorpusRoot();
        return Map.of(
            "status", "UP",
            "corpusRoot", corpus.toString(),
            "corpusPresent", Files.isDirectory(corpus),
            "xmlCount", 0,
            "recipeCount", 0);
    }
}
