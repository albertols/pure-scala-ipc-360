package io.pure360.etl360;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.pure360.etl360.service.CorpusService;
import io.pure360.etl360.service.ipc.ExpressionRules;
import io.pure360.etl360.service.ipc.IpcCatalog;
import io.pure360.etl360.service.ipc.IpcCheck;
import io.pure360.etl360.service.ipc.IpcRuleEngine;
import io.pure360.etl360.service.ipc.IpcVocabulary;
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

    @Test
    void everyRuleIsDocumentedInTheWiki() throws Exception {
        String rulesMd = Files.readString(Path.of("../docs/ipc/rules.md"));
        for (IpcCatalog.IpcRuleMeta meta : catalog.rules()) {
            assertThat(rulesMd).as("docs/ipc/rules.md documents " + meta.id()).contains(meta.id());
        }
    }

    @Test
    void everyWikiRefResolvesToAFileThatExists() throws Exception {
        for (IpcCatalog.IpcRuleMeta meta : catalog.rules()) {
            String ref = meta.wikiRef();
            if (ref.isBlank()) continue;
            String file = ref.contains("#") ? ref.substring(0, ref.indexOf('#')) : ref;
            assertThat(Files.isRegularFile(Path.of("..").resolve(file)))
                .as(meta.id() + " wikiRef -> " + file).isTrue();
        }
    }

    @Test
    void everyKindHasAWikiPage() {
        for (String kind : IpcVocabulary.TARGET_TYPES) {
            assertThat(Files.isRegularFile(Path.of("../docs/ipc/transformations/" + kind + ".md")))
                .as("wiki page for target kind " + kind).isTrue();
        }
        assertThat(Files.isRegularFile(Path.of("../docs/ipc/transformations/union.md")))
            .as("wiki page for source kind union").isTrue();
    }

    /**
     * Exact set equality, not just cardinality: a same-count rename in RecipeConstants.scala
     * would otherwise drift past this test silently. backend does depend on parser
     * (backend/pom.xml:44), so the Scala object IS on the classpath — the Java copy is kept
     * deliberately to keep Scala 2.12 collection interop out of the backend, and this test is
     * what makes the copy safe (human ruling, pre-flight scan 2026-08-01).
     */
    @Test
    void expressionVocabularyMatchesTheScalaConstants() throws Exception {
        String scala = Files.readString(
            Path.of("../parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/RecipeConstants.scala"));
        String block = scala.substring(scala.indexOf("PredefinedFunctions"),
            scala.indexOf("final val GlobalTransformationExclusionList"));
        java.util.Set<String> fromScala = new java.util.LinkedHashSet<>();
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"([A-Z_0-9]+)\"").matcher(block);
        while (m.find()) fromScala.add(m.group(1));
        assertThat(fromScala).as("regex found the function list").hasSizeGreaterThan(30);
        assertThat(ExpressionRules.PREDEFINED_FUNCTIONS)
            .as("Java copy of RecipeConstants.scala:48-52 matches the Scala source exactly")
            .containsExactlyInAnyOrderElementsOf(fromScala);
    }
}
