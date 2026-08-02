package io.pure360.etl360.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.pure360.etl360.api.dto.RegistryDto;
import io.pure360.etl360.api.dto.RegistryTableDto;
import io.pure360.etl360.service.CorpusService;
import io.pure360.etl360.service.RecipeService;
import io.pure360.etl360.service.RegistryService;
import io.pure360.etl360.service.ipc.IpcCatalog;
import io.pure360.etl360.service.ipc.IpcRuleEngine;
import io.pure360.etl360.service.support.PathResolver;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * MockMvc against the real corpus for the endpoint contract ({@code servesRealCorpusRegistry}),
 * plus a standalone {@link RegistryService} over an isolated {@code @TempDir} corpus for the
 * exclusion assertion — self-contained so it can seed a {@code _layout_*.json} and a
 * {@code _history/} entry without touching the shared {@code fixture-corpus} other service tests
 * depend on. Mirrors {@code SummaryControllerTest}'s two-test shape (see CLAUDE.md's note on
 * that idiom).
 */
@SpringBootTest
@AutoConfigureMockMvc
class RegistryControllerTest {
    @Autowired MockMvc mvc;
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void servesRealCorpusRegistry() throws Exception {
        String body = mvc.perform(get("/api/registry"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sourceTables", hasSize(greaterThanOrEqualTo(100))))
            .andExpect(jsonPath("$.targetTables", hasSize(greaterThanOrEqualTo(80))))
            .andExpect(jsonPath("$.layers", hasItem("CDM")))
            .andExpect(jsonPath("$.layers", hasItem("DWH")))
            .andReturn().getResponse().getContentAsString();

        // A known DDL table (CDM/m_DM_INFOHUB_BIZLINK/BIZLINK.json, also exercised by
        // RecipeAndDdlControllerTest) must carry its columns. Asserted via Jackson rather than a
        // chained jsonPath filter — clearer to read and to debug on failure.
        JsonNode root = mapper.readTree(body);
        JsonNode bizlink = null;
        for (JsonNode t : root.get("ddlTables")) {
            if ("BIZLINK".equals(t.get("name").asText())) {
                bizlink = t;
                break;
            }
        }
        assertThat(bizlink).as("BIZLINK DDL table present in $.ddlTables").isNotNull();
        assertThat(bizlink.get("columns")).as("BIZLINK columns").isNotEmpty();
    }

    @Test
    void layoutSidecarsAndHistoryContentsAreExcludedFromRegistry(@TempDir Path tmp) throws IOException {
        Path mappingDir = Files.createDirectories(tmp.resolve("CDM/m_FIX"));
        Files.writeString(mappingDir.resolve("_ETL_m_FIX.json"),
            "{\"steps\":[],\"table\":{\"sourceTableNames\":[\"SRC_FIX\"],\"targetTableNames\":[\"TGT_FIX\"]}}");
        Files.writeString(mappingDir.resolve("TGT_FIX.json"),
            "[{\"mode\":\"NULLABLE\",\"name\":\"COL_A\",\"type\":\"STRING\",\"description\":\"\"}]");
        // Canvas-layout sidecar: must never surface as a DDL/source/target entry.
        Files.writeString(mappingDir.resolve("_layout_m_FIX.json"), "{\"nodes\":{}}");
        // Write-history sidecar: an archived recipe (different table names) plus an archived
        // DDL-shaped file — neither may leak into the live registry.
        Path historyDir = Files.createDirectories(mappingDir.resolve("_history"));
        Files.writeString(historyDir.resolve("_ETL_m_FIX.20260101-000000-000.json"),
            "{\"steps\":[],\"table\":{\"sourceTableNames\":[\"HISTORY_POISON_SRC\"],"
                + "\"targetTableNames\":[\"HISTORY_POISON_TGT\"]}}");
        Files.writeString(historyDir.resolve("HISTORY_POISON_DDL.json"), "[]");

        PathResolver paths = new PathResolver(tmp);
        CorpusService corpus = new CorpusService(tmp);
        RecipeService recipes = new RecipeService(paths, new IpcRuleEngine(new IpcCatalog()));
        RegistryService service = new RegistryService(corpus, recipes);

        RegistryDto registry = service.registry();

        assertThat(registry.sourceTables()).extracting(RegistryTableDto::name).containsExactly("SRC_FIX");
        assertThat(registry.targetTables()).extracting(RegistryTableDto::name).containsExactly("TGT_FIX");
        assertThat(registry.ddlTables()).extracting(RegistryTableDto::name).containsExactly("TGT_FIX");
        assertThat(registry.ddlTables().get(0).columns()).containsExactly("COL_A");

        List<String> allNames = new ArrayList<>();
        registry.sourceTables().forEach(t -> allNames.add(t.name()));
        registry.targetTables().forEach(t -> allNames.add(t.name()));
        registry.ddlTables().forEach(t -> allNames.add(t.name()));
        assertThat(allNames).doesNotContain("HISTORY_POISON_SRC", "HISTORY_POISON_TGT", "HISTORY_POISON_DDL");
    }
}
