package io.pure360.etl360.api.dto;

/** One archived version listed by {@code GET /api/recipes/history/{*path}}. {@code version} is
 * the sidecar's {@code yyyyMMdd-HHmmss-SSS} stamp, also the value passed back to
 * {@code ?version=} and to {@code POST /api/recipes/rollback/{*path}}. */
public record RecipeHistoryEntryDto(String version, String timestamp, long sizeBytes) {}
