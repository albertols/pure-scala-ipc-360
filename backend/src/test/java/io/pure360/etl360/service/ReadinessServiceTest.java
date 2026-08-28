package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.ReadinessDto;
import io.pure360.etl360.config.DataRoots;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.io.IOException;
import java.io.UncheckedIOException;

import static org.assertj.core.api.Assertions.assertThat;

/** Against the committed mock tier — the same floors the other contract tests assert. */
@SpringBootTest
class ReadinessServiceTest {
    @Autowired ReadinessService readiness;

    @Autowired CorpusService corpusService;
    @Autowired DiagnosticsService diagnosticsService;
    @Autowired LayerToLayerService layerToLayerService;
    @Autowired B15Reader b15Reader;
    @Autowired DataRoots dataRoots;

    @Test
    void reportsTheCommittedCorpusCounts() {
        ReadinessDto r = readiness.readiness();

        assertThat(r.corpus().xml()).isEqualTo(81);
        assertThat(r.corpus().recipes()).isEqualTo(86);
        assertThat(r.corpus().ddl()).isEqualTo(212);
        assertThat(r.corpus().layers()).contains("CDM", "DWH");
    }

    @Test
    void reportsTheCommittedOperationalTotals() {
        ReadinessDto r = readiness.readiness();

        assertThat(r.operational().clusters()).isEqualTo(21);
        assertThat(r.operational().recipes()).isEqualTo(30);
        assertThat(r.operational().days()).isEqualTo(14);
        assertThat(r.operational().rows()).isEqualTo(417);
    }

    /**
     * The one genuinely new number, and it must NOT come from the relationships graph.
     *
     * <p>22, not the design doc's 23: that number was a raw {@code grep} across every
     * {@code statements.sql} under the mock {@code LAYER_TO_LAYER/}, including {@code ARCHIVE/} —
     * a directory {@code LayerToLayerServiceTest} already documents as a deliberate decoy outside
     * the 8-directory vocabulary ({@code DEFAULT_LAYER_DIRS.doesNotContain("ARCHIVE")},
     * {@code entries()...doesNotContain("ARCHIVE")}). Counting from {@code entries()} — as this
     * task specifies — correctly excludes it, so 22 is what the specified computation actually
     * yields.
     */
    @Test
    void countsDistinctWorkflowsFromTheControlSchema() {
        assertThat(readiness.readiness().dags().workflows()).isEqualTo(22);
    }

    @Test
    void mirrorsTheDiagnosticsStatusRatherThanComputingASecondOpinion() {
        ReadinessDto r = readiness.readiness();

        assertThat(r.status()).isIn("ok", "degraded");
        assertThat(r.roots()).isNotEmpty();
        assertThat(r.roots().get(0).resolved()).isNotBlank();
    }

    /**
     * docs/ is present in this repo, so progress resolves — see ProgressScannerTest for null.
     *
     * <p>{@code adrs} floor is 15 (the count as of this task), not the plan's forward-looking 16 —
     * ADR-0016 doesn't exist until Task 11 writes it. tasksDone/tasksTotal are deliberately not
     * asserted to exact values: they change every time a plan checkbox is ticked, including by
     * this very task's commit.
     */
    @Test
    void carriesRepoSourcedProgress() {
        ReadinessDto.Progress p = readiness.readiness().progress();

        assertThat(p).isNotNull();
        assertThat(p.tasksTotal()).isGreaterThan(0);
        assertThat(p.tasksDone()).isLessThanOrEqualTo(p.tasksTotal());
        assertThat(p.adrs()).isGreaterThanOrEqualTo(15);
    }

    /** index() calls B15Reader.fingerprint(), a stat sweep per dated export (ADR-0014). */
    @Test
    void readsTheClusterIndexExactlyOncePerRequest() {
        class Counting extends ClusterIndexService {
            int calls = 0;
            Counting(B15Reader b15) { super(b15); }
            @Override public Index index() { calls++; return super.index(); }
        }
        Counting counting = new Counting(b15Reader);
        ReadinessService svc = new ReadinessService(corpusService, counting, diagnosticsService,
            layerToLayerService, new ProgressScanner(), dataRoots);

        svc.readiness();

        assertThat(counting.calls).isEqualTo(1);
    }

    /**
     * {@code ProgressScanner.read()} throws {@link UncheckedIOException} if a plan file is deleted
     * between the directory listing and the read. The landing page must never 500 for that — it
     * degrades to a null progress block, same as the "docs/ absent" path.
     */
    @Test
    void degradesToNullProgressWhenTheScannerThrows() {
        class Throwing extends ProgressScanner {
            @Override public Progress scan() {
                throw new UncheckedIOException(new IOException("plan file vanished mid-scan"));
            }
        }
        ReadinessService svc = new ReadinessService(corpusService, new ClusterIndexService(b15Reader),
            diagnosticsService, layerToLayerService, new Throwing(), dataRoots);

        ReadinessDto r = svc.readiness();

        assertThat(r.progress()).isNull();
    }
}
