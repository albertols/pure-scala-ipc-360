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

    // ─── ?clusters= scoping ──────────────────────────────────────────────────────
    //
    // `/api/operational/summary` was the last unbounded payload on Tab 3's selected path:
    // `useOperationalSummary(hasSelection)` gates on WHETHER a selection exists, never on WHICH,
    // so the first cluster click aggregated every recipe x every date. Measured on the 30-recipe
    // mock the summary is 38 904 B against the entire unscoped graph's 20 984 B; at the ~7 000
    // recipes this sub-project targets and ~90 B per history entry that is tens of megabytes
    // parsed on the main thread. The parameter mirrors /api/relationships's scoping semantics
    // exactly — ABSENT means today's full response, byte-identical.

    private JsonNode summary(String query) throws Exception {
        return new ObjectMapper().readTree(mvc.perform(get("/api/operational/summary" + query))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    /** The single most important assertion here: today's callers must see today's bytes. */
    @Test
    void anUnscopedRequestIsByteIdenticalWithAndWithoutAnEmptyClustersParameter() throws Exception {
        String plain = mvc.perform(get("/api/operational/summary"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        // A bare `clusters=` is not "scope to nothing", it is no scope at all — same as absent.
        String bare = mvc.perform(get("/api/operational/summary?clusters="))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        assertThat(bare).isEqualTo(plain);
        assertThat(new ObjectMapper().readTree(plain).get("recipes").size()).isEqualTo(30);
    }

    @Test
    void aScopedSummaryIsAStrictSubsetOfTheUnscopedOne() throws Exception {
        JsonNode full = summary("");
        JsonNode scoped = summary("?clusters=cluster-wf-cas-load-4001");

        assertThat(scoped.get("recipes").size())
            .isEqualTo(5)                                   // Task 1's 5-recipe cluster
            .isLessThan(full.get("recipes").size());

        java.util.Set<String> fullNames = new java.util.HashSet<>();
        for (JsonNode r : full.get("recipes")) fullNames.add(r.get("recipeFilename").asText());
        for (JsonNode r : scoped.get("recipes")) {
            assertThat(fullNames).contains(r.get("recipeFilename").asText());
        }
    }

    /**
     * The recipe set narrows; the date axis does not. `dates` is the b15 history's own extent,
     * not a property of the selection — narrowing it would silently shrink the calendar and the
     * history strips to whatever the current selection happened to touch.
     */
    @Test
    void scopingNarrowsTheRecipesButNotTheDateAxis() throws Exception {
        assertThat(summary("?clusters=cluster-wf-cas-load-4001").get("dates").size()).isEqualTo(14);
    }

    @Test
    void severalClustersUnionTheirRecipes() throws Exception {
        int one = summary("?clusters=cluster-wf-cas-load-4001").get("recipes").size();
        int two = summary("?clusters=cluster-wf-cas-load-4001&clusters=cluster-wf-cas-core-4002")
            .get("recipes").size();

        assertThat(two).isGreaterThan(one).isLessThan(30);
    }

    /** Unknown names contribute nothing rather than 404ing — same rule as /api/relationships. */
    @Test
    void anUnknownClusterScopesToNoRecipesRatherThanFailing() throws Exception {
        assertThat(summary("?clusters=no-such-cluster").get("recipes")).isEmpty();
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
