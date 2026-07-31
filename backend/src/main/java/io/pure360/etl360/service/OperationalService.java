package io.pure360.etl360.service;

import com.fasterxml.jackson.databind.MappingIterator;
import com.fasterxml.jackson.dataformat.csv.CsvMapper;
import com.fasterxml.jackson.dataformat.csv.CsvSchema;
import io.pure360.etl360.api.dto.B15RowDto;
import io.pure360.etl360.api.dto.LayerToLayerEntryDto;
import io.pure360.etl360.api.dto.OperationalSnapshotDto;
import io.pure360.etl360.api.dto.OperationalSummaryDto;
import io.pure360.etl360.api.dto.OperationalSummaryDto.HistoryEntryDto;
import io.pure360.etl360.api.dto.OperationalSummaryDto.RecipeSummaryDto;
import io.pure360.etl360.config.DataRoots;
import io.pure360.etl360.service.support.InvalidDateException;
import io.pure360.etl360.service.support.NotFoundException;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads dated b15 "application end" CSV snapshots from
 * {@code <composer>/dwh/config/cluster_tuning/inputs/<YYYY_MM_DD>/}. The composer root itself
 * is resolved through {@link DataRoots#composer()} (real/mock/absent fallback); when composer
 * is absent entirely, {@link #dates()} returns an empty list and {@link #snapshot(String)}
 * reports "Nearest available: none".
 */
@Service
public class OperationalService {
    private static final String B15_FILENAME = "b15_application_end_with_recipe_null_status.csv";
    private static final Pattern DATE_DIR = Pattern.compile("\\d{4}_\\d{2}_\\d{2}");
    private static final Pattern DURATION = Pattern.compile("(\\d+)m\\s+(\\d+)sec");
    private static final String UNKNOWN_LAYER = "UNKNOWN";

    private final DataRoots roots;
    private final LayerToLayerService layerToLayer;
    private final CsvMapper csvMapper = new CsvMapper();

    public OperationalService(DataRoots roots, LayerToLayerService layerToLayer) {
        this.roots = roots;
        this.layerToLayer = layerToLayer;
    }

    public List<String> dates() {
        Optional<Path> inputs = inputsDir();
        if (inputs.isEmpty()) return List.of();
        List<String> out = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(inputs.get())) {
            for (Path p : stream) {
                String name = p.getFileName().toString();
                if (DATE_DIR.matcher(name).matches() && Files.isRegularFile(p.resolve(B15_FILENAME))) {
                    out.add(name.replace('_', '-'));
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        Collections.sort(out);
        return out;
    }

    public OperationalSnapshotDto snapshot(String isoDate) {
        LocalDate date;
        try {
            date = LocalDate.parse(isoDate);
        } catch (DateTimeParseException e) {
            throw new InvalidDateException("Invalid date '" + isoDate + "' — expected YYYY-MM-DD");
        }
        String underscored = isoDate.replace('-', '_');
        Path csv = inputsDir().map(dir -> dir.resolve(underscored).resolve(B15_FILENAME)).orElse(null);
        if (csv == null || !Files.isRegularFile(csv)) {
            throw new NotFoundException("No operational snapshot for " + isoDate
                + " — b15 CSV not present under inputs/" + underscored + "/. Nearest available: "
                + nearestAvailable(date));
        }
        return new OperationalSnapshotDto(isoDate, parseCsv(csv));
    }

    /**
     * Aggregates the full committed b15 history ({@link #dates()}, mode-aware via the same
     * {@link DataRoots} resolution as everything else in this service) by recipe. History is one
     * entry per date the recipe appears, in ascending date order; {@code layer} is resolved from
     * the first {@link LayerToLayerService} entry matching the recipe filename, or {@code
     * "UNKNOWN"} when the recipe isn't configured there (e.g. b15 rows that predate/outrun L2L
     * coverage). Percentile/average stats are computed over parsed, non-null durations only —
     * an all-null duration set yields null stats rather than a divide-by-zero or a fabricated 0.
     */
    public OperationalSummaryDto summary() {
        List<String> ds = dates();
        Map<String, List<HistoryEntryDto>> historyByRecipe = new LinkedHashMap<>();
        Map<String, B15RowDto> latestRowByRecipe = new LinkedHashMap<>();
        Map<String, String> latestDateByRecipe = new LinkedHashMap<>();
        for (String date : ds) {
            for (B15RowDto row : snapshot(date).rows()) {
                String recipe = row.recipeFilename();
                historyByRecipe.computeIfAbsent(recipe, k -> new ArrayList<>())
                    .add(new HistoryEntryDto(date, row.status(), parseDurationMin(row.avgJobDurationInMinsSec())));
                latestRowByRecipe.put(recipe, row);       // dates() is ascending -> last write wins == max date
                latestDateByRecipe.put(recipe, date);
            }
        }

        Map<String, String> layerByRecipe = new LinkedHashMap<>();
        for (LayerToLayerEntryDto entry : layerToLayer.entries()) {
            layerByRecipe.putIfAbsent(entry.recipe(), entry.layer());   // first match wins
        }

        List<RecipeSummaryDto> recipes = new ArrayList<>();
        for (var e : historyByRecipe.entrySet()) {
            String recipe = e.getKey();
            List<HistoryEntryDto> history = e.getValue();
            int okCount = 0, koCount = 0;
            for (HistoryEntryDto h : history) {
                if ("SUCCESS".equals(h.status())) okCount++;
                else if ("FAILED".equals(h.status())) koCount++;
            }
            List<Double> durations = history.stream().map(HistoryEntryDto::durationMin)
                .filter(Objects::nonNull).sorted().toList();
            Double avg = durations.isEmpty() ? null
                : durations.stream().mapToDouble(Double::doubleValue).average().orElseThrow();
            Double p50 = durations.isEmpty() ? null : nearestRank(durations, 50);
            Double p95 = durations.isEmpty() ? null : nearestRank(durations, 95);
            B15RowDto lastRow = latestRowByRecipe.get(recipe);
            recipes.add(new RecipeSummaryDto(recipe, layerByRecipe.getOrDefault(recipe, UNKNOWN_LAYER),
                latestDateByRecipe.get(recipe), lastRow.status(), okCount, koCount, history,
                avg, p50, p95, lastRow.jobId(), lastRow.clusterName()));
        }
        recipes.sort(Comparator.comparing(RecipeSummaryDto::recipeFilename));
        return new OperationalSummaryDto(ds, recipes);
    }

    /** Parses the b15 "&lt;m&gt;m &lt;ss&gt;sec" duration cell into minutes as a double, e.g.
     * "43m 31sec" -&gt; 43.51(6). Returns null for null/blank/unrecognized input rather than
     * throwing — malformed durations should drop out of the average/percentile pool, not fail
     * the whole summary. */
    static Double parseDurationMin(String v) {
        if (v == null) return null;
        Matcher m = DURATION.matcher(v.trim());
        if (!m.matches()) return null;
        int minutes = Integer.parseInt(m.group(1));
        int seconds = Integer.parseInt(m.group(2));
        return minutes + seconds / 60.0;
    }

    /** Nearest-rank percentile: the {@code ceil(pct/100 * n)}-th smallest of {@code sortedAsc}
     * (1-indexed), clamped to [1, n]. Caller guarantees a non-empty, ascending-sorted list. */
    static double nearestRank(List<Double> sortedAsc, int pct) {
        int n = sortedAsc.size();
        int rank = (int) Math.ceil(pct / 100.0 * n);
        rank = Math.max(1, Math.min(rank, n));
        return sortedAsc.get(rank - 1);
    }

    private String nearestAvailable(LocalDate date) {
        String best = null;
        long bestDist = Long.MAX_VALUE;
        for (String iso : dates()) {
            LocalDate d = LocalDate.parse(iso);
            long dist = Math.abs(ChronoUnit.DAYS.between(date, d));
            if (dist < bestDist || (dist == bestDist && best != null && d.isBefore(LocalDate.parse(best)))) {
                bestDist = dist;
                best = iso;
            }
        }
        return best == null ? "none" : best;
    }

    private Optional<Path> inputsDir() {
        return roots.composer()
            .map(c -> c.resolve("dwh/config/cluster_tuning/inputs"))
            .filter(Files::isDirectory);
    }

    private List<B15RowDto> parseCsv(Path csv) {
        try {
            CsvSchema schema = CsvSchema.emptySchema().withHeader();
            MappingIterator<Map<String, String>> it = csvMapper.readerFor(Map.class).with(schema).readValues(csv.toFile());
            List<B15RowDto> out = new ArrayList<>();
            for (Map<String, String> row : it.readAll()) {
                out.add(new B15RowDto(
                    cell(row, "cluster_name"), cell(row, "recipe_filename"), cell(row, "job_id"),
                    cell(row, "app_start_iso"), cell(row, "avg_job_duration_in_mins_sec"),
                    cell(row, "status"), cell(row, "message")));
            }
            return out;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Missing/absent cells (short rows without trailing commas) map to null in the CsvMapper
     * result; normalize those — and any nulls — to empty string, matching present-but-empty cells. */
    private static String cell(Map<String, String> row, String key) {
        String v = row.get(key);
        return v == null ? "" : v;
    }
}
