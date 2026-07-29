package io.pure360.etl360.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import java.net.URI;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class MappingControllerTest {
    @Autowired MockMvc mvc;

    @Test
    void realCorpusMappingServesLosslessDom() throws Exception {
        mvc.perform(get("/api/mappings/dom/CDM/m_DM_INFOHUB_BIZLINK"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.name").value("POWERMART"));
    }

    @Test
    void missingMappingIs404ProblemJson() throws Exception {
        mvc.perform(get("/api/mappings/dom/CDM/missing"))
           .andExpect(status().isNotFound())
           .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
           .andExpect(jsonPath("$.title").value("Not found"));
    }

    @Test
    void traversalAttemptIs400() throws Exception {
        mvc.perform(get(URI.create("/api/mappings/dom/..%2F..%2Fetc")))
           .andExpect(status().isBadRequest());
    }
}
