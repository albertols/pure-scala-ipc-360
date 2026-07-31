package io.pure360.etl360;

import io.pure360.etl360.api.dto.B15RowDto;
import io.pure360.etl360.api.dto.LayerToLayerEntryDto;
import io.pure360.etl360.api.dto.RelationshipsDto;
import io.pure360.etl360.service.LayerToLayerService;
import io.pure360.etl360.service.OperationalService;
import io.pure360.etl360.service.RelationshipService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Spec §8.1 gate: {@link OperationalService} (14-day committed b15 history, Task 9) and
 * {@link RelationshipService} over the REAL committed mock data, not a fixture.
 *
 * {@code etl360.dwh-control-root} is pinned to a guaranteed-absent path so {@link
 * io.pure360.etl360.config.DataRoots#dwhControl()} falls through to the committed mock
 * mirror deterministically. Without this override, a developer machine that happens to carry
 * a pre-existing real (git-ignored) {@code DWH_CONTROL} export — one that predates this
 * sub-project's {@code LAYER_TO_LAYER} schema and so contains none of it — would make "real"
 * win over "mock" per {@code DataRoots}' by-design real-first fallback, silently zeroing out
 * this test's LayerToLayer-dependent assertions (everyB15RecipeIsConfigured,
 * relationshipsGraphConsistent) through no fault of the service code under test. No pin is
 * needed for the composer tier: no real composer directory exists on this machine, so the mock
 * b15 history engages naturally.
 */
@SpringBootTest(properties = "etl360.dwh-control-root=/nonexistent-etl360-test-dwh-control")
@AutoConfigureMockMvc
class OperationalContractTest {
    @Autowired MockMvc mvc;
    @Autowired OperationalService operational;
    @Autowired LayerToLayerService layerToLayer;
    @Autowired RelationshipService relationshipService;

    @Test
    void allFourteenDatesServe() throws Exception {
        var dates = operational.dates();
        assertThat(dates).hasSize(14).startsWith("2026-07-16").endsWith("2026-07-29");
        for (String d : dates) mvc.perform(get("/api/operational/" + d)).andExpect(status().isOk())
            .andExpect(jsonPath("$.rows").isNotEmpty());
    }

    @Test
    void everyB15RecipeIsConfigured() {
        Set<String> configured = layerToLayer.entries().stream().map(LayerToLayerEntryDto::recipe).collect(Collectors.toSet());
        for (String d : operational.dates())
            for (var row : operational.snapshot(d).rows()) assertThat(configured).contains(row.recipeFilename());
    }

    @Test
    void statusMixPresent() {   // SUCCESS + FAILED + null-status somewhere in the window
        var all = operational.dates().stream().flatMap(d -> operational.snapshot(d).rows().stream()).toList();
        assertThat(all).extracting(B15RowDto::status).contains("SUCCESS", "FAILED", "");
    }

    @Test
    void relationshipsGraphConsistent() throws Exception {
        mvc.perform(get("/api/relationships")).andExpect(status().isOk());
        var g = relationshipService.graph();
        Set<String> ids = g.nodes().stream().map(RelationshipsDto.NodeDto::id).collect(Collectors.toSet());
        for (var e : g.edges()) { assertThat(ids).contains(e.from()); assertThat(ids).contains(e.to()); }
        assertThat(g.nodes().stream().filter(n -> n.kind().equals("recipe")).count()).isGreaterThanOrEqualTo(30);
    }

    @Test
    void multiTargetShapeIncludesAuditTable() {   // Spec §3 Tab 5 multi-target shape (final-review I1)
        var g = relationshipService.graph();
        assertThat(g.nodes()).extracting(RelationshipsDto.NodeDto::id).contains("table:ETL_SYN_ORDERS_AUDIT");
        assertThat(g.edges()).contains(new RelationshipsDto.EdgeDto(
            "recipe:_ETL_m_SYN_ETL_ORDERS_BRIDGE.json", "table:ETL_SYN_ORDERS_AUDIT", "writes"));
    }
}
