package io.pure360.etl360.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** The config.json→ETL360_GCP_PROJECT→property thread: application.yml binds the env
 * var via ${ETL360_GCP_PROJECT:...} (application.yml:10); this proves property→response. */
@SpringBootTest(properties = "etl360.gcp.project-id=cfg-itest-project")
@AutoConfigureMockMvc
class ConfigGcpProjectOverrideTest {
    @Autowired MockMvc mvc;

    @Test
    void servesTheConfiguredGcpProjectId() throws Exception {
        mvc.perform(get("/api/config"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.gcpProjectId").value("cfg-itest-project"));
    }
}
