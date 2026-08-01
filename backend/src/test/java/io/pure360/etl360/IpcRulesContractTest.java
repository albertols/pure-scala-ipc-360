package io.pure360.etl360;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.pure360.etl360.service.CorpusService;
import io.pure360.etl360.service.ipc.IpcCatalog;
import io.pure360.etl360.service.ipc.IpcCheck;
import io.pure360.etl360.service.ipc.IpcRuleEngine;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class IpcRulesContractTest {
    @Autowired CorpusService corpus;
    @Autowired IpcRuleEngine engine;
    @Autowired IpcCatalog catalog;
    private final ObjectMapper mapper = new ObjectMapper();

    /** Spec §5.4's invariant: the committed corpus is error-free under the whole catalogue. */
    @Test
    void everyCorpusRecipeIsErrorFree() throws Exception {
        List<String> recipes = corpus.allRecipePaths();
        assertThat(recipes).hasSizeGreaterThanOrEqualTo(86);
        List<String> offenders = new ArrayList<>();
        for (String rel : recipes) {
            var content = mapper.readTree(
                Files.readString(Path.of("../parser/src/main/resources/xmltobq").resolve(rel)));
            for (IpcCheck c : engine.run(content)) {
                if ("fail".equals(c.status()) && "error".equals(c.severity())) {
                    offenders.add(rel + " " + c.ruleId() + " @" + c.path() + ": " + c.message());
                }
            }
        }
        assertThat(offenders).as("corpus recipes violating an error-severity rule").isEmpty();
    }

    @Test
    void everyRegisteredRuleIdHasCatalogueMetadata() {
        for (String id : engine.ruleIds()) {
            assertThat(catalog.meta(id)).as("catalogue entry for " + id).isNotNull();
        }
    }

    @Test
    void everyCatalogueRuleIdIsRegistered() {
        java.util.Set<String> implemented = new java.util.HashSet<>(engine.ruleIds());
        // IPC-TYP-* required-key ids are emitted by the shared IPC-TYP-REQUIRED-KEYS rule via
        // the key schema's ruleId fields rather than being registered individually, so the
        // schema's ids count as implemented too.
        catalog.keySchema().values().forEach(specs -> specs.forEach(s -> {
            if (!s.ruleId().isBlank()) implemented.add(s.ruleId());
        }));
        for (IpcCatalog.IpcRuleMeta meta : catalog.rules()) {
            assertThat(implemented).as("rule " + meta.id() + " is implemented").contains(meta.id());
        }
    }

    /** The reverse direction: a ruleId in the key schema with no catalogue entry would emit
     * checks carrying no severity, statement or citation. */
    @Test
    void everyKeySchemaRuleIdHasCatalogueMetadata() {
        catalog.keySchema().forEach((kind, specs) -> specs.forEach(s -> {
            if (s.ruleId().isBlank()) return;
            assertThat(catalog.meta(s.ruleId()))
                .as("catalogue entry for " + kind + "." + s.key() + " -> " + s.ruleId()).isNotNull();
        }));
    }

    @Test
    void everyRuleCitesTheParser() {
        for (IpcCatalog.IpcRuleMeta meta : catalog.rules()) {
            assertThat(meta.parserRef()).as(meta.id() + " parserRef").isNotBlank();
            assertThat(meta.severity()).as(meta.id() + " severity").isIn("error", "warning", "info");
        }
    }
}
