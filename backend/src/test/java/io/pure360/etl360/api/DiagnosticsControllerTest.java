package io.pure360.etl360.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Contract for the report Tab 3 renders when its canvas is empty. Asserted against the committed
 * mock tier, which is what a fresh clone with no config.json resolves to — so these expectations
 * double as the "healthy default" the GUI panel is compared against on someone else's machine.
 */
@SpringBootTest
@AutoConfigureMockMvc
class DiagnosticsControllerTest {
    @Autowired MockMvc mvc;

    @Test
    void reportsTheResolvedAbsolutePathOfEveryDataRoot() throws Exception {
        mvc.perform(get("/api/diagnostics"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.corpus.resolved").value(notNullValue()))
           .andExpect(jsonPath("$.dwhControl.resolvedReal").value(notNullValue()))
           .andExpect(jsonPath("$.dwhControl.mockPath").value(notNullValue()))
           .andExpect(jsonPath("$.composer.resolved").value(notNullValue()));
    }

    @Test
    void committedMockTierIsAHealthyReport() throws Exception {
        mvc.perform(get("/api/diagnostics"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.status").value("ok"))
           .andExpect(jsonPath("$.corpus.status").value("ok"))
           .andExpect(jsonPath("$.dwhControl.tier").value("mock"))
           .andExpect(jsonPath("$.dwhControl.status").value("ok"))
           .andExpect(jsonPath("$.dwhControl.scan.rowsParsed").value(greaterThan(0)))
           .andExpect(jsonPath("$.dwhControl.scan.rowsSkipped").value(0));
    }

    /** The report must state the vocabulary it scanned FOR, not just what it found. */
    @Test
    void reportsTheControlSchemaVocabularyItScannedWith() throws Exception {
        mvc.perform(get("/api/diagnostics"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.dwhControl.scan.anchorTable").value("CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG"))
           .andExpect(jsonPath("$.dwhControl.scan.expectedLayerDirs[0]").value("STG"))
           .andExpect(jsonPath("$.dwhControl.requiredChild").value("LAYER_TO_LAYER"));
    }

    /** ARCHIVE/ ships in the mock mirror but is outside the default layer list — the report says so. */
    @Test
    void aPresentButUnconfiguredLayerDirIsNamedRatherThanSilentlySkipped() throws Exception {
        mvc.perform(get("/api/diagnostics"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.dwhControl.scan.unexpectedDirs[0]").value("ARCHIVE"));
    }
}
