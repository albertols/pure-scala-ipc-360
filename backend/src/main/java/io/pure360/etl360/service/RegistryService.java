package io.pure360.etl360.service;

import com.fasterxml.jackson.databind.JsonNode;
import io.pure360.etl360.api.dto.RegistryColumnDto;
import io.pure360.etl360.api.dto.RegistryDto;
import io.pure360.etl360.api.dto.RegistryTableDto;
import io.pure360.etl360.api.dto.RegistryVariantDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

/**
 * Searchable authoring inventory for "new recipe from scratch" (spec §6.4, Task 12): every
 * source table, target table, and DDL table name referenced across the live recipe corpus, with
 * the columns a matching {@code <TABLE>.json} carries and the recipes that reference it.
 *
 * <p>Task 16: {@code columns} is a UNION across every file sharing a name, which for the 11
 * corpus names whose files genuinely disagree matches no real file on disk. The union stays
 * (it is what the free-text search filters on), but each DDL entry now also carries one
 * {@link RegistryVariantDto} per DISTINCT column set — see that record's doc comment for why a
 * variant is a column set rather than a file, and why neither unioning nor intersecting can
 * stand in for it.
 *
 * <p>Walks {@link CorpusService#allRecipePaths()} exactly once — already {@code _history}-clean
 * (see {@link io.pure360.etl360.service.support.HistorySidecar#isHistoryPath}) — and, per
 * recipe, reads its content via {@link RecipeService#recipe} and its sibling DDL files via
 * {@link RecipeService#ddls}, which already excludes every {@code _}-prefixed entry: the
 * recipe's own {@code _ETL_*.json}, the anonymizer-mangled {@code _sqlTranslations_*}/
 * {@code _WESTPOND_*} files, and {@link io.pure360.etl360.service.support.LayoutSidecar}
 * {@code _layout_*.json} sidecars. Neither exclusion predicate is reimplemented here — see
 * {@code RegistryControllerTest#layoutSidecarsAndHistoryContentsAreExcludedFromRegistry}, which
 * asserts rather than assumes both hold.
 *
 * <p>Read-only: every filesystem call below is a {@code Files.list}/{@code Files.readString}
 * (via {@link CorpusService} and {@link RecipeService}) — nothing here creates, moves, or writes
 * anything under the corpus.
 */
@Service
public class RegistryService {
    private final CorpusService corpus;
    private final RecipeService recipes;

    public RegistryService(CorpusService corpus, RecipeService recipes) {
        this.corpus = corpus;
        this.recipes = recipes;
    }

    public RegistryDto registry() {
        Map<String, Set<String>> sourceUsage = new TreeMap<>();
        Map<String, Set<String>> targetUsage = new TreeMap<>();
        Map<String, Set<String>> ddlUsage = new TreeMap<>();
        Map<String, Set<String>> ddlColumns = new TreeMap<>();
        // tableName -> (that file's column set -> the mapping dirs whose copy has that set).
        // The key is a SET, so two files differing only in column ORDER are one variant (one
        // corpus name, ODS_F_MAPLEGLADE_WITHDRAWALS, is exactly that case); the retained key is
        // the FIRST file's insertion-ordered LinkedHashSet, so the emitted columns follow one
        // real file's on-disk order rather than an invented one.
        Map<String, Map<Set<RegistryColumnDto>, Set<String>>> ddlVariants = new TreeMap<>();
        Set<String> layers = new TreeSet<>();

        for (String recipePath : corpus.allRecipePaths()) {
            layers.add(firstSegment(recipePath));

            JsonNode table = recipes.recipe(recipePath).content().path("table");
            table.path("sourceTableNames").forEach(n ->
                sourceUsage.computeIfAbsent(n.asText(), k -> new TreeSet<>()).add(recipePath));
            table.path("targetTableNames").forEach(n ->
                targetUsage.computeIfAbsent(n.asText(), k -> new TreeSet<>()).add(recipePath));

            String mappingDir = recipePath.substring(0, recipePath.lastIndexOf('/'));
            recipes.ddls(mappingDir).forEach((tableName, fields) -> {
                ddlUsage.computeIfAbsent(tableName, k -> new TreeSet<>()).add(recipePath);
                Set<String> cols = ddlColumns.computeIfAbsent(tableName, k -> new TreeSet<>());
                Set<RegistryColumnDto> variant = new LinkedHashSet<>();
                fields.forEach(f -> {
                    cols.add(f.path("name").asText());
                    variant.add(new RegistryColumnDto(f.path("name").asText(), f.path("type").asText()));
                });
                ddlVariants
                    .computeIfAbsent(tableName, k -> new LinkedHashMap<>())
                    .computeIfAbsent(variant, k -> new TreeSet<>())
                    .add(mappingDir);
            });
        }

        return new RegistryDto(
            toDtos(sourceUsage, Map.of(), Map.of()),
            toDtos(targetUsage, Map.of(), Map.of()),
            toDtos(ddlUsage, ddlColumns, ddlVariants),
            new ArrayList<>(layers));
    }

    private static List<RegistryTableDto> toDtos(
            Map<String, Set<String>> usage,
            Map<String, Set<String>> columns,
            Map<String, Map<Set<RegistryColumnDto>, Set<String>>> variants) {
        List<RegistryTableDto> out = new ArrayList<>();
        for (Map.Entry<String, Set<String>> e : usage.entrySet()) {
            List<String> cols = new ArrayList<>(columns.getOrDefault(e.getKey(), Set.of()));
            out.add(new RegistryTableDto(e.getKey(), cols, new ArrayList<>(e.getValue()),
                toVariantDtos(variants.getOrDefault(e.getKey(), Map.of()))));
        }
        return out;
    }

    /** Variant order is first-encounter order over the (sorted) recipe walk — deterministic
     * across runs, and meaningful: {@code variants[0]} is the definition carried by the
     * alphabetically first mapping directory. */
    private static List<RegistryVariantDto> toVariantDtos(Map<Set<RegistryColumnDto>, Set<String>> byColumnSet) {
        List<RegistryVariantDto> out = new ArrayList<>();
        byColumnSet.forEach((cols, dirs) -> out.add(new RegistryVariantDto(new ArrayList<>(cols), new ArrayList<>(dirs))));
        return out;
    }

    private static String firstSegment(String relPath) {
        int slash = relPath.indexOf('/');
        return slash < 0 ? relPath : relPath.substring(0, slash);
    }
}
