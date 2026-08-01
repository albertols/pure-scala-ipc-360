package io.pure360.etl360.api;

import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * MockMvc-only (no port binding). Modelled on {@code RecipeWriteControllerTest}'s
 * {@code @DynamicPropertySource} temp-corpus idiom: a fresh temp directory seeded with one
 * fixture recipe ({@code CDM/m_FIX/_ETL_m_FIX.json}) and one real DDL file ({@code T.json}) in
 * the same output directory — the real corpus under {@code parser/src/main/resources/xmltobq}
 * is never touched by this class.
 * <p>
 * Ordered: {@code putThenGetRoundTripsPositionsAndFileLandsBesideRecipe} must run before
 * {@code sidecarExcludedFromTreeAndDdlWalks} so the exclusion assertions are checked against a
 * corpus that actually contains a {@code _layout_*.json} file, not just a corpus that never had
 * one to exclude.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class LayoutControllerTest {
    static Path corpus;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) throws IOException {
        corpus = Files.createTempDirectory("layout-corpus");
        Path dir = Files.createDirectories(corpus.resolve("CDM/m_FIX"));
        Files.writeString(dir.resolve("_ETL_m_FIX.json"), "{\"steps\":[],\"table\":{}}");
        Files.writeString(dir.resolve("T.json"), "[]");
        r.add("etl360.corpus-root", () -> corpus.toString());
    }

    @Autowired MockMvc mvc;

    @Test
    @Order(1)
    void getWithNoSidecarReturns200EmptyLayoutNever404() throws Exception {
        mvc.perform(get("/api/layouts/CDM/m_FIX/_ETL_m_FIX.json"))
            .andExpect(status().isOk())
            .andExpect(content().json("{\"version\":1,\"nodes\":{}}"));
    }

    @Test
    @Order(2)
    void putThenGetRoundTripsPositionsAndFileLandsBesideRecipe() throws Exception {
        String body = "{\"version\":1,\"nodes\":{\"n1\":{\"dx\":12.5,\"dy\":-4.0}}}";
        mvc.perform(put("/api/layouts/CDM/m_FIX/_ETL_m_FIX.json").contentType("application/json").content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.nodes.n1.dx").value(12.5))
            .andExpect(jsonPath("$.nodes.n1.dy").value(-4.0));

        mvc.perform(get("/api/layouts/CDM/m_FIX/_ETL_m_FIX.json"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.nodes.n1.dx").value(12.5))
            .andExpect(jsonPath("$.nodes.n1.dy").value(-4.0));

        assertThat(Files.isRegularFile(corpus.resolve("CDM/m_FIX/_layout_m_FIX.json"))).isTrue();
    }

    @Test
    @Order(3)
    void sidecarExcludedFromTreeAndDdlWalks() throws Exception {
        String treeBody = mvc.perform(get("/api/tree")).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(treeBody).doesNotContain("_layout_");

        mvc.perform(get("/api/ddl/CDM/m_FIX"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$._layout_m_FIX").doesNotExist());
    }

    @Test
    @Order(4)
    void sandboxEscapeReturns400() throws Exception {
        mvc.perform(get("/api/layouts/../../etc/passwd.json")).andExpect(status().isBadRequest());
    }
}
