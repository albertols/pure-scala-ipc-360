package io.pure360.etl360.service.ipc;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class IpcVocabularyTest {
    @Test
    void resolvesAnonymizedTargetTypeTokens() {
        assertThat(IpcVocabulary.canonicalTargetType("BERYLFALLS")).isEqualTo("sourceQualifier");
        assertThat(IpcVocabulary.canonicalTargetType("EARLYGLADE")).isEqualTo("unionInput");
        assertThat(IpcVocabulary.canonicalTargetType("ASHPATH2")).isEqualTo("joinerInput");
        assertThat(IpcVocabulary.canonicalTargetType("CEDARWICK2")).isEqualTo("storedProcedure");
    }

    @Test
    void passesCanonicalTypesThrough() {
        assertThat(IpcVocabulary.canonicalTargetType("table")).isEqualTo("table");
        assertThat(IpcVocabulary.canonicalSourceType("joiner")).isEqualTo("joiner");
    }

    @Test
    void unknownTypeResolvesToItself() {
        assertThat(IpcVocabulary.canonicalTargetType("NOSUCHTYPE")).isEqualTo("NOSUCHTYPE");
        assertThat(IpcVocabulary.TARGET_TYPES).doesNotContain("NOSUCHTYPE");
    }

    @Test
    void resolvesTheAnonymizedRouterGroupsKey() {
        assertThat(IpcVocabulary.canonicalKey("greencliff")).isEqualTo("groups");
        assertThat(IpcVocabulary.canonicalKey("weststone")).isEqualTo("fields");
        assertThat(IpcVocabulary.canonicalKey("fields")).isEqualTo("fields");
    }

    @Test
    void knowsAllTenTargetAndSourceKinds() {
        assertThat(IpcVocabulary.TARGET_TYPES).containsExactlyInAnyOrder(
            "table", "unionInput", "sourceQualifier", "filter", "joinerInput",
            "aggregator", "router", "normalizer", "java", "storedProcedure");
        assertThat(IpcVocabulary.SOURCE_TYPES).containsExactlyInAnyOrder(
            "table", "union", "sourceQualifier", "filter", "joiner",
            "aggregator", "router", "normalizer", "java", "storedProcedure");
    }
}
