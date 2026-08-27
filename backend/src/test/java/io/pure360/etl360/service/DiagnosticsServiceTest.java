package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.DiagnosticsDto;
import io.pure360.etl360.config.DataRoots;
import io.pure360.etl360.config.Etl360Properties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Every assertion here corresponds to one way the relationships graph can come back EMPTY while
 * every path in config.json looks right — the four silent-skip paths in
 * {@link LayerToLayerService} plus the tier fallback in {@link DataRoots}. The point of the
 * report is that the four are distinguishable from each other in the GUI; a report that merely
 * says "0 rows" would be no better than the empty canvas it is explaining.
 */
class DiagnosticsServiceTest {

    private static final String VALID_ROW = "('ODS', 'd', 'r.json', 'wf', 'TGT', 1, [], [], [], [])";

    private DiagnosticsService serviceOver(Etl360Properties props) {
        DataRoots roots = new DataRoots(props);
        LayerToLayerService l2l = new LayerToLayerService(roots, props);
        return new DiagnosticsService(props, roots, new CorpusService(props), new OperationalService(roots, l2l), l2l);
    }

    /** Props whose dwhControlRoot is {@code tmp/DWH_CONTROL} and whose mock tier deliberately does not exist. */
    private Etl360Properties propsOver(Path tmp, Etl360Properties.LayerToLayer vocabulary) {
        return new Etl360Properties(
            tmp.resolve("corpus").toString(),
            tmp.resolve("DWH_CONTROL").toString(),
            tmp.resolve("no-mock-here").toString(),
            tmp.resolve("no-composer-here").toString(),
            new Etl360Properties.Gcp("p", "r", "u1", "u2", "u3"),
            vocabulary);
    }

    private Etl360Properties propsOver(Path tmp) {
        return propsOver(tmp, Etl360Properties.LayerToLayer.DEFAULTS);
    }

    private Path writeStatements(Path tmp, String layerDir, String content) throws Exception {
        Path dir = Files.createDirectories(tmp.resolve("DWH_CONTROL/LAYER_TO_LAYER/" + layerDir));
        Path file = dir.resolve("statements.sql");
        Files.writeString(file, content);
        return file;
    }

    // --- Path 1: neither tier carries LAYER_TO_LAYER/ ------------------------------------------

    @Test
    void controlSchemaAbsentFromBothTiersIsReportedAsAbsentNotAsAnEmptyScan(@TempDir Path tmp) {
        DiagnosticsDto d = serviceOver(propsOver(tmp)).report();

        assertThat(d.dwhControl().tier()).isEqualTo("absent");
        assertThat(d.dwhControl().status()).isEqualTo("ko");
        assertThat(d.dwhControl().realExists()).isFalse();
        assertThat(d.dwhControl().mockUsable()).isFalse();
        assertThat(d.dwhControl().requiredChild()).isEqualTo("LAYER_TO_LAYER");
        assertThat(d.dwhControl().hint()).contains("LAYER_TO_LAYER");
        assertThat(d.status()).isEqualTo("ko");
    }

    /** The root exists but carries a pre-LAYER_TO_LAYER export layout — the case DataRoots calls out. */
    @Test
    void realRootPresentWithoutTheRequiredChildIsReportedAsRejectedWithTheReasonWhy(@TempDir Path tmp) throws Exception {
        Files.createDirectories(tmp.resolve("DWH_CONTROL/2.1.STG_TO_ODS"));

        DiagnosticsDto d = serviceOver(propsOver(tmp)).report();

        assertThat(d.dwhControl().realExists()).isTrue();
        assertThat(d.dwhControl().realUsable()).isFalse();
        assertThat(d.dwhControl().tier()).isEqualTo("absent");
        assertThat(d.dwhControl().hint()).contains("LAYER_TO_LAYER");
    }

    // --- Path 2: layer directory names differ from the configured list -------------------------

    @Test
    void layerDirsThatAreNotInTheConfiguredListAreNamedAsUnexpectedNotSilentlySkipped(@TempDir Path tmp) throws Exception {
        writeStatements(tmp, "RAW", Etl360Properties.LayerToLayer.DEFAULTS.anchor() + " " + VALID_ROW);

        DiagnosticsDto d = serviceOver(propsOver(tmp)).report();

        assertThat(d.dwhControl().tier()).isEqualTo("real");
        assertThat(d.dwhControl().status()).isEqualTo("ko");
        assertThat(d.dwhControl().scan().presentDirs()).containsExactly("RAW");
        assertThat(d.dwhControl().scan().unexpectedDirs()).containsExactly("RAW");
        assertThat(d.dwhControl().scan().filesRead()).isZero();
        assertThat(d.dwhControl().scan().rowsParsed()).isZero();
        assertThat(d.dwhControl().hint()).contains("RAW").contains("layerDirs");
    }

    /**
     * The INSERT-target sweep must cover directories OUTSIDE the configured layer list. That is
     * precisely the case where it earns its keep: when the layer names are what's wrong, every
     * configured directory holds nothing to look at, and a sweep restricted to the files the scan
     * actually read would report "found: none" for a root full of perfectly readable statements.
     */
    @Test
    void insertTargetSweepCoversLayerDirsTheScanItselfNeverReads(@TempDir Path tmp) throws Exception {
        writeStatements(tmp, "RAW", "INSERT INTO CTL.CORP_L2L_CONFIG VALUES " + VALID_ROW);

        DiagnosticsDto d = serviceOver(propsOver(tmp)).report();

        assertThat(d.dwhControl().scan().filesRead()).isZero();          // RAW is not configured...
        assertThat(d.dwhControl().scan().insertTargetsFound())           // ...but it is still swept
            .extracting(DiagnosticsDto.InsertTarget::table)
            .containsExactly("CTL.CORP_L2L_CONFIG");
    }

    @Test
    void configuringThatLayerDirNameFlipsTheSameRootToOk(@TempDir Path tmp) throws Exception {
        writeStatements(tmp, "RAW", Etl360Properties.LayerToLayer.DEFAULTS.anchor() + " " + VALID_ROW);
        var vocabulary = new Etl360Properties.LayerToLayer(
            Etl360Properties.LayerToLayer.DEFAULT_ANCHOR_TABLE, List.of("RAW"));

        DiagnosticsDto d = serviceOver(propsOver(tmp, vocabulary)).report();

        assertThat(d.dwhControl().status()).isEqualTo("ok");
        assertThat(d.dwhControl().scan().unexpectedDirs()).isEmpty();
        assertThat(d.dwhControl().scan().rowsParsed()).isEqualTo(1);
    }

    // --- Path 3: the INSERT target table differs (the anonymized-default trap) -----------------

    @Test
    void anchorMismatchReportsTheInsertTargetTableActuallyFoundInTheFile(@TempDir Path tmp) throws Exception {
        writeStatements(tmp, "ODS",
            "INSERT INTO CTL.CORP_L2L_CONFIG VALUES " + VALID_ROW + "\n"
                + "INSERT INTO CTL.CORP_L2L_CONFIG VALUES " + VALID_ROW);

        DiagnosticsDto d = serviceOver(propsOver(tmp)).report();

        assertThat(d.dwhControl().status()).isEqualTo("ko");
        assertThat(d.dwhControl().scan().filesRead()).isEqualTo(1);
        assertThat(d.dwhControl().scan().anchorHits()).isZero();
        assertThat(d.dwhControl().scan().rowsParsed()).isZero();
        assertThat(d.dwhControl().scan().insertTargetsFound())
            .extracting(DiagnosticsDto.InsertTarget::table)
            .containsExactly("CTL.CORP_L2L_CONFIG");
        assertThat(d.dwhControl().scan().insertTargetsFound().get(0).count()).isEqualTo(2);
        // The hint must be actionable: it names the config key AND the value to put in it.
        assertThat(d.dwhControl().hint()).contains("CTL.CORP_L2L_CONFIG").contains("layerToLayerTable");
    }

    @Test
    void configuringThatAnchorTableFlipsTheSameRootToOk(@TempDir Path tmp) throws Exception {
        writeStatements(tmp, "ODS", "INSERT INTO CTL.CORP_L2L_CONFIG VALUES " + VALID_ROW);
        var vocabulary = new Etl360Properties.LayerToLayer(
            "CTL.CORP_L2L_CONFIG", Etl360Properties.LayerToLayer.DEFAULT_LAYER_DIRS);

        DiagnosticsDto d = serviceOver(propsOver(tmp, vocabulary)).report();

        assertThat(d.dwhControl().status()).isEqualTo("ok");
        assertThat(d.dwhControl().scan().anchorHits()).isEqualTo(1);
        assertThat(d.dwhControl().scan().rowsParsed()).isEqualTo(1);
    }

    // --- Path 4: statements match but every row fails to parse ---------------------------------

    @Test
    void rowsThatMatchTheAnchorButFailToParseAreCountedWithTheFirstFailureReason(@TempDir Path tmp) throws Exception {
        writeStatements(tmp, "ODS",
            Etl360Properties.LayerToLayer.DEFAULTS.anchor() + " (ODS_NOQUOTE, 'd', 'r.json', 'wf', 't', 1, [], [], [], [])");

        DiagnosticsDto d = serviceOver(propsOver(tmp)).report();

        assertThat(d.dwhControl().status()).isEqualTo("ko");
        assertThat(d.dwhControl().scan().anchorHits()).isEqualTo(1);
        assertThat(d.dwhControl().scan().rowsParsed()).isZero();
        assertThat(d.dwhControl().scan().rowsSkipped()).isEqualTo(1);
        assertThat(d.dwhControl().scan().files()).hasSize(1);
        assertThat(d.dwhControl().scan().files().get(0).firstSkipReason()).isNotBlank();
        assertThat(d.dwhControl().hint()).contains("malformed");
    }

    // --- Happy path + the other two roots ------------------------------------------------------

    @Test
    void healthyRealRootIsOkAndReportsPerFileCounts(@TempDir Path tmp) throws Exception {
        Path file = writeStatements(tmp, "ODS", Etl360Properties.LayerToLayer.DEFAULTS.anchor() + " " + VALID_ROW);

        DiagnosticsDto d = serviceOver(propsOver(tmp)).report();

        assertThat(d.dwhControl().tier()).isEqualTo("real");
        assertThat(d.dwhControl().status()).isEqualTo("ok");
        assertThat(d.dwhControl().scan().rowsParsed()).isEqualTo(1);
        assertThat(d.dwhControl().scan().rowsSkipped()).isZero();
        DiagnosticsDto.FileScan scanned = d.dwhControl().scan().files().get(0);
        assertThat(scanned.path()).isEqualTo(file.toString());
        assertThat(scanned.bytes()).isGreaterThan(0);
        assertThat(scanned.anchorHits()).isEqualTo(1);
        assertThat(scanned.rowsParsed()).isEqualTo(1);
    }

    @Test
    void everyRootReportsWhatWasConfiguredAndWhereItResolvedTo(@TempDir Path tmp) throws Exception {
        writeStatements(tmp, "ODS", Etl360Properties.LayerToLayer.DEFAULTS.anchor() + " " + VALID_ROW);
        Files.createDirectories(tmp.resolve("corpus"));

        DiagnosticsDto d = serviceOver(propsOver(tmp)).report();

        assertThat(d.corpus().configured()).isEqualTo(tmp.resolve("corpus").toString());
        assertThat(d.corpus().resolved()).isEqualTo(tmp.resolve("corpus").toString());
        assertThat(d.corpus().exists()).isTrue();
        assertThat(d.dwhControl().resolvedReal()).isEqualTo(tmp.resolve("DWH_CONTROL").toString());
        assertThat(d.composer().resolved()).isEqualTo(tmp.resolve("no-composer-here").toString());
        assertThat(d.composer().exists()).isFalse();
        assertThat(d.composer().tier()).isEqualTo("absent");
    }

    /** An empty corpus is a KO in its own right — Tabs 1/2 would render nothing either. */
    @Test
    void corpusWithNoXmlAndNoRecipesIsKo(@TempDir Path tmp) throws Exception {
        Files.createDirectories(tmp.resolve("corpus"));

        DiagnosticsDto d = serviceOver(propsOver(tmp)).report();

        assertThat(d.corpus().exists()).isTrue();
        assertThat(d.corpus().status()).isEqualTo("ko");
        assertThat(d.corpus().counts().get("xml")).isZero();
        assertThat(d.corpus().counts().get("recipes")).isZero();
    }
}
