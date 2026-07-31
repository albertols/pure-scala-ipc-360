package io.pure360.etl360.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.pure360.etl360.api.dto.RecipeDto;
import io.pure360.etl360.api.dto.RecipeHistoryEntryDto;
import io.pure360.etl360.api.dto.RecipeSaveRequestDto;
import io.pure360.etl360.api.dto.RecipeValidationDto;
import io.pure360.etl360.api.dto.RecipeValidationErrorDto;
import io.pure360.etl360.service.support.HistorySidecar;
import io.pure360.etl360.service.support.InvalidCorpusPathException;
import io.pure360.etl360.service.support.NotFoundException;
import io.pure360.etl360.service.support.PathResolver;
import io.pure360.etl360.service.support.StaleRecipeException;
import io.pure360.etl360.service.support.UnreadableFileException;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

@Service
public class RecipeService {
    private static final String RECIPE_PREFIX = "_ETL_";
    private static final String JSON_EXT = ".json";

    private final PathResolver paths;
    private final ObjectMapper mapper = new ObjectMapper();

    public RecipeService(PathResolver paths) { this.paths = paths; }

    public RecipeDto recipe(String relJsonPath) {
        if (!relJsonPath.endsWith(JSON_EXT)) {
            throw new InvalidCorpusPathException("Recipe path must end with .json: " + relJsonPath);
        }
        Path file = paths.insideCorpus(relJsonPath);
        if (!Files.isRegularFile(file)) {
            throw new NotFoundException("No recipe file at " + relJsonPath);
        }
        JsonNode content = readJson(file);
        return new RecipeDto(relJsonPath, file.getFileName().toString(), sizeOf(file), modifiedAt(file), content);
    }

    public Map<String, JsonNode> ddls(String mappingDirRel) {
        Path dir = paths.insideCorpus(mappingDirRel);
        if (!Files.isDirectory(dir)) {
            throw new NotFoundException("No mapping output directory at " + mappingDirRel);
        }
        Map<String, JsonNode> result = new LinkedHashMap<>();
        try (Stream<Path> list = Files.list(dir)) {
            for (Path f : list.sorted().toList()) {
                String name = f.getFileName().toString();
                if (!name.endsWith(".json")) continue;
                // Real DDL files are TABLE_NAME.json and never start with "_". This also
                // catches anonymizer-mangled "_sqlTranslations_*" files (e.g. "_WESTPOND_ETL_*"
                // in the real corpus) that a literal "_sqlTranslations" prefix check would miss.
                if (name.startsWith("_")) continue;
                String key = name.substring(0, name.length() - ".json".length());
                result.put(key, readJson(f));
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return result;
    }

    /**
     * Archives the current file to {@code _history/}, writes {@code request.content()}
     * atomically (temp file + move), and returns the fresh {@link RecipeDto}. Rejects with
     * {@link StaleRecipeException} (409) if {@code request.baseModified()} no longer matches
     * the file's current {@code modifiedAt} — someone else saved first.
     */
    public RecipeDto save(String relJsonPath, RecipeSaveRequestDto request) {
        Path file = writableRecipeFile(relJsonPath);
        if (!Files.isRegularFile(file)) {
            throw new NotFoundException("No recipe file at " + relJsonPath);
        }
        String currentModified = modifiedAt(file);
        if (!currentModified.equals(request.baseModified())) {
            throw new StaleRecipeException("Recipe " + relJsonPath + " was modified since it was loaded "
                + "(expected baseModified=" + request.baseModified() + ", current=" + currentModified + ")");
        }
        archive(file);
        writeAtomic(file, request.content());
        return recipe(relJsonPath);
    }

    /** Sorted newest-first: {@code [{version, timestamp, sizeBytes}]} from the {@code _history/} sidecar. */
    public List<RecipeHistoryEntryDto> history(String relJsonPath) {
        Path file = writableRecipeFile(relJsonPath);
        Path historyDir = file.resolveSibling(HistorySidecar.DIR);
        if (!Files.isDirectory(historyDir)) {
            return List.of();
        }
        String stem = stripJsonExt(file.getFileName().toString());
        try (Stream<Path> list = Files.list(historyDir)) {
            return list.filter(Files::isRegularFile)
                .map(p -> new RecipeHistoryEntryDto(versionOf(stem, p), modifiedAt(p), sizeOf(p)))
                .sorted(Comparator.comparing(RecipeHistoryEntryDto::version).reversed())
                .toList();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** That archived version's content, shaped as a {@link RecipeDto}. */
    public RecipeDto historyVersion(String relJsonPath, String version) {
        Path file = writableRecipeFile(relJsonPath);
        Path archived = historyFile(file, version);
        if (!Files.isRegularFile(archived)) {
            throw new NotFoundException("No archived version " + version + " for " + relJsonPath);
        }
        return new RecipeDto(relJsonPath, file.getFileName().toString(), sizeOf(archived), modifiedAt(archived),
            readJson(archived));
    }

    /** Archives the current file, restores the archived {@code version} over it, returns a fresh {@link RecipeDto}. */
    public RecipeDto rollback(String relJsonPath, String version) {
        Path file = writableRecipeFile(relJsonPath);
        if (!Files.isRegularFile(file)) {
            throw new NotFoundException("No recipe file at " + relJsonPath);
        }
        Path archived = historyFile(file, version);
        if (!Files.isRegularFile(archived)) {
            throw new NotFoundException("No archived version " + version + " for " + relJsonPath);
        }
        archive(file);
        restoreAtomic(file, archived);
        return recipe(relJsonPath);
    }

    /**
     * Structural checks only, no file IO: parses to an object with a non-empty {@code steps}
     * array; every step's target has a {@code name} and non-blank {@code type} (RULED
     * DEVIATION from spec §7's "every step type known": the anonymizer corrupted type VALUES
     * corpus-wide — BERYLFALLS x86, EARLYGLADE x49, ASHPATH2 x10, CEDARWICK2 x1 — and spec §9
     * requires all 74 corpus recipes to validate green, so "known type" is implemented as
     * "non-blank type", not membership of a canonical set); every field (under {@code fields}
     * or the anonymizer-renamed {@code weststone} key — both tolerated) has a {@code name};
     * every dot-ref {@code T.F} found anywhere in the document under a {@code source} key has
     * its {@code T} (case-insensitively, first segment only — {@code F} may itself contain
     * dots, e.g. Router group-qualified ports) resolvable against the union of every step's
     * {@code sources[].name}, every step's {@code target.name}, and {@code table.sourceTableNames}.
     */
    public RecipeValidationDto validate(JsonNode recipe) {
        List<RecipeValidationErrorDto> errors = new ArrayList<>();
        if (recipe == null || !recipe.isObject()) {
            errors.add(new RecipeValidationErrorDto("$", "Recipe is not a JSON object"));
            return new RecipeValidationDto(false, errors);
        }
        JsonNode steps = recipe.path("steps");
        if (!steps.isArray() || steps.isEmpty()) {
            errors.add(new RecipeValidationErrorDto("$.steps", "steps must be a non-empty array"));
            return new RecipeValidationDto(false, errors);
        }

        Set<String> refTargets = collectRefTargets(recipe, steps);

        for (int i = 0; i < steps.size(); i++) {
            JsonNode step = steps.get(i);
            String stepPath = "$.steps[" + i + "]";
            JsonNode target = step.path("target");
            if (!target.isObject()) {
                errors.add(new RecipeValidationErrorDto(stepPath + ".target", "step target is missing"));
                continue;
            }
            if (target.path("name").asText("").isBlank()) {
                errors.add(new RecipeValidationErrorDto(stepPath + ".target.name", "step target is missing a name"));
            }
            if (target.path("type").asText("").isBlank()) {
                errors.add(new RecipeValidationErrorDto(stepPath + ".target.type", "step target is missing a type"));
            }
            JsonNode fields = target.has("fields") ? target.get("fields") : target.get("weststone");
            if (fields != null && fields.isArray()) {
                String fieldsKey = target.has("fields") ? "fields" : "weststone";
                for (int j = 0; j < fields.size(); j++) {
                    if (fields.get(j).path("name").asText("").isBlank()) {
                        errors.add(new RecipeValidationErrorDto(
                            stepPath + ".target." + fieldsKey + "[" + j + "]", "field is missing a name"));
                    }
                }
            }
        }

        collectDotRefErrors(recipe, refTargets, errors, "$");

        return new RecipeValidationDto(errors.isEmpty(), errors);
    }

    // --- write-path helpers -------------------------------------------------------------

    /** Sandbox + writability gate shared by save/history/historyVersion/rollback: path must
     * end {@code .json}, resolve inside the corpus, have an {@code _ETL_}-prefixed basename,
     * and carry no {@code _history} segment — otherwise {@link InvalidCorpusPathException} (400). */
    private Path writableRecipeFile(String relJsonPath) {
        if (!relJsonPath.endsWith(JSON_EXT)) {
            throw new InvalidCorpusPathException("Recipe path must end with .json: " + relJsonPath);
        }
        Path file = paths.insideCorpus(relJsonPath); // throws InvalidCorpusPathException on sandbox escape
        if (!file.getFileName().toString().startsWith(RECIPE_PREFIX)) {
            throw new InvalidCorpusPathException("Not a writable recipe file (must be " + RECIPE_PREFIX
                + "*.json): " + relJsonPath);
        }
        if (HistorySidecar.isHistoryPath(paths.corpusRoot(), file)) {
            throw new InvalidCorpusPathException("Cannot write inside the history sidecar: " + relJsonPath);
        }
        return file;
    }

    private void archive(Path file) {
        try {
            Path historyDir = Files.createDirectories(file.resolveSibling(HistorySidecar.DIR));
            Path archived = historyDir.resolve(stripJsonExt(file.getFileName().toString())
                + "." + HistorySidecar.newVersion() + JSON_EXT);
            Files.copy(file, archived, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private void writeAtomic(Path file, JsonNode content) {
        try {
            Path tmp = file.resolveSibling("." + file.getFileName() + ".tmp");
            mapper.writerWithDefaultPrettyPrinter().writeValue(tmp.toFile(), content);
            Files.move(tmp, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Atomic byte-identical restore of an archived file over the live one (temp file + move). */
    private void restoreAtomic(Path target, Path source) {
        try {
            Path tmp = target.resolveSibling("." + target.getFileName() + ".tmp");
            Files.copy(source, tmp, StandardCopyOption.REPLACE_EXISTING);
            Files.move(tmp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private Path historyFile(Path liveFile, String version) {
        String stem = stripJsonExt(liveFile.getFileName().toString());
        return liveFile.resolveSibling(HistorySidecar.DIR).resolve(stem + "." + version + JSON_EXT);
    }

    private static String versionOf(String stem, Path archived) {
        String name = archived.getFileName().toString();
        return name.substring(stem.length() + 1, name.length() - JSON_EXT.length());
    }

    private static String stripJsonExt(String name) {
        return name.substring(0, name.length() - JSON_EXT.length());
    }

    // --- validate helpers -----------------------------------------------------------------

    private static Set<String> collectRefTargets(JsonNode recipe, JsonNode steps) {
        Set<String> refs = new HashSet<>();
        for (JsonNode step : steps) {
            String targetName = step.path("target").path("name").asText("");
            if (!targetName.isBlank()) refs.add(targetName.toLowerCase(Locale.ROOT));
            JsonNode sources = step.path("sources");
            if (sources.isArray()) {
                for (JsonNode src : sources) {
                    String name = src.path("name").asText("");
                    if (!name.isBlank()) refs.add(name.toLowerCase(Locale.ROOT));
                }
            }
        }
        JsonNode sourceTableNames = recipe.path("table").path("sourceTableNames");
        if (sourceTableNames.isArray()) {
            for (JsonNode n : sourceTableNames) {
                if (n.isTextual() && !n.asText().isBlank()) refs.add(n.asText().toLowerCase(Locale.ROOT));
            }
        }
        return refs;
    }

    /** Recursively scans the whole document for {@code source} keys holding a dotted
     * reference ({@code T.F}, first segment only significant) and flags any whose {@code T}
     * doesn't resolve against {@code refTargets}. */
    private static void collectDotRefErrors(JsonNode node, Set<String> refTargets,
                                             List<RecipeValidationErrorDto> errors, String path) {
        if (node.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> it = node.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                String childPath = path + "." + e.getKey();
                if ("source".equals(e.getKey()) && e.getValue().isTextual()) {
                    String ref = e.getValue().asText();
                    int dot = ref.indexOf('.');
                    if (dot > 0) {
                        String t = ref.substring(0, dot);
                        if (!refTargets.contains(t.toLowerCase(Locale.ROOT))) {
                            errors.add(new RecipeValidationErrorDto(childPath,
                                "Unresolvable reference \"" + ref + "\": unknown source/target \"" + t + "\""));
                        }
                    }
                }
                collectDotRefErrors(e.getValue(), refTargets, errors, childPath);
            }
        } else if (node.isArray()) {
            for (int i = 0; i < node.size(); i++) {
                collectDotRefErrors(node.get(i), refTargets, errors, path + "[" + i + "]");
            }
        }
    }

    // --- shared IO helpers ------------------------------------------------------------------

    private JsonNode readJson(Path file) {
        try {
            return mapper.readTree(file.toFile());
        } catch (JsonProcessingException e) {
            throw new UnreadableFileException("Malformed JSON in " + file.getFileName() + ": " + e.getMessage());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static String modifiedAt(Path file) {
        try {
            return Files.getLastModifiedTime(file).toInstant().atOffset(ZoneOffset.UTC).toString();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static long sizeOf(Path file) {
        try {
            return Files.size(file);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
