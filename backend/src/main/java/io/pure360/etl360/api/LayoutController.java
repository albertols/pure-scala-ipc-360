package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.LayoutDto;
import io.pure360.etl360.service.LayoutService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/layouts")
public class LayoutController {
    private final LayoutService service;

    public LayoutController(LayoutService service) { this.service = service; }

    @GetMapping("/{*path}")
    public LayoutDto layout(@PathVariable("path") String path) {
        return service.layout(MappingController.stripLeadingSlash(path));
    }

    @PutMapping("/{*path}")
    public LayoutDto save(@PathVariable("path") String path, @RequestBody LayoutDto body) {
        return service.save(MappingController.stripLeadingSlash(path), body);
    }
}
