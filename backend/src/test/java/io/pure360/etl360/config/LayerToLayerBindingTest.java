package io.pure360.etl360.config;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@code Etl360Properties} carries two constructors (the canonical one plus the pre-vocabulary
 * arity most tests use), so which one Spring binds through is not self-evident. A bind that
 * silently fell back to the defaults would reproduce precisely the failure this whole feature
 * exists to remove: a config.json the operator has correctly filled in, ignored without a word.
 */
class LayerToLayerBindingTest {

    @SpringBootTest(properties = {
        "etl360.layer-to-layer.anchor-table=CTL.CORP_L2L_CONFIG",
        "etl360.layer-to-layer.layer-dirs=RAW,CURATED,MART",
    })
    @Nested
    class WhenConfigured {
        @Autowired Etl360Properties props;

        @Test
        void anchorTableIsTakenFromConfiguration() {
            assertThat(props.layerToLayer().anchorTable()).isEqualTo("CTL.CORP_L2L_CONFIG");
            assertThat(props.layerToLayer().anchor())
                .isEqualTo("INSERT INTO CTL.CORP_L2L_CONFIG VALUES");
        }

        /** ETL360_L2L_LAYER_DIRS arrives as one comma-separated string, never as a YAML list. */
        @Test
        void commaSeparatedLayerDirsBindToAList() {
            assertThat(props.layerToLayer().layerDirs()).containsExactly("RAW", "CURATED", "MART");
        }
    }

    @SpringBootTest
    @Nested
    class WhenUnset {
        @Autowired Etl360Properties props;

        @Test
        void fallsBackToThisReposAnonymizedDefaults() {
            assertThat(props.layerToLayer().anchorTable())
                .isEqualTo(Etl360Properties.LayerToLayer.DEFAULT_ANCHOR_TABLE);
            assertThat(props.layerToLayer().layerDirs())
                .isEqualTo(Etl360Properties.LayerToLayer.DEFAULT_LAYER_DIRS);
        }
    }
}
