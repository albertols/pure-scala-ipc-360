package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.MappingModelDto;
import io.pure360.etl360.api.dto.XmlNodeDto;
import io.pure360.etl360.service.DomService;
import io.pure360.etl360.service.SemanticModelService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/mappings")
public class MappingController {
    private final DomService domService;
    private final SemanticModelService modelService;

    public MappingController(DomService domService, SemanticModelService modelService) {
        this.domService = domService;
        this.modelService = modelService;
    }

    @GetMapping("/dom/{*path}")
    public XmlNodeDto dom(@PathVariable("path") String path) {
        return domService.dom(stripLeadingSlash(path));
    }

    @GetMapping("/model/{*path}")
    public MappingModelDto model(@PathVariable("path") String path) {
        return modelService.model(stripLeadingSlash(path));
    }

    static String stripLeadingSlash(String p) { return p.startsWith("/") ? p.substring(1) : p; }
}
