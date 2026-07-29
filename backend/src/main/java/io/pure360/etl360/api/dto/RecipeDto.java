package io.pure360.etl360.api.dto;

import com.fasterxml.jackson.databind.JsonNode;

public record RecipeDto(String path, String fileName, long sizeBytes, String modifiedAt, JsonNode content) {}
