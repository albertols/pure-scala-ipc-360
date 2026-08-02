package io.pure360.etl360.api.dto;

import java.util.List;

/** {@code GET /api/registry} response: the searchable inventory backing "new recipe from
 * scratch" (spec §6.4) — every source table, target table, and DDL table name referenced
 * across the live recipe corpus, plus the corpus's layers. */
public record RegistryDto(List<RegistryTableDto> sourceTables, List<RegistryTableDto> targetTables,
                          List<RegistryTableDto> ddlTables, List<String> layers) {}
