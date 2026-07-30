package io.pure360.etl360.service;

import com.fasterxml.jackson.databind.MappingIterator;
import com.fasterxml.jackson.dataformat.csv.CsvMapper;
import com.fasterxml.jackson.dataformat.csv.CsvSchema;
import io.pure360.etl360.api.dto.B15RowDto;
import io.pure360.etl360.api.dto.OperationalSnapshotDto;
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
import java.util.List;
import java.util.Map;
import java.util.Optional;
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

    private final DataRoots roots;
    private final CsvMapper csvMapper = new CsvMapper();

    public OperationalService(DataRoots roots) { this.roots = roots; }

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
