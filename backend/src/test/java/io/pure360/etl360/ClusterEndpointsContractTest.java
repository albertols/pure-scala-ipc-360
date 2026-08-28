package io.pure360.etl360;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.empty;
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

    @Test
    void runsAreNewestFirstAndCarryTheJobIdAndStartTimestampTheLinksNeed() throws Exception {
        mvc.perform(get("/api/operational/runs")
                .param("recipe", "_ETL_m_CAS_DWH_EVENTS_FACT.json"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.limit").value(10))
           .andExpect(jsonPath("$.byRecipe['_ETL_m_CAS_DWH_EVENTS_FACT.json']", hasSize(10)))
           .andExpect(jsonPath("$.byRecipe['_ETL_m_CAS_DWH_EVENTS_FACT.json'][0].date").value("2026-07-29"))
           .andExpect(jsonPath("$.byRecipe['_ETL_m_CAS_DWH_EVENTS_FACT.json'][0].jobId").value(notNullValue()))
           .andExpect(jsonPath("$.byRecipe['_ETL_m_CAS_DWH_EVENTS_FACT.json'][0].appStartIso").value(notNullValue()))
           .andExpect(jsonPath("$.byRecipe['_ETL_m_CAS_DWH_EVENTS_FACT.json'][0].clusterName").value("cluster-wf-cas-core-4002"));
    }

    @Test
    void limitDefaultsToTenAndIsHonoured() throws Exception {
        mvc.perform(get("/api/operational/runs")
                .param("recipe", "_ETL_m_CAS_DWH_EVENTS_FACT.json").param("limit", "3"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.limit").value(3))
           .andExpect(jsonPath("$.byRecipe['_ETL_m_CAS_DWH_EVENTS_FACT.json']", hasSize(3)));
    }

    @Test
    void severalRecipesComeBackInOneCall() throws Exception {
        mvc.perform(get("/api/operational/runs")
                .param("recipe", "_ETL_m_CAS_DWH_EVENTS_FACT.json")
                .param("recipe", "_ETL_m_CAS_ODS_EVENTS.json"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.byRecipe['_ETL_m_CAS_DWH_EVENTS_FACT.json']", hasSize(10)))
           .andExpect(jsonPath("$.byRecipe['_ETL_m_CAS_ODS_EVENTS.json']", hasSize(10)));
    }

    /** A stable client shape matters more than a compact one: absent means [], never missing. */
    @Test
    void aRecipeWithNoRunsMapsToAnEmptyArrayRatherThanBeingOmitted() throws Exception {
        mvc.perform(get("/api/operational/runs").param("recipe", "_ETL_does_not_exist.json"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.byRecipe['_ETL_does_not_exist.json']", hasSize(0)));
    }

    @Test
    void moreThanTwoHundredRecipesIsRejectedWithAMessageNamingTheLimit() throws Exception {
        var request = get("/api/operational/runs");
        for (int i = 0; i < 201; i++) request = request.param("recipe", "r" + i + ".json");
        mvc.perform(request)
           .andExpect(status().isBadRequest())
           .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("200")));
    }

    @Test
    void limitAboveFiftyIsRejected() throws Exception {
        mvc.perform(get("/api/operational/runs").param("recipe", "r.json").param("limit", "51"))
           .andExpect(status().isBadRequest());
    }

    /**
     * The acceptance boundaries, not just the rejection ones — a reviewer verified these by
     * live-probing rather than a test. A regression that flipped 200 from accepted to rejected
     * would break the UI silently: no backend test would fail, only a live symptom would surface.
     *
     * <p><b>This proves the COUNT bound only, and cannot prove more.</b> {@code MockMvc.param()}
     * sets parameters on a mock request object; no URL, and no request line, is ever built. The
     * eight-character names below therefore hide the bound that actually binds — the container's
     * 8 KB {@code server.max-http-header-size}, which 200 REAL corpus recipe names (mean ~40
     * chars, 9 608 B of query string) blow straight through. That one is pinned over a real
     * socket by {@link RunsRequestSizeContractTest}, and respected client-side by
     * {@code clusterQueries.ts}'s {@code QUERY_BUDGET_BYTES}.
     */
    @Test
    void exactlyTwoHundredRecipesSucceedsOnTheCountBound() throws Exception {
        var request = get("/api/operational/runs");
        for (int i = 0; i < 200; i++) request = request.param("recipe", "r" + i + ".json");
        mvc.perform(request).andExpect(status().isOk());
    }

    @Test
    void limitOfFiftySucceeds() throws Exception {
        mvc.perform(get("/api/operational/runs").param("recipe", "r.json").param("limit", "50"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.limit").value(50));
    }

    @Test
    void limitOfZeroIsRejected() throws Exception {
        mvc.perform(get("/api/operational/runs").param("recipe", "r.json").param("limit", "0"))
           .andExpect(status().isBadRequest());
    }

    @Test
    void negativeLimitIsRejected() throws Exception {
        mvc.perform(get("/api/operational/runs").param("recipe", "r.json").param("limit", "-1"))
           .andExpect(status().isBadRequest());
    }
}
