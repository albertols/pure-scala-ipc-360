package io.pure360.etl360.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

import java.nio.file.Path;
import java.util.List;

@ConfigurationProperties(prefix = "etl360")
public record Etl360Properties(String corpusRoot, String dwhControlRoot, String mockRoot,
                               String composerRoot, Gcp gcp, LayerToLayer layerToLayer) {

    /** Binding constructor: substitutes the defaults for an unset {@code etl360.layer-to-layer}. */
    @ConstructorBinding
    public Etl360Properties {
        layerToLayer = layerToLayer == null ? LayerToLayer.DEFAULTS : layerToLayer.withDefaults();
    }

    /** Pre-{@code layerToLayer} arity, kept so call sites that don't care about the control-schema
     * vocabulary (most tests) stay readable. Binds nothing — Spring uses the canonical one. */
    public Etl360Properties(String corpusRoot, String dwhControlRoot, String mockRoot,
                            String composerRoot, Gcp gcp) {
        this(corpusRoot, dwhControlRoot, mockRoot, composerRoot, gcp, LayerToLayer.DEFAULTS);
    }

    public record Gcp(String projectId, String region, String dataprocJobUrl,
                      String dataprocClusterUrl, String loggingUrl, String loggingDuration) {
        public static final String DEFAULT_LOGGING_DURATION = "P31D";

        /** Binding constructor: substitutes the default for an unset/blank logging-duration. */
        @ConstructorBinding
        public Gcp {
            loggingDuration = loggingDuration == null || loggingDuration.isBlank()
                ? DEFAULT_LOGGING_DURATION : loggingDuration.trim();
        }

        /** Pre-loggingDuration arity, kept so existing test call sites stay readable. */
        public Gcp(String projectId, String region, String dataprocJobUrl,
                   String dataprocClusterUrl, String loggingUrl) {
            this(projectId, region, dataprocJobUrl, dataprocClusterUrl, loggingUrl, DEFAULT_LOGGING_DURATION);
        }
    }

    /**
     * The control-schema vocabulary {@link io.pure360.etl360.service.LayerToLayerService} scans for.
     *
     * <p>Both values were {@code static final} until they turned out to be <b>anonymized sample
     * values</b>, not IPC vocabulary: this repo's corpus writes
     * {@code CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG} under eight fixed layer directories, but a
     * real control-schema export names its own table and may use its own layer directory names.
     * Neither mismatch errors — the scan simply matches nothing, so the relationships graph comes
     * back empty and Tab 3 renders "No relationship entries" with no hint as to why. Making them
     * configurable is what lets {@code config.json} fix that without a code change; {@code
     * /api/diagnostics} is what tells you which of the two is wrong.
     */
    public record LayerToLayer(String anchorTable, List<String> layerDirs) {
        public static final String DEFAULT_ANCHOR_TABLE = "CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG";
        public static final List<String> DEFAULT_LAYER_DIRS =
            List.of("STG", "ODS", "DWH", "CDM", "RDM", "QDM", "ETL", "OUTPUT");
        public static final LayerToLayer DEFAULTS = new LayerToLayer(DEFAULT_ANCHOR_TABLE, DEFAULT_LAYER_DIRS);

        /** A partially-specified binding (only one of the two keys set) keeps the default for the other. */
        LayerToLayer withDefaults() {
            String table = anchorTable == null || anchorTable.isBlank() ? DEFAULT_ANCHOR_TABLE : anchorTable.trim();
            List<String> dirs = layerDirs == null || layerDirs.isEmpty() ? DEFAULT_LAYER_DIRS : List.copyOf(layerDirs);
            return new LayerToLayer(table, dirs);
        }

        /** The literal the scanner anchors statements on. */
        public String anchor() { return "INSERT INTO " + anchorTable + " VALUES"; }
    }

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
