package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.RecipeDto;
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
}
