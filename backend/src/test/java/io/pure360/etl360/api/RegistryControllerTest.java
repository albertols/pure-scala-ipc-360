package io.pure360.etl360.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.pure360.etl360.api.dto.RegistryColumnDto;
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
import java.util.Map;

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

        // Task 16: a name backed by exactly ONE definition is canonical — one variant, whose
        // column names are exactly the (trivially unioned) `columns` list.
        assertThat(bizlink.get("variants")).as("BIZLINK variants").hasSize(1);
        List<String> bizlinkVariantCols = new ArrayList<>();
        bizlink.get("variants").get(0).get("columns").forEach(c -> bizlinkVariantCols.add(c.get("name").asText()));
        List<String> bizlinkCols = new ArrayList<>();
        bizlink.get("columns").forEach(c -> bizlinkCols.add(c.asText()));
        assertThat(bizlinkVariantCols).containsExactlyInAnyOrderElementsOf(bizlinkCols);
    }

    /**
     * Task 16, the honesty case: {@code DWH_SYN_ORDERS_FACT} is written by THREE mapping
     * directories with three genuinely different column sets (7 / 5 / 2 columns; union 8,
     * intersect 1 — measured, see the plan's Task 16 note). {@code columns} is the union, so it
     * matches no real {@code <TABLE>.json} on disk; {@code variants} is what the dialog offers
     * instead, each entry a real file's own columns plus the mapping dirs that carry it.
     */
    @Test
    void divergentDdlNameCarriesOneVariantPerDistinctColumnSet() throws Exception {
        String body = mvc.perform(get("/api/registry")).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        JsonNode fact = null;
        for (JsonNode t : mapper.readTree(body).get("ddlTables")) {
            if ("DWH_SYN_ORDERS_FACT".equals(t.get("name").asText())) {
                fact = t;
                break;
            }
        }
        assertThat(fact).as("DWH_SYN_ORDERS_FACT present in $.ddlTables").isNotNull();

        List<Integer> variantSizes = new ArrayList<>();
        List<String> variantDirs = new ArrayList<>();
        for (JsonNode v : fact.get("variants")) {
            variantSizes.add(v.get("columns").size());
            v.get("mappingDirs").forEach(d -> variantDirs.add(d.asText()));
        }
        assertThat(variantSizes).containsExactlyInAnyOrder(7, 5, 2);
        assertThat(variantDirs).containsExactlyInAnyOrder(
            "CDM/m_SYN_DM_ORDERS_SUMMARY", "DWH/m_SYN_DWH_ORDERS_FACT", "QDM/m_SYN_QDM_ORDERS_QUALITY");
        // The union is 8 — no variant may present it as if it were a definition.
        assertThat(fact.get("columns")).hasSize(8);
        assertThat(variantSizes).doesNotContain(8);
        // Every variant column carries the DDL's own BigQuery type (what the dialog maps to a
        // ScalaType) — names alone would not be enough to author fields from.
        for (JsonNode v : fact.get("variants")) {
            for (JsonNode c : v.get("columns")) {
                assertThat(c.get("name").asText()).isNotBlank();
                assertThat(c.get("type").asText()).isNotBlank();
            }
        }
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
        // Task 16: one definition behind the name — canonical, exactly one variant.
        assertThat(registry.ddlTables().get(0).variants()).hasSize(1);
        assertThat(registry.ddlTables().get(0).variants().get(0).columns())
            .containsExactly(new RegistryColumnDto("COL_A", "STRING"));
        assertThat(registry.ddlTables().get(0).variants().get(0).mappingDirs()).containsExactly("CDM/m_FIX");
        // A source/target table name has no DDL behind it at all — empty variants, exactly as it
        // already keeps empty columns.
        assertThat(registry.sourceTables().get(0).variants()).isEmpty();
        assertThat(registry.targetTables().get(0).variants()).isEmpty();
    }

    /**
     * Task 16: a variant is a distinct COLUMN SET, not a file. Three mapping dirs write a
     * {@code TGT} DDL: two byte-identical copies and one genuinely different set. The identical
     * pair must collapse into ONE variant carrying both mapping dirs — otherwise every one of
     * the 25 recurring corpus names would look divergent when only 11 actually are, and the
     * dialog would demand a choice where there is no conflict.
     */
    @Test
    void identicalDdlCopiesCollapseIntoOneVariantWhileDifferentColumnSetsStaySeparate(@TempDir Path tmp)
            throws IOException {
        String same = "[{\"mode\":\"NULLABLE\",\"name\":\"A\",\"type\":\"STRING\",\"description\":\"\"},"
            + "{\"mode\":\"NULLABLE\",\"name\":\"B\",\"type\":\"NUMERIC\",\"description\":\"\"}]";
        String other = "[{\"mode\":\"NULLABLE\",\"name\":\"A\",\"type\":\"STRING\",\"description\":\"\"},"
            + "{\"mode\":\"NULLABLE\",\"name\":\"C\",\"type\":\"TIMESTAMP\",\"description\":\"\"}]";
        for (Map.Entry<String, String> e : Map.of("CDM/m_A", same, "CDM/m_B", same, "CDM/m_C", other).entrySet()) {
            Path dir = Files.createDirectories(tmp.resolve(e.getKey()));
            String mapping = e.getKey().substring(e.getKey().indexOf('/') + 1);
            Files.writeString(dir.resolve("_ETL_" + mapping + ".json"),
                "{\"steps\":[],\"table\":{\"sourceTableNames\":[],\"targetTableNames\":[\"TGT\"]}}");
            Files.writeString(dir.resolve("TGT.json"), e.getValue());
        }

        RegistryDto registry = new RegistryService(
            new CorpusService(tmp),
            new RecipeService(new PathResolver(tmp), new IpcRuleEngine(new IpcCatalog()))).registry();

        RegistryTableDto tgt = registry.ddlTables().stream()
            .filter(t -> "TGT".equals(t.name())).findFirst().orElseThrow();
        // `columns` stays the union (three names across the two definitions) — unchanged contract.
        assertThat(tgt.columns()).containsExactly("A", "B", "C");
        assertThat(tgt.variants()).hasSize(2);
        assertThat(tgt.variants().get(0).columns())
            .containsExactly(new RegistryColumnDto("A", "STRING"), new RegistryColumnDto("B", "NUMERIC"));
        assertThat(tgt.variants().get(0).mappingDirs()).containsExactly("CDM/m_A", "CDM/m_B");
        assertThat(tgt.variants().get(1).columns())
            .containsExactly(new RegistryColumnDto("A", "STRING"), new RegistryColumnDto("C", "TIMESTAMP"));
        assertThat(tgt.variants().get(1).mappingDirs()).containsExactly("CDM/m_C");
    }
}
