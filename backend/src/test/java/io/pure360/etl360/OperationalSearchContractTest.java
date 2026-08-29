package io.pure360.etl360;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Contract for {@code GET /api/operational/search} against the committed mock tier.
 *
 * <p>The capability that did not exist: Tab 3's toolbar search filters cards that are ALREADY
 * loaded, which needs a cluster selected first. On a real export there was no way to answer
 * "which cluster runs this table?" without guessing. Table names live only in the L2L graph,
 * which ADR-0014 deliberately never fetches unscoped — so a client-side search structurally
 * cannot see them, and the join has to happen here. See ADR-0019.
 */
@SpringBootTest
@AutoConfigureMockMvc
class OperationalSearchContractTest {

    @Autowired MockMvc mvc;

    @Test
    void findsRecipesAndNamesTheClustersTheyRanIn() throws Exception {
        mvc.perform(get("/api/operational/search").param("q", "CAS_DWH"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.hits[?(@.kind=='recipe')]", hasSize(greaterThanOrEqualTo(1))))
           .andExpect(jsonPath("$.hits[?(@.kind=='recipe')].clusters",
               everyItem(hasSize(greaterThanOrEqualTo(1)))));
    }

    @Test
    void findsTablesToo() throws Exception {
        mvc.perform(get("/api/operational/search").param("q", "CAS_DWH"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.hits[?(@.kind=='table')]", hasSize(greaterThanOrEqualTo(1))));
    }

    @Test
    void aTableHitCarriesTheClustersOfTheRecipesThatTouchIt() throws Exception {
        // The join the client cannot do: table -> edges -> recipes -> b15 clusters.
        mvc.perform(get("/api/operational/search").param("q", "CAS_DWH_EVENTS_FACT"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.hits[?(@.kind=='table')].clusters",
               everyItem(hasSize(greaterThanOrEqualTo(1)))));
    }

    @Test
    void reportsTheLayerSoAHitIsReadableWithoutLoadingIt() throws Exception {
        mvc.perform(get("/api/operational/search").param("q", "CAS_DWH_EVENTS_FACT"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.hits[*].layer", hasItem("DWH")));
    }

    @Test
    void isCaseInsensitive() throws Exception {
        mvc.perform(get("/api/operational/search").param("q", "cas_dwh"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.hits", hasSize(greaterThanOrEqualTo(1))));
    }

    @Test
    void aTooShortQueryReturnsEmptyRatherThanErroring() throws Exception {
        // An error here would flash the results panel red as the user types the first letter.
        mvc.perform(get("/api/operational/search").param("q", "c"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.hits").isEmpty())
           .andExpect(jsonPath("$.truncated").value(false));
    }

    @Test
    void limitBoundsTheResultAndSetsTruncated() throws Exception {
        mvc.perform(get("/api/operational/search").param("q", "CAS").param("limit", "2"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.hits", hasSize(2)))
           .andExpect(jsonPath("$.truncated").value(true));
    }

    @Test
    void rejectsAnOutOfRangeLimit() throws Exception {
        mvc.perform(get("/api/operational/search").param("q", "CAS").param("limit", "500"))
           .andExpect(status().isBadRequest());
        mvc.perform(get("/api/operational/search").param("q", "CAS").param("limit", "0"))
           .andExpect(status().isBadRequest());
    }

    @Test
    void aMatchlessQueryIsAnEmptyResultNotA404() throws Exception {
        mvc.perform(get("/api/operational/search").param("q", "ZZZ_NOTHING_MATCHES_THIS"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.hits").isEmpty())
           .andExpect(jsonPath("$.truncated").value(false));
    }

    /** Determinism: the same request must answer identically across calls, like clustersOf(). */
    @Test
    void isOrderedDeterministically() throws Exception {
        String first = mvc.perform(get("/api/operational/search").param("q", "CAS"))
            .andReturn().getResponse().getContentAsString();
        String second = mvc.perform(get("/api/operational/search").param("q", "CAS"))
            .andReturn().getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat(first).isEqualTo(second);
    }
}
