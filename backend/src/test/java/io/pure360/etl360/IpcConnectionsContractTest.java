package io.pure360.etl360;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.pure360.etl360.service.CorpusService;
import io.pure360.etl360.service.ipc.IpcCatalog;
import io.pure360.etl360.service.ipc.IpcVocabulary;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class IpcConnectionsContractTest {
    @Autowired CorpusService corpus;
    @Autowired IpcCatalog catalog;
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
}
