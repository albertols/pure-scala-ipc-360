package io.pure360.etl360.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class RecipeAndDdlControllerTest {
    @Autowired MockMvc mvc;

    @Test
    void realCorpusRecipeServesContentAndMetadata() throws Exception {
        mvc.perform(get("/api/recipes/CDM/m_DM_INFOHUB_BIZLINK/_ETL_m_DM_INFOHUB_BIZLINK.json"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.fileName").value("_ETL_m_DM_INFOHUB_BIZLINK.json"))
           .andExpect(jsonPath("$.content").isMap());
    }

    @Test
    void missingRecipeIs404() throws Exception {
        mvc.perform(get("/api/recipes/CDM/m_DM_INFOHUB_BIZLINK/nope.json"))
           .andExpect(status().isNotFound());
    }

    @Test
    void realCorpusDdlsReturnsMapExcludingRecipe() throws Exception {
        mvc.perform(get("/api/ddl/CDM/m_DM_INFOHUB_BIZLINK"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.BIZLINK").isArray())
           .andExpect(jsonPath("$._ETL_m_DM_INFOHUB_BIZLINK").doesNotExist());
    }

    @Test
    void missingDdlDirIs404() throws Exception {
        mvc.perform(get("/api/ddl/CDM/missing"))
           .andExpect(status().isNotFound());
    }
}
