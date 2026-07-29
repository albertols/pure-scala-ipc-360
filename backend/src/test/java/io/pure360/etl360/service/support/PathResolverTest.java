package io.pure360.etl360.service.support;

import org.junit.jupiter.api.Test;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.*;

class PathResolverTest {
    private final PathResolver resolver = new PathResolver(Path.of("src/test/resources/fixture-corpus"));

    @Test
    void traversalRejected() {
        assertThatThrownBy(() -> resolver.xmlFile("../../../etc/passwd"))
            .isInstanceOf(InvalidCorpusPathException.class);
    }

    @Test
    void resolvesExistingXml() {
        assertThat(resolver.xmlFile("CDM/m_FIXTURE")).exists();
    }
}
