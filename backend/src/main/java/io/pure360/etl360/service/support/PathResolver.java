package io.pure360.etl360.service.support;

import io.pure360.etl360.config.Etl360Properties;
import org.springframework.stereotype.Component;
import java.nio.file.Files;
import java.nio.file.Path;

@Component
public class PathResolver {
    private final Path corpus;

    @org.springframework.beans.factory.annotation.Autowired
    public PathResolver(Etl360Properties props) { this(props.resolvedCorpusRoot()); }
    public PathResolver(Path corpusRoot) { this.corpus = corpusRoot.toAbsolutePath().normalize(); }
    // @Autowired disambiguates the two-constructor bean, same as CorpusService.

    public Path insideCorpus(String relPath) {
        Path p = corpus.resolve(relPath).normalize();
        if (!p.startsWith(corpus)) {
            throw new InvalidCorpusPathException("Path escapes corpus root: " + relPath);
        }
        return p;
    }

    public Path xmlFile(String mappingPath) {
        Path lower = insideCorpus(mappingPath + ".xml");
        if (Files.isRegularFile(lower)) {
            return lower;
        }
        // Corpus mixes lowercase .xml (46 files) and uppercase .XML (13 files) — see
        // CLAUDE.md corpus caveats. Checked explicitly (not relied on fs case-insensitivity)
        // so this resolves identically on case-sensitive filesystems (e.g. Linux CI).
        Path upper = insideCorpus(mappingPath + ".XML");
        if (Files.isRegularFile(upper)) {
            return upper;
        }
        throw new NotFoundException("No mapping XML at " + mappingPath);
    }

    public Path corpusRoot() { return corpus; }
}
