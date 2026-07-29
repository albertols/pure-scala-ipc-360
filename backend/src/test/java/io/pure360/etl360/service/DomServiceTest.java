package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.XmlNodeDto;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.*;

class DomServiceTest {
    private final DomService service = new DomService(
        new io.pure360.etl360.service.support.PathResolver(Path.of("src/test/resources/fixture-corpus")));

    @Test
    void losslessDomOfFixture() {
        XmlNodeDto root = service.dom("CDM/m_FIXTURE");
        assertThat(root.name()).isEqualTo("POWERMART");
        assertThat(root.attributes()).containsEntry("REPOSITORY_VERSION", "188.97");
        XmlNodeDto folder = root.children().get(0).children().get(0);
        assertThat(folder.name()).isEqualTo("FOLDER");
        assertThat(folder.attributes()).containsEntry("NAME", "FIX_FOLDER");
        // every element level preserved: SOURCE, TARGET, TRANSFORMATION, MAPPING
        assertThat(folder.children()).extracting(XmlNodeDto::name)
            .containsExactly("SOURCE", "TARGET", "TRANSFORMATION", "MAPPING");
        // entity &gt; decoded losslessly inside attribute
        XmlNodeDto field = folder.children().get(2).children().get(0);
        assertThat(field.attributes().get("EXPRESSION")).contains(">CHR(39)");
    }

    @Test
    void missingMappingIs404() {
        assertThatThrownBy(() -> service.dom("CDM/nope"))
            .isInstanceOf(io.pure360.etl360.service.support.NotFoundException.class);
    }

    @Test
    void unparsableXmlIs422WithAnonymizerHint(@TempDir Path tempDir) throws Exception {
        Path dir = tempDir.resolve("CDM");
        Files.createDirectories(dir);
        // undeclared entity — same shape as anonymizer-mangled corpus XML, not a real DTD issue.
        Files.writeString(dir.resolve("m_BROKEN.xml"), "<POWERMART>&bogusEntity;</POWERMART>");
        DomService broken = new DomService(
            new io.pure360.etl360.service.support.PathResolver(tempDir));

        assertThatThrownBy(() -> broken.dom("CDM/m_BROKEN"))
            .isInstanceOf(io.pure360.etl360.service.support.XmlUnparsableException.class)
            .hasMessageContaining("anonymizer");
    }
}
