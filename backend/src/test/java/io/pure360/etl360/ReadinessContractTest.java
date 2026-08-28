package io.pure360.etl360;

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

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
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

    @Test
    void servesEveryFieldTheLandingPageNeedsInOneRequest() throws Exception {
        mvc.perform(get("/api/readiness"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.status").value(oneOf("ok", "degraded")))
           .andExpect(jsonPath("$.corpus.xml").value(81))
           .andExpect(jsonPath("$.corpus.recipes").value(86))
           .andExpect(jsonPath("$.corpus.ddl").value(212))
           .andExpect(jsonPath("$.operational.clusters").value(21))
           .andExpect(jsonPath("$.operational.recipes").value(30))
           .andExpect(jsonPath("$.operational.days").value(14))
           .andExpect(jsonPath("$.operational.rows").value(417))
           // 22, not the design doc's 23 — see ReadinessServiceTest.countsDistinctWorkflowsFromTheControlSchema:
           // the design doc's 23 was a raw grep across statements.sql INCLUDING the ARCHIVE/ decoy
           // directory; entries() (what ReadinessService actually counts from) correctly excludes it.
           .andExpect(jsonPath("$.dags.workflows").value(22))
           .andExpect(jsonPath("$.roots", hasSize(3)))
           .andExpect(jsonPath("$.roots[0].resolved").value(notNullValue()))
           // 15, not the plan's forward-looking 16 — see ReadinessServiceTest.carriesRepoSourcedProgress:
           // ADR-0016 doesn't exist until Task 11 of this sub-project writes it.
           .andExpect(jsonPath("$.progress.adrs").value(greaterThanOrEqualTo(15)));
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
     */
    @Nested
    @NestedTestConfiguration(INHERIT)
    @AutoConfigureMockMvc
    @Import(WhenProgressCannotBeDetermined.NullProgressConfig.class)
    class WhenProgressCannotBeDetermined {
        @Autowired MockMvc mvc;

        @Test
        void omitsTheProgressKeyEntirelyRatherThanSerializingNull() throws Exception {
            mvc.perform(get("/api/readiness"))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$.status").value(oneOf("ok", "degraded")))
               .andExpect(jsonPath("$.corpus.xml").value(81))
               .andExpect(jsonPath("$.progress").doesNotExist());
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
