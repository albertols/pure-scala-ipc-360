package io.pure360.etl360.service;

import io.pure360.etl360.config.DataRoots;
import io.pure360.etl360.config.Etl360Properties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class ClusterIndexServiceTest {

    private static final String HEADER = "cluster_name,recipe_filename,job_id,app_start_iso,"
        + "avg_job_duration_in_mins_sec,status,message\n";

    private static ClusterIndexService serviceOver(Path composerRoot) {
        Etl360Properties props = new Etl360Properties(
            "parser/src/main/resources/xmltobq", "does/not/exist",
            "does/not/exist-mock", composerRoot.toString(), null);
        return new ClusterIndexService(new B15Reader(new DataRoots(props)));
    }

    private static void day(Path root, String date, String... rows) throws Exception {
        Path dir = Files.createDirectories(root.resolve("dwh/config/cluster_tuning/inputs").resolve(date));
        Files.writeString(dir.resolve(B15Reader.B15_FILENAME), HEADER + String.join("\n", rows) + "\n");
    }

    @Test
    void groupsRecipesUnderTheirClusterAndCountsOkKo(@TempDir Path tmp) throws Exception {
        day(tmp, "2026_07_18",
            "cl-a,r1.json,j1,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,",
            "cl-a,r2.json,j2,2026-07-18T02:00:00.000Z,2m 0sec,FAILED,boom",
            "cl-b,r3.json,j3,2026-07-18T03:00:00.000Z,3m 0sec,SUCCESS,");

        var index = serviceOver(tmp).index();

        assertThat(index.byCluster()).containsOnlyKeys("cl-a", "cl-b");
        assertThat(index.byCluster().get("cl-a").recipes()).containsExactly("r1.json", "r2.json");
        assertThat(index.byCluster().get("cl-a").rows()).isEqualTo(2);
        assertThat(index.byCluster().get("cl-a").ok()).isEqualTo(1);
        assertThat(index.byCluster().get("cl-a").ko()).isEqualTo(1);
        assertThat(index.totals().clusters()).isEqualTo(2);
        assertThat(index.totals().recipes()).isEqualTo(3);
        assertThat(index.totals().rows()).isEqualTo(3);
    }

    @Test
    void dateIdxIndexesTheGlobalDateAxisRatherThanRepeatingIsoStrings(@TempDir Path tmp) throws Exception {
        day(tmp, "2026_07_18", "cl-a,r1.json,j1,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,");
        day(tmp, "2026_07_19", "cl-b,r2.json,j2,2026-07-19T01:00:00.000Z,1m 0sec,SUCCESS,");
        day(tmp, "2026_07_20", "cl-a,r1.json,j3,2026-07-20T01:00:00.000Z,1m 0sec,SUCCESS,");

        var index = serviceOver(tmp).index();

        assertThat(index.dates()).containsExactly("2026-07-18", "2026-07-19", "2026-07-20");
        assertThat(index.byCluster().get("cl-a").dateIdx()).containsExactly(0, 2);
        assertThat(index.byCluster().get("cl-b").dateIdx()).containsExactly(1);
    }

    @Test
    void runsForARecipeAreDateAscendingAndCarryJobIdAndStartTimestamp(@TempDir Path tmp) throws Exception {
        day(tmp, "2026_07_19", "cl-a,r1.json,j-19,2026-07-19T05:00:00.000Z,1m 30sec,SUCCESS,");
        day(tmp, "2026_07_18", "cl-a,r1.json,j-18,2026-07-18T04:00:00.000Z,2m 0sec,FAILED,boom");

        var runs = serviceOver(tmp).index().runsByRecipe().get("r1.json");

        assertThat(runs).hasSize(2);
        assertThat(runs.get(0).date()).isEqualTo("2026-07-18");
        assertThat(runs.get(0).jobId()).isEqualTo("j-18");
        assertThat(runs.get(0).status()).isEqualTo("FAILED");
        assertThat(runs.get(0).message()).isEqualTo("boom");
        assertThat(runs.get(1).appStartIso()).isEqualTo("2026-07-19T05:00:00.000Z");
        assertThat(runs.get(1).durationMin()).isEqualTo(1.5);
    }

    @Test
    void lastDateAndLastStatusComeFromTheMostRecentDate(@TempDir Path tmp) throws Exception {
        day(tmp, "2026_07_18", "cl-a,r1.json,j1,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,");
        day(tmp, "2026_07_19", "cl-a,r1.json,j2,2026-07-19T01:00:00.000Z,1m 0sec,FAILED,boom");

        var entry = serviceOver(tmp).index().byCluster().get("cl-a");

        assertThat(entry.lastDate()).isEqualTo("2026-07-19");
        assertThat(entry.lastStatus()).isEqualTo("FAILED");
    }

    @Test
    void anUnrecognizedStatusCountsAsNeitherOkNorKo(@TempDir Path tmp) throws Exception {
        day(tmp, "2026_07_18",
            "cl-a,r1.json,j1,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,",
            "cl-a,r2.json,j2,2026-07-18T02:00:00.000Z,,,");

        var entry = serviceOver(tmp).index().byCluster().get("cl-a");

        assertThat(entry.rows()).isEqualTo(2);
        assertThat(entry.ok()).isEqualTo(1);
        assertThat(entry.ko()).isZero();
    }

    @Test
    void theIndexIsCachedAndRebuiltWhenANewDateDirectoryAppears(@TempDir Path tmp) throws Exception {
        day(tmp, "2026_07_18", "cl-a,r1.json,j1,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,");
        ClusterIndexService service = serviceOver(tmp);

        var first = service.index();
        assertThat(service.index()).isSameAs(first);          // unchanged disk -> cache hit

        day(tmp, "2026_07_19", "cl-b,r2.json,j2,2026-07-19T01:00:00.000Z,1m 0sec,SUCCESS,");

        var second = service.index();
        assertThat(second).isNotSameAs(first);
        assertThat(second.totals().clusters()).isEqualTo(2);
    }

    @Test
    void recipesInAndClustersOfAreTheTwoJoinDirections(@TempDir Path tmp) throws Exception {
        day(tmp, "2026_07_18",
            "cl-a,r1.json,j1,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,",
            "cl-a,r2.json,j2,2026-07-18T02:00:00.000Z,1m 0sec,SUCCESS,",
            "cl-b,r3.json,j3,2026-07-18T03:00:00.000Z,1m 0sec,SUCCESS,");
        ClusterIndexService service = serviceOver(tmp);

        assertThat(service.recipesIn(java.util.List.of("cl-a"))).containsExactlyInAnyOrder("r1.json", "r2.json");
        assertThat(service.recipesIn(java.util.List.of("cl-a", "cl-b"))).hasSize(3);
        assertThat(service.recipesIn(java.util.List.of("nope"))).isEmpty();
        assertThat(service.clustersOf("r3.json")).containsExactly("cl-b");
        assertThat(service.clustersOf("unknown.json")).isEmpty();
    }

    /**
     * clustersOf()'s "name-ascending" contract, which nothing verified before: the pre-existing
     * recipesIn/clustersOf test only asserts a single-element result, which is ordered by
     * definition. The list ships as NodeDto.clusterNames on /api/relationships?clusters=, so a
     * per-run reordering would break response caching and diffing.
     *
     * <p>Two deliberate choices keep this test honest, and both must survive any refactor:
     *
     * <p>1. The rows are written in a SCRAMBLED order, so the expectation cannot be met by
     * accident. The guarantee now lives in build()'s TreeSet accumulator for
     * Index.clustersByRecipe; swap that TreeSet for a LinkedHashSet and this test must go red.
     * Alphabetical rows would let insertion order stand in for the sort and hide that.
     *
     * <p>2. The names are long and varied. clustersOf() used to scan Index.byCluster(), whose
     * Map.copyOf iteration order is a rotation of a fixed hash-derived order — so short keys whose
     * table order happens to BE alphabetical (e.g. "cl-a".."cl-j") let an unsorted implementation
     * pass roughly 1 run in 20, which is exactly what happened on the first attempt at this test.
     * These ten do not rotate to sorted order. Keep them if the scan ever comes back.
     */
    @Test
    void clustersOfIsNameAscendingForARecipeThatRanInManyClusters(@TempDir Path tmp) throws Exception {
        String[] clusters = {
            "cluster-wf-alpha-1001", "cluster-wf-bravo-2002", "cluster-wf-charlie-3003",
            "cluster-wf-delta-4004", "cluster-wf-echo-5005", "cluster-wf-foxtrot-6006",
            "cluster-wf-golf-7007", "cluster-wf-hotel-8008", "cluster-wf-india-9009",
            "cluster-wf-juliett-1010"};
        int[] scrambled = {6, 2, 9, 0, 7, 4, 1, 8, 3, 5};
        String[] rows = new String[clusters.length];
        for (int i = 0; i < scrambled.length; i++) {
            rows[i] = clusters[scrambled[i]] + ",shared.json,j" + i + ",2026-07-18T0" + i
                + ":00:00.000Z,1m 0sec,SUCCESS,";
        }
        day(tmp, "2026_07_18", rows);

        assertThat(serviceOver(tmp).clustersOf("shared.json")).containsExactly(clusters);
    }

    /**
     * clustersOf() is a lookup into a map built once, not a per-call scan of byCluster: that scan
     * re-entered index() — and therefore B15Reader.fingerprint(), a stat sweep over every dated
     * export — once per recipe on a scoped relationships request. Asserts the map directly, so the
     * inverse index is covered even if clustersOf() is ever reimplemented again.
     */
    @Test
    void clustersByRecipeIsABuildTimeInverseIndexWithNameAscendingValues(@TempDir Path tmp) throws Exception {
        day(tmp, "2026_07_18",
            "cl-zulu,shared.json,j1,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,",
            "cl-alpha,shared.json,j2,2026-07-18T02:00:00.000Z,1m 0sec,SUCCESS,",
            "cl-mike,shared.json,j3,2026-07-18T03:00:00.000Z,1m 0sec,SUCCESS,",
            "cl-zulu,solo.json,j4,2026-07-18T04:00:00.000Z,1m 0sec,SUCCESS,");
        ClusterIndexService service = serviceOver(tmp);

        var clustersByRecipe = service.index().clustersByRecipe();

        assertThat(clustersByRecipe).containsOnlyKeys("shared.json", "solo.json");
        // Written zulu, alpha, mike — comes back ascending, so this is the sort and not row order.
        assertThat(clustersByRecipe.get("shared.json")).containsExactly("cl-alpha", "cl-mike", "cl-zulu");
        assertThat(clustersByRecipe.get("solo.json")).containsExactly("cl-zulu");
        assertThat(service.clustersOf("shared.json")).containsExactly("cl-alpha", "cl-mike", "cl-zulu");
        assertThat(service.clustersOf("unknown.json")).isEmpty();
    }

    @Test
    void anAbsentComposerYieldsAnEmptyIndexRatherThanThrowing(@TempDir Path tmp) {
        var index = serviceOver(tmp.resolve("nothing-here")).index();

        assertThat(index.dates()).isEmpty();
        assertThat(index.byCluster()).isEmpty();
        assertThat(index.totals().rows()).isZero();
    }
}
