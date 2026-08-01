package io.pure360.etl360.api.dto;

import java.util.List;

/**
 * Response of {@code POST /api/recipes/validate}. {@code valid} remains
 * {@code errors.isEmpty()} — warnings never block a save (spec §5.5) — so pre-existing
 * consumers ({@code scripts/recipe_sweep.mts}, Tab 2's save path) are unaffected.
 */
public record RecipeValidationDto(boolean valid,
                                  List<RecipeValidationErrorDto> errors,
                                  List<RecipeValidationErrorDto> warnings,
                                  List<IpcCheckDto> checks) {}
