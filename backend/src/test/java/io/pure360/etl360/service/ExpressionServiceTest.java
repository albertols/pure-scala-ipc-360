package io.pure360.etl360.service;

import io.pure360.etl360.service.support.PathResolver;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.assertThat;

class ExpressionServiceTest {
    @Test
    void extractsExpressionsFromXmlDom() {
        Path fixture = Path.of("src/test/resources/fixture-corpus");
        var service = new ExpressionService(new CorpusService(fixture),
                                            new DomService(new PathResolver(fixture)));
        var all = service.all();
        assertThat(all).hasSize(1);
        var e = all.get(0);
        assertThat(e.transformation()).isEqualTo("EXP_FIX");
        assertThat(e.port()).isEqualTo("COL_A_OUT");
        assertThat(e.formula()).contains("LTRIM");
        assertThat(e.origin()).isEqualTo("xml");
        assertThat(e.layer()).isEqualTo("CDM");
    }

    @Test
    void skipsDamagedMappingWithoutEmptyingArchive(@TempDir Path tempDir) throws Exception {
        // One healthy mapping (copy of the fixture) plus one damaged mapping in a throwaway
        // temp corpus (never the shared fixture-corpus) — the damaged file must be skipped
        // with a WARN log, not blow up or empty the whole archive.
        Path healthyDir = tempDir.resolve("CDM");
        Files.createDirectories(healthyDir);
        Files.copy(Path.of("src/test/resources/fixture-corpus/CDM/m_FIXTURE.xml"),
            healthyDir.resolve("m_FIXTURE.xml"));
        // undeclared entity — same shape as anonymizer-mangled corpus XML, not a real DTD issue.
        Files.writeString(healthyDir.resolve("m_BROKEN.xml"), "<POWERMART>&bogusEntity;</POWERMART>");

        var service = new ExpressionService(new CorpusService(tempDir),
                                            new DomService(new PathResolver(tempDir)));
        var all = service.all();

        assertThat(all).hasSize(1);
        assertThat(all.get(0).mappingPath()).isEqualTo("CDM/m_FIXTURE");
    }
}
