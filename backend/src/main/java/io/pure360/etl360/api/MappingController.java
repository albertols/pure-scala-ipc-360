package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.XmlNodeDto;
import io.pure360.etl360.service.DomService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/mappings")
public class MappingController {
    private final DomService domService;
    public MappingController(DomService domService) { this.domService = domService; }

    @GetMapping("/dom/{*path}")
    public XmlNodeDto dom(@PathVariable("path") String path) {
        return domService.dom(stripLeadingSlash(path));
    }

    static String stripLeadingSlash(String p) { return p.startsWith("/") ? p.substring(1) : p; }
}
