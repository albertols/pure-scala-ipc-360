package io.pure360.etl360.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.in;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Slice over the real committed mock data (Task 3's statements.sql mirror). b15 date dirs
 * don't exist under the main mock composer root yet (Task 9), so the operational endpoints
 * here assert only shape/error paths, not actual snapshot content.
 *
 * {@code etl360.dwh-control-root} is pinned to a guaranteed-absent path so {@link
 * io.pure360.etl360.config.DataRoots#dwhControl()} falls through to the committed mock
 * mirror deterministically. Without this override, a developer machine that happens to carry
 * a pre-existing real (git-ignored) {@code DWH_CONTROL} export — one that predates this
 * sub-project's {@code LAYER_TO_LAYER} schema and so contains none of it — would make "real"
 * win over "mock" per {@code DataRoots}' by-design real-first fallback, silently zeroing out
 * this test's entry counts through no fault of the controller/service code under test.
 */
@SpringBootTest(properties = "etl360.dwh-control-root=/nonexistent-etl360-test-dwh-control")
@AutoConfigureMockMvc
class RelationshipAndOperationalControllerTest {
    @Autowired MockMvc mvc;

    @Test
    void relationshipsServesNodesAndMetaFromTheRealMockData() throws Exception {
        mvc.perform(get("/api/relationships"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.nodes").isNotEmpty())
           .andExpect(jsonPath("$.meta.entryCount").value(greaterThanOrEqualTo(18)))
           .andExpect(jsonPath("$.meta.skippedRows").value(0));
    }

    @Test
    void operationalDatesReturnsModeAndDatesArray() throws Exception {
        mvc.perform(get("/api/operational/dates"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.mode").value(in(List.of("real", "mock", "absent"))))
           .andExpect(jsonPath("$.dates").isArray());
    }

    @Test
    void operationalUnparsableDateIs400InvalidDateProblemJson() throws Exception {
        mvc.perform(get("/api/operational/not-a-date"))
           .andExpect(status().isBadRequest())
           .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
           .andExpect(jsonPath("$.title").value("Invalid date"));
    }

    @Test
    void operationalMissingSnapshotIs404WithB15Detail() throws Exception {
        mvc.perform(get("/api/operational/2001-01-01"))
           .andExpect(status().isNotFound())
           .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString(
               "b15 CSV not present under inputs/2001_01_01")));
    }
}
