package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.DiagnosticsDto;
import io.pure360.etl360.config.DataRoots;
import io.pure360.etl360.config.Etl360Properties;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Answers "why is this tab empty?" by re-walking the control schema the way
 * {@link LayerToLayerService} does, but recording what it saw at every step instead of only the
 * rows that survived.
 *
 * <p>It deliberately does NOT reuse {@code LayerToLayerService}'s cached entries: the whole point
 * is to observe the steps *before* the surviving rows — which directories exist, which files were
 * opened, how many statements matched the anchor — because a zero at each of those steps has a
 * different cause and a different fix. It shares the vocabulary and the tier resolution with that
 * service (never its own copy) so the report can never describe a scan different from the real one.
 */
@Service
public class DiagnosticsService {
    /** {@code INSERT INTO <identifier> VALUES}, used to report what the files actually target. */
    private static final Pattern INSERT_TARGET =
        Pattern.compile("INSERT\\s+INTO\\s+([A-Za-z0-9_.$\"`\\[\\]-]+)\\s+VALUES", Pattern.CASE_INSENSITIVE);
    private static final String STATEMENTS_FILE = "statements.sql";

    private final Etl360Properties props;
    private final DataRoots roots;
    private final CorpusService corpus;
    private final OperationalService operational;
    private final LayerToLayerService layerToLayer;

    public DiagnosticsService(Etl360Properties props, DataRoots roots, CorpusService corpus,
                              OperationalService operational, LayerToLayerService layerToLayer) {
        this.props = props;
        this.roots = roots;
        this.corpus = corpus;
        this.operational = operational;
        this.layerToLayer = layerToLayer;
    }

    public DiagnosticsDto report() {
        DiagnosticsDto.RootStatus corpusStatus = corpusStatus();
        DiagnosticsDto.ControlSchema controlSchema = controlSchema();
        DiagnosticsDto.RootStatus composerStatus = composerStatus();
        boolean allOk = "ok".equals(corpusStatus.status())
            && "ok".equals(controlSchema.status())
            && "ok".equals(composerStatus.status());
        return new DiagnosticsDto(allOk ? "ok" : "ko", corpusStatus, controlSchema, composerStatus);
    }

    // --- corpus -------------------------------------------------------------------------------

    private DiagnosticsDto.RootStatus corpusStatus() {
        Path resolved = props.resolvedCorpusRoot();
        boolean exists = Files.isDirectory(resolved);
        int xml = exists ? corpus.xmlCount() : 0;
        int recipes = exists ? corpus.recipeCount() : 0;
        boolean ok = exists && (xml > 0 || recipes > 0);
        String hint;
        if (!exists) {
            hint = "Directory does not exist — set xmltobqPath in config.json to your Powermart export root.";
        } else if (!ok) {
            hint = "Directory exists but holds no .xml/.XML and no _ETL_*.json — is this the export root itself, "
                + "or a level above it?";
        } else if (recipes == 0) {
            hint = xml + " XML(s) but no _ETL_*.json recipes — Tab 1 works, Tab 2 needs a parser run "
                + "(see HOW_TO_RUN_ON_YOUR_DATA.md §4).";
        } else {
            hint = "";
        }
        return new DiagnosticsDto.RootStatus("corpus", props.corpusRoot(), resolved.toString(), exists,
            null, exists ? "real" : "absent", ok ? "ok" : "ko", hint,
            Map.of("xml", xml, "recipes", recipes));
    }

    // --- composer (b15 run history) -----------------------------------------------------------

    private DiagnosticsDto.RootStatus composerStatus() {
        Path resolved = props.resolvedComposerRoot();
        boolean exists = Files.isDirectory(resolved);
        String tier = roots.composerMode();
        int dates = "absent".equals(tier) ? 0 : operational.dates().size();
        boolean ok = !"absent".equals(tier) && dates > 0;
        String hint;
        if ("absent".equals(tier)) {
            hint = "No " + DataRoots.COMPOSER_INPUTS + "/ under " + resolved
                + " — set composerRoot to the directory that CONTAINS that chain.";
        } else if (dates == 0) {
            hint = "Tier " + tier + " resolved but holds no date directories of b15 CSVs.";
        } else {
            hint = "";
        }
        return new DiagnosticsDto.RootStatus("composer", props.composerRoot(), resolved.toString(), exists,
            DataRoots.COMPOSER_INPUTS, tier, ok ? "ok" : "ko", hint, Map.of("dates", dates));
    }

    // --- control schema (relationships) -------------------------------------------------------

    private DiagnosticsDto.ControlSchema controlSchema() {
        Path real = props.resolvedDwhControlRoot();
        Path mock = props.resolvedMockRoot().resolve("DWH_CONTROL");
        boolean realExists = Files.isDirectory(real);
        boolean realUsable = realExists && Files.isDirectory(real.resolve(DataRoots.LAYER_TO_LAYER));
        boolean mockUsable = Files.isDirectory(mock.resolve(DataRoots.LAYER_TO_LAYER));
        String tier = roots.dwhControlMode();

        Optional<Path> base = roots.dwhControl().map(p -> p.resolve(DataRoots.LAYER_TO_LAYER));
        DiagnosticsDto.Scan scan = base.map(this::scan).orElseGet(this::emptyScan);
        boolean ok = !"absent".equals(tier) && scan.rowsParsed() > 0;
        String hint = hint(tier, realExists, real, mock, scan);

        return new DiagnosticsDto.ControlSchema(props.dwhControlRoot(), real.toString(), realExists,
            DataRoots.LAYER_TO_LAYER, realUsable, mock.toString(), mockUsable, tier,
            ok ? "ok" : "ko", hint, scan);
    }

    private DiagnosticsDto.Scan emptyScan() {
        return new DiagnosticsDto.Scan(vocabulary().anchorTable(), vocabulary().anchor(),
            layerToLayer.layerDirs(), List.of(), List.of(), 0, 0, 0, 0, List.of(), List.of());
    }

    private DiagnosticsDto.Scan scan(Path base) {
        List<String> present = subdirectories(base);
        List<String> expected = layerToLayer.layerDirs();
        List<String> unexpected = present.stream().filter(d -> !expected.contains(d)).toList();

        String anchor = layerToLayer.anchor();
        List<DiagnosticsDto.FileScan> files = new ArrayList<>();
        int anchorHits = 0, parsed = 0, skipped = 0;
        for (String dir : expected) {
            Path file = base.resolve(dir).resolve(STATEMENTS_FILE);
            if (!Files.isRegularFile(file)) continue;
            DiagnosticsDto.FileScan scanned = scanFile(file, anchor);
            files.add(scanned);
            anchorHits += scanned.anchorHits();
            parsed += scanned.rowsParsed();
            skipped += scanned.rowsSkipped();
        }
        return new DiagnosticsDto.Scan(vocabulary().anchorTable(), anchor, expected, present, unexpected,
            files.size(), anchorHits, parsed, skipped, files, insertTargets(base, present));
    }

    private DiagnosticsDto.FileScan scanFile(Path file, String anchor) {
        String content = read(file);
        int parsed = 0, skipped = 0;
        String firstSkipReason = null;
        List<String> bodies = LayerToLayerService.statements(content, anchor);
        for (String body : bodies) {
            try {
                LayerToLayerService.parseRow(body);
                parsed++;
            } catch (RuntimeException e) {
                skipped++;
                if (firstSkipReason == null) firstSkipReason = e.getMessage();
            }
        }
        return new DiagnosticsDto.FileScan(file.toString(), content.length(), bodies.size(),
            parsed, skipped, firstSkipReason);
    }

    /**
     * Every {@code INSERT INTO <table>} identifier present under {@code LAYER_TO_LAYER/}, most
     * frequent first — swept across ALL subdirectories, including ones outside the configured
     * layer list, because when the layer names are what's wrong the configured dirs hold nothing
     * to look at. This is what turns "0 rows" into "your files say CTL.CORP_L2L_CONFIG".
     */
    private List<DiagnosticsDto.InsertTarget> insertTargets(Path base, List<String> presentDirs) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (String dir : presentDirs) {
            Path file = base.resolve(dir).resolve(STATEMENTS_FILE);
            if (!Files.isRegularFile(file)) continue;
            Matcher m = INSERT_TARGET.matcher(read(file));
            while (m.find()) counts.merge(m.group(1), 1, Integer::sum);
        }
        return counts.entrySet().stream()
            .sorted(Comparator.<Map.Entry<String, Integer>>comparingInt(Map.Entry::getValue).reversed()
                .thenComparing(Map.Entry::getKey))
            .map(e -> new DiagnosticsDto.InsertTarget(e.getKey(), e.getValue()))
            .toList();
    }

    /**
     * The single most actionable sentence for the state the scan is in. Ordered by how early the
     * pipeline broke, because an earlier break makes every later count meaningless — reporting
     * "no statements matched" is misleading when the real problem is that no file was opened.
     */
    private String hint(String tier, boolean realExists, Path real, Path mock, DiagnosticsDto.Scan scan) {
        if ("absent".equals(tier)) {
            return (realExists
                ? "Root exists but has no " + DataRoots.LAYER_TO_LAYER + "/ inside it: " + real
                : "Root does not exist: " + real)
                + " — and the mock mirror at " + mock + " is unusable too. Point dwhControlRoot at the "
                + "directory that CONTAINS " + DataRoots.LAYER_TO_LAYER + "/.";
        }
        if (scan.presentDirs().isEmpty()) {
            return DataRoots.LAYER_TO_LAYER + "/ exists but has no layer subdirectories.";
        }
        if (scan.filesRead() == 0) {
            String found = String.join(", ", scan.presentDirs());
            return "No " + STATEMENTS_FILE + " under any configured layer directory ("
                + String.join(", ", scan.expectedLayerDirs()) + "). Present instead: " + found
                + " — set layerDirs in config.json to the names your export uses.";
        }
        if (scan.anchorHits() == 0) {
            String targets = scan.insertTargetsFound().stream()
                .map(t -> t.table() + " (×" + t.count() + ")")
                .reduce((a, b) -> a + ", " + b).orElse("none");
            return "Read " + scan.filesRead() + " " + STATEMENTS_FILE + " but no statement matched \""
                + scan.anchor() + "\". The files INSERT INTO: " + targets
                + " — set layerToLayerTable in config.json to the one your control schema uses.";
        }
        if (scan.rowsParsed() == 0) {
            String reason = scan.files().stream()
                .map(DiagnosticsDto.FileScan::firstSkipReason)
                .filter(r -> r != null && !r.isBlank())
                .findFirst().orElse("unknown");
            return "All " + scan.rowsSkipped() + " matched statement(s) were malformed and skipped; "
                + "first failure: " + reason;
        }
        if (scan.rowsSkipped() > 0) {
            return scan.rowsParsed() + " row(s) parsed, " + scan.rowsSkipped()
                + " skipped as malformed (see backend log for each).";
        }
        return "";
    }

    private Etl360Properties.LayerToLayer vocabulary() { return props.layerToLayer(); }

    private static List<String> subdirectories(Path base) {
        try (Stream<Path> children = Files.list(base)) {
            return children.filter(Files::isDirectory)
                .map(p -> p.getFileName().toString())
                .sorted()
                .toList();
        } catch (IOException e) {
            return List.of();
        }
    }

    /** Diagnostics must never be the thing that fails: an unreadable file reports as empty. */
    private static String read(Path p) {
        try {
            return Files.readString(p);
        } catch (IOException | RuntimeException e) {
            return "";
        }
    }
}
