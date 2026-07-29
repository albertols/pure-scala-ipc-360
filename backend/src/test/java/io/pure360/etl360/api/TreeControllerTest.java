package io.pure360.etl360.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import static org.hamcrest.Matchers.greaterThan;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class TreeControllerTest {
    @Autowired MockMvc mvc;

    @Test
    void servesRealCorpusTree() throws Exception {
        mvc.perform(get("/api/tree"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.kind").value("dir"))
           .andExpect(jsonPath("$.children.length()").value(greaterThan(3)));
    }

    @Test
    void healthNowReportsRealCounts() throws Exception {
        mvc.perform(get("/api/health"))
           .andExpect(jsonPath("$.xmlCount").value(greaterThan(40)))
           .andExpect(jsonPath("$.recipeCount").value(greaterThan(60)));
    }
}
