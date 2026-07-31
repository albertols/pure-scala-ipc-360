package io.pure360.etl360.api;

import com.fasterxml.jackson.databind.JsonNode;
import io.pure360.etl360.api.dto.RecipeDto;
import io.pure360.etl360.api.dto.RecipeHistoryEntryDto;
import io.pure360.etl360.api.dto.RecipeSaveRequestDto;
import io.pure360.etl360.api.dto.RecipeValidationDto;
import io.pure360.etl360.service.RecipeService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

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
    // Split into two typed mappings (disambiguated by the presence/absence of the `version`
    // query param, standard Spring params-condition idiom) rather than one Object-returning
    // method, so springdoc/OpenAPI — and Task 8's generated frontend types.gen.ts — see a real
    // response schema for both shapes instead of an untyped `{}`.
    @GetMapping(value = "/history/{*path}", params = "!version")
    public List<RecipeHistoryEntryDto> historyList(@PathVariable("path") String path) {
        return service.history(MappingController.stripLeadingSlash(path));
    }

    @GetMapping(value = "/history/{*path}", params = "version")
    public RecipeDto historyVersion(@PathVariable("path") String path, @RequestParam("version") String version) {
        return service.historyVersion(MappingController.stripLeadingSlash(path), version);
    }

    @PostMapping("/rollback/{*path}")
    public RecipeDto rollback(@PathVariable("path") String path, @RequestParam("version") String version) {
        return service.rollback(MappingController.stripLeadingSlash(path), version);
    }
}
