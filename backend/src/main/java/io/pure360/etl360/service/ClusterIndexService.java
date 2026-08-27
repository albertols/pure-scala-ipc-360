package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.B15RowDto;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Indexes the whole committed b15 history once, so the cluster pane, the calendar, the run picker
 * and the scoped relationships graph share one walk instead of four.
 *
 * <p>Cached whole and invalidated by {@link B15Reader#fingerprint()} rather than a TTL: a new dated
 * export appears without a restart, and an unchanged directory costs one stat per file. Building it
 * is O(total rows) and happens on the first request after any change.
 *
 * <p>Resolves <b>no layers</b>. A recipe's layer is an L2L fact; joining it here would couple a pure
 * function of the b15 files to the control schema. {@code ClusterController} performs that join.
 */
@Service
public class ClusterIndexService {

    /** One b15 row, resolved. {@code durationMin} is null when the duration cell is unparseable. */
    public record RunEntry(String date, String clusterName, String recipeFilename, String jobId,
                           String appStartIso, Double durationMin, String status, String message) {}

    /** {@code dateIdx} indexes {@link Index#dates()}; {@code recipes} is name-ascending. */
    public record ClusterEntry(String name, List<Integer> dateIdx, List<String> recipes,
                               int rows, int ok, int ko, String lastDate, String lastStatus) {}

    /** No table count: b15 knows nothing about tables, and inventing one here would be a lie. */
    public record Totals(int clusters, int recipes, int dates, int rows) {}

    public record Index(List<String> dates, Map<String, ClusterEntry> byCluster,
                        Map<String, List<RunEntry>> runsByRecipe, Totals totals) {}

    private static final String OK = "SUCCESS";
    private static final String KO = "FAILED";

    private final B15Reader b15;
    private volatile String fingerprint;
    private volatile Index cached;

    public ClusterIndexService(B15Reader b15) {
        this.b15 = b15;
    }

    public Index index() {
        String fp = b15.fingerprint();
        Index hit = cached;
        if (hit != null && fp.equals(fingerprint)) return hit;
        synchronized (this) {
            if (cached != null && fp.equals(fingerprint)) return cached;
            Index built = build();
            cached = built;
            fingerprint = fp;
            return built;
        }
    }

    /** Every recipe filename that ran in any of {@code clusterNames}. Unknown names contribute none. */
    public Set<String> recipesIn(Collection<String> clusterNames) {
        Map<String, ClusterEntry> byCluster = index().byCluster();
        Set<String> out = new LinkedHashSet<>();
        for (String name : clusterNames) {
            ClusterEntry entry = byCluster.get(name);
            if (entry != null) out.addAll(entry.recipes());
        }
        return out;
    }

    /**
     * The clusters a recipe has run in, name-ascending. Empty for a recipe absent from b15.
     *
     * <p>The sort is not cosmetic and cannot be dropped in favour of build()'s TreeMap ordering:
     * {@link #build()} hands {@code byCluster} to {@code Map.copyOf}, whose iteration order is
     * unspecified and, on this JDK, re-randomized per JVM run. This list goes on the wire as
     * {@code NodeDto.clusterNames}, so without sorting here the same request would answer
     * differently across restarts.
     */
    public List<String> clustersOf(String recipeFilename) {
        List<String> out = new ArrayList<>();
        for (ClusterEntry entry : index().byCluster().values()) {
            if (entry.recipes().contains(recipeFilename)) out.add(entry.name());
        }
        out.sort(Comparator.naturalOrder());
        return List.copyOf(out);
    }

    private Index build() {
        List<String> dates = b15.dates();

        // Accumulators. TreeMap so clusters come out name-ascending deterministically, matching
        // OperationalService.summary()'s sorted-recipes contract.
        Map<String, Set<Integer>> dateIdxByCluster = new TreeMap<>();
        Map<String, Set<String>> recipesByCluster = new TreeMap<>();
        Map<String, int[]> countsByCluster = new TreeMap<>();          // [rows, ok, ko]
        Map<String, String> lastDateByCluster = new TreeMap<>();
        Map<String, String> lastStatusByCluster = new TreeMap<>();
        Map<String, List<RunEntry>> runsByRecipe = new LinkedHashMap<>();
        Set<String> allRecipes = new LinkedHashSet<>();
        int rowTotal = 0;

        for (int i = 0; i < dates.size(); i++) {
            String date = dates.get(i);
            Path csv = b15.csvFor(date).orElse(null);
            if (csv == null) continue;                                  // raced away since dates()
            for (B15RowDto row : b15.rows(csv)) {
                rowTotal++;
                String cluster = row.clusterName();
                String recipe = row.recipeFilename();
                allRecipes.add(recipe);

                dateIdxByCluster.computeIfAbsent(cluster, k -> new LinkedHashSet<>()).add(i);
                recipesByCluster.computeIfAbsent(cluster, k -> new java.util.TreeSet<>()).add(recipe);
                int[] counts = countsByCluster.computeIfAbsent(cluster, k -> new int[3]);
                counts[0]++;
                if (OK.equals(row.status())) counts[1]++;
                else if (KO.equals(row.status())) counts[2]++;
                // dates ascending -> last write wins == the most recent date the cluster ran
                lastDateByCluster.put(cluster, date);
                lastStatusByCluster.put(cluster, row.status());

                runsByRecipe.computeIfAbsent(recipe, k -> new ArrayList<>()).add(new RunEntry(
                    date, cluster, recipe, row.jobId(), row.appStartIso(),
                    OperationalService.parseDurationMin(row.avgJobDurationInMinsSec()),
                    row.status(), row.message()));
            }
        }

        Map<String, ClusterEntry> byCluster = new LinkedHashMap<>();
        for (String cluster : recipesByCluster.keySet()) {
            int[] counts = countsByCluster.get(cluster);
            byCluster.put(cluster, new ClusterEntry(
                cluster,
                List.copyOf(dateIdxByCluster.get(cluster)),
                List.copyOf(recipesByCluster.get(cluster)),
                counts[0], counts[1], counts[2],
                lastDateByCluster.get(cluster), lastStatusByCluster.get(cluster)));
        }

        Map<String, List<RunEntry>> runs = new LinkedHashMap<>();
        runsByRecipe.forEach((recipe, list) -> runs.put(recipe, List.copyOf(list)));

        return new Index(dates, Map.copyOf(byCluster), Map.copyOf(runs),
            new Totals(byCluster.size(), allRecipes.size(), dates.size(), rowTotal));
    }
}
