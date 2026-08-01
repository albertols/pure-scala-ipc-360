package io.pure360.etl360.service;

import org.junit.jupiter.api.Test;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.*;

class RecipeServiceTest {
    private final RecipeService service = new RecipeService(
        new io.pure360.etl360.service.support.PathResolver(Path.of("src/test/resources/fixture-corpus")),
        new io.pure360.etl360.service.ipc.IpcRuleEngine(new io.pure360.etl360.service.ipc.IpcCatalog()));

    @Test
    void readsRecipeWithMetadata() {
        var r = service.recipe("CDM/m_FIXTURE/_ETL_m_FIXTURE.json");
        assertThat(r.content().get("name").asText()).isEqualTo("m_FIXTURE");
        assertThat(r.fileName()).isEqualTo("_ETL_m_FIXTURE.json");
        assertThat(r.sizeBytes()).isPositive();
    }

    @Test
    void listsDdlsExcludingRecipeAndTranslations() {
        assertThat(service.ddls("CDM/m_FIXTURE")).containsOnlyKeys("TGT_FIXTURE");
    }

    @Test
    void missingRecipeIs404() {
        assertThatThrownBy(() -> service.recipe("CDM/m_FIXTURE/nope.json"))
            .isInstanceOf(io.pure360.etl360.service.support.NotFoundException.class);
    }
}
