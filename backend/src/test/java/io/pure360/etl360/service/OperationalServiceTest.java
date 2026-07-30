package io.pure360.etl360.service;

import io.pure360.etl360.config.DataRoots;
import io.pure360.etl360.config.Etl360Properties;
import io.pure360.etl360.service.support.InvalidDateException;
import io.pure360.etl360.service.support.NotFoundException;
import org.junit.jupiter.api.Test;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OperationalServiceTest {
    private OperationalService service() {
        Path mockRoot = Path.of("src/test/resources/fixture-mock").toAbsolutePath();
        var props = new Etl360Properties("unused", "unused-dwh", mockRoot.toString(),
            mockRoot.resolve("nonexistent-composer").toString(),
            new Etl360Properties.Gcp("p", "r", "u1", "u2", "u3"));
        return new OperationalService(new DataRoots(props));
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
}
