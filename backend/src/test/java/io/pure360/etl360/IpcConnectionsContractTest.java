package io.pure360.etl360;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.pure360.etl360.service.CorpusService;
import io.pure360.etl360.service.ipc.IpcCatalog;
import io.pure360.etl360.service.ipc.IpcConnections;
import io.pure360.etl360.service.ipc.IpcVocabulary;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class IpcConnectionsContractTest {
    @Autowired CorpusService corpus;
    @Autowired IpcCatalog catalog;
    @Autowired IpcConnections connections;
    private final ObjectMapper mapper = new ObjectMapper();

    /** Spec §6.2: the matrix is authored, the corpus validates it. Every pairing that
     * actually occurs across the 86 recipes must be permitted — an over-strict matrix
     * fails here, and so does an invented one. */
    @Test
    void everyPairingObservedInTheCorpusIsPermitted() throws Exception {
        Set<String> unpermitted = new LinkedHashSet<>();
        for (String rel : corpus.allRecipePaths()) {
            JsonNode d = mapper.readTree(
                Files.readString(Path.of("../parser/src/main/resources/xmltobq").resolve(rel)));
            for (JsonNode step : d.path("steps")) {
                String tgt = IpcVocabulary.canonicalTargetType(step.path("target").path("type").asText(""));
                for (JsonNode src : step.path("sources")) {
                    String s = IpcVocabulary.canonicalSourceType(src.path("type").asText(""));
                    var rule = catalog.connections().get(s);
                    if (rule == null || !rule.mayFeed().contains(tgt)) {
                        unpermitted.add(s + " -> " + tgt + "  (e.g. " + rel + ")");
                    }
                }
            }
        }
        assertThat(unpermitted).as("corpus pairings the authored matrix forbids").isEmpty();
    }

    @Test
    void everySourceKindHasAConnectionRule() {
        assertThat(catalog.connections().keySet()).containsAll(IpcVocabulary.SOURCE_TYPES);
    }

    @Test
    void everyMayFeedTargetIsAKnownTargetKind() {
        catalog.connections().forEach((src, rule) ->
            assertThat(IpcVocabulary.TARGET_TYPES)
                .as("mayFeed targets of " + src).containsAll(rule.mayFeed()));
    }

    @Test
    void joinerInputCarriesItsMasterDetailCardinality() {
        var rule = catalog.connections().get("joinerInput");
        assertThat(rule).isNotNull();
        assertThat(rule.exactly()).isEqualTo(2);
        assertThat(rule.namedInputs()).containsExactlyInAnyOrder("MASTER", "DETAIL");
    }

    /** Task 9, spec §6.2: the classification table's ten source kinds must all be present,
     * with exactly two {@code null} ("cannot be determined") entries — {@code table} (not a
     * transformation) and {@code java} (configured active-or-passive at creation, unrecorded
     * in the recipe JSON). A drifted classification (e.g. a kind silently defaulting to
     * {@code null} because the JSON key was mistyped) fails here before it can mask a
     * fan-in bug. */
    @Test
    void everySourceKindCarriesItsActiveClassification() {
        assertThat(catalog.connections().get("table").active()).isNull();
        assertThat(catalog.connections().get("java").active()).isNull();
        assertThat(catalog.connections().get("sourceQualifier").active()).isTrue();
        assertThat(catalog.connections().get("filter").active()).isTrue();
        assertThat(catalog.connections().get("joiner").active()).isTrue();
        assertThat(catalog.connections().get("aggregator").active()).isTrue();
        assertThat(catalog.connections().get("router").active()).isTrue();
        assertThat(catalog.connections().get("union").active()).isTrue();
        assertThat(catalog.connections().get("normalizer").active()).isTrue();
        assertThat(catalog.connections().get("storedProcedure").active()).isFalse();
    }

    /** Two active transformations feeding the same downstream input group is exactly the
     * case PowerCenter's Designer refuses — spec §6.2, added after Task 8's review. */
    @Test
    void fanInVerdictBlocksTwoActiveTransformationsIntoTheSameInput() {
        assertThat(connections.fanInVerdict(List.of("filter"), "aggregator")).isEqualTo("block");
    }

    /** A passive existing input among the mix must not mask an active one — the block
     * condition is "at least one existing input is active", not "every existing input is
     * active". */
    @Test
    void fanInVerdictBlocksWhenAnyExistingInputIsActiveRegardlessOfOtherPassiveInputs() {
        assertThat(connections.fanInVerdict(List.of("storedProcedure", "filter"), "aggregator"))
            .isEqualTo("block");
    }

    /** Two passive transformations (or a passive one alone) never trip the rule. */
    @Test
    void fanInVerdictOkWhenNoParticipantIsActive() {
        assertThat(connections.fanInVerdict(List.of("storedProcedure"), "storedProcedure")).isEqualTo("ok");
    }

    /** Per the exact contract ("block when the candidate is active AND at least one existing
     * input is active"), a PASSIVE candidate joining a group whose only known input is active
     * is "ok", not "block" — the literal formula screens the transformation being newly
     * connected, not every pairing within the resulting group. Documented explicitly so this
     * reads as an intentional, spec-literal scoping decision rather than an oversight; see the
     * task report's "concerns" for the gap this leaves against the fuller Designer rule quoted
     * in the brief's narrative (an active-then-passive connection order is not itself
     * re-flagged by this function). */
    @Test
    void fanInVerdictDoesNotBlockAPassiveCandidateJoiningAnAlreadyActiveGroup() {
        assertThat(connections.fanInVerdict(List.of("filter"), "storedProcedure")).isEqualTo("ok");
    }

    /** A single new source with nothing already connected is trivially fine regardless of
     * its own classification. */
    @Test
    void fanInVerdictOkWithNoExistingInputs() {
        assertThat(connections.fanInVerdict(List.of(), "aggregator")).isEqualTo("ok");
    }

    /** `table`'s `active` is `null` ("cannot be determined"), never "passive" — the fan-in
     * check must warn, not silently wave the candidate through as safe. */
    @Test
    void fanInVerdictWarnsWhenTheCandidateIsUnclassified() {
        assertThat(connections.fanInVerdict(List.of("filter"), "table")).isEqualTo("warn");
    }

    /** Same principle, unknown participant on the existing side instead of the candidate. */
    @Test
    void fanInVerdictWarnsWhenAnExistingInputIsUnclassified() {
        assertThat(connections.fanInVerdict(List.of("java"), "filter")).isEqualTo("warn");
    }

    /** `null` must never resolve to "block" even when it sits alongside a definite active
     * participant — refusing a link we cannot prove illegal is worse than permitting one we
     * cannot prove legal (spec §6.2). A wrong implementation that treats `null` as truthy or
     * as "assume active" would block here instead. */
    @Test
    void fanInVerdictWarnsRatherThanBlocksWhenAnUnknownParticipantJoinsAKnownActiveOne() {
        assertThat(connections.fanInVerdict(List.of("java"), "aggregator")).isEqualTo("warn");
    }

    /** Spec §6.2's free validation: the corpus's only multi-source steps are 21 uniform
     * {@code table} fan-ins, and {@code table} is {@code null} ("cannot be determined") — so
     * a correctly classified rule leaves every one of the 86 corpus recipes unflagged. A
     * `block` verdict anywhere here means the classification or the check regressed, not that
     * the corpus grew a genuinely illegal fan-in. Every source in a multi-source step is
     * checked as the candidate against the rest as existing inputs, so a single step with
     * (say) three sources is exercised from all three angles, not just the last one. */
    @Test
    void fanInCheckNeverBlocksAnyCorpusRecipe() throws Exception {
        List<String> blocked = new ArrayList<>();
        int multiSourceSteps = 0;
        for (String rel : corpus.allRecipePaths()) {
            JsonNode d = mapper.readTree(
                Files.readString(Path.of("../parser/src/main/resources/xmltobq").resolve(rel)));
            for (JsonNode step : d.path("steps")) {
                List<String> kinds = new ArrayList<>();
                for (JsonNode src : step.path("sources")) {
                    kinds.add(IpcVocabulary.canonicalSourceType(src.path("type").asText("")));
                }
                if (kinds.size() < 2) continue;
                multiSourceSteps++;
                for (int i = 0; i < kinds.size(); i++) {
                    List<String> existing = new ArrayList<>(kinds);
                    String candidate = existing.remove(i);
                    String verdict = connections.fanInVerdict(existing, candidate);
                    if ("block".equals(verdict)) {
                        blocked.add(rel + " step target " + step.path("target").path("name").asText("")
                            + ": " + kinds + " (candidate " + candidate + ")");
                    }
                }
            }
        }
        assertThat(blocked).as("corpus fan-ins the classification wrongly blocks").isEmpty();
        assertThat(multiSourceSteps).as("corpus's only multi-source steps (spec §6.2)").isEqualTo(21);
    }
}
