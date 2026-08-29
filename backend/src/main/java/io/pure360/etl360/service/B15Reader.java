package io.pure360.etl360.service;

import com.fasterxml.jackson.databind.MappingIterator;
import com.fasterxml.jackson.dataformat.csv.CsvMapper;
import com.fasterxml.jackson.dataformat.csv.CsvSchema;
import io.pure360.etl360.api.dto.B15RowDto;
import io.pure360.etl360.config.DataRoots;
import io.pure360.etl360.config.Etl360Properties;
import io.pure360.etl360.service.support.B15Status;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.FileTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * The b15 corpus on disk: where the dated CSVs are, which dates exist, and their parsed rows.
 *
 * <p>Parsing is cached per file on {@code (mtime, size)} — the same idiom {@link DomService} and
 * {@link SemanticModelService} use, and for the same reason: these are live working directories,
 * so a TTL would be both too eager and too lazy. Before this class, {@code
 * OperationalService.summary()} re-read every dated CSV from disk on every request.
 *
 * <p>{@link #fingerprint()} is the cheap change-detector {@link ClusterIndexService} rebuilds on:
 * a directory walk plus one stat per file, with no parsing.
 */
@Component
public class B15Reader {
    public static final String B15_FILENAME = "b15_application_end_with_recipe_null_status.csv";
    private static final Pattern DATE_DIR = Pattern.compile("\\d{4}_\\d{2}_\\d{2}");

    private record Cached(FileTime mtime, long size, List<B15RowDto> rows) {}

    private final DataRoots roots;
    private final B15Status status;
    private final CsvMapper csvMapper = new CsvMapper();
    private final Map<Path, Cached> cache = new ConcurrentHashMap<>();

    public B15Reader(DataRoots roots, Etl360Properties props) {
        this.roots = roots;
        this.status = props.b15().toStatus();
    }

    /**
     * The status vocabulary this reader canonicalises against — exposed so
     * {@code DiagnosticsService} can report the tokens it could not recognize, which is what
     * keeps a mislabelled PENDING card from being a silent failure. See ADR-0018.
     */
    public B15Status status() { return status; }

    public Optional<Path> inputsDir() {
        return roots.composer()
            .map(c -> c.resolve(DataRoots.COMPOSER_INPUTS))
            .filter(Files::isDirectory);
    }

    /** Ascending ISO dates for which a b15 CSV actually exists. An empty composer yields empty. */
    public List<String> dates() {
        List<String> out = new ArrayList<>();
        for (Path day : dayDirs()) out.add(day.getFileName().toString().replace('_', '-'));
        Collections.sort(out);
        return out;
    }

    public Optional<Path> csvFor(String isoDate) {
        return inputsDir()
            .map(dir -> dir.resolve(isoDate.replace('-', '_')).resolve(B15_FILENAME))
            .filter(Files::isRegularFile);
    }

    /** Parsed rows for one CSV, immutable and cached; re-parsed only when mtime or size changed. */
    public List<B15RowDto> rows(Path csv) {
        try {
            BasicFileAttributes attrs = Files.readAttributes(csv, BasicFileAttributes.class);
            Cached hit = cache.get(csv);
            if (hit != null && hit.mtime().equals(attrs.lastModifiedTime()) && hit.size() == attrs.size()) {
                return hit.rows();
            }
            List<B15RowDto> parsed = parse(csv);
            cache.put(csv, new Cached(attrs.lastModifiedTime(), attrs.size(), parsed));
            return parsed;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * A digest of every b15 file's path, mtime and size — stable across calls when nothing on disk
     * changed, different the moment a file or a whole date directory appears, disappears or is
     * rewritten. Parses nothing.
     *
     * <p>A file that disappears between {@link #dayDirs()} listing it and the stat below (a real
     * working directory, not a snapshot) is skipped rather than propagated: this runs on every
     * cluster-index request now, so a rare race must not turn into a live 500.
     */
    public String fingerprint() {
        StringBuilder sb = new StringBuilder();
        for (Path day : dayDirs()) {
            Path csv = day.resolve(B15_FILENAME);
            try {
                BasicFileAttributes a = Files.readAttributes(csv, BasicFileAttributes.class);
                sb.append(csv).append('|').append(a.lastModifiedTime().toMillis())
                  .append('|').append(a.size()).append('\n');
            } catch (IOException e) {
                // Raced away since dayDirs() listed it — skip, don't propagate.
            }
        }
        return sb.toString();
    }

    /** Date directories holding a real CSV, sorted by directory name (== chronological). */
    private List<Path> dayDirs() {
        Optional<Path> inputs = inputsDir();
        if (inputs.isEmpty()) return List.of();
        List<Path> out = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(inputs.get())) {
            for (Path p : stream) {
                if (DATE_DIR.matcher(p.getFileName().toString()).matches()
                    && Files.isRegularFile(p.resolve(B15_FILENAME))) {
                    out.add(p);
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        out.sort(Comparator.comparing(p -> p.getFileName().toString()));
        return out;
    }

    private List<B15RowDto> parse(Path csv) {
        try {
            CsvSchema schema = CsvSchema.emptySchema().withHeader();
            MappingIterator<Map<String, String>> it =
                csvMapper.readerFor(Map.class).with(schema).readValues(csv.toFile());
            List<B15RowDto> out = new ArrayList<>();
            for (Map<String, String> row : it.readAll()) {
                out.add(new B15RowDto(
                    cell(row, "cluster_name"), cell(row, "recipe_filename"), cell(row, "job_id"),
                    cell(row, "app_start_iso"), cell(row, "avg_job_duration_in_mins_sec"),
                    // Canonicalised HERE, at the ONE boundary, so ClusterIndexService,
                    // ClusterController, OperationalService and the frontend's STATUS_MAP all
                    // keep comparing exactly two literals and need no change. ADR-0018.
                    status.canonical(cell(row, "status")), cell(row, "message")));
            }
            return List.copyOf(out);
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
