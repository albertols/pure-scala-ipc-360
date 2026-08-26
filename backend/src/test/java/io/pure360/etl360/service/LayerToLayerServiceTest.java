package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.LayerToLayerEntryDto;
import io.pure360.etl360.config.DataRoots;
import io.pure360.etl360.config.Etl360Properties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LayerToLayerServiceTest {
    private LayerToLayerService service() {
        Path mockRoot = Path.of("src/test/resources/fixture-mock").toAbsolutePath();
        var props = new Etl360Properties("unused", mockRoot.resolve("DWH_CONTROL").toString(),
            mockRoot.toString(), "unused-composer",
            new Etl360Properties.Gcp("p", "r", "u1", "u2", "u3"));
        return new LayerToLayerService(new DataRoots(props), props);
    }

    /** Wires a LayerToLayerService against a scratch DWH_CONTROL/LAYER_TO_LAYER/ODS/statements.sql
     * whose content is fully controlled by the test, for scanner-recovery scenarios that don't
     * belong in the committed fixture. */
    private LayerToLayerService serviceOver(Path dwhControlDir) {
        var props = new Etl360Properties("unused", dwhControlDir.toString(),
            dwhControlDir.resolve("unused-mock").toString(), "unused-composer",
            new Etl360Properties.Gcp("p", "r", "u1", "u2", "u3"));
        return new LayerToLayerService(new DataRoots(props), props);
    }

    /** Same as {@link #serviceOver(Path)} but with a non-default control-schema vocabulary —
     * the corp-export case where the INSERT target table and/or the layer directory names
     * differ from this repo's anonymized defaults. */
    private LayerToLayerService serviceOver(Path dwhControlDir, String anchorTable, List<String> layerDirs) {
        var props = new Etl360Properties("unused", dwhControlDir.toString(),
            dwhControlDir.resolve("unused-mock").toString(), "unused-composer",
            new Etl360Properties.Gcp("p", "r", "u1", "u2", "u3"),
            new Etl360Properties.LayerToLayer(anchorTable, layerDirs));
        return new LayerToLayerService(new DataRoots(props), props);
    }

    @Test
    void parsesRowsSkipsMalformedIgnoresNonLayerDirs() {
        LayerToLayerService s = service();
        assertThat(s.entries()).hasSize(3);            // 4 rows - 1 malformed; ARCHIVE ignored
        assertThat(s.skippedRows()).isEqualTo(1);
        LayerToLayerEntryDto full = s.entries().get(0);
        assertThat(full.layer()).isEqualTo("ODS");
        assertThat(full.sources()).isNotEmpty();
        assertThat(full.sources().get(0).table()).isNotBlank();
        assertThat(full.targetPartition().get(0).partitionType()).isNotBlank();
    }

    @Test
    void quotedCommaInsideStructFieldSurvivesTokenization() {
        LayerToLayerService s = service();
        LayerToLayerEntryDto full = s.entries().get(0);
        // 'SRC_TABLE_A, WITH_COMMA' contains a literal comma inside the quoted field —
        // the tokenizer must not split on it.
        assertThat(full.sources().get(0).table()).isEqualTo("SRC_TABLE_A, WITH_COMMA");
        assertThat(full.sources()).hasSize(2);
        assertThat(full.sources().get(1).table()).isEqualTo("SRC_TABLE_B");
        assertThat(full.sources().get(1).active()).isFalse();
        assertThat(full.sources().get(1).dayOffset()).isEqualTo(1);
    }

    @Test
    void doubledSingleQuoteEscapesInsideAStringLiteral() {
        LayerToLayerEntryDto dto = LayerToLayerService.parseRow(
            "'ODS', 'dir', '_ETL_m_it''s_a_recipe.json', 'wf', 'tgt', 1, [], [], [], []");
        assertThat(dto.recipe()).isEqualTo("_ETL_m_it's_a_recipe.json");
    }

    @Test
    void emptyArraysParseToEmptyListsNotNulls() {
        LayerToLayerService s = service();
        LayerToLayerEntryDto empty = s.entries().get(1);
        assertThat(empty.layer()).isEqualTo("ODS");
        assertThat(empty.sources()).isEmpty();
        assertThat(empty.lookupTables()).isEmpty();
        assertThat(empty.targetsWriteMode()).isEmpty();
        assertThat(empty.targetPartition()).isEmpty();
    }

    @Test
    void malformedRowIsCountedAsSkippedNotThrownFromService() {
        // parseRow itself throws on malformed input...
        assertThatThrownBy(() -> LayerToLayerService.parseRow("'ODS', broken"))
            .isInstanceOf(RuntimeException.class);
        // ...but the service catches it per-row and merely counts it, never propagating.
        LayerToLayerService s = service();
        assertThat(s.entries()).hasSize(3);
        assertThat(s.skippedRows()).isEqualTo(1);
    }

    @Test
    void archiveDirIsNotOneOfTheEightLayerDirsSoItsRowsAreIgnored() {
        assertThat(Etl360Properties.LayerToLayer.DEFAULT_LAYER_DIRS).doesNotContain("ARCHIVE");
        LayerToLayerService s = service();
        assertThat(s.entries()).extracting(LayerToLayerEntryDto::layer).doesNotContain("ARCHIVE");
    }

    @Test
    void statementsExtractsBalancedParenBodiesOnly() {
        List<String> bodies = LayerToLayerService.statements(
            "INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES ('ODS', 'd', 'r.json', 'wf', 't', 1, "
                + "[STRUCT('A, B', true, 0)], [], [], [])",
            Etl360Properties.LayerToLayer.DEFAULTS.anchor());
        assertThat(bodies).hasSize(1);
        LayerToLayerEntryDto dto = LayerToLayerService.parseRow(bodies.get(0));
        assertThat(dto.sources().get(0).table()).isEqualTo("A, B");
    }

    // --- Fix-round regression: an unbalanced-paren statement must not swallow later,
    // well-formed statements in the same file. Before the fix, statements() `break`s the outer
    // scan on an unbalanced row, so everything after it in the file is silently lost — never
    // parsed, never counted as skipped. ---

    @Test
    void unbalancedStatementFollowedByValidOneInSameFileStillYieldsTheValidEntry(@TempDir Path tmp) throws Exception {
        Path dir = Files.createDirectories(tmp.resolve("DWH_CONTROL/LAYER_TO_LAYER/ODS"));
        // First statement's VALUES(...) paren is never closed (no trailing ')'), so the
        // balanced-paren scan runs all the way to EOF — swallowing the second, valid statement's
        // text too — unless the scanner re-anchors after giving up on the unbalanced one.
        Files.writeString(dir.resolve("statements.sql"),
            "INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES ('ODS', 'BROKEN_NO_CLOSE'\n"
                + "INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES ('ODS', 'd', 'r.json', 'wf', 't', 1, [], [], [], [])");

        LayerToLayerService s = serviceOver(dir.getParent().getParent());
        assertThat(s.entries()).hasSize(1);
        assertThat(s.entries().get(0).recipe()).isEqualTo("r.json");
        assertThat(s.skippedRows()).isEqualTo(1);
    }

    @Test
    void balancedButMalformedStatementFollowedByValidOneInSameFileStillYieldsTheValidEntry(@TempDir Path tmp) throws Exception {
        Path dir = Files.createDirectories(tmp.resolve("DWH_CONTROL/LAYER_TO_LAYER/ODS"));
        // First statement's parens balance fine, but its layer field is unquoted — parseRow
        // throws for a different reason than unbalanced parens. Guards that the per-statement
        // try/catch in load() keeps going to the next statement regardless of which failure mode
        // tripped it.
        Files.writeString(dir.resolve("statements.sql"),
            "INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES (ODS_NOQUOTE, 'd', 'r1.json', 'wf', 't', 1, [], [], [], [])\n"
                + "INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES ('ODS', 'd', 'r2.json', 'wf', 't', 1, [], [], [], [])");

        LayerToLayerService s = serviceOver(dir.getParent().getParent());
        assertThat(s.entries()).hasSize(1);
        assertThat(s.entries().get(0).recipe()).isEqualTo("r2.json");
        assertThat(s.skippedRows()).isEqualTo(1);
    }

    // --- Configurable control-schema vocabulary. This repo's defaults
    // (CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG, the eight layer dirs) are ANONYMIZED sample
    // values; a real corp export names its own control table and may use its own layer dir
    // names. Both used to be `static final`, so such an export parsed to zero rows with no
    // warning and Tab 3 rendered an empty graph. ---

    @Test
    void configuredAnchorTableIsUsedInsteadOfTheDefault(@TempDir Path tmp) throws Exception {
        Path dir = Files.createDirectories(tmp.resolve("DWH_CONTROL/LAYER_TO_LAYER/ODS"));
        Files.writeString(dir.resolve("statements.sql"),
            "INSERT INTO CTL.CORP_L2L_CONFIG VALUES ('ODS', 'd', 'r.json', 'wf', 't', 1, [], [], [], [])");

        LayerToLayerService s = serviceOver(dir.getParent().getParent(),
            "CTL.CORP_L2L_CONFIG", Etl360Properties.LayerToLayer.DEFAULT_LAYER_DIRS);

        assertThat(s.entries()).hasSize(1);
        assertThat(s.entries().get(0).recipe()).isEqualTo("r.json");
    }

    @Test
    void configuredLayerDirsAreUsedInsteadOfTheDefaultEight(@TempDir Path tmp) throws Exception {
        Path dir = Files.createDirectories(tmp.resolve("DWH_CONTROL/LAYER_TO_LAYER/RAW"));
        Files.writeString(dir.resolve("statements.sql"),
            "INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES ('RAW', 'd', 'r.json', 'wf', 't', 1, [], [], [], [])");

        LayerToLayerService s = serviceOver(dir.getParent().getParent(),
            Etl360Properties.LayerToLayer.DEFAULT_ANCHOR_TABLE, List.of("RAW"));

        assertThat(s.entries()).hasSize(1);
        assertThat(s.entries().get(0).layer()).isEqualTo("RAW");
    }

    @Test
    void defaultVocabularyIsThisReposAnonymizedControlTableAndEightLayerDirs() {
        assertThat(Etl360Properties.LayerToLayer.DEFAULT_ANCHOR_TABLE)
            .isEqualTo("CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG");
        assertThat(Etl360Properties.LayerToLayer.DEFAULT_LAYER_DIRS)
            .containsExactly("STG", "ODS", "DWH", "CDM", "RDM", "QDM", "ETL", "OUTPUT");
    }
}
