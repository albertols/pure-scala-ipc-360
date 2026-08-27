package io.pure360.etl360;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Contract for the b15 cluster index against the committed mock tier — 21 clusters / 30 recipes /
 * 14 dates / 417 rows, with cluster-wf-cas-load-4001 holding 5 recipes (Task 1). These are the
 * floors `make validate-loop` re-asserts over HTTP.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ClusterEndpointsContractTest {
    @Autowired MockMvc mvc;

    /** A literal /clusters must not be swallowed by OperationalController's /{date} template. */
    @Test
    void clustersIsRoutedAsALiteralSegmentNotAsADate() throws Exception {
        mvc.perform(get("/api/operational/clusters"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.totals").value(notNullValue()));
    }

    @Test
    void theIndexReportsTheCommittedMockFloors() throws Exception {
        mvc.perform(get("/api/operational/clusters"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.totals.clusters").value(21))
           .andExpect(jsonPath("$.totals.recipes").value(30))
           .andExpect(jsonPath("$.totals.dates").value(14))
           .andExpect(jsonPath("$.totals.rows").value(417))
           .andExpect(jsonPath("$.dates", hasSize(14)))
           .andExpect(jsonPath("$.clusters", hasSize(21)))
           .andExpect(jsonPath("$.mode").value("mock"));
    }

    /** The whole point of Task 1: a cluster that groups several recipes actually exists. */
    @Test
    void atLeastOneClusterGroupsFourOrMoreRecipes() throws Exception {
        mvc.perform(get("/api/operational/clusters"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.clusters[?(@.name == 'cluster-wf-cas-load-4001')].recipeCount").value(5))
           .andExpect(jsonPath("$.clusters[?(@.name == 'cluster-wf-cas-core-4002')].recipeCount").value(4));
    }

    @Test
    void clustersAreNameAscendingAndCarryDateIndicesNotIsoStrings() throws Exception {
        mvc.perform(get("/api/operational/clusters"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.clusters[0].name").value("cluster-wf-cas-core-4002"))
           .andExpect(jsonPath("$.clusters[0].dateIdx", everyItem(greaterThanOrEqualTo(0))))
           .andExpect(jsonPath("$.clusters[0].lastDate").value(notNullValue()));
    }

    @Test
    void theDetailEndpointListsTheClustersRecipesWithTheirLayer() throws Exception {
        mvc.perform(get("/api/operational/clusters/cluster-wf-cas-load-4001"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.name").value("cluster-wf-cas-load-4001"))
           .andExpect(jsonPath("$.recipes", hasSize(5)))
           .andExpect(jsonPath("$.recipes[0].recipeFilename").value(notNullValue()))
           .andExpect(jsonPath("$.recipes[0].layer").value(notNullValue()))
           .andExpect(jsonPath("$.recipes[0].dateIdx").value(notNullValue()));
    }

    /** The CAS clusters deliberately cut across workflows — proves layer comes from L2L, per recipe. */
    @Test
    void recipesInOneClusterCanCarryDifferentLayers() throws Exception {
        mvc.perform(get("/api/operational/clusters/cluster-wf-cas-load-4001"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.recipes[?(@.layer == 'STG')]", hasSize(2)))
           .andExpect(jsonPath("$.recipes[?(@.layer == 'ODS')]", hasSize(3)));
    }

    @Test
    void anUnknownClusterIs404() throws Exception {
        mvc.perform(get("/api/operational/clusters/no-such-cluster"))
           .andExpect(status().isNotFound());
    }
}
