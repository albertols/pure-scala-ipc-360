package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.LayerToLayerEntryDto;
import io.pure360.etl360.config.DataRoots;
import io.pure360.etl360.config.Etl360Properties;
import org.junit.jupiter.api.Test;
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
        return new LayerToLayerService(new DataRoots(props));
    }

    @Test
    void parsesRowsSkipsMalformedIgnoresNonLayerDirs() {
        LayerToLayerService s = service();
        assertThat(s.entries()).hasSize(2);            // 3 rows - 1 malformed; ARCHIVE ignored
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
        assertThat(s.entries()).hasSize(2);
        assertThat(s.skippedRows()).isEqualTo(1);
    }

    @Test
    void archiveDirIsNotOneOfTheEightLayerDirsSoItsRowsAreIgnored() {
        assertThat(LayerToLayerService.LAYER_DIRS).doesNotContain("ARCHIVE");
        LayerToLayerService s = service();
        assertThat(s.entries()).extracting(LayerToLayerEntryDto::layer).doesNotContain("ARCHIVE");
    }

    @Test
    void statementsExtractsBalancedParenBodiesOnly() {
        List<String> bodies = LayerToLayerService.statements(
            "INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES ('ODS', 'd', 'r.json', 'wf', 't', 1, "
                + "[STRUCT('A, B', true, 0)], [], [], [])");
        assertThat(bodies).hasSize(1);
        LayerToLayerEntryDto dto = LayerToLayerService.parseRow(bodies.get(0));
        assertThat(dto.sources().get(0).table()).isEqualTo("A, B");
    }
}
