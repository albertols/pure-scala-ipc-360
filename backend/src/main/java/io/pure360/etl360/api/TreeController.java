package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.TreeNodeDto;
import io.pure360.etl360.service.CorpusService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class TreeController {
    private final CorpusService corpus;
    public TreeController(CorpusService corpus) { this.corpus = corpus; }

    @GetMapping("/tree")
    public TreeNodeDto tree() { return corpus.tree(); }
}
