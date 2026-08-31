package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.ClusterDetailDto;
import io.pure360.etl360.api.dto.ClusterIndexDto;
import io.pure360.etl360.api.dto.LayerToLayerEntryDto;
import io.pure360.etl360.api.dto.RelationshipsDto;
import io.pure360.etl360.api.dto.RunsDto;
import io.pure360.etl360.api.dto.LineageDto;
import io.pure360.etl360.api.dto.SearchHitsDto;
import io.pure360.etl360.config.DataRoots;
import io.pure360.etl360.service.ClusterIndexService;
import io.pure360.etl360.service.LayerToLayerService;
import io.pure360.etl360.service.LineageService;
import io.pure360.etl360.service.RelationshipService;
import io.pure360.etl360.service.support.InvalidRequestException;
import io.pure360.etl360.service.support.NotFoundException;
import io.pure360.etl360.service.support.TableClusters;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeSet;

/**
 * Serves the b15 cluster index. Holds no logic beyond DTO assembly and the one join
 * {@link ClusterIndexService} deliberately does not do: recipe -> layer, resolved from
 * {@link LayerToLayerService} with the same first-match-wins rule and "UNKNOWN" fallback
 * {@code OperationalService.summary()} uses.
 */
@RestController
@RequestMapping("/api/operational")
public class ClusterController {
    private static final String UNKNOWN_LAYER = "UNKNOWN";

    private final ClusterIndexService index;
    private final LayerToLayerService layerToLayer;
    private final RelationshipService relationships;
    private final LineageService lineage;
    private final DataRoots roots;

    public ClusterController(ClusterIndexService index, LayerToLayerService layerToLayer,
                             RelationshipService relationships, LineageService lineage,
                             DataRoots roots) {
        this.index = index;
        this.layerToLayer = layerToLayer;
        this.relationships = relationships;
        this.lineage = lineage;
        this.roots = roots;
    }

    @GetMapping("/clusters")
    public ClusterIndexDto clusters() {
        ClusterIndexService.Index idx = index.index();
        List<ClusterIndexDto.ClusterSummaryDto> clusters = idx.byCluster().values().stream()
            .sorted(Comparator.comparing(ClusterIndexService.ClusterEntry::name))
            .map(e -> new ClusterIndexDto.ClusterSummaryDto(e.name(), e.recipes().size(), e.dateIdx(),
                e.rows(), e.ok(), e.ko(), e.lastDate(), e.lastStatus()))
            .toList();
        ClusterIndexService.Totals t = idx.totals();
        return new ClusterIndexDto(roots.composerMode(), idx.dates(),
            new ClusterIndexDto.TotalsDto(t.clusters(), t.recipes(), t.dates(), t.rows()), clusters);
    }

    @GetMapping("/clusters/{name}")
    public ClusterDetailDto cluster(@PathVariable("name") String name) {
        ClusterIndexService.Index idx = index.index();
        ClusterIndexService.ClusterEntry entry = idx.byCluster().get(name);
        if (entry == null) throw new NotFoundException("No cluster '" + name + "' in the b15 history");

        Map<String, String> layerByRecipe = layerByRecipe();
        List<String> dates = entry.dateIdx().stream().map(idx.dates()::get).toList();

        // date -> index, built ONCE. `idx.dates().indexOf(...)` inside the per-run loop below made
        // this endpoint O(recipes x runs x dates) in STRING comparisons — ~3.3M for a 50-recipe
        // cluster over a 365-day history, per pane expansion.
        Map<String, Integer> dateIndex = new HashMap<>();
        for (int i = 0; i < idx.dates().size(); i++) dateIndex.put(idx.dates().get(i), i);

        List<ClusterDetailDto.RecipeInClusterDto> recipes = new ArrayList<>();
        for (String recipe : entry.recipes()) {
            List<ClusterIndexService.RunEntry> runs = idx.runsByRecipe().getOrDefault(recipe, List.of());
            List<Integer> dateIdx = runs.stream()
                .filter(r -> name.equals(r.clusterName()))
                .map(r -> dateIndex.getOrDefault(r.date(), -1))
                .distinct().sorted().toList();
            int ok = 0, ko = 0;
            String lastDate = null, lastStatus = null;
            for (ClusterIndexService.RunEntry r : runs) {
                if (!name.equals(r.clusterName())) continue;
                if ("SUCCESS".equals(r.status())) ok++;
                else if ("FAILED".equals(r.status())) ko++;
                lastDate = r.date();               // runs are date-ascending
                lastStatus = r.status();
            }
            recipes.add(new ClusterDetailDto.RecipeInClusterDto(recipe,
                layerByRecipe.getOrDefault(recipe, UNKNOWN_LAYER), dateIdx,
                dateIdx.size(), ok, ko, lastDate, lastStatus));
        }
        return new ClusterDetailDto(name, dates, recipes);
    }

    static final int MAX_RECIPES = 200;
    static final int MAX_LIMIT = 50;
    static final int DEFAULT_LIMIT = 10;

    /**
     * Run history for up to {@link #MAX_RECIPES} recipes at once. The bound exists so a caller
     * cannot relocate the scale problem into this endpoint; the frontend's useRuns() chunks its
     * recipe list to respect it, so the limit never surfaces to a user.
     *
     * <p>It is not the only bound on a request here, and it is not the tighter one. The whole
     * request line lives inside the container's 8 KB {@code server.max-http-header-size}, which
     * 200 realistic recipe names (~40 chars each, 9 608 B of query string) exceed — so the
     * frontend chunks against an encoded BYTE budget as well, and this count is the second of two
     * simultaneous bounds. See {@code RunsRequestSizeContractTest}.
     */
    @GetMapping("/runs")
    public RunsDto runs(@RequestParam("recipe") List<String> recipes,
                        @RequestParam(name = "limit", defaultValue = "" + DEFAULT_LIMIT) int limit) {
        if (recipes.size() > MAX_RECIPES) {
            throw new InvalidRequestException("Too many recipes: " + recipes.size()
                + " — at most " + MAX_RECIPES + " per request. Chunk the list client-side.");
        }
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new InvalidRequestException("limit must be between 1 and " + MAX_LIMIT + ", got " + limit);
        }
        Map<String, List<ClusterIndexService.RunEntry>> byRecipe = index.index().runsByRecipe();
        Map<String, List<RunsDto.RunDto>> out = new LinkedHashMap<>();
        for (String recipe : recipes) {
            List<ClusterIndexService.RunEntry> runs = byRecipe.getOrDefault(recipe, List.of());
            List<RunsDto.RunDto> newestFirst = new ArrayList<>();
            for (int i = runs.size() - 1; i >= 0 && newestFirst.size() < limit; i--) {
                ClusterIndexService.RunEntry r = runs.get(i);
                newestFirst.add(new RunsDto.RunDto(r.date(), r.clusterName(), r.jobId(),
                    r.appStartIso(), r.durationMin(), r.status(), r.message()));
            }
            out.put(recipe, List.copyOf(newestFirst));
        }
        return new RunsDto(limit, out);
    }

    static final int LINEAGE_DEFAULT_LIMIT = 150;
    static final int LINEAGE_MAX_LIMIT = 600;

    /**
     * One node's transitive upstream AND downstream closure — see {@link LineageDto} and ADR-0020.
     *
     * <p>Unlike {@code /search}, an unknown {@code node} IS a 404: the caller here has a node id
     * in hand (it came from a graph this server served), so a miss means something is genuinely
     * wrong rather than that the user is still typing.
     */
    @GetMapping("/lineage")
    public LineageDto lineage(@RequestParam("node") String node,
                              @RequestParam(name = "limit", defaultValue = "" + LINEAGE_DEFAULT_LIMIT) int limit) {
        if (limit < 1 || limit > LINEAGE_MAX_LIMIT) {
            throw new InvalidRequestException(
                "limit must be between 1 and " + LINEAGE_MAX_LIMIT + ", got " + limit);
        }
        return lineage.lineage(node, limit, null, List.of());
    }

    static final int SEARCH_MIN_Q = 2;
    static final int SEARCH_DEFAULT_LIMIT = 50;
    static final int SEARCH_MAX_LIMIT = 200;

    /**
     * Substring search over b15 recipe names AND relationship-graph table names, each hit carrying
     * the clusters that reach it.
     *
     * <p>Exists because the client cannot do this join: table names are only in the L2L graph,
     * which ADR-0014 never fetches unscoped, so Tab 3's own toolbar search can only see cards
     * already loaded — and loading them requires already knowing which cluster to pick. See
     * {@link SearchHitsDto} and ADR-0019.
     *
     * <p>A query shorter than {@link #SEARCH_MIN_Q} returns an EMPTY result rather than a 400: the
     * caller is a search box, and erroring on the first keystroke would flash it red on every use.
     * An over-range {@code limit}, by contrast, is a caller bug and does get a 400.
     */
    @GetMapping("/search")
    public SearchHitsDto search(@RequestParam("q") String q,
                                @RequestParam(name = "limit", defaultValue = "" + SEARCH_DEFAULT_LIMIT) int limit) {
        if (limit < 1 || limit > SEARCH_MAX_LIMIT) {
            throw new InvalidRequestException(
                "limit must be between 1 and " + SEARCH_MAX_LIMIT + ", got " + limit);
        }
        String needle = q == null ? "" : q.trim().toLowerCase(Locale.ROOT);
        if (needle.length() < SEARCH_MIN_Q) return new SearchHitsDto(List.of(), false);

        ClusterIndexService.Index idx = index.index();
        Map<String, List<String>> clustersByRecipe = idx.clustersByRecipe();
        Map<String, String> layerByRecipe = layerByRecipe();

        // Recipes first, then tables; each name-ascending. Deterministic ordering is not cosmetic
        // — the same query must answer identically across restarts, the same guarantee
        // ClusterIndexService.clustersOf() makes for its own list.
        List<SearchHitsDto.HitDto> hits = new ArrayList<>();
        for (String recipe : new TreeSet<>(idx.runsByRecipe().keySet())) {
            if (!recipe.toLowerCase(Locale.ROOT).contains(needle)) continue;
            hits.add(new SearchHitsDto.HitDto("recipe", recipe,
                layerByRecipe.getOrDefault(recipe, UNKNOWN_LAYER),
                clustersByRecipe.getOrDefault(recipe, List.of())));
        }
        hits.addAll(tableHits(needle, clustersByRecipe));

        boolean truncated = hits.size() > limit;
        return new SearchHitsDto(List.copyOf(truncated ? hits.subList(0, limit) : hits), truncated);
    }

    /**
     * Table matches, each carrying the clusters of every recipe joined to it by an edge in either
     * direction — a table is reachable both from the recipe that writes it and from the ones that
     * read it, and an operator troubleshooting it wants all of them.
     */
    private List<SearchHitsDto.HitDto> tableHits(String needle, Map<String, List<String>> clustersByRecipe) {
        RelationshipsDto graph = relationships.graph();
        TableClusters joins = TableClusters.of(graph);

        Map<String, SearchHitsDto.HitDto> matched = new java.util.TreeMap<>();
        for (RelationshipsDto.NodeDto node : graph.nodes()) {
            if (!"table".equals(node.kind()) || node.name() == null) continue;
            if (!node.name().toLowerCase(Locale.ROOT).contains(needle)) continue;
            matched.putIfAbsent(node.name(), new SearchHitsDto.HitDto("table", node.name(),
                node.layer() == null || node.layer().isEmpty() ? UNKNOWN_LAYER : node.layer(),
                joins.clustersFor(node.id(), clustersByRecipe)));
        }
        return List.copyOf(matched.values());
    }

    private Map<String, String> layerByRecipe() {
        Map<String, String> out = new LinkedHashMap<>();
        for (LayerToLayerEntryDto entry : layerToLayer.entries()) {
            out.putIfAbsent(entry.recipe(), entry.layer());   // first match wins
        }
        return out;
    }
}
