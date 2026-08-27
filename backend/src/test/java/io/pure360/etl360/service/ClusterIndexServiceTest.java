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
     * clustersOf() documents "name-ascending", but it iterates Index.byCluster(), which build()
     * hands to Map.copyOf — an immutable map whose iteration order is UNSPECIFIED and, on this
     * JDK, re-randomized per JVM run by ImmutableCollections.SALT. The pre-existing
     * recipesIn/clustersOf test only ever asserts a single-element result, which is ordered by
     * definition, so nothing caught it; /api/relationships?clusters= puts the list on the wire,
     * where a per-run reordering breaks caching and diffing.
     *
     * <p>The names are deliberate. MapN's iteration order is some rotation (forwards or backwards)
     * of a fixed, hash-derived table order, so short keys whose table order happens to BE
     * alphabetical (e.g. "cl-a".."cl-j") let an unsorted implementation pass ~1 run in 20. These
     * ten hash into a table order that is not a rotation of their sorted order, so no SALT value
     * can make the unsorted implementation pass.
     */
    @Test
    void clustersOfIsNameAscendingForARecipeThatRanInManyClusters(@TempDir Path tmp) throws Exception {
        String[] clusters = {
            "cluster-wf-alpha-1001", "cluster-wf-bravo-2002", "cluster-wf-charlie-3003",
            "cluster-wf-delta-4004", "cluster-wf-echo-5005", "cluster-wf-foxtrot-6006",
            "cluster-wf-golf-7007", "cluster-wf-hotel-8008", "cluster-wf-india-9009",
            "cluster-wf-juliett-1010"};
        String[] rows = new String[clusters.length];
        for (int i = 0; i < clusters.length; i++) {
            rows[i] = clusters[i] + ",shared.json,j" + i + ",2026-07-18T0" + i
                + ":00:00.000Z,1m 0sec,SUCCESS,";
        }
        day(tmp, "2026_07_18", rows);

        assertThat(serviceOver(tmp).clustersOf("shared.json")).containsExactly(clusters);
    }

    @Test
    void anAbsentComposerYieldsAnEmptyIndexRatherThanThrowing(@TempDir Path tmp) {
        var index = serviceOver(tmp.resolve("nothing-here")).index();

        assertThat(index.dates()).isEmpty();
        assertThat(index.byCluster()).isEmpty();
        assertThat(index.totals().rows()).isZero();
    }
}
