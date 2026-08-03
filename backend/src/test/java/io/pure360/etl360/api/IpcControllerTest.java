package io.pure360.etl360.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.greaterThan;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Task 9: {@code GET /api/ipc/rules} gains {@code connections}, so the frontend holds no
 * second copy of the adjacency matrix Task 8 authored.
 *
 * <p>Final whole-branch review, BLOCKING 3: {@code POST /api/ipc/fan-in} is the production
 * caller {@code IpcConnections.fanInVerdict} never had. The fan-in constraint is the one
 * PowerCenter rule the pairwise {@code mayFeed} adjacency cannot express, and the user
 * explicitly ruled "add fan-in now" during planning — computing it with no caller shipped
 * half of that. It stays SERVER-side (the rule lives in exactly one language, matching
 * {@code ipcRules.ts}'s standing ruling against a second TypeScript mirror of the
 * catalogue); the GUI asks this endpoint and renders the answer. */
@SpringBootTest
@AutoConfigureMockMvc
class IpcControllerTest {
    @Autowired MockMvc mvc;

    @Test
    void rulesServeTheConnectionMatrix() throws Exception {
        mvc.perform(get("/api/ipc/rules"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.connections.sourceQualifier.mayFeed.length()").value(greaterThan(0)));
    }

    /** The batch shape the pre-add dialog needs: every candidate in both pickers is one
     * pairing with its OWN existing input group (a "feeds" candidate's group is the
     * downstream step's `sources[]`, which differs per candidate), so a single round trip
     * has to carry many pairings and hand each verdict back under the caller's own key. */
    @Test
    void fanInVerdictsAreServedPerPairingUnderTheCallerSKey() throws Exception {
        mvc.perform(post("/api/ipc/fan-in")
               .contentType(MediaType.APPLICATION_JSON)
               .content("""
                   {"pairings":[
                     {"key":"fedBy:AGG1","existingSourceKinds":["filter"],"candidateKind":"aggregator"},
                     {"key":"fedBy:SP1","existingSourceKinds":[],"candidateKind":"storedProcedure"}
                   ]}"""))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.verdicts['fedBy:AGG1']").value("block"))
           .andExpect(jsonPath("$.verdicts['fedBy:SP1']").value("ok"));
    }

    /** The nullable-{@code active} half of the contract, over the wire: {@code table} is
     * "cannot be determined", and refusing a link we cannot prove illegal is worse than
     * permitting one we cannot prove legal — so it must warn, never block. */
    @Test
    void fanInVerdictWarnsRatherThanBlocksForAnUnclassifiedParticipant() throws Exception {
        mvc.perform(post("/api/ipc/fan-in")
               .contentType(MediaType.APPLICATION_JSON)
               .content("""
                   {"pairings":[
                     {"key":"a","existingSourceKinds":["filter"],"candidateKind":"table"},
                     {"key":"b","existingSourceKinds":["java"],"candidateKind":"filter"},
                     {"key":"c","existingSourceKinds":["table"],"candidateKind":"joinerInput"}
                   ]}"""))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.verdicts.a").value("warn"))
           .andExpect(jsonPath("$.verdicts.b").value("warn"))
           .andExpect(jsonPath("$.verdicts.c").value("warn"));
    }

    /** Anonymizer type aliases resolve server-side before classification, exactly as
     * {@code IpcConnectionsContractTest}'s corpus sweep does — a recipe carrying
     * {@code BERYLFALLS} is a {@code sourceQualifier} (active), so a passive candidate
     * joining it blocks. Resolving client-side instead would need a second copy of the
     * alias table in the GUI, which CLAUDE.md forbids. */
    @Test
    void fanInResolvesAnonymizerTypeAliasesBeforeClassifying() throws Exception {
        mvc.perform(post("/api/ipc/fan-in")
               .contentType(MediaType.APPLICATION_JSON)
               .content("""
                   {"pairings":[
                     {"key":"aliased","existingSourceKinds":["BERYLFALLS"],"candidateKind":"storedProcedure"}
                   ]}"""))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.verdicts.aliased").value("block"));
    }

    /** A kind absent from the matrix entirely (a typo, a future transformation) is
     * "cannot be determined", not "definitely safe" — it warns, and never 500s. An empty
     * request body's {@code pairings} is likewise an empty answer, not a crash. */
    @Test
    void fanInDegradesToWarnForAnUnknownKindAndToEmptyForNoPairings() throws Exception {
        mvc.perform(post("/api/ipc/fan-in")
               .contentType(MediaType.APPLICATION_JSON)
               .content("""
                   {"pairings":[
                     {"key":"x","existingSourceKinds":["filter"],"candidateKind":"notAKind"}
                   ]}"""))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.verdicts.x").value("warn"));

        mvc.perform(post("/api/ipc/fan-in")
               .contentType(MediaType.APPLICATION_JSON)
               .content("{}"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.verdicts.length()").value(0));
    }
}
