package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.ExpressionEntryDto;
import io.pure360.etl360.service.ExpressionService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/expressions")
public class ExpressionController {
    private final ExpressionService service;

    public ExpressionController(ExpressionService service) { this.service = service; }

    @GetMapping
    public List<ExpressionEntryDto> expressions() {
        return service.all();
    }
}
