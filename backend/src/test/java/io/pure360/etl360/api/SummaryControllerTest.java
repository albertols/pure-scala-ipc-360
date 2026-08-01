package io.pure360.etl360.api;

import io.pure360.etl360.service.CorpusService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * MockMvc against the real corpus for the endpoint contract ({@code servesRealCorpusCounts}),
 * plus a standalone {@link CorpusService} over an isolated {@code @TempDir} corpus for the
 * exclusion assertion — self-contained so it can seed a {@code _layout_*.json} and a
 * {@code _history/} entry without touching the shared {@code fixture-corpus} other service
 * tests depend on (see {@code CorpusServiceTest}).
 */
@SpringBootTest
@AutoConfigureMockMvc
class SummaryControllerTest {
    @Autowired MockMvc mvc;

    @Test
    void servesRealCorpusCounts() throws Exception {
        mvc.perform(get("/api/summary"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.xmlCount").value(greaterThanOrEqualTo(81)))
            .andExpect(jsonPath("$.recipeCount").value(greaterThanOrEqualTo(86)))
            .andExpect(jsonPath("$.ddlCount").value(greaterThan(0)))
            .andExpect(jsonPath("$.layers", hasItem("CDM")))
            .andExpect(jsonPath("$.layers", hasItem("DWH")));
    }

    @Test
    void layoutSidecarsAndHistoryContentsAreExcludedFromDdlCount(@TempDir Path tmp) throws IOException {
        Path mappingDir = Files.createDirectories(tmp.resolve("CDM/m_FIX"));
        Files.writeString(mappingDir.resolve("_ETL_m_FIX.json"), "{}");
        Files.writeString(mappingDir.resolve("REAL_TABLE.json"), "[]");     // counted
        Files.writeString(mappingDir.resolve("_layout_m_FIX.json"), "{}"); // excluded: layout sidecar
        Path historyDir = Files.createDirectories(mappingDir.resolve("_history"));
        Files.writeString(historyDir.resolve("ARCHIVED_TABLE.json"), "[]"); // excluded: history sidecar

        CorpusService service = new CorpusService(tmp);
        assertThat(service.summary().ddlCount()).isEqualTo(1);
    }
}
