package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.SummaryDto;
import io.pure360.etl360.service.CorpusService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class SummaryController {
    private final CorpusService corpus;
    public SummaryController(CorpusService corpus) { this.corpus = corpus; }

    @GetMapping("/summary")
    public SummaryDto summary() { return corpus.summary(); }
}
