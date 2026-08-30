package io.pure360.etl360.config;

import io.pure360.etl360.service.support.B15Status;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

import java.nio.file.Path;
import java.util.List;

@ConfigurationProperties(prefix = "etl360")
public record Etl360Properties(String corpusRoot, String dwhControlRoot, String mockRoot,
                               String composerRoot, Gcp gcp, LayerToLayer layerToLayer, B15 b15) {

    /** Binding constructor: substitutes the defaults for an unset {@code etl360.layer-to-layer}
     * or {@code etl360.b15}. */
    @ConstructorBinding
    public Etl360Properties {
        layerToLayer = layerToLayer == null ? LayerToLayer.DEFAULTS : layerToLayer.withDefaults();
        b15 = b15 == null ? B15.DEFAULTS : b15.withDefaults();
    }

    /** Pre-{@code layerToLayer} arity, kept so call sites that don't care about the control-schema
     * vocabulary (most tests) stay readable. Binds nothing — Spring uses the canonical one. */
    public Etl360Properties(String corpusRoot, String dwhControlRoot, String mockRoot,
                            String composerRoot, Gcp gcp) {
        this(corpusRoot, dwhControlRoot, mockRoot, composerRoot, gcp, LayerToLayer.DEFAULTS, B15.DEFAULTS);
    }

    /** Pre-{@code b15} arity, same reason: the b15 status vocabulary is irrelevant to most tests. */
    public Etl360Properties(String corpusRoot, String dwhControlRoot, String mockRoot,
                            String composerRoot, Gcp gcp, LayerToLayer layerToLayer) {
        this(corpusRoot, dwhControlRoot, mockRoot, composerRoot, gcp, layerToLayer, B15.DEFAULTS);
    }

    public record Gcp(String projectId, String region, String dataprocJobUrl,
                      String dataprocClusterUrl, String loggingUrl, String loggingDuration,
                      String bigQueryUrl) {
        public static final String DEFAULT_LOGGING_DURATION = "P31D";
        public static final String DEFAULT_BIGQUERY_URL =
            "https://console.cloud.google.com/bigquery?project={project}";

        /** Binding constructor: substitutes defaults for an unset/blank logging-duration or bigquery-url. */
        @ConstructorBinding
        public Gcp {
            loggingDuration = loggingDuration == null || loggingDuration.isBlank()
                ? DEFAULT_LOGGING_DURATION : loggingDuration.trim();
            bigQueryUrl = bigQueryUrl == null || bigQueryUrl.isBlank()
                ? DEFAULT_BIGQUERY_URL : bigQueryUrl.trim();
        }

        /** Pre-loggingDuration arity, kept so existing test call sites stay readable. */
        public Gcp(String projectId, String region, String dataprocJobUrl,
                   String dataprocClusterUrl, String loggingUrl) {
            this(projectId, region, dataprocJobUrl, dataprocClusterUrl, loggingUrl,
                DEFAULT_LOGGING_DURATION, DEFAULT_BIGQUERY_URL);
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

    /**
     * The b15 {@code status} vocabulary {@link io.pure360.etl360.service.B15Reader} canonicalises
     * against.
     *
     * <p>Configurable for exactly the reason {@link LayerToLayer} is: the committed values are
     * this corpus's anonymized sample dialect, and a real export writing a different token used to
     * fail <b>silently</b> — every failed run rendering as PENDING, "never ran". Unlike the
     * anchor table, a mismatch here does not empty the tab, it quietly mislabels it, which is why
     * {@code /api/diagnostics} reports the tokens that matched neither list.
     *
     * <p>See {@link io.pure360.etl360.service.support.B15Status} and ADR-0018.
     */
    public record B15(List<String> statusOk, List<String> statusKo) {
        public static final B15 DEFAULTS = new B15(B15Status.DEFAULT_OK, B15Status.DEFAULT_KO);

        /** A partially-specified binding (only one of the two keys set) keeps the default for the other. */
        B15 withDefaults() {
            List<String> ok = statusOk == null || statusOk.isEmpty()
                ? B15Status.DEFAULT_OK : List.copyOf(statusOk);
            List<String> ko = statusKo == null || statusKo.isEmpty()
                ? B15Status.DEFAULT_KO : List.copyOf(statusKo);
            return new B15(ok, ko);
        }

        /** The normalizer this vocabulary describes. */
        public B15Status toStatus() { return B15Status.of(statusOk, statusKo); }
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
