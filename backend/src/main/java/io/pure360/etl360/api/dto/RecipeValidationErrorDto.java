package io.pure360.etl360.api.dto;

/** One structural problem found by {@code POST /api/recipes/validate}. {@code path} is a
 * JSON-pointer-ish locator into the submitted document (e.g. {@code $.steps[2].target.name}). */
public record RecipeValidationErrorDto(String path, String message) {}
