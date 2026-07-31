package io.pure360.etl360.service.support;

import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/**
 * Shared rules for the recipe write-history sidecar: {@code <recipeDir>/_history/} holds
 * archived versions of an edited {@code _ETL_*.json} recipe, named
 * {@code <base>.<yyyyMMdd-HHmmss-SSS>.json}. Committable by design (user's git-versioning
 * intent) — never git-ignored, but excluded from every corpus walk ({@code /api/tree},
 * {@link io.pure360.etl360.service.CorpusService#allRecipePaths()},
 * {@link io.pure360.etl360.service.CorpusService#allXmlPaths()}, DDL discovery) via
 * {@link #isHistoryPath}, so a viewer never lists an archived version as if it were live data.
 */
public final class HistorySidecar {
    public static final String DIR = "_history";

    private static final DateTimeFormatter VERSION_FORMAT =
        DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss-SSS").withZone(ZoneOffset.UTC);

    private HistorySidecar() {}

    /** True if any path segment relative to {@code root} is literally {@value #DIR}. */
    public static boolean isHistoryPath(Path root, Path p) {
        for (Path segment : root.relativize(p)) {
            if (DIR.equals(segment.toString())) {
                return true;
            }
        }
        return false;
    }

    /** A new archive version stamp: UTC {@code yyyyMMdd-HHmmss-SSS}. */
    public static String newVersion() {
        return VERSION_FORMAT.format(Instant.now());
    }
}
