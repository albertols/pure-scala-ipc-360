package io.pure360.etl360.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.pure360.etl360.service.CorpusService;
import io.pure360.etl360.service.support.HistorySidecar;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * MockMvc-only (no port binding). {@code @DynamicPropertySource} points {@code etl360.corpus-root}
 * at a fresh {@code @TempDir}-style temp directory seeded with a single fixture recipe
 * ({@code CDM/m_FIX/_ETL_m_FIX.json}) plus one non-recipe JSON ({@code BIZ.json}) — the real
 * corpus under {@code parser/src/main/resources/xmltobq} is never touched by this class.
 * <p>
 * All tests below share that ONE temp corpus/fixture for the life of the class (Spring caches
 * the context by property set), so the write-mutating tests are ordered deliberately:
 * {@code validateChecksRefsAndShape} must see the pristine fixture (runs first), then
 * {@code putArchivesThenWritesAtomicallyAndReturnsFreshDto} asserts an exact {@code _history}
 * count of one (must run before any other test adds more archives to that same sidecar), then
 * the remaining tests layer on top and re-derive their own "before" state dynamically via GET
 * rather than assuming a pristine file, so they remain correct however many prior PUTs ran.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class RecipeWriteControllerTest {
    static Path corpus;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) throws IOException {
        corpus = Files.createTempDirectory("write-corpus");
        Path dir = Files.createDirectories(corpus.resolve("CDM/m_FIX"));
        Files.writeString(dir.resolve("_ETL_m_FIX.json"),
            "{\"steps\":[{\"target\":{\"name\":\"T\",\"type\":\"table\",\"fields\":[{\"name\":\"A\",\"dataType\":\"String\",\"transformation\":{\"source\":\"S.A\"}}]},\"sources\":[{\"name\":\"S\",\"type\":\"table\"}]}],\"table\":{\"targetTableNames\":[\"T\"],\"sourceTableNames\":[\"S\"]}}");
        Files.writeString(dir.resolve("BIZ.json"), "[]");
        r.add("etl360.corpus-root", () -> corpus.toString());
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;
    @Autowired CorpusService corpusService;

    @Test
    @Order(1)
    void validateChecksRefsAndShape() throws Exception {
        mvc.perform(post("/api/recipes/validate").contentType("application/json")
                .content(Files.readString(corpus.resolve("CDM/m_FIX/_ETL_m_FIX.json"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.valid").value(true));

        mvc.perform(post("/api/recipes/validate").contentType("application/json")
                .content("{\"steps\":[{\"target\":{\"name\":\"T\",\"type\":\"table\",\"weststone\":[{\"name\":\"A\",\"transformation\":{\"source\":\"GHOST.A\"}}]},\"sources\":[]}],\"table\":{\"targetTableNames\":[\"T\"],\"sourceTableNames\":[]}}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.valid").value(false))
            .andExpect(jsonPath("$.errors[0].message", containsString("GHOST")));
    }

    @Test
    @Order(2)
    void putArchivesThenWritesAtomicallyAndReturnsFreshDto() throws Exception {
        String base = om.readTree(mvc.perform(get("/api/recipes/CDM/m_FIX/_ETL_m_FIX.json"))
            .andReturn().getResponse().getContentAsString()).get("modifiedAt").asText();
        String body = "{\"baseModified\":\"" + base + "\",\"content\":{\"steps\":[],\"table\":{\"targetTableNames\":[],\"sourceTableNames\":[]}}}";

        mvc.perform(put("/api/recipes/CDM/m_FIX/_ETL_m_FIX.json").contentType("application/json").content(body))
           .andExpect(status().isOk()).andExpect(jsonPath("$.fileName").value("_ETL_m_FIX.json"));

        try (var s = Files.list(corpus.resolve("CDM/m_FIX/_history"))) {
            var names = s.map(p -> p.getFileName().toString()).toList();
            assertThat(names).hasSize(1);
            assertThat(names.get(0)).matches("_ETL_m_FIX\\.\\d{8}-\\d{6}-\\d{3}\\.json"); // yyyyMMdd-HHmmss-SSS
        }

        // stale baseModified (file already moved on from `base`) -> 409
        mvc.perform(put("/api/recipes/CDM/m_FIX/_ETL_m_FIX.json").contentType("application/json").content(body))
           .andExpect(status().isConflict());
    }

    @Test
    @Order(3)
    void historyListsViewsAndRollsBackByteIdentical() throws Exception {
        String recipePath = "/api/recipes/CDM/m_FIX/_ETL_m_FIX.json";
        String beforeResponse = mvc.perform(get(recipePath)).andReturn().getResponse().getContentAsString();
        JsonNode before = om.readTree(beforeResponse).get("content");
        String base = om.readTree(beforeResponse).get("modifiedAt").asText();

        String body = "{\"baseModified\":\"" + base + "\",\"content\":{\"steps\":[{\"target\":{\"name\":\"X\",\"type\":\"table\",\"fields\":[]},\"sources\":[]}],\"table\":{\"targetTableNames\":[\"X\"],\"sourceTableNames\":[]}}}";
        mvc.perform(put(recipePath).contentType("application/json").content(body)).andExpect(status().isOk());

        String historyPath = "/api/recipes/history/CDM/m_FIX/_ETL_m_FIX.json";
        String historyListJson = mvc.perform(get(historyPath))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].version").exists())
            .andReturn().getResponse().getContentAsString();
        // Newest archive first: the entry PUT just created above (archiving `before`).
        String version = om.readTree(historyListJson).get(0).get("version").asText();

        mvc.perform(get(historyPath).param("version", version))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.content.steps").exists());

        mvc.perform(post("/api/recipes/rollback/CDM/m_FIX/_ETL_m_FIX.json").param("version", version))
           .andExpect(status().isOk());

        String restored = mvc.perform(get(recipePath)).andReturn().getResponse().getContentAsString();
        assertThat(om.readTree(restored).get("content")).isEqualTo(before);
    }

    @Test
    @Order(4)
    void sandboxEscapeAndNonRecipeAre400() throws Exception {
        mvc.perform(put("/api/recipes/CDM/../../escape.json").contentType("application/json")
            .content("{\"baseModified\":\"x\",\"content\":{}}")).andExpect(status().isBadRequest());
        mvc.perform(put("/api/recipes/CDM/m_FIX/BIZ.json").contentType("application/json")
            .content("{\"baseModified\":\"x\",\"content\":{}}")).andExpect(status().isBadRequest());
    }

    @Test
    @Order(5)
    void historySidecarExcludedFromTreeAndRecipeWalks() throws Exception {
        // Self-sufficient even if run in isolation: guarantee _history exists here too.
        String recipePath = "/api/recipes/CDM/m_FIX/_ETL_m_FIX.json";
        String base = om.readTree(mvc.perform(get(recipePath)).andReturn().getResponse().getContentAsString())
            .get("modifiedAt").asText();
        String body = "{\"baseModified\":\"" + base + "\",\"content\":{\"steps\":[],\"table\":{\"targetTableNames\":[],\"sourceTableNames\":[]}}}";
        mvc.perform(put(recipePath).contentType("application/json").content(body)).andExpect(status().isOk());

        String treeBody = mvc.perform(get("/api/tree")).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(treeBody).doesNotContain("_history");

        assertThat(corpusService.allRecipePaths()).hasSize(1);
    }

    /**
     * Task 7 review finding: save/rollback's archive step used {@code Files.copy(...,
     * REPLACE_EXISTING)} into a millisecond-timestamped filename — two saves landing in the
     * same millisecond would silently clobber one archive entry (lost history, not lost data:
     * the live file itself was still written correctly, but only via a check-then-act with no
     * synchronization, which is the bigger defect this same fix addresses).
     * <p>
     * Forces the collision deterministically (no timing-dependent flakiness) by stubbing
     * {@link HistorySidecar#newVersion()} to return a fixed timestamp for both saves in this
     * test, then asserts two distinct archive files exist afterward — proving the {@code -1}
     * suffix collision handling actually fires end-to-end through {@code save()}, not just in
     * isolation.
     */
    @Test
    @Order(6)
    void sameMillisecondSavesProduceDistinctHistoryEntries() throws Exception {
        String recipePath = "/api/recipes/CDM/m_FIX/_ETL_m_FIX.json";
        Path historyDir = corpus.resolve("CDM/m_FIX/_history");
        long before = countFiles(historyDir);
        String fixedVersion = "20991231-235959-999"; // won't collide with any real archive above

        try (MockedStatic<HistorySidecar> mocked =
                 Mockito.mockStatic(HistorySidecar.class, Mockito.CALLS_REAL_METHODS)) {
            mocked.when(HistorySidecar::newVersion).thenReturn(fixedVersion);

            for (int i = 0; i < 2; i++) {
                String base = om.readTree(mvc.perform(get(recipePath)).andReturn().getResponse().getContentAsString())
                    .get("modifiedAt").asText();
                String body = "{\"baseModified\":\"" + base
                    + "\",\"content\":{\"steps\":[],\"table\":{\"targetTableNames\":[],\"sourceTableNames\":[]}}}";
                mvc.perform(put(recipePath).contentType("application/json").content(body))
                   .andExpect(status().isOk());
            }
        }

        assertThat(countFiles(historyDir) - before).isEqualTo(2); // no entry silently overwritten
        try (var s = Files.list(historyDir)) {
            var names = s.map(p -> p.getFileName().toString())
                .filter(n -> n.contains(fixedVersion)).toList();
            assertThat(names).containsExactlyInAnyOrder(
                "_ETL_m_FIX." + fixedVersion + ".json",
                "_ETL_m_FIX." + fixedVersion + "-1.json");
        }
    }

    /**
     * Final-review finding: {@code history()} listed every regular file in {@code _history/}
     * and fed each into {@code versionOf}, which assumes the name is exactly
     * {@code <stem>.<version>.json} — a stray Finder file like {@code .DS_Store} (the sidecar
     * is committable and Finder-visible) or another recipe's archive threw
     * {@code StringIndexOutOfBoundsException}, turning into a 500. Asserts the endpoint now
     * ignores both and still returns only this recipe's own archives.
     */
    @Test
    @Order(7)
    void historyFiltersStrayAndForeignFilesFromSidecar() throws Exception {
        String historyPath = "/api/recipes/history/CDM/m_FIX/_ETL_m_FIX.json";
        Path historyDir = corpus.resolve("CDM/m_FIX/_history");

        int before = om.readTree(mvc.perform(get(historyPath)).andReturn().getResponse().getContentAsString()).size();

        Files.writeString(historyDir.resolve(".DS_Store"), "junk");
        Files.writeString(historyDir.resolve("_ETL_other.20990101-000000-000.json"), "{}");

        String afterJson = mvc.perform(get(historyPath))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(om.readTree(afterJson)).hasSize(before); // stray + foreign files excluded
    }

    private static long countFiles(Path dir) throws IOException {
        if (!Files.isDirectory(dir)) return 0;
        try (var s = Files.list(dir)) {
            return s.count();
        }
    }
}
