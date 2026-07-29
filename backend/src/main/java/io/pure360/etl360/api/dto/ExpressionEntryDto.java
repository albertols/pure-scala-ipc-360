package io.pure360.etl360.api.dto;

public record ExpressionEntryDto(String mappingPath, String layer, String transformation,
                                  String port, String formula, String origin) {}
