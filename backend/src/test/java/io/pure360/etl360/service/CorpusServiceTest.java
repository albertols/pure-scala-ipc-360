package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.TreeNodeDto;
import org.junit.jupiter.api.Test;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.assertThat;

class CorpusServiceTest {
    private final CorpusService service =
        new CorpusService(Path.of("src/test/resources/fixture-corpus"));

    @Test
    void buildsTreeWithLayersKindsAndFlags() {
        TreeNodeDto root = service.tree();
        assertThat(root.kind()).isEqualTo("dir");
        assertThat(root.layer()).isEqualTo("root");
        TreeNodeDto cdm = root.children().get(0);
        assertThat(cdm.name()).isEqualTo("CDM");
        assertThat(cdm.layer()).isEqualTo("CDM");
        TreeNodeDto xml = cdm.children().stream()
            .filter(n -> n.kind().equals("xml")).findFirst().orElseThrow();
        assertThat(xml.path()).isEqualTo("CDM/m_FIXTURE.xml");
        assertThat(xml.mappingPath()).isEqualTo("CDM/m_FIXTURE");
        assertThat(xml.hasRecipe()).isTrue();
        assertThat(xml.hasDdl()).isTrue();
        assertThat(xml.sizeBytes()).isPositive();
        assertThat(xml.modifiedAt()).isNotBlank();
        TreeNodeDto out = cdm.children().stream()
            .filter(n -> n.kind().equals("outputDir")).findFirst().orElseThrow();
        assertThat(out.children()).extracting(TreeNodeDto::kind).containsOnly("json");
    }

    @Test
    void countsMatchFixture() {
        // Fixture carries both a lowercase-.xml mapping (m_FIXTURE) and an uppercase-.XML
        // one (m_UPPER), mirroring the real corpus's 46 .xml + 13 .XML split.
        assertThat(service.xmlCount()).isEqualTo(2);
        assertThat(service.recipeCount()).isEqualTo(2);
        assertThat(service.allXmlPaths()).containsExactly("CDM/m_FIXTURE", "CDM/m_UPPER");
        assertThat(service.allRecipePaths()).containsExactly(
            "CDM/m_FIXTURE/_ETL_m_FIXTURE.json", "CDM/m_UPPER/_ETL_m_UPPER.json");
    }

    @Test
    void uppercaseXmlExtensionIsRecognized() {
        TreeNodeDto root = service.tree();
        TreeNodeDto cdm = root.children().get(0);
        TreeNodeDto upper = cdm.children().stream()
            .filter(n -> n.name().equals("m_UPPER.XML")).findFirst().orElseThrow();
        assertThat(upper.kind()).isEqualTo("xml");
        assertThat(upper.mappingPath()).isEqualTo("CDM/m_UPPER");
        assertThat(service.allXmlPaths()).contains("CDM/m_UPPER");
    }
}
