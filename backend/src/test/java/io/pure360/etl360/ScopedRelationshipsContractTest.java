package io.pure360.etl360;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Scoping contract for /api/relationships?clusters= against the committed mock. */
@SpringBootTest
@AutoConfigureMockMvc
class ScopedRelationshipsContractTest {
    @Autowired MockMvc mvc;
    private final ObjectMapper json = new ObjectMapper();

    private JsonNode graph(String query) throws Exception {
        return json.readTree(mvc.perform(get("/api/relationships" + query))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    /** The single most important assertion here: today's callers must see today's bytes. */
    @Test
    void anUnscopedRequestIsUnchangedAndCarriesNoneOfTheNewFields() throws Exception {
        String body = mvc.perform(get("/api/relationships"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain("neighbor");
        assertThat(body).doesNotContain("clusterNames");
        assertThat(body).doesNotContain("scopedClusters");
        assertThat(body).doesNotContain("neighborCount");
    }

    @Test
    void aScopedRequestIsAStrictSubsetOfTheFullGraph() throws Exception {
        int full = graph("").get("nodes").size();
        int scoped = graph("?clusters=cluster-wf-cas-load-4001").get("nodes").size();

        assertThat(scoped).isPositive().isLessThan(full);
    }

    @Test
    void everyCoreRecipeInScopeCarriesItsClusterNameAndIsNotFlaggedAsANeighbour() throws Exception {
        JsonNode g = graph("?clusters=cluster-wf-cas-load-4001");

        long core = 0;
        for (JsonNode n : g.get("nodes")) {
            if (!"recipe".equals(n.path("kind").asText())) continue;
            if (n.path("neighbor").asBoolean(false)) continue;
            core++;
            assertThat(n.path("clusterNames").toString()).contains("cluster-wf-cas-load-4001");
        }
        assertThat(core).isEqualTo(5);   // Task 1's 5-recipe cluster
    }

    @Test
    void neighboursAreIncludedAndFlaggedAndCountedInMeta() throws Exception {
        JsonNode g = graph("?clusters=cluster-wf-cas-load-4001");

        long flagged = 0;
        for (JsonNode n : g.get("nodes")) if (n.path("neighbor").asBoolean(false)) flagged++;

        assertThat(flagged).isPositive();
        assertThat(g.get("meta").get("neighborCount").asInt()).isEqualTo((int) flagged);
        assertThat(g.get("meta").get("scopedClusters").toString()).contains("cluster-wf-cas-load-4001");
    }

    /** 1 hop means 1 hop: a neighbour's neighbour is not pulled in. */
    @Test
    void neighboursAreNotExpandedASecondTime() throws Exception {
        JsonNode scoped = graph("?clusters=cluster-wf-cas-load-4001");
        JsonNode full = graph("");

        assertThat(scoped.get("nodes").size()).isLessThan(full.get("nodes").size());
        // Every edge must have at least one endpoint that is a non-neighbour node.
        java.util.Set<String> core = new java.util.HashSet<>();
        for (JsonNode n : scoped.get("nodes")) {
            if (!n.path("neighbor").asBoolean(false)) core.add(n.get("id").asText());
        }
        for (JsonNode e : scoped.get("edges")) {
            assertThat(core.contains(e.get("from").asText()) || core.contains(e.get("to").asText()))
                .as("edge %s -> %s joins two neighbours", e.get("from").asText(), e.get("to").asText())
                .isTrue();
        }
    }

    @Test
    void severalClustersUnionTheirRecipes() throws Exception {
        int one = graph("?clusters=cluster-wf-cas-load-4001").get("nodes").size();
        int two = graph("?clusters=cluster-wf-cas-load-4001,cluster-wf-cas-out-4003").get("nodes").size();

        assertThat(two).isGreaterThan(one);
    }

    /** A stale UI selection must degrade to "nothing here", not to an error page. */
    @Test
    void anUnknownClusterYieldsAnEmptyScopedGraphNotA404() throws Exception {
        JsonNode g = graph("?clusters=no-such-cluster");

        assertThat(g.get("nodes")).isEmpty();
        assertThat(g.get("meta").get("scopedClusters").toString()).contains("no-such-cluster");
    }

    /**
     * A table's physical metadata must not depend on which clusters happen to be selected.
     *
     * <p>Compares absent-vs-present as a difference, not just value-vs-value. Building the
     * layer/writeMode/partitionType lookup maps from the scoped subset instead of the whole entries
     * list does not corrupt those fields, it DROPS them — so a comparison that skips scoped nodes
     * without a writeMode passes against exactly the bug it is meant to catch (verified by
     * mutation: narrowing the maps to the selection left such a check green).
     */
    @Test
    void tableWriteModeIsResolvedFromTheWholeGraphNotTheSelection() throws Exception {
        JsonNode scoped = graph("?clusters=cluster-wf-cas-core-4002");
        JsonNode full = graph("");

        java.util.Map<String, JsonNode> fullNodes = new java.util.HashMap<>();
        for (JsonNode n : full.get("nodes")) fullNodes.put(n.get("id").asText(), n);

        int compared = 0;
        for (JsonNode n : scoped.get("nodes")) {
            if (!"table".equals(n.path("kind").asText())) continue;
            String id = n.get("id").asText();
            JsonNode f = fullNodes.get(id);
            assertThat(f).as("scoped table %s is absent from the full graph", id).isNotNull();
            for (String field : java.util.List.of("layer", "writeMode", "partitionType")) {
                assertThat(n.path(field).asText(null))
                    .as("%s.%s is a whole-graph fact, not a per-selection one", id, field)
                    .isEqualTo(f.path(field).asText(null));
            }
            compared++;
        }
        assertThat(compared).isPositive();

        // Non-vacuity. CAS_ODS_EVENTS is a SOURCE of this selection but is WRITTEN by a recipe in
        // cluster-wf-cas-load-4001 — outside it. Without the whole-entries-list maps it would come
        // back with a null writeMode and the writer's layer replaced by the reader's.
        JsonNode odsEvents = null;
        for (JsonNode n : scoped.get("nodes")) {
            if ("table:CAS_ODS_EVENTS".equals(n.get("id").asText())) odsEvents = n;
        }
        assertThat(odsEvents).as("table:CAS_ODS_EVENTS must be in the cas-core-4002 scope").isNotNull();
        assertThat(odsEvents.path("writeMode").asText(null)).isEqualTo("APPEND");
        assertThat(odsEvents.path("partitionType").asText(null)).isEqualTo("DAILY");
        assertThat(odsEvents.path("layer").asText(null)).isEqualTo("ODS");
    }
}
