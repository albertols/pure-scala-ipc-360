package io.pure360.etl360.api.dto;

import java.util.List;
import java.util.Map;

/**
 * What each data root resolved to, whether it is usable, and — for the control schema — exactly
 * how far the scan got before it produced nothing.
 *
 * <p>This exists because every way of mis-pointing a data root fails <b>silently</b>: a rejected
 * root falls back to the committed mock tier, an unrecognized layer directory is skipped without
 * a warning, and statements whose INSERT target doesn't match the configured table simply never
 * match. All three end at the same place — an empty relationships graph and a Tab 3 that says
 * "No relationship entries" — so the counts here are deliberately staged (dirs present → files
 * read → anchor hits → rows parsed) to show which step dropped to zero.
 *
 * <p>Nothing secret-ish belongs here beyond the filesystem paths the operator configured
 * themselves, and the {@code INSERT INTO <table>} identifiers found in their own control-schema
 * files — never row payloads.
 */
public record DiagnosticsDto(String status, RootStatus corpus, ControlSchema dwhControl,
                             RootStatus composer, B15Vocabulary b15) {

    /** A plainly-resolved root: corpus (no fallback tier) or composer (mock-backed). */
    public record RootStatus(String name, String configured, String resolved, boolean exists,
                             String requiredChild, String tier, String status, String hint,
                             Map<String, Integer> counts) {}

    /**
     * The control schema root, reported in more depth than the others because it is the one whose
     * failure modes are indistinguishable from the outside.
     *
     * @param realUsable whether the configured root won the "real" tier — i.e. it exists AND
     *                   carries {@code requiredChild}. Existence alone is not enough, which is
     *                   the distinction {@link io.pure360.etl360.config.DataRoots} makes and the
     *                   one an operator cannot see from config.json.
     */
    public record ControlSchema(String configured, String resolvedReal, boolean realExists,
                                String requiredChild, boolean realUsable, String mockPath,
                                boolean mockUsable, String tier, String status, String hint,
                                Scan scan) {}

    /**
     * The scan over {@code <tier>/LAYER_TO_LAYER/}, staged so a zero can be attributed:
     * {@code presentDirs} empty → wrong root; {@code unexpectedDirs} non-empty with
     * {@code filesRead} zero → layer names differ; {@code filesRead} non-zero with
     * {@code anchorHits} zero → the INSERT target differs (and {@code insertTargetsFound} says
     * what to configure instead); {@code anchorHits} non-zero with {@code rowsParsed} zero →
     * the rows themselves are malformed.
     */
    public record Scan(String anchorTable, String anchor, List<String> expectedLayerDirs,
                       List<String> presentDirs, List<String> unexpectedDirs, int filesRead,
                       int anchorHits, int rowsParsed, int rowsSkipped, List<FileScan> files,
                       List<InsertTarget> insertTargetsFound) {}

    /** One {@code statements.sql}, with the same staged counts as the whole scan. */
    public record FileScan(String path, long bytes, int anchorHits, int rowsParsed,
                           int rowsSkipped, String firstSkipReason) {}

    /** An {@code INSERT INTO <table> VALUES} identifier actually present in the scanned files. */
    public record InsertTarget(String table, int count) {}

    /**
     * The b15 {@code status} vocabulary, and the tokens the scan could not place.
     *
     * <p>The rest of this DTO explains an EMPTY Tab 3. This part explains a MISLABELLED one: a
     * status token matching neither list resolves to PENDING, so a run that actually failed
     * renders as "never ran" — the same silent-failure shape as a mis-pointed root, one level
     * down. {@code statusOk}/{@code statusKo} are echoed so an operator can see what to add to
     * {@code b15StatusOk}/{@code b15StatusKo} in config.json; {@code rowsScanned} says how much
     * history the counts below were drawn from, so an empty list can be read as "nothing
     * unrecognized" rather than "nothing looked at".
     */
    public record B15Vocabulary(List<String> statusOk, List<String> statusKo, int rowsScanned,
                                List<StatusToken> unrecognizedStatuses) {}

    /** An unrecognized b15 status token, by first-seen spelling, and how often it appeared. */
    public record StatusToken(String value, long count) {}
}
