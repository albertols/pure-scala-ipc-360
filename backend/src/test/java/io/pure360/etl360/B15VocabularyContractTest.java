package io.pure360.etl360;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code /api/diagnostics} reports the b15 status vocabulary it canonicalises against, and any
 * token that matched neither list.
 *
 * <p>ADR-0013 exists so an empty Tab 3 names its own cause. ADR-0018 extends it one level down: a
 * card that says PENDING when the run actually failed must be explainable without reading the CSV
 * by hand. Against the committed mock — which writes only canonical tokens — the report must show
 * an EMPTY unrecognized list, which is the shape a real export's {@code SKIPPED x3} populates.
 */
@SpringBootTest
@AutoConfigureMockMvc
class B15VocabularyContractTest {

    @Autowired MockMvc mvc;

    @Test
    void reportsTheVocabularyItAcceptsSoAMismatchIsDiagnosable() throws Exception {
        mvc.perform(get("/api/diagnostics"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.b15.statusOk", hasItem("SUCCESS")))
           .andExpect(jsonPath("$.b15.statusKo", hasItem("FAILED")))
           // The token the real export writes, and the whole reason this exists.
           .andExpect(jsonPath("$.b15.statusKo", hasItem("FAILURE")));
    }

    @Test
    void reportsNoUnrecognizedTokensForTheCommittedMock() throws Exception {
        mvc.perform(get("/api/diagnostics"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.b15.unrecognizedStatuses").isArray())
           .andExpect(jsonPath("$.b15.unrecognizedStatuses").isEmpty());
    }

    /**
     * The report must not be empty merely because nothing has been parsed yet — an operator opens
     * diagnostics precisely when they have NOT been able to make the tab work.
     */
    @Test
    void isSelfSufficientWithoutAPriorOperationalRequest() throws Exception {
        mvc.perform(get("/api/diagnostics"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.b15.rowsScanned").value(417));
    }
}
