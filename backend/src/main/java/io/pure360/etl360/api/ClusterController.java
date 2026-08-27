package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.ClusterDetailDto;
import io.pure360.etl360.api.dto.ClusterIndexDto;
import io.pure360.etl360.api.dto.LayerToLayerEntryDto;
import io.pure360.etl360.config.DataRoots;
import io.pure360.etl360.service.ClusterIndexService;
import io.pure360.etl360.service.LayerToLayerService;
import io.pure360.etl360.service.support.NotFoundException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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
    private final DataRoots roots;

    public ClusterController(ClusterIndexService index, LayerToLayerService layerToLayer, DataRoots roots) {
        this.index = index;
        this.layerToLayer = layerToLayer;
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

        List<ClusterDetailDto.RecipeInClusterDto> recipes = new ArrayList<>();
        for (String recipe : entry.recipes()) {
            List<ClusterIndexService.RunEntry> runs = idx.runsByRecipe().getOrDefault(recipe, List.of());
            List<Integer> dateIdx = runs.stream()
                .filter(r -> name.equals(r.clusterName()))
                .map(r -> idx.dates().indexOf(r.date()))
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

    private Map<String, String> layerByRecipe() {
        Map<String, String> out = new LinkedHashMap<>();
        for (LayerToLayerEntryDto entry : layerToLayer.entries()) {
            out.putIfAbsent(entry.recipe(), entry.layer());   // first match wins
        }
        return out;
    }
}
