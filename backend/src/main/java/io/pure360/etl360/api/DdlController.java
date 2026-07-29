package io.pure360.etl360.api;

import com.fasterxml.jackson.databind.JsonNode;
import io.pure360.etl360.service.RecipeService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/ddl")
public class DdlController {
    private final RecipeService service;

    public DdlController(RecipeService service) { this.service = service; }

    @GetMapping("/{*path}")
    public Map<String, JsonNode> ddl(@PathVariable("path") String path) {
        return service.ddls(MappingController.stripLeadingSlash(path));
    }
}
