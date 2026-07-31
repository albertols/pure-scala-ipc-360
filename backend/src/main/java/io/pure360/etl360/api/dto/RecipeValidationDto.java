package io.pure360.etl360.api.dto;

import java.util.List;

/** Response of {@code POST /api/recipes/validate}. */
public record RecipeValidationDto(boolean valid, List<RecipeValidationErrorDto> errors) {}
