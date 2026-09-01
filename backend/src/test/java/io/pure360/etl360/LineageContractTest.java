package io.pure360.etl360;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Contract for {@code GET /api/operational/lineage} against the committed mock tier.
 *
 * <p>A one-hop neighbour list answers "what touches this node". The question an operator has in
 * front of a failed table is "where did this come from and what breaks next" — a PATH. See
 * ADR-0020 and spec §13.
 */
@SpringBootTest
@AutoConfigureMockMvc
class LineageContractTest {

    /** A CAS table with recipes on both sides of it in the committed mock. */
    private static final String SEED = "table:CAS_DWH_EVENTS_FACT";

    @Autowired MockMvc mvc;
    private final ObjectMapper mapper = new ObjectMapper();

    private JsonNode lineage(String node, String query) throws Exception {
        String body = mvc.perform(get("/api/operational/lineage").param("node", node)
                .param("limit", query))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return mapper.readTree(body);
    }

    @Test
    void seedSitsAtHopZero() throws Exception {
        mvc.perform(get("/api/operational/lineage").param("node", SEED))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.seed").value(SEED))
           .andExpect(jsonPath("$.nodes[?(@.id=='" + SEED + "')].hop").value(org.hamcrest.Matchers.hasItem(0)));
    }

    @Test
    void reachesBothUpstreamAndDownstream() throws Exception {
        JsonNode d = lineage(SEED, "150");
        Set<Integer> hops = new HashSet<>();
        d.get("nodes").forEach(n -> hops.add(n.get("hop").asInt()));

        assertThat(hops).contains(0);
        assertThat(hops.stream().anyMatch(h -> h < 0)).as("has upstream").isTrue();
        assertThat(hops.stream().anyMatch(h -> h > 0)).as("has downstream").isTrue();
    }

    @Test
    void everyEdgeEndpointIsAReturnedNode() throws Exception {
        // An edge to a node the budget cut would draw an arrow into empty space.
        JsonNode d = lineage(SEED, "150");
        Set<String> ids = new HashSet<>();
        d.get("nodes").forEach(n -> ids.add(n.get("id").asText()));

        d.get("edges").forEach(e -> {
            assertThat(ids).as("edge from").contains(e.get("from").asText());
            assertThat(ids).as("edge to").contains(e.get("to").asText());
        });
        assertThat(d.get("edges")).isNotEmpty();
    }

    @Test
    void carriesTheLayerAndKindTheViewColoursBy() throws Exception {
        JsonNode d = lineage(SEED, "150");
        JsonNode seed = d.get("nodes").findValues("id").isEmpty() ? null : d.get("nodes").get(0);
        assertThat(seed).isNotNull();
        d.get("nodes").forEach(n -> {
            assertThat(n.get("kind").asText()).isIn("recipe", "table");
            assertThat(n.get("name").asText()).isNotBlank();
            assertThat(n.has("layer")).isTrue();
        });
    }

    @Test
    void aTightBudgetTruncatesAndSaysSo() throws Exception {
        JsonNode d = lineage(SEED, "2");
        assertThat(d.get("nodes")).hasSize(2);
        assertThat(d.get("truncated").asBoolean()).isTrue();
        // The view has to be able to say HOW MUCH it is not showing.
        assertThat(d.get("totalReachable").asInt()).isGreaterThan(2);
    }

    @Test
    void aTightBudgetKeepsTheNEAREST_hops() throws Exception {
        // BFS, not DFS: the budget must cut the furthest hops, never an arbitrary branch.
        JsonNode d = lineage(SEED, "3");
        d.get("nodes").forEach(n -> assertThat(Math.abs(n.get("hop").asInt())).isLessThanOrEqualTo(1));
    }

    @Test
    void anUntruncatedResultReportsItsOwnSize() throws Exception {
        JsonNode d = lineage(SEED, "600");
        assertThat(d.get("truncated").asBoolean()).isFalse();
        assertThat(d.get("totalReachable").asInt()).isEqualTo(d.get("nodes").size());
    }

    @Test
    void anUnknownNodeIs404() throws Exception {
        mvc.perform(get("/api/operational/lineage").param("node", "table:NO_SUCH_TABLE"))
           .andExpect(status().isNotFound());
    }

    @Test
    void rejectsAnOutOfRangeLimit() throws Exception {
        mvc.perform(get("/api/operational/lineage").param("node", SEED).param("limit", "5000"))
           .andExpect(status().isBadRequest());
        mvc.perform(get("/api/operational/lineage").param("node", SEED).param("limit", "0"))
           .andExpect(status().isBadRequest());
    }

    @Test
    void isDeterministicAcrossCalls() throws Exception {
        String a = mvc.perform(get("/api/operational/lineage").param("node", SEED))
            .andReturn().getResponse().getContentAsString();
        String b = mvc.perform(get("/api/operational/lineage").param("node", SEED))
            .andReturn().getResponse().getContentAsString();
        assertThat(a).isEqualTo(b);
    }

    // ── ADR-0021: cluster scope ───────────────────────────────────────────────

    private JsonNode scoped(String cluster) throws Exception {
        String body = mvc.perform(get("/api/operational/lineage")
                .param("node", SEED).param("limit", "600").param("cluster", cluster))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return mapper.readTree(body);
    }

    private String firstOption() throws Exception {
        JsonNode d = lineage(SEED, "600");
        assertThat(d.get("clusterOptions")).as("seed reaches a cluster").isNotEmpty();
        return d.get("clusterOptions").get(0).get("name").asText();
    }

    @Test
    void unscopedCarriesANullActiveClusterAndTheSeedsOptions() throws Exception {
        JsonNode d = lineage(SEED, "600");
        assertThat(d.get("activeCluster").isNull()).isTrue();
        d.get("clusterOptions").forEach(o -> {
            assertThat(o.get("name").asText()).isNotBlank();
            assertThat(o.get("recipes").asInt()).isGreaterThan(0);
        });
    }

    @Test
    void aScopedCallReportsTheClusterItScopedTo() throws Exception {
        String c = firstOption();
        assertThat(scoped(c).get("activeCluster").asText()).isEqualTo(c);
    }

    @Test
    void aScopedCallIsSmallerThanOrEqualToTheUnscopedOne() throws Exception {
        String c = firstOption();
        assertThat(scoped(c).get("nodes").size())
            .isLessThanOrEqualTo(lineage(SEED, "600").get("nodes").size());
    }

    @Test
    void everyScopedEdgeEndpointIsStillAReturnedNode() throws Exception {
        JsonNode d = scoped(firstOption());
        Set<String> ids = new HashSet<>();
        d.get("nodes").forEach(n -> ids.add(n.get("id").asText()));
        d.get("edges").forEach(e -> {
            assertThat(ids).as("edge from").contains(e.get("from").asText());
            assertThat(ids).as("edge to").contains(e.get("to").asText());
        });
    }

    @Test
    void autoResolvesAClusterWithoutTheCallerNamingOne() throws Exception {
        String body = mvc.perform(get("/api/operational/lineage")
                .param("node", SEED).param("cluster", "auto"))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(mapper.readTree(body).get("activeCluster").asText()).isEqualTo(firstOption());
    }

    @Test
    void autoHonoursPrefer() throws Exception {
        JsonNode opts = lineage(SEED, "600").get("clusterOptions");
        String tail = opts.get(opts.size() - 1).get("name").asText();
        String body = mvc.perform(get("/api/operational/lineage")
                .param("node", SEED).param("cluster", "auto").param("prefer", "nope," + tail))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(mapper.readTree(body).get("activeCluster").asText()).isEqualTo(tail);
    }

    @Test
    void anUnknownClusterIs400() throws Exception {
        mvc.perform(get("/api/operational/lineage").param("node", SEED).param("cluster", "nope"))
           .andExpect(status().isBadRequest());
    }
}
