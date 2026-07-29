package io.pure360.etl360.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.nio.file.Path;

@ConfigurationProperties(prefix = "etl360")
public record Etl360Properties(String corpusRoot, String dwhControlRoot, String mockRoot,
                               String composerRoot, Gcp gcp) {

    public record Gcp(String projectId, String region, String dataprocJobUrl,
                      String dataprocClusterUrl, String loggingUrl) {}

    private static Path resolveAgainstRepoRoot(String p) {
        Path path = Path.of(p);
        if (path.isAbsolute()) return path.normalize();
        return RepoRoot.resolve(Path.of(System.getProperty("user.dir"))).resolve(path).normalize();
    }

    public Path resolvedCorpusRoot()     { return resolveAgainstRepoRoot(corpusRoot); }
    public Path resolvedDwhControlRoot() { return resolveAgainstRepoRoot(dwhControlRoot); }
    public Path resolvedMockRoot()       { return resolveAgainstRepoRoot(mockRoot); }
    public Path resolvedComposerRoot()   { return resolveAgainstRepoRoot(composerRoot); }
}
