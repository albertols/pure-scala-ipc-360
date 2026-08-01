package io.pure360.etl360.service.support;

import java.nio.file.Path;

/**
 * Canvas-layout sidecar rules: {@code <mappingDir>/_layout_<mapping>.json} holds node
 * positions for the recipe {@code <mappingDir>/_ETL_<mapping>.json}.
 *
 * <p>Positions deliberately do NOT live inside the recipe: the parser never emits x/y, so
 * embedding them would make {@code make regen-corpus} diff on every recipe and break
 * CLAUDE.md hard rule 3 (ADR-0011). Like {@code _history/}, the sidecar is committable but
 * excluded from every corpus walk.
 */
public final class LayoutSidecar {
    public static final String PREFIX = "_layout_";
    private static final String RECIPE_PREFIX = "_ETL_";
    private static final String JSON_EXT = ".json";

    private LayoutSidecar() {}

    public static boolean isLayoutFile(String fileName) {
        return fileName.startsWith(PREFIX) && fileName.endsWith(JSON_EXT);
    }

    /** {@code …/_ETL_m_FOO.json} -> {@code …/_layout_m_FOO.json}. */
    public static Path layoutFileFor(Path recipeFile) {
        String name = recipeFile.getFileName().toString();
        String stem = name.startsWith(RECIPE_PREFIX) ? name.substring(RECIPE_PREFIX.length()) : name;
        return recipeFile.resolveSibling(PREFIX + stem);
    }
}
