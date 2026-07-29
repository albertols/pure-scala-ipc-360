package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.TreeNodeDto;
import io.pure360.etl360.config.Etl360Properties;
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
                    children.add(dirNode(p, null));
                } else if (name.endsWith(".xml")) {
                    children.add(xmlNode(p));
                } else if (name.endsWith(".json")) {
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
        String mappingPath = rel.substring(0, rel.length() - ".xml".length());
        Path outDir = p.resolveSibling(p.getFileName().toString().replaceFirst("\\.xml$", ""));
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
        return Files.exists(dir.resolveSibling(dir.getFileName().toString() + ".xml"));
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
        return collect(".xml").stream()
            .map(r -> r.substring(0, r.length() - ".xml".length())).toList();
    }

    public List<String> allRecipePaths() {
        return collect(".json").stream()
            .filter(r -> r.substring(r.lastIndexOf('/') + 1).startsWith("_ETL_")).toList();
    }

    private List<String> collect(String ext) {
        try (Stream<Path> walk = Files.walk(root)) {
            return walk.filter(Files::isRegularFile)
                .filter(p -> p.getFileName().toString().endsWith(ext))
                .map(this::relative).sorted().toList();
        } catch (IOException e) { throw new UncheckedIOException(e); }
    }
}
