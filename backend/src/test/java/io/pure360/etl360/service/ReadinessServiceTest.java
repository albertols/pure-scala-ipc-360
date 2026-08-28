package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.DiagnosticsDto;
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

    /**
     * ADR-0013: the roots panel must report the path actually READ, never the configured string
     * echoed back. {@code DiagnosticsService} already distinguishes {@code resolvedReal} (unused
     * once the mock tier wins) from {@code mockPath} (what {@code LayerToLayerService} actually
     * scans) — {@code ReadinessService} must pick between them by {@code tier}, exactly as
     * {@code DataRootsPanel.tsx}'s {@code servingPath()} does on the frontend, rather than
     * hard-wiring {@code resolvedReal} regardless of which tier won.
     *
     * <p>This repo's committed test environment has no usable {@code DWH_CONTROL/LAYER_TO_LAYER/}
     * (that directory tree is git-ignored — see root CLAUDE.md), so the control schema always
     * resolves to the mock tier here; the assertion on {@code tier()} pins that precondition so a
     * future change to the test fixtures that flips the tier fails loudly instead of silently
     * asserting nothing.
     */
    @Test
    void reportsTheMockPathForDwhControlWhenTheMockTierWon() {
        DiagnosticsDto.ControlSchema control = diagnosticsService.report().dwhControl();
        assertThat(control.tier()).isEqualTo("mock");

        ReadinessDto.Root dwhControlRoot = readiness.readiness().roots().stream()
            .filter(root -> "dwhControl".equals(root.name()))
            .findFirst().orElseThrow();

        assertThat(dwhControlRoot.resolved()).isEqualTo(control.mockPath());
        assertThat(dwhControlRoot.resolved()).isNotEqualTo(control.resolvedReal());
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
