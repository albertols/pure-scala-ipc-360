package io.pure360.etl360;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.emptyOrNullString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Spec §5 gate for {@code GET /api/operational/summary} over the REAL committed 14-day mock
 * b15 history + mock LayerToLayer config (Task 9's synthetic operational data plus the CAS
 * casuistics family), not a fixture. Same {@code etl360.dwh-control-root} pin as {@link
 * OperationalContractTest} — see its Javadoc for why the pin is needed for LayerToLayer-backed
 * assertions to engage the committed mock deterministically.
 */
@SpringBootTest(properties = "etl360.dwh-control-root=/nonexistent-etl360-test-dwh-control")
@AutoConfigureMockMvc
class OperationalSummaryContractTest {
    @Autowired MockMvc mvc;

    @Test
    void summaryServesFourteenDatesAndCasEventsFactAggregatesCorrectly() throws Exception {
        String recipe = "$.recipes[?(@.recipeFilename == '_ETL_m_CAS_DWH_EVENTS_FACT.json')]";
        mvc.perform(get("/api/operational/summary"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.dates.length()").value(14))
            .andExpect(jsonPath(recipe + ".layer").value("DWH"))
            .andExpect(jsonPath(recipe + ".history.length()").value(14))
            .andExpect(jsonPath(recipe + ".okCount").value(10))
            .andExpect(jsonPath(recipe + ".koCount").value(4))
            .andExpect(jsonPath(recipe + ".latestDate").value("2026-07-29"))
            .andExpect(jsonPath(recipe + ".latestStatus").value("FAILED"))
            .andExpect(jsonPath(recipe + ".lastJobId").value(not(emptyOrNullString())))
            .andExpect(jsonPath(recipe + ".lastClusterName").value(not(emptyOrNullString())));
    }

    @Test
    void casEventsFactP95IsAtLeastP50() throws Exception {
        String body = mvc.perform(get("/api/operational/summary")).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JsonNode root = new ObjectMapper().readTree(body);
        JsonNode entry = null;
        for (JsonNode r : root.get("recipes")) {
            if ("_ETL_m_CAS_DWH_EVENTS_FACT.json".equals(r.get("recipeFilename").asText())) { entry = r; break; }
        }
        assertThat(entry).isNotNull();
        assertThat(entry.get("p95DurationMin").asDouble()).isGreaterThanOrEqualTo(entry.get("p50DurationMin").asDouble());
    }
}
