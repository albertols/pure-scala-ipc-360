package io.pure360.etl360;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.pure360.etl360.service.ProgressScanner;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.NestedTestConfiguration;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.oneOf;
import static org.springframework.test.context.NestedTestConfiguration.EnclosingConfiguration.INHERIT;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Contract for the landing page's single payload, against the committed mock tier. */
@SpringBootTest
@AutoConfigureMockMvc
class ReadinessContractTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper objectMapper;

    /**
     * Covers every field the payload carries — a rename or drop of ANY of them must fail this
     * test, since the plan's downstream tasks (Task 4's generated TypeScript, the landing page's
     * components) consume each by name. {@code progress.tasksDone}/{@code tasksTotal} are the
     * two fields that legitimately drift (this repo's own plan checkboxes get ticked, including
     * by this task's commit), so those two get a relational/floor assertion instead of an exact
     * value — never a hardcoded live count.
     */
    @Test
    void servesEveryFieldTheLandingPageNeedsInOneRequest() throws Exception {
        MvcResult result = mvc.perform(get("/api/readiness"))
           .andExpect(status().isOk())
           // "ok"/"ko" is the real vocabulary — DiagnosticsService (ADR-0013) never emits
           // "degraded"; that word names only the mascot's presentational mood on the frontend.
           .andExpect(jsonPath("$.status").value(oneOf("ok", "ko")))
           .andExpect(jsonPath("$.corpus.xml").value(81))
           .andExpect(jsonPath("$.corpus.recipes").value(86))
           .andExpect(jsonPath("$.corpus.ddl").value(212))
           .andExpect(jsonPath("$.corpus.dirs").value(greaterThan(0)))
           .andExpect(jsonPath("$.corpus.layers", hasItem("CDM")))
           .andExpect(jsonPath("$.corpus.layers", hasItem("DWH")))
           .andExpect(jsonPath("$.operational.clusters").value(21))
           .andExpect(jsonPath("$.operational.recipes").value(30))
           .andExpect(jsonPath("$.operational.days").value(14))
           .andExpect(jsonPath("$.operational.rows").value(417))
           .andExpect(jsonPath("$.operational.mode").value(notNullValue()))
           // 22, not the design doc's 23 — see ReadinessServiceTest.countsDistinctWorkflowsFromTheControlSchema:
           // the design doc's 23 was a raw grep across statements.sql INCLUDING the ARCHIVE/ decoy
           // directory; entries() (what ReadinessService actually counts from) correctly excludes it.
           .andExpect(jsonPath("$.dags.workflows").value(22))
           .andExpect(jsonPath("$.roots", hasSize(3)))
           .andExpect(jsonPath("$.roots[0].name").value("corpus"))
           .andExpect(jsonPath("$.roots[0].resolved").value(notNullValue()))
           .andExpect(jsonPath("$.roots[0].tier").value(notNullValue()))
           .andExpect(jsonPath("$.roots[0].status").value(notNullValue()))
           .andExpect(jsonPath("$.roots[0].hint").exists())
           .andExpect(jsonPath("$.roots[1].name").value("dwhControl"))
           .andExpect(jsonPath("$.roots[1].resolved").value(notNullValue()))
           .andExpect(jsonPath("$.roots[1].tier").value(notNullValue()))
           .andExpect(jsonPath("$.roots[1].status").value(notNullValue()))
           .andExpect(jsonPath("$.roots[1].hint").exists())
           .andExpect(jsonPath("$.roots[2].name").value("composer"))
           .andExpect(jsonPath("$.roots[2].resolved").value(notNullValue()))
           .andExpect(jsonPath("$.roots[2].tier").value(notNullValue()))
           .andExpect(jsonPath("$.roots[2].status").value(notNullValue()))
           .andExpect(jsonPath("$.roots[2].hint").exists())
           // 15, not the plan's forward-looking 16 — see ReadinessServiceTest.carriesRepoSourcedProgress:
           // ADR-0016 doesn't exist until Task 11 of this sub-project writes it.
           .andExpect(jsonPath("$.progress.adrs").value(greaterThanOrEqualTo(15)))
           .andExpect(jsonPath("$.progress.tasksTotal").value(greaterThan(0)))
           .andExpect(jsonPath("$.progress.tasksDone").exists())
           .andReturn();

        // tasksDone <= tasksTotal is a relationship between two fields — jsonPath alone can only
        // compare one field against a fixed matcher, so this reads the raw body to check it.
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        int tasksDone = body.at("/progress/tasksDone").asInt();
        int tasksTotal = body.at("/progress/tasksTotal").asInt();
        assertThat(tasksDone).isLessThanOrEqualTo(tasksTotal);
    }

    /** One request, not four — that is the endpoint's whole reason to exist. */
    @Test
    void carriesCorpusOperationalDagsAndRootsTogether() throws Exception {
        mvc.perform(get("/api/readiness"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.corpus").value(notNullValue()))
           .andExpect(jsonPath("$.operational").value(notNullValue()))
           .andExpect(jsonPath("$.dags").value(notNullValue()))
           .andExpect(jsonPath("$.roots").value(notNullValue()));
    }

    /** Existing endpoints must be untouched by this addition. */
    @Test
    void doesNotDisturbTheEndpointsTheLandingPageAggregates() throws Exception {
        mvc.perform(get("/api/summary")).andExpect(status().isOk())
           .andExpect(jsonPath("$.xmlCount").value(81));
        mvc.perform(get("/api/operational/clusters")).andExpect(status().isOk())
           .andExpect(jsonPath("$.totals.clusters").value(21));
        mvc.perform(get("/api/diagnostics")).andExpect(status().isOk())
           .andExpect(jsonPath("$.status").value(notNullValue()));
    }

    /**
     * {@code ReadinessDto} is {@code @JsonInclude(NON_NULL)} on the outer record, so a null
     * {@code progress} must serialize as an ABSENT key, not a JSON {@code null} literal — that is
     * what lets Task 4 type it as an optional property rather than a nullable one. Forces the
     * degraded path over real HTTP (not just at the service layer, which {@code ReadinessServiceTest}
     * and {@code ProgressScannerTest} already cover) by swapping in a {@link ProgressScanner} whose
     * {@code scan()} always returns null, via a nested Spring context that inherits everything from
     * the enclosing class and adds only this one override.
     *
     * <p><b>Why the assertion parses the body instead of using {@code jsonPath(...).doesNotExist()}:</b>
     * Spring's {@code JsonPathExpectationsHelper.doesNotExist()} catches {@code PathNotFoundException}
     * and then separately accepts a resolved {@code null} — an ABSENT key and an explicit JSON
     * {@code null} literal both satisfy it. Verified by mutation: temporarily forcing
     * {@code @JsonInclude(ALWAYS)} onto {@code ReadinessDto} (so {@code progress} serializes as an
     * explicit {@code null}) left the old {@code doesNotExist()} assertion GREEN — see the task
     * report's "Fix round 1" section for that run's output. Parsing the body into a {@link JsonNode}
     * and asserting {@code !has("progress")} does discriminate the two cases, because
     * {@code JsonNode.has} is false for a key that was never written at all and true (with a
     * {@code NullNode} value) for one written as an explicit {@code null}.
     */
    @Nested
    @NestedTestConfiguration(INHERIT)
    @AutoConfigureMockMvc
    @Import(WhenProgressCannotBeDetermined.NullProgressConfig.class)
    class WhenProgressCannotBeDetermined {
        @Autowired MockMvc mvc;
        @Autowired ObjectMapper objectMapper;

        @Test
        void omitsTheProgressKeyEntirelyRatherThanSerializingNull() throws Exception {
            MvcResult result = mvc.perform(get("/api/readiness"))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$.status").value(oneOf("ok", "ko")))
               .andExpect(jsonPath("$.corpus.xml").value(81))
               .andReturn();

            JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
            assertThat(body.has("progress"))
                .as("progress must be an ABSENT key, not an explicit JSON null, when it cannot be determined")
                .isFalse();
        }

        @TestConfiguration
        static class NullProgressConfig {
            @Bean
            @Primary
            ProgressScanner alwaysNullProgressScanner() {
                return new ProgressScanner() {
                    @Override
                    public Progress scan() {
                        return null;
                    }
                };
            }
        }
    }
}
