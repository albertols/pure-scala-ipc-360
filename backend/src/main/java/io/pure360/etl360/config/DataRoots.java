package io.pure360.etl360.config;

import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

/**
 * Resolves the corpus/DWH_CONTROL/composer data roots with a real-dir/mock-mirror/absent
 * fallback for DWH_CONTROL, and a real/absent (no mock tier) fallback for composer.
 *
 * Every method here is computed on demand (no caching) so that a directory created after
 * application boot — e.g. someone drops DWH_CONTROL/ in place while the server is running —
 * is picked up on the next call.
 */
@Component
public class DataRoots {
    private final Etl360Properties props;

    public DataRoots(Etl360Properties props) {
        this.props = props;
    }

    public Path corpus() {
        return props.resolvedCorpusRoot();
    }

    public Optional<Path> dwhControl() {
        Path real = props.resolvedDwhControlRoot();
        if (Files.isDirectory(real)) return Optional.of(real);
        Path mock = props.resolvedMockRoot().resolve("DWH_CONTROL");
        if (Files.isDirectory(mock)) return Optional.of(mock);
        return Optional.empty();
    }

    public String dwhControlMode() {
        Path real = props.resolvedDwhControlRoot();
        if (Files.isDirectory(real)) return "real";
        Path mock = props.resolvedMockRoot().resolve("DWH_CONTROL");
        if (Files.isDirectory(mock)) return "mock";
        return "absent";
    }

    public Optional<Path> composer() {
        Path real = props.resolvedComposerRoot();
        if (Files.isDirectory(real)) return Optional.of(real);
        return Optional.empty();
    }

    public String composerMode() {
        return Files.isDirectory(props.resolvedComposerRoot()) ? "real" : "absent";
    }
}
