package io.pure360.etl360.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.pure360.etl360.api.dto.IpcCheckDto;
import io.pure360.etl360.api.dto.RecipeDto;
import io.pure360.etl360.api.dto.RecipeHistoryEntryDto;
import io.pure360.etl360.api.dto.RecipeSaveRequestDto;
import io.pure360.etl360.api.dto.RecipeValidationDto;
import io.pure360.etl360.api.dto.RecipeValidationErrorDto;
import io.pure360.etl360.service.ipc.IpcCheck;
import io.pure360.etl360.service.ipc.IpcRuleEngine;
import io.pure360.etl360.service.support.HistorySidecar;
import io.pure360.etl360.service.support.InvalidCorpusPathException;
import io.pure360.etl360.service.support.NotFoundException;
import io.pure360.etl360.service.support.PathResolver;
import io.pure360.etl360.service.support.RecipeAlreadyExistsException;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
public class RecipeService {
    private static final String RECIPE_PREFIX = "_ETL_";
    private static final String JSON_EXT = ".json";

    private final PathResolver paths;
    private final IpcRuleEngine engine;
    private final ObjectMapper mapper = new ObjectMapper();

    // Single coarse monitor guarding save/rollback's check-then-act (staleness check + archive +
    // write must be atomic per JVM, not just per file operation) — fine for a local single-user
    // tool; see RULED FIX in the Task 7 review (unsynchronized save/rollback could silently lose
    // a concurrent writer's update, and same-millisecond archives could collide).
    private final Object writeLock = new Object();

    public RecipeService(PathResolver paths, IpcRuleEngine engine) {
        this.paths = paths;
        this.engine = engine;
    }

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
        synchronized (writeLock) {
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
    }

    /**
     * Creates a brand-new recipe file at {@code relJsonPath} and returns the fresh
     * {@link RecipeDto}. Deliberately creates a directory inside the corpus — sub-project 8's
     * final review caught {@code LayoutService} doing exactly that as an <em>accidental</em>
     * side effect of a missing existence check (see its javadoc), so here every guard runs, in
     * order, before anything touches the filesystem: {@code relJsonPath} must resolve to exactly
     * {@code <layer>/<mapping>/_ETL_<mapping>.json} where {@code <layer>} is an existing
     * top-level directory of the corpus root ({@link #creatableRecipeFile}, 400 otherwise); the
     * file must not already exist ({@link RecipeAlreadyExistsException}, 409 — this endpoint
     * never upserts, which is why it is a {@code POST} that conflicts rather than a {@code PUT}
     * that overwrites); and {@code content} must validate with zero errors (400 otherwise).
     * Only the {@code <mapping>} directory is ever created — a nonexistent {@code <layer>} is
     * rejected outright by {@link #creatableRecipeFile}, never stood up.
     */
    public RecipeDto create(String relJsonPath, JsonNode content) {
        synchronized (writeLock) {
            Path file = creatableRecipeFile(relJsonPath);
            if (Files.exists(file)) {
                throw new RecipeAlreadyExistsException("Recipe already exists at " + relJsonPath);
            }
            RecipeValidationDto validation = validate(content);
            if (!validation.valid()) {
                throw new InvalidCorpusPathException(
                    "Recipe body failed validation for " + relJsonPath + ": " + validation.errors());
            }
            try {
                Files.createDirectories(file.getParent()); // <mapping> only — <layer> already verified to exist
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
            writeAtomic(file, content);
            return recipe(relJsonPath);
        }
    }

    /** Sorted newest-first: {@code [{version, timestamp, sizeBytes}]} from the {@code _history/} sidecar. */
    public List<RecipeHistoryEntryDto> history(String relJsonPath) {
        Path file = writableRecipeFile(relJsonPath);
        Path historyDir = file.resolveSibling(HistorySidecar.DIR);
        if (!Files.isDirectory(historyDir)) {
            return List.of();
        }
        String stem = stripJsonExt(file.getFileName().toString());
        String ownPrefix = stem + ".";
        try (Stream<Path> list = Files.list(historyDir)) {
            return list.filter(Files::isRegularFile)
                // _history/ is git-committable and Finder-visible: a stray file (e.g. macOS
                // .DS_Store) or another recipe's archive must not reach versionOf, which assumes
                // the name is exactly "<stem>.<version>.json".
                .filter(p -> {
                    String name = p.getFileName().toString();
                    return name.startsWith(ownPrefix) && name.endsWith(JSON_EXT);
                })
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
        synchronized (writeLock) {
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
    }

    /**
     * Delegates to {@link IpcRuleEngine} — the full IPC conformance catalogue (spec §5.4) —
     * and splits its checks into {@code errors}/{@code warnings} by each check's calibrated
     * severity. {@code valid} stays exactly {@code errors.isEmpty()}: warnings never block a
     * save (spec §5.5), so pre-existing consumers ({@code scripts/recipe_sweep.mts}, Tab 2's
     * save path) are unaffected by a recipe that only trips warning-severity rules.
     */
    public RecipeValidationDto validate(JsonNode recipe) {
        if (recipe == null || !recipe.isObject()) {
            var e = List.of(new RecipeValidationErrorDto("$", "Recipe is not a JSON object"));
            return new RecipeValidationDto(false, e, List.of(), List.of());
        }
        JsonNode steps = recipe.path("steps");
        if (!steps.isArray() || steps.isEmpty()) {
            var e = List.of(new RecipeValidationErrorDto("$.steps", "steps must be a non-empty array"));
            return new RecipeValidationDto(false, e, List.of(), List.of());
        }

        List<IpcCheck> checks = engine.run(recipe);
        List<RecipeValidationErrorDto> errors = new ArrayList<>();
        List<RecipeValidationErrorDto> warnings = new ArrayList<>();
        List<IpcCheckDto> dtos = new ArrayList<>();
        for (IpcCheck c : checks) {
            dtos.add(new IpcCheckDto(c.ruleId(), c.severity(), c.status(), c.path(), c.message()));
            if (!"fail".equals(c.status())) continue;
            var err = new RecipeValidationErrorDto(c.path(), c.ruleId() + ": " + c.message());
            if ("error".equals(c.severity())) errors.add(err); else warnings.add(err);
        }
        return new RecipeValidationDto(errors.isEmpty(), errors, warnings, dtos);
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

    /** Sandbox + shape gate for {@link #create}: {@code relJsonPath} must end {@code .json},
     * resolve inside the corpus, and normalize to exactly three segments —
     * {@code <layer>/<mapping>/_ETL_<mapping>.json} — where {@code <layer>} is an existing
     * top-level directory of the corpus root, enumerated fresh via {@link #existingLayers()} on
     * every call (never hardcoded, never cached) so a new corpus layer needs no code change.
     * Throws {@link InvalidCorpusPathException} (400) otherwise. Deliberately does NOT check
     * existence of the file itself — {@link #create} does that separately so it can raise the
     * more specific {@link RecipeAlreadyExistsException} (409). */
    private Path creatableRecipeFile(String relJsonPath) {
        if (!relJsonPath.endsWith(JSON_EXT)) {
            throw new InvalidCorpusPathException("Recipe path must end with .json: " + relJsonPath);
        }
        Path file = paths.insideCorpus(relJsonPath); // throws InvalidCorpusPathException on sandbox escape
        Path relative = paths.corpusRoot().relativize(file);
        String shapeMessage = "Recipe path must be <layer>/<mapping>/" + RECIPE_PREFIX
            + "<mapping>.json: " + relJsonPath;
        if (relative.getNameCount() != 3) {
            throw new InvalidCorpusPathException(shapeMessage);
        }
        String layer = relative.getName(0).toString();
        String mapping = relative.getName(1).toString();
        String expectedFileName = RECIPE_PREFIX + mapping + JSON_EXT;
        if (!relative.getName(2).toString().equals(expectedFileName)) {
            throw new InvalidCorpusPathException(shapeMessage);
        }
        if (!existingLayers().contains(layer)) {
            throw new InvalidCorpusPathException(
                "Unknown corpus layer (not an existing top-level directory): " + layer);
        }
        return file;
    }

    /** Top-level directory names of the corpus root, listed fresh on every call — never a
     * hardcoded list, never cached — so a layer added to the corpus is picked up immediately. */
    private Set<String> existingLayers() {
        try (Stream<Path> list = Files.list(paths.corpusRoot())) {
            return list.filter(Files::isDirectory)
                .map(p -> p.getFileName().toString())
                .collect(Collectors.toSet());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Archives under a caller-held {@link #writeLock}, so this alone doesn't need its own
     * synchronization — but the naming is still collision-proof in its own right (defense in
     * depth: {@link HistorySidecar#newVersion()} is millisecond-precision, and a caller-held
     * lock only guarantees serialization within this JVM, not against a stray external write). */
    private void archive(Path file) {
        try {
            Path historyDir = Files.createDirectories(file.resolveSibling(HistorySidecar.DIR));
            String stem = stripJsonExt(file.getFileName().toString());
            Path archived = uniqueArchivePath(historyDir, stem, HistorySidecar.newVersion());
            // No REPLACE_EXISTING: uniqueArchivePath already guarantees `archived` doesn't
            // exist, so a collision can never silently overwrite a prior archive entry.
            Files.copy(file, archived);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Same-millisecond archives get a {@code -1}, {@code -2}, ... suffix instead of colliding
     * on {@code <stem>.<version>.json}. */
    private static Path uniqueArchivePath(Path historyDir, String stem, String version) {
        Path candidate = historyDir.resolve(stem + "." + version + JSON_EXT);
        for (int suffix = 1; Files.exists(candidate); suffix++) {
            candidate = historyDir.resolve(stem + "." + version + "-" + suffix + JSON_EXT);
        }
        return candidate;
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
