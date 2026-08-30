package io.pure360.etl360.service;

import io.pure360.etl360.service.support.B15Status;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class B15StatusTest {

    @Test
    void canonicalisesTheRealExportsFailureToken() {
        // The defect this class exists for: a real Composer export writes FAILURE, which matched
        // no literal anywhere in the stack, so a failed run rendered as PENDING — "never ran".
        assertThat(B15Status.DEFAULT.canonical("FAILURE")).isEqualTo("FAILED");
    }

    @Test
    void acceptsTheSynonymsOfBothOutcomes() {
        for (String ok : List.of("SUCCESS", "SUCCEEDED", "OK", "COMPLETED", "DONE")) {
            assertThat(B15Status.DEFAULT.canonical(ok)).as(ok).isEqualTo("SUCCESS");
        }
        for (String ko : List.of("FAILURE", "FAILED", "ERROR", "KILLED", "ABORTED", "CANCELLED")) {
            assertThat(B15Status.DEFAULT.canonical(ko)).as(ko).isEqualTo("FAILED");
        }
    }

    @Test
    void matchesCaseInsensitivelyAndTrims() {
        assertThat(B15Status.DEFAULT.canonical("  failure ")).isEqualTo("FAILED");
        assertThat(B15Status.DEFAULT.canonical("Success")).isEqualTo("SUCCESS");
    }

    @Test
    void mapsBlankAndUnknownToTheEmptyToken() {
        assertThat(B15Status.DEFAULT.canonical("")).isEmpty();
        assertThat(B15Status.DEFAULT.canonical(null)).isEmpty();
        assertThat(B15Status.DEFAULT.canonical("   ")).isEmpty();
        assertThat(B15Status.DEFAULT.canonical("SKIPPED")).isEmpty();
    }

    @Test
    void reportsUnrecognizedTokensInsteadOfSwallowingThem() {
        B15Status s = B15Status.of(List.of("SUCCESS"), List.of("FAILED"));
        s.canonical("SKIPPED");
        s.canonical("skipped");   // same token, different spelling — one entry, counted twice
        s.canonical("SUCCESS");   // recognized, must not be reported

        assertThat(s.unrecognized()).containsExactly(Map.entry("SKIPPED", 2L));
    }

    @Test
    void ordersTheReportByCountDescending() {
        B15Status s = B15Status.of(List.of("SUCCESS"), List.of("FAILED"));
        s.canonical("RARE");
        s.canonical("COMMON");
        s.canonical("COMMON");

        assertThat(s.unrecognized().keySet()).containsExactly("COMMON", "RARE");
    }

    @Test
    void aRecognizedVocabularyIsNeverReported() {
        B15Status s = B15Status.of(List.of("SUCCESS"), List.of("FAILED"));
        s.canonical("SUCCESS");
        s.canonical("FAILED");
        s.canonical("");

        assertThat(s.unrecognized()).isEmpty();
    }

    @Test
    void configuredVocabularyReplacesTheDefault() {
        B15Status s = B15Status.of(List.of("GOOD"), List.of("BAD"));

        assertThat(s.canonical("GOOD")).isEqualTo("SUCCESS");
        assertThat(s.canonical("BAD")).isEqualTo("FAILED");
        // A configured vocabulary is a REPLACEMENT, not an addition — otherwise a site that
        // needs to reclassify CANCELLED as a success could never stop it being a failure.
        assertThat(s.canonical("SUCCESS")).isEmpty();
    }
}
