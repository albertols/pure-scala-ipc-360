package io.pure360.etl360.api.dto;

import java.util.List;

/** One table in the {@code /api/registry} authoring inventory (spec §6.4): its name, the
 * columns a matching {@code <TABLE>.json} DDL carries (empty when no DDL is known — e.g. a
 * source/target table name with no corresponding DDL file), the recipes that reference it, and
 * (Task 16) one {@link RegistryVariantDto} per DISTINCT column set behind the name.
 *
 * <p>{@code columns} is a UNION across every DDL file sharing this name — for the 11 corpus
 * names whose files genuinely disagree it therefore matches no real file on disk, which is why
 * {@code variants} exists: it is the only member of this record that can be presented to an
 * operator as "this is what that table IS". A name with no DDL behind it keeps {@code columns}
 * and {@code variants} both empty. */
public record RegistryTableDto(String name, List<String> columns, List<String> usedByRecipes,
                               List<RegistryVariantDto> variants) {}
