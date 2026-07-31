package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.OperationalSummaryDto;
import io.pure360.etl360.config.DataRoots;
import io.pure360.etl360.config.Etl360Properties;
import io.pure360.etl360.service.support.InvalidDateException;
import io.pure360.etl360.service.support.NotFoundException;
import org.junit.jupiter.api.Test;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

class OperationalServiceTest {
    private OperationalService service() {
        Path mockRoot = Path.of("src/test/resources/fixture-mock").toAbsolutePath();
        var props = new Etl360Properties("unused", "unused-dwh", mockRoot.toString(),
            mockRoot.resolve("nonexistent-composer").toString(),
            new Etl360Properties.Gcp("p", "r", "u1", "u2", "u3"));
        DataRoots roots = new DataRoots(props);
        return new OperationalService(roots, new LayerToLayerService(roots));
    }

    @Test
    void listsDatesIsoSorted() {
        assertThat(service().dates()).containsExactly("2026-07-01", "2026-07-02");
    }

    @Test
    void snapshotParsesQuotedCommasAndNullStatus() {
        var snap = service().snapshot("2026-07-01");
        assertThat(snap.rows()).hasSize(3);
        assertThat(snap.rows().get(1).message()).isEqualTo("Stage 4 failed, executor lost");
        assertThat(snap.rows().get(2).status()).isEmpty();
    }

    @Test
    void missingDateIs404WithOperatorMessage() {
        assertThatThrownBy(() -> service().snapshot("2026-07-15"))
            .isInstanceOf(NotFoundException.class)
            .hasMessageContaining("b15 CSV not present under inputs/2026_07_15")
            .hasMessageContaining("2026-07-02");   // nearest available date included
    }

    @Test
    void malformedDateIs400() {
        assertThatThrownBy(() -> service().snapshot("bogus"))
            .isInstanceOf(InvalidDateException.class);
    }

    @Test
    void parseDurationMinParsesMinutesAndSecondsElseNull() {
        assertThat(OperationalService.parseDurationMin("43m 31sec")).isCloseTo(43.516666, within(0.0001));
        assertThat(OperationalService.parseDurationMin("20m 00sec")).isEqualTo(20.0);
        assertThat(OperationalService.parseDurationMin("")).isNull();
        assertThat(OperationalService.parseDurationMin(null)).isNull();
        assertThat(OperationalService.parseDurationMin("garbage")).isNull();
    }

    @Test
    void nearestRankUsesCeilingOfPctTimesNOneIndexed() {
        List<Double> sortedAsc = List.of(10.0, 14.083333333333334);
        assertThat(OperationalService.nearestRank(sortedAsc, 50)).isEqualTo(10.0);
        assertThat(OperationalService.nearestRank(sortedAsc, 95)).isCloseTo(14.083333, within(0.0001));
    }

    @Test
    void summaryGroupsByRecipeAcrossDatesWithNearestRankPercentilesAndUnknownLayerFallback() {
        var summary = service().summary();
        assertThat(summary.dates()).containsExactly("2026-07-01", "2026-07-02");

        Map<String, OperationalSummaryDto.RecipeSummaryDto> byRecipe = summary.recipes().stream()
            .collect(Collectors.toMap(OperationalSummaryDto.RecipeSummaryDto::recipeFilename, Function.identity()));

        // Absent from the fixture LayerToLayer config -> UNKNOWN layer (the contract-tested fallback).
        var orders = byRecipe.get("_ETL_m_SYN_ODS_ORDERS.json");
        assertThat(orders).isNotNull();
        assertThat(orders.layer()).isEqualTo("UNKNOWN");
        assertThat(orders.history()).hasSize(2);
        assertThat(orders.p50DurationMin()).isCloseTo(10.0, within(0.01));
        assertThat(orders.p95DurationMin()).isCloseTo(14.083, within(0.01));
        assertThat(orders.avgDurationMin()).isCloseTo(12.04, within(0.01));

        // Present in the fixture LayerToLayer config (ODS/_ETL_m_FIXTURE.json) -> real layer, single history point.
        var fixture = byRecipe.get("_ETL_m_FIXTURE.json");
        assertThat(fixture).isNotNull();
        assertThat(fixture.layer()).isEqualTo("ODS");
        assertThat(fixture.okCount()).isEqualTo(1);
        assertThat(fixture.koCount()).isZero();
        assertThat(fixture.p50DurationMin()).isEqualTo(20.0);
        assertThat(fixture.p95DurationMin()).isEqualTo(20.0);
        assertThat(fixture.latestDate()).isEqualTo("2026-07-02");
        assertThat(fixture.lastJobId()).isEqualTo("application_1774840000002_0002");
        assertThat(fixture.lastClusterName()).isEqualTo("cluster-fix-01");

        // Null/blank status passes through raw ("" — not SUCCESS/FAILED) and doesn't count as OK or KO,
        // even though a duration is present and folds into the average.
        var dmSummary = byRecipe.get("_ETL_m_SYN_DM_ORDERS_SUMMARY.json");
        assertThat(dmSummary).isNotNull();
        assertThat(dmSummary.latestStatus()).isEmpty();
        assertThat(dmSummary.okCount()).isZero();
        assertThat(dmSummary.koCount()).isZero();
        assertThat(dmSummary.avgDurationMin()).isNotNull();
    }
}
