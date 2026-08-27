package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.RelationshipsDto;
import io.pure360.etl360.service.RelationshipService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api")
public class RelationshipController {
    private final RelationshipService relationships;

    public RelationshipController(RelationshipService relationships) {
        this.relationships = relationships;
    }

    @GetMapping("/relationships")
    public RelationshipsDto relationships(
            @RequestParam(name = "clusters", required = false) List<String> clusters) {
        return relationships.graph(clusters == null ? List.of() : clusters);
    }
}
