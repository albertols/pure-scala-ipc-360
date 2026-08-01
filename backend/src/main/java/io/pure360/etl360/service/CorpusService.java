package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.SummaryDto;
import io.pure360.etl360.api.dto.TreeNodeDto;
import io.pure360.etl360.config.Etl360Properties;
import io.pure360.etl360.service.support.HistorySidecar;
import io.pure360.etl360.service.support.LayoutSidecar;
import org.springframework.stereotype.Service;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.*;
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Stream;

@Service
public class CorpusService {
    private final Path root;

    @org.springframework.beans.factory.annotation.Autowired
    public CorpusService(Etl360Properties props) { this(props.resolvedCorpusRoot()); }
    public CorpusService(Path corpusRoot) { this.root = corpusRoot.normalize(); }
    // @Autowired disambiguates: Spring refuses beans with two non-default constructors otherwise.

    public TreeNodeDto tree() {
        return dirNode(root, "root");
    }

    private TreeNodeDto dirNode(Path dir, String layerOfRoot) {
        List<TreeNodeDto> children = new ArrayList<>();
        try (Stream<Path> list = Files.list(dir)) {
            List<Path> entries = list.sorted(Comparator
                .comparing((Path p) -> Files.isDirectory(p) ? 0 : 1)
                .thenComparing(p -> p.getFileName().toString())).toList();
            for (Path p : entries) {
                String name = p.getFileName().toString();
                if (Files.isDirectory(p)) {
                    // Write-history sidecar (see HistorySidecar): archived recipe versions,
                    // never a browsable tree entry.
                    if (HistorySidecar.DIR.equals(name)) continue;
                    children.add(dirNode(p, null));
                } else if (hasXmlExtension(name)) {
                    children.add(xmlNode(p));
                } else if (name.endsWith(".json")) {
                    // Canvas-layout sidecar (see LayoutSidecar): editor state, never a
                    // browsable corpus entry — same exclusion contract as _history/.
                    if (LayoutSidecar.isLayoutFile(name)) continue;
                    children.add(leaf(p, "json"));
                }
            }
        } catch (IOException e) { throw new UncheckedIOException(e); }
        String rel = relative(dir);
        String kind = isOutputDir(dir) ? "outputDir" : "dir";
        return new TreeNodeDto(dir.equals(root) ? root.getFileName().toString() : dir.getFileName().toString(),
            rel, kind, layerOf(rel, layerOfRoot), null, null, null, null, null, children);
    }

    private TreeNodeDto xmlNode(Path p) {
        String rel = relative(p);
        String mappingPath = stripXmlExtension(rel);
        Path outDir = p.resolveSibling(stripXmlExtension(p.getFileName().toString()));
        boolean hasRecipe = false, hasDdl = false;
        if (Files.isDirectory(outDir)) {
            try (Stream<Path> out = Files.list(outDir)) {
                for (Path f : out.toList()) {
                    String n = f.getFileName().toString();
                    if (n.startsWith("_ETL_") && n.endsWith(".json")) hasRecipe = true;
                    // Real DDL files are TABLE_NAME.json and never start with "_". This also
                    // catches anonymizer-mangled "_sqlTranslations_*" files (e.g. "_WESTPOND_ETL_*"
                    // in the real corpus) that a literal "_sqlTranslations" prefix check would miss.
                    else if (n.endsWith(".json") && !n.startsWith("_")) hasDdl = true;
                }
            } catch (IOException e) { throw new UncheckedIOException(e); }
        }
        TreeNodeDto leaf = leaf(p, "xml");
        return new TreeNodeDto(leaf.name(), leaf.path(), "xml", leaf.layer(),
            leaf.sizeBytes(), leaf.modifiedAt(), mappingPath, hasRecipe, hasDdl, null);
    }

    private TreeNodeDto leaf(Path p, String kind) {
        try {
            String rel = relative(p);
            return new TreeNodeDto(p.getFileName().toString(), rel, kind, layerOf(rel, null),
                Files.size(p),
                Files.getLastModifiedTime(p).toInstant().atOffset(ZoneOffset.UTC).toString(),
                null, null, null, null);
        } catch (IOException e) { throw new UncheckedIOException(e); }
    }

    private boolean isOutputDir(Path dir) {
        String name = dir.getFileName().toString();
        return Files.exists(dir.resolveSibling(name + ".xml")) || Files.exists(dir.resolveSibling(name + ".XML"));
    }

    /** Case-insensitive: the corpus mixes lowercase {@code .xml} (46 files) and uppercase
     * {@code .XML} (13 files) — see CLAUDE.md corpus caveats. */
    private static boolean hasXmlExtension(String name) {
        return name.length() > 4 && name.regionMatches(true, name.length() - 4, ".xml", 0, 4);
    }

    /** Strips whichever-case {@code .xml}/{@code .XML} suffix {@link #hasXmlExtension} matched. */
    private static String stripXmlExtension(String name) {
        return name.substring(0, name.length() - 4);
    }

    private String relative(Path p) { return root.relativize(p).toString().replace('\\', '/'); }

    private String layerOf(String rel, String rootLayer) {
        if (rootLayer != null || rel.isEmpty()) return rootLayer != null ? rootLayer : "root";
        int slash = rel.indexOf('/');
        return slash < 0 ? rel : rel.substring(0, slash);
    }

    public int xmlCount() { return allXmlPaths().size(); }
    public int recipeCount() { return allRecipePaths().size(); }

    public List<String> allXmlPaths() {
        try (Stream<Path> walk = Files.walk(root)) {
            return walk.filter(Files::isRegularFile)
                .filter(p -> !HistorySidecar.isHistoryPath(root, p))
                .filter(p -> hasXmlExtension(p.getFileName().toString()))
                .map(this::relative).sorted()
                .map(CorpusService::stripXmlExtension).toList();
        } catch (IOException e) { throw new UncheckedIOException(e); }
    }

    public List<String> allRecipePaths() {
        return collect(".json").stream()
            .filter(r -> r.substring(r.lastIndexOf('/') + 1).startsWith("_ETL_")).toList();
    }

    private List<String> collect(String ext) {
        try (Stream<Path> walk = Files.walk(root)) {
            return walk.filter(Files::isRegularFile)
                .filter(p -> !HistorySidecar.isHistoryPath(root, p))
                .filter(p -> p.getFileName().toString().endsWith(ext))
                .map(this::relative).sorted().toList();
        } catch (IOException e) { throw new UncheckedIOException(e); }
    }

    /** Static corpus counts for the view-aware summary (Tabs 1/2/4's rail, Tab 3's chip —
     * spec §7.1). Reuses {@link #allXmlPaths()}/{@link #allRecipePaths()} (both already
     * {@code _history}-clean) and a {@link #collect(String)} pass over {@code .json}, further
     * filtered to real DDL files: names that neither start with {@code _} (excludes
     * {@code _ETL_*} recipes and anonymizer-mangled {@code _sqlTranslations_*}/
     * {@code _WESTPOND_*} files) nor are {@link LayoutSidecar} entries. {@code layers} is the
     * sorted set of first path segments across all three collections. */
    public SummaryDto summary() {
        List<String> xmlPaths = allXmlPaths();
        List<String> recipePaths = allRecipePaths();
        List<String> ddlPaths = collect(".json").stream().filter(CorpusService::isDdlPath).toList();

        Set<String> layers = new TreeSet<>();
        xmlPaths.forEach(p -> layers.add(firstSegment(p)));
        recipePaths.forEach(p -> layers.add(firstSegment(p)));
        ddlPaths.forEach(p -> layers.add(firstSegment(p)));

        return new SummaryDto(xmlPaths.size(), recipePaths.size(), ddlPaths.size(), countDirs(), new ArrayList<>(layers));
    }

    private static boolean isDdlPath(String relPath) {
        String name = relPath.substring(relPath.lastIndexOf('/') + 1);
        return !name.startsWith("_") && !LayoutSidecar.isLayoutFile(name);
    }

    private static String firstSegment(String relPath) {
        int slash = relPath.indexOf('/');
        return slash < 0 ? relPath : relPath.substring(0, slash);
    }

    private int countDirs() {
        try (Stream<Path> walk = Files.walk(root)) {
            return (int) walk.filter(Files::isDirectory)
                .filter(p -> !HistorySidecar.isHistoryPath(root, p))
                .count();
        } catch (IOException e) { throw new UncheckedIOException(e); }
    }
}
