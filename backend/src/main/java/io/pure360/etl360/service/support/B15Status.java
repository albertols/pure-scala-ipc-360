package io.pure360.etl360.service.support;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.LongAdder;
import java.util.stream.Collectors;

/**
 * Canonicalises the b15 {@code status} column.
 *
 * <p>That column's vocabulary is <b>export-specific</b>, not IPC law. This repo's anonymized
 * sample data writes {@code SUCCESS}/{@code FAILED}; a real Composer export writes
 * {@code FAILURE}. Until this class existed, that token matched no literal anywhere in the stack
 * — {@code ClusterIndexService}, {@code ClusterController}, {@code OperationalService} and the
 * frontend's {@code STATUS_MAP} each compared a closed pair — so a FAILED run resolved to
 * PENDING and rendered as "never ran": the most misleading state Tab 3 can show, and a
 * <b>silent</b> one. Same class of trap as the ADR-0013 anchor table, and fixed the same way:
 * make the vocabulary configurable, and report what did not match instead of swallowing it.
 *
 * <p>Canonical output is deliberately today's vocabulary ({@code SUCCESS} / {@code FAILED} /
 * {@code ""}), so every downstream consumer keeps comparing two literals and needs no change.
 * See ADR-0018.
 *
 * <p>Thread-safe: {@link #canonical} is called from the request threads that parse b15 CSVs.
 */
public final class B15Status {
    public static final String OK = "SUCCESS";
    public static final String KO = "FAILED";
    public static final String UNKNOWN = "";

    public static final List<String> DEFAULT_OK =
        List.of("SUCCESS", "SUCCEEDED", "OK", "COMPLETED", "DONE");

    /**
     * KILLED/ABORTED/CANCELLED default to KO because to an operator they are emphatically not
     * successes, and "a non-success rendering as PENDING" is the exact defect this class fixes.
     * A site that disagrees reclassifies them via {@code etl360.b15.status-ok}.
     */
    public static final List<String> DEFAULT_KO =
        List.of("FAILURE", "FAILED", "ERROR", "KILLED", "ABORTED", "CANCELLED");

    public static final B15Status DEFAULT = of(DEFAULT_OK, DEFAULT_KO);

    /** First-seen spelling of an unrecognized token, plus how often it has been seen. */
    private record Unrecognized(String display, LongAdder count) {}

    private final Set<String> ok;
    private final Set<String> ko;
    private final Map<String, Unrecognized> unrecognized = new ConcurrentHashMap<>();

    private B15Status(Set<String> ok, Set<String> ko) {
        this.ok = ok;
        this.ko = ko;
    }

    /**
     * A configured vocabulary <b>replaces</b> the default rather than extending it — otherwise a
     * site that needs to reclassify CANCELLED as a success could never stop it being a failure.
     */
    public static B15Status of(List<String> ok, List<String> ko) {
        return new B15Status(normalizeAll(ok), normalizeAll(ko));
    }

    private static Set<String> normalizeAll(List<String> tokens) {
        return tokens.stream().map(B15Status::key)
            .filter(s -> !s.isEmpty())
            .collect(Collectors.toUnmodifiableSet());
    }

    private static String key(String raw) {
        return raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
    }

    /**
     * {@code SUCCESS}, {@code FAILED}, or {@code ""} — the last for a blank cell AND for anything
     * unrecognized, which is additionally recorded for {@link #unrecognized()}.
     */
    public String canonical(String raw) {
        String k = key(raw);
        if (k.isEmpty()) return UNKNOWN;
        if (ok.contains(k)) return OK;
        if (ko.contains(k)) return KO;
        unrecognized.computeIfAbsent(k, x -> new Unrecognized(raw.trim(), new LongAdder()))
            .count().increment();
        return UNKNOWN;
    }

    /**
     * Tokens seen that matched neither vocabulary, keyed by their first-seen spelling and counted
     * case-insensitively, most frequent first.
     *
     * <p>ADR-0013 exists so an empty Tab 3 names its own cause. This is the same principle one
     * level down: a PENDING card naming its own cause, via {@code GET /api/diagnostics}.
     */
    public Map<String, Long> unrecognized() {
        return unrecognized.values().stream()
            .sorted(Comparator.comparingLong((Unrecognized u) -> u.count().sum()).reversed()
                .thenComparing(Unrecognized::display))
            .collect(Collectors.toMap(Unrecognized::display, u -> u.count().sum(),
                (a, b) -> a, LinkedHashMap::new));
    }
}
