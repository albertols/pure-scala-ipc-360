package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.RegistryDto;
import io.pure360.etl360.service.RegistryService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class RegistryController {
    private final RegistryService service;

    public RegistryController(RegistryService service) { this.service = service; }

    @GetMapping("/registry")
    public RegistryDto registry() { return service.registry(); }
}
