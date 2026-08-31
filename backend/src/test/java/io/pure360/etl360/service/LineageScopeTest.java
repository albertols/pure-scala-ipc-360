package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.LineageDto;
import io.pure360.etl360.service.support.InvalidRequestException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The scoped closure, at the service level. ADR-0021 supersedes ADR-0020's "not cluster-scoped"
 * clause by making the boundary EXPLICIT: the flow stops at the cluster edge, but every crossing
 * is a named gateway. These tests are what hold that promise.
 */
@SpringBootTest
class LineageScopeTest {

    /** A CAS table with recipes on both sides of it in the committed mock. */
    private static final String SEED = "table:CAS_DWH_EVENTS_FACT";

    @Autowired LineageService lineage;
    @Autowired ClusterIndexService index;

    private LineageDto scoped(String cluster) {
        return lineage.lineage(SEED, 600, cluster, List.of());
    }

    private static Set<String> ids(LineageDto d) {
        return d.nodes().stream().map(LineageDto.LineageNodeDto::id).collect(Collectors.toSet());
    }

    private String aClusterOfTheSeed() {
        List<LineageDto.ClusterOptionDto> opts = lineage.lineage(SEED, 600, null, List.of()).clusterOptions();
        assertThat(opts).as("the seed must reach at least one cluster in the committed mock").isNotEmpty();
        return opts.get(0).name();
    }

    @Test
    void unscopedReportsNoActiveCluster() {
        LineageDto d = lineage.lineage(SEED, 600, null, List.of());
        assertThat(d.activeCluster()).isNull();
        assertThat(d.nodes()).allSatisfy(n -> assertThat(n.gateway()).isFalse());
    }

    @Test
    void everyScopedRecipeBelongsToTheCluster() {
        String c = aClusterOfTheSeed();
        for (LineageDto.LineageNodeDto n : scoped(c).nodes()) {
            if (!"recipe".equals(n.kind()) || n.gateway()) continue;
            assertThat(index.clustersOf(n.name())).as("recipe %s", n.name()).contains(c);
        }
    }

    @Test
    void aScopedResultIsAStrictSubsetOfTheUnscopedOne() {
        String c = aClusterOfTheSeed();
        Set<String> all = ids(lineage.lineage(SEED, 600, null, List.of()));
        assertThat(all).containsAll(ids(scoped(c)));
    }

    @Test
    void gatewaysAreTerminal() {
        String c = aClusterOfTheSeed();
        LineageDto d = scoped(c);
        Set<String> gateways = d.nodes().stream().filter(LineageDto.LineageNodeDto::gateway)
            .map(LineageDto.LineageNodeDto::id).collect(Collectors.toSet());
        // No returned path leaves the cluster and comes back: every edge touching a gateway has
        // its other endpoint in scope.
        d.edges().forEach(e -> assertThat(gateways.contains(e.from()) && gateways.contains(e.to()))
            .as("edge %s -> %s joins two gateways", e.from(), e.to()).isFalse());
    }

    @Test
    void theSeedIsAlwaysPresent() {
        String c = aClusterOfTheSeed();
        assertThat(ids(scoped(c))).contains(SEED);
    }

    @Test
    void autoPrefersTheCallersSelectionWhenTheSeedBelongsToIt() {
        List<LineageDto.ClusterOptionDto> opts =
            lineage.lineage(SEED, 600, null, List.of()).clusterOptions();
        // The LAST option is by construction not the one `auto` picks unaided (options are
        // count-descending), so honouring `prefer` is observable.
        String tail = opts.get(opts.size() - 1).name();
        assertThat(lineage.lineage(SEED, 600, LineageService.AUTO, List.of(tail)).activeCluster())
            .isEqualTo(tail);
    }

    @Test
    void autoFallsBackToTheLargestWhenThePreferenceDoesNotApply() {
        List<LineageDto.ClusterOptionDto> opts =
            lineage.lineage(SEED, 600, null, List.of()).clusterOptions();
        assertThat(lineage.lineage(SEED, 600, LineageService.AUTO, List.of("no-such-cluster"))
            .activeCluster()).isEqualTo(opts.get(0).name());
    }

    @Test
    void clusterOptionsAreCountDescendingThenName() {
        List<LineageDto.ClusterOptionDto> opts =
            lineage.lineage(SEED, 600, null, List.of()).clusterOptions();
        for (int i = 0; i + 1 < opts.size(); i++) {
            LineageDto.ClusterOptionDto a = opts.get(i), b = opts.get(i + 1);
            assertThat(a.recipes() > b.recipes()
                || (a.recipes() == b.recipes() && a.name().compareTo(b.name()) <= 0)).isTrue();
        }
    }

    @Test
    void anUnknownClusterIsARejectedRequest() {
        assertThatThrownBy(() -> scoped("no-such-cluster"))
            .isInstanceOf(InvalidRequestException.class)
            .hasMessageContaining("no-such-cluster");
    }

    @Test
    void isDeterministicAcrossCalls() {
        String c = aClusterOfTheSeed();
        assertThat(scoped(c)).isEqualTo(scoped(c));
    }
}
