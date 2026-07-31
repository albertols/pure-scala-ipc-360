package io.pure360.etl360.api.dto;

import com.fasterxml.jackson.databind.JsonNode;

/** {@code PUT /api/recipes/{*path}} body: the client's full recipe content plus the
 * {@code modifiedAt} it loaded ({@code baseModified}), used as an optimistic-concurrency
 * precondition (mismatch → 409). */
public record RecipeSaveRequestDto(String baseModified, JsonNode content) {}
