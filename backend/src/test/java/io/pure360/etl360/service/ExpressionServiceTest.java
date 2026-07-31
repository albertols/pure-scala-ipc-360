package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.ExpressionEntryDto;
import io.pure360.etl360.config.RepoRoot;
import io.pure360.etl360.service.support.PathResolver;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

class ExpressionServiceTest {
    @Test
    void extractsExpressionsFromXmlDom() {
        Path fixture = Path.of("src/test/resources/fixture-corpus");
        var service = new ExpressionService(new CorpusService(fixture),
                                            new DomService(new PathResolver(fixture)),
                                            new PathResolver(fixture));
        var all = service.all();
        assertThat(all).hasSize(1);
        var e = all.get(0);
        assertThat(e.transformation()).isEqualTo("EXP_FIX");
        assertThat(e.port()).isEqualTo("COL_A_OUT");
        assertThat(e.formula()).contains("LTRIM");
        assertThat(e.origin()).isEqualTo("xml");
        assertThat(e.layer()).isEqualTo("CDM");
    }

    // Task 11: recipe-origin walk, exercised against the REAL corpus (not fixture-corpus) —
    // the SYN_ODS_ORDERS recipe is the cross-language determinism fixture (see task-5-report.md):
    // its AMOUNT field's transformation tree must render byte-identically to the frontend's
    // renderFormula, corrected during Task 5 to include the outer "Undefined" node's genuine
    // second {value:"2"} parameter.
    @Test
    void mergesRecipeOriginExpressionsAlongsideXmlOriginOnes() {
        Path real = RepoRoot.resolve(Path.of(".")).resolve("parser/src/main/resources/xmltobq");
        var service = new ExpressionService(new CorpusService(real), new DomService(new PathResolver(real)),
            new PathResolver(real));
        List<ExpressionEntryDto> all = service.all();

        long xmlCount = all.stream().filter(e -> "xml".equals(e.origin())).count();
        long recipeCount = all.stream().filter(e -> "recipe".equals(e.origin())).count();
        assertThat(xmlCount).isGreaterThan(0);
        assertThat(recipeCount).isGreaterThan(0);
        assertThat(all.size()).isEqualTo(xmlCount + recipeCount);

        ExpressionEntryDto e = all.stream()
            .filter(x -> "recipe".equals(x.origin()) && "AMOUNT".equals(x.port())
                && "ODS/m_SYN_ODS_ORDERS/_ETL_m_SYN_ODS_ORDERS.json".equals(x.mappingPath()))
            .findFirst().orElseThrow(() -> new AssertionError("SYN_ODS_ORDERS AMOUNT recipe entry not found"));

        assertThat(e.layer()).isEqualTo("ODS");
        assertThat(e.transformation()).isEqualTo("ODS_SYN_ORDERS");
        assertThat(e.formula()).isEqualTo(
            "Undefined(EXP_ARITHMETIC(STG_L_SYN_ORDERS.AMOUNT, *, LKP_SYN_CURRENCY(STG_L_SYN_ORDERS.CURRENCY_CODE)), 2)");
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
                                            new DomService(new PathResolver(tempDir)),
                                            new PathResolver(tempDir));
        var all = service.all();

        assertThat(all).hasSize(1);
        assertThat(all.get(0).mappingPath()).isEqualTo("CDM/m_FIXTURE");
    }
}
