package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.DiagnosticsDto;
import io.pure360.etl360.api.dto.LayerToLayerEntryDto;
import io.pure360.etl360.api.dto.ReadinessDto;
import io.pure360.etl360.api.dto.SummaryDto;
import io.pure360.etl360.config.DataRoots;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Assembles the landing page's single payload from services that already cache their work.
 *
 * <p>Three disciplines this class exists to hold:
 * <ol>
 *   <li>{@link ClusterIndexService#index()} is called <b>once</b> — it invokes
 *       {@code B15Reader.fingerprint()}, a stat sweep per dated export directory (ADR-0014).</li>
 *   <li>The DAG count comes from {@link LayerToLayerService#entries()}, not from the relationships
 *       graph. Tab 4 groups by {@code workflow} over the whole graph; counting that way here would
 *       pull the exact payload sub-project 10 exists to bound.</li>
 *   <li>{@link ProgressScanner#scan()} is guarded against any {@code RuntimeException}, not merely
 *       its two documented null paths — {@code ProgressScanner.read()} throws
 *       {@code UncheckedIOException} if a plan file is deleted between the directory listing and
 *       the read. The landing page is the first thing a new user sees; it must never 500 because a
 *       doc file moved.</li>
 * </ol>
 */
@Service
public class ReadinessService {
    private final CorpusService corpus;
    private final ClusterIndexService clusterIndex;
    private final DiagnosticsService diagnostics;
    private final LayerToLayerService layerToLayer;
    private final ProgressScanner progressScanner;
    private final DataRoots roots;

    public ReadinessService(CorpusService corpus, ClusterIndexService clusterIndex,
                            DiagnosticsService diagnostics, LayerToLayerService layerToLayer,
                            ProgressScanner progressScanner, DataRoots roots) {
        this.corpus = corpus;
        this.clusterIndex = clusterIndex;
        this.diagnostics = diagnostics;
        this.layerToLayer = layerToLayer;
        this.progressScanner = progressScanner;
        this.roots = roots;
    }

    public ReadinessDto readiness() {
        SummaryDto s = corpus.summary();
        ClusterIndexService.Totals t = clusterIndex.index().totals();   // ONCE — see class javadoc
        DiagnosticsDto d = diagnostics.report();

        Set<String> workflows = new LinkedHashSet<>();
        for (LayerToLayerEntryDto e : layerToLayer.entries()) {
            String wf = e.workflow();
            if (wf != null && !wf.isBlank()) workflows.add(wf.trim());
        }

        List<ReadinessDto.Root> rootList = new ArrayList<>();
        rootList.add(new ReadinessDto.Root("corpus", d.corpus().resolved(), d.corpus().tier(),
            d.corpus().status(), d.corpus().hint()));
        rootList.add(new ReadinessDto.Root("dwhControl", servingPath(d.dwhControl()),
            d.dwhControl().tier(), d.dwhControl().status(), d.dwhControl().hint()));
        rootList.add(new ReadinessDto.Root("composer", servingComposerPath(d),
            d.composer().tier(), d.composer().status(), d.composer().hint()));

        ReadinessDto.Progress progress = safeProgress();

        return new ReadinessDto(
            d.status(),
            new ReadinessDto.Corpus(s.xmlCount(), s.recipeCount(), s.ddlCount(), s.dirCount(), s.layers()),
            new ReadinessDto.Operational(t.clusters(), t.recipes(), t.dates(), t.rows(), roots.composerMode()),
            new ReadinessDto.Dags(workflows.size()),
            List.copyOf(rootList),
            progress);
    }

    /**
     * The path actually READ, never the configured string echoed back: for a mock-served control
     * schema, {@code resolvedReal} is the tier that LOST and is not being scanned at all. Mirrors
     * {@code DataRootsPanel.tsx}'s {@code servingPath()} on the frontend — one branch, not
     * re-derived a second time on either side.
     */
    private static String servingPath(DiagnosticsDto.ControlSchema control) {
        return "mock".equals(control.tier()) ? control.mockPath() : control.resolvedReal();
    }

    /**
     * Same discipline as {@link #servingPath(DiagnosticsDto.ControlSchema)}, but composer has no
     * {@code ControlSchema}-shaped DTO to branch on — it is a plain {@code RootStatus} whose
     * {@code resolved} field is always the configured (real) path, regardless of which tier
     * served. {@link DataRoots#composer()} is the one place that already picked the winning tier
     * (real, then mock, then absent) via the same usability probe {@code composerMode()} uses, so
     * defer to it rather than re-deriving the branch here; only when neither tier is usable
     * (composer absent) does this fall back to the configured path {@code diagnostics} reports.
     */
    private String servingComposerPath(DiagnosticsDto d) {
        return roots.composer().map(Path::toString).orElseGet(() -> d.composer().resolved());
    }

    /**
     * Never lets a {@code ProgressScanner} failure reach the caller. {@link ProgressScanner#scan()}
     * already returns null for its two documented "cannot determine" paths, but a plan file
     * deleted mid-scan throws {@code UncheckedIOException} instead — that and any other runtime
     * failure degrade to null here rather than turning the whole landing page into a 500.
     */
    private ReadinessDto.Progress safeProgress() {
        ProgressScanner.Progress p;
        try {
            p = progressScanner.scan();
        } catch (RuntimeException e) {
            return null;
        }
        return p == null ? null : new ReadinessDto.Progress(p.tasksDone(), p.tasksTotal(), p.adrs());
    }
}
