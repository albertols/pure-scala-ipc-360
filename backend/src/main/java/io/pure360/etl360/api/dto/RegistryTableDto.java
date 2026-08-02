package io.pure360.etl360.api.dto;

import java.util.List;

/** One table in the {@code /api/registry} authoring inventory (spec §6.4): its name, the
 * columns a matching {@code <TABLE>.json} DDL carries (empty when no DDL is known — e.g. a
 * source/target table name with no corresponding DDL file), and the recipes that reference it. */
public record RegistryTableDto(String name, List<String> columns, List<String> usedByRecipes) {}
