package io.pure360.etl360.api;

import com.fasterxml.jackson.databind.JsonNode;
import io.pure360.etl360.api.dto.RecipeDto;
import io.pure360.etl360.api.dto.RecipeSaveRequestDto;
import io.pure360.etl360.api.dto.RecipeValidationDto;
import io.pure360.etl360.service.RecipeService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/recipes")
public class RecipeController {
    private final RecipeService service;

    public RecipeController(RecipeService service) { this.service = service; }

    @GetMapping("/{*path}")
    public RecipeDto recipe(@PathVariable("path") String path) {
        return service.recipe(MappingController.stripLeadingSlash(path));
    }

    @PutMapping("/{*path}")
    public RecipeDto save(@PathVariable("path") String path, @RequestBody RecipeSaveRequestDto body) {
        return service.save(MappingController.stripLeadingSlash(path), body);
    }

    @PostMapping("/validate")
    public RecipeValidationDto validate(@RequestBody JsonNode recipe) {
        return service.validate(recipe);
    }

    // RULED DEVIATION from spec §7's "/history" and "/history/{version}" suffix sketch: Spring's
    // {*path} must be the LAST pattern segment (same constraint already recorded for
    // /api/mappings/dom|model in docs/architecture.md "Deviation from spec §4 table"), so the
    // recipe path lives right after /history/ and the archive version rides as a query param.
    @GetMapping("/history/{*path}")
    public Object history(@PathVariable("path") String path,
                           @RequestParam(name = "version", required = false) String version) {
        String rel = MappingController.stripLeadingSlash(path);
        return version == null ? service.history(rel) : service.historyVersion(rel, version);
    }

    @PostMapping("/rollback/{*path}")
    public RecipeDto rollback(@PathVariable("path") String path, @RequestParam("version") String version) {
        return service.rollback(MappingController.stripLeadingSlash(path), version);
    }
}
