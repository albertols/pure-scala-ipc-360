package io.pure360.etl360;

import io.pure360.etl360.api.dto.LayerToLayerEntryDto;
import io.pure360.etl360.service.CorpusService;
import io.pure360.etl360.service.LayerToLayerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Spec §8.1 gate: {@link LayerToLayerService} over the REAL committed mock
 * {@code statements.sql} mirror (Task 3), not a fixture.
 *
 * {@code etl360.dwh-control-root} is pinned to a guaranteed-absent path so {@link
 * io.pure360.etl360.config.DataRoots#dwhControl()} falls through to the committed mock
 * mirror deterministically. Without this override, a developer machine that happens to carry
 * a pre-existing real (git-ignored) {@code DWH_CONTROL} export — one that predates this
 * sub-project's {@code LAYER_TO_LAYER} schema and so contains none of it — would make "real"
 * win over "mock" per {@code DataRoots}' by-design real-first fallback, silently zeroing out
 * this test's entry counts through no fault of the service code under test.
 */
@SpringBootTest(properties = "etl360.dwh-control-root=/nonexistent-etl360-test-dwh-control")
class LayerToLayerContractTest {
    @Autowired CorpusService corpus;
    @Autowired LayerToLayerService layerToLayer;

    @Test
    void everyConfiguredRecipeExistsInCorpus() {
        List<String> corpusRecipes = corpus.allRecipePaths().stream()
            .map(p -> p.substring(p.lastIndexOf('/') + 1)).toList();
        var entries = layerToLayer.entries();
        assertThat(entries).hasSizeGreaterThanOrEqualTo(33);
        assertThat(layerToLayer.skippedRows()).isZero();
        for (var e : entries) assertThat(corpusRecipes).contains(e.recipe());
    }

    @Test
    void synFamilyFullyConfigured() {
        assertThat(layerToLayer.entries()).extracting(LayerToLayerEntryDto::recipe)
            .contains("_ETL_m_SYN_STG_L_ORDERS_LOAD.json", "_ETL_m_SYN_STG_L_CUSTOMERS_LOAD.json",
                      "_ETL_m_SYN_ODS_ORDERS.json", "_ETL_m_SYN_ODS_CUSTOMERS.json",
                      "_ETL_m_SYN_DWH_ORDERS_FACT.json", "_ETL_m_SYN_DM_ORDERS_SUMMARY.json",
                      "_ETL_m_SYN_RDM_ORDERS_EXPORT.json", "_ETL_m_SYN_QDM_ORDERS_QUALITY.json",
                      "_ETL_m_SYN_ETL_ORDERS_BRIDGE.json", "_ETL_m_SYN_OUT_ORDERS_FEED.json");
    }

    @Test
    void casFamilyFullyConfigured() {   // sub-project 4 spec §3: every CAS mapping has L2L row(s)
        assertThat(layerToLayer.entries()).extracting(LayerToLayerEntryDto::recipe)
            .contains("_ETL_m_CAS_STG_L_EVENTS_LOAD.json", "_ETL_m_CAS_STG_L_REFS_LOAD.json",
                      "_ETL_m_CAS_ODS_EVENTS.json", "_ETL_m_CAS_ODS_EVENTS_ENRICH.json",
                      "_ETL_m_CAS_DWH_EVENTS_FACT.json", "_ETL_m_CAS_ODS_REFS.json",
                      "_ETL_m_CAS_ETL_EVENTS_SPLIT.json", "_ETL_m_CAS_CDM_EVENTS_MART.json",
                      "_ETL_m_CAS_RDM_EVENTS_EXPORT.json", "_ETL_m_CAS_QDM_EVENTS_QUALITY.json",
                      "_ETL_m_CAS_OUT_EVENTS_FEED.json", "_ETL_m_CAS_DWH_ORPHAN_METRICS.json");
    }

    @Test
    void decoyDirIsExcluded() {
        assertThat(layerToLayer.entries()).extracting(LayerToLayerEntryDto::recipe)
            .doesNotContain("_ETL_m_SYN_DECOY_NEVER_SERVED.json");
    }
}
