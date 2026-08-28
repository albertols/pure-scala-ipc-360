package io.pure360.etl360;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.ArrayList;
import java.util.List;
import java.util.StringJoiner;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The request-SIZE contract for {@code GET /api/operational/runs} — the one bound
 * {@link ClusterEndpointsContractTest} structurally cannot see.
 *
 * <p>Every other test in this repo drives the API through {@code MockMvc}, which sets parameters
 * on a mock request object and <b>never builds a URL or a request line at all</b>. That is exactly
 * why a real, hard failure stayed invisible: {@code ClusterEndpointsContractTest
 * .exactlyTwoHundredRecipesSucceeds} passes with 200 eight-character names (`r0.json`), while the
 * same 200 REAL corpus recipe names (mean ~40 chars) build a 9 608-byte query string that Tomcat
 * rejects with a raw 400 — before the dispatcher, so not even the app's ProblemDetail handler
 * runs. Any cluster or DAG above ~166 recipes lost its run history entirely.
 *
 * <p>So this class boots a REAL container on a real port and sends real request lines. It pins
 * both halves of the fix: a chunk sized by the frontend's byte budget succeeds, and a chunk sized
 * by the recipe COUNT alone (what the old {@code useRuns} chunker produced) does not — which is
 * the whole reason {@code clusterQueries.ts}'s {@code QUERY_BUDGET_BYTES} exists.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RunsRequestSizeContractTest {

    /** Mirrors {@code frontend/src/api/clusterQueries.ts}'s {@code QUERY_BUDGET_BYTES}. */
    private static final int FRONTEND_QUERY_BUDGET_BYTES = 6000;

    /** Mirrors {@code ClusterController.MAX_RECIPES}, the count-only bound that was not enough. */
    private static final int MAX_RECIPES = 200;

    /** Exactly 40 characters — the corpus's mean recipe-filename length. */
    private static String probeName(int i) {
        return String.format("_ETL_m_CAS_SCALE_PROBE_%04d_PADDING.json", i);
    }

    private static String query(int recipeCount) {
        StringJoiner q = new StringJoiner("&");
        q.add("limit=10");
        for (int i = 0; i < recipeCount; i++) q.add("recipe=" + probeName(i));
        return q.toString();
    }

    /** How many 40-char names the frontend's byte budget admits in one chunk. */
    private static int namesWithinBudget() {
        int n = 0;
        while (query(n + 1).length() <= FRONTEND_QUERY_BUDGET_BYTES) n++;
        return n;
    }

    @Autowired TestRestTemplate rest;

    @Test
    void theProbeNamesAreTheRealisticLengthTheBudgetMathsAssumes() {
        assertThat(probeName(0)).hasSize(40);
        // 8 for "limit=10" + 48 per name ("&recipe=" + 40).
        assertThat(query(MAX_RECIPES)).hasSize(9608);
    }

    /**
     * The assurance: a chunk built the way {@code useRuns} now builds it goes over a real socket
     * and comes back 200 with every recipe accounted for.
     */
    @Test
    void aChunkSizedByTheFrontendsByteBudgetSucceedsOverARealRequestLine() {
        int count = namesWithinBudget();
        assertThat(count).isGreaterThan(100).isLessThan(MAX_RECIPES);

        String url = "/api/operational/runs?" + query(count);
        assertThat(url.length()).isLessThanOrEqualTo(FRONTEND_QUERY_BUDGET_BYTES + 32);

        ResponseEntity<String> response = rest.getForEntity(url, String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        // Absent means [], never missing (ClusterEndpointsContractTest's shape contract) — so
        // every requested name must appear as a key even though none of them ran.
        List<String> missing = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            if (!response.getBody().contains(probeName(i))) missing.add(probeName(i));
        }
        assertThat(missing).isEmpty();
    }

    /**
     * The reproduction. 200 realistic names is what a count-only chunker produced, and the
     * container refuses it: a bare 400 with no ProblemDetail body, because the app was never
     * reached. Raising {@code server.max-http-header-size} is not the fix — a reverse proxy in
     * front of a real deployment imposes its own 8 KB, so the budget has to live client-side.
     */
    @Test
    void aChunkSizedByTheRecipeCountAloneIsRejectedByTheContainerBeforeTheApp() {
        ResponseEntity<String> response =
            rest.getForEntity("/api/operational/runs?" + query(MAX_RECIPES), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        // Not the app's own "Too many recipes" 400 — this never got that far.
        assertThat(response.getBody() == null || !response.getBody().contains("Too many recipes")).isTrue();
    }
}
