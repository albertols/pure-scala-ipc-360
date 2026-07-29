package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.MappingModelDto;
import io.pure360.etl360.config.RepoRoot;
import io.pure360.etl360.service.support.PathResolver;
import org.junit.jupiter.api.Test;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.assertThat;

class SemanticModelServiceTest {
    private final SemanticModelService service = new SemanticModelService(new PathResolver(
        RepoRoot.resolve(Path.of(".")).resolve("parser/src/main/resources/xmltobq")));

    @Test
    void parsesRealMappingViaScalaParser() {
        MappingModelDto m = service.model("CDM/m_DM_INFOHUB_BIZLINK");
        assertThat(m.repository().name()).isNotBlank();
        assertThat(m.repository().folder().name()).isNotBlank();
        assertThat(m.repository().folder().mappings()).isNotEmpty();
        assertThat(m.repository().folder().sources()).isNotEmpty();
    }
}
