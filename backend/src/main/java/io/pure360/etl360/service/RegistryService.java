package io.pure360.etl360.service;

import com.fasterxml.jackson.databind.JsonNode;
import io.pure360.etl360.api.dto.RegistryDto;
import io.pure360.etl360.api.dto.RegistryTableDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
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
                fields.forEach(f -> cols.add(f.path("name").asText()));
            });
        }

        return new RegistryDto(
            toDtos(sourceUsage, Map.of()),
            toDtos(targetUsage, Map.of()),
            toDtos(ddlUsage, ddlColumns),
            new ArrayList<>(layers));
    }

    private static List<RegistryTableDto> toDtos(Map<String, Set<String>> usage, Map<String, Set<String>> columns) {
        List<RegistryTableDto> out = new ArrayList<>();
        for (Map.Entry<String, Set<String>> e : usage.entrySet()) {
            List<String> cols = new ArrayList<>(columns.getOrDefault(e.getKey(), Set.of()));
            out.add(new RegistryTableDto(e.getKey(), cols, new ArrayList<>(e.getValue())));
        }
        return out;
    }

    private static String firstSegment(String relPath) {
        int slash = relPath.indexOf('/');
        return slash < 0 ? relPath : relPath.substring(0, slash);
    }
}
