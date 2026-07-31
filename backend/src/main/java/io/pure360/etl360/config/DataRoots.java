package io.pure360.etl360.config;

import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

/**
 * Resolves the corpus/DWH_CONTROL/composer data roots with a real-dir/mock-mirror/absent
 * fallback for both DWH_CONTROL and composer.
 *
 * <p><b>A root counts as "real" only if it actually carries the structure its reader needs</b>
 * — not merely because a directory of that name exists. A legacy or half-populated
 * {@code DWH_CONTROL/} (e.g. one holding old {@code 2.1.STG_TO_ODS/} export folders but no
 * {@code LAYER_TO_LAYER/}) used to win the real tier and then serve an EMPTY relationships
 * graph, so Tab 3 rendered "No relationship entries" with no hint that a perfectly good
 * mock mirror was sitting unused. Existence is not usability: probe for the substructure
 * ({@code LAYER_TO_LAYER/} here, the composer {@code inputs/} chain there) and fall through
 * to the mock mirror when it is missing.
 *
 * <p>Every method is computed on demand (no caching) so that a directory created after
 * application boot — e.g. someone drops a populated DWH_CONTROL/ in place while the server
 * is running — is picked up on the next call.
 */
@Component
public class DataRoots {
    /** The subdirectory LayerToLayerService needs; a DWH_CONTROL root without it is unusable. */
    static final String LAYER_TO_LAYER = "LAYER_TO_LAYER";
    /** The chain OperationalService walks for b15 CSVs; a composer root without it is unusable. */
    static final String COMPOSER_INPUTS = "dwh/config/cluster_tuning/inputs";

    private final Etl360Properties props;

    public DataRoots(Etl360Properties props) {
        this.props = props;
    }

    public Path corpus() {
        return props.resolvedCorpusRoot();
    }

    /** True when {@code root} is a directory that also carries {@code relative} inside it. */
    private static boolean usable(Path root, String relative) {
        return Files.isDirectory(root) && Files.isDirectory(root.resolve(relative));
    }

    public Optional<Path> dwhControl() {
        Path real = props.resolvedDwhControlRoot();
        if (usable(real, LAYER_TO_LAYER)) return Optional.of(real);
        Path mock = props.resolvedMockRoot().resolve("DWH_CONTROL");
        if (usable(mock, LAYER_TO_LAYER)) return Optional.of(mock);
        return Optional.empty();
    }

    public String dwhControlMode() {
        Path real = props.resolvedDwhControlRoot();
        if (usable(real, LAYER_TO_LAYER)) return "real";
        Path mock = props.resolvedMockRoot().resolve("DWH_CONTROL");
        if (usable(mock, LAYER_TO_LAYER)) return "mock";
        return "absent";
    }

    public Optional<Path> composer() {
        Path real = props.resolvedComposerRoot();
        if (usable(real, COMPOSER_INPUTS)) return Optional.of(real);
        Path mock = props.resolvedMockRoot().resolve("composer");
        if (usable(mock, COMPOSER_INPUTS)) return Optional.of(mock);
        return Optional.empty();
    }

    public String composerMode() {
        Path real = props.resolvedComposerRoot();
        if (usable(real, COMPOSER_INPUTS)) return "real";
        Path mock = props.resolvedMockRoot().resolve("composer");
        if (usable(mock, COMPOSER_INPUTS)) return "mock";
        return "absent";
    }
}
