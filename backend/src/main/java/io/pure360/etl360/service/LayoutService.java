package io.pure360.etl360.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.pure360.etl360.api.dto.LayoutDto;
import io.pure360.etl360.service.support.InvalidCorpusPathException;
import io.pure360.etl360.service.support.LayoutSidecar;
import io.pure360.etl360.service.support.PathResolver;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Map;

/**
 * Reads/writes the {@code _layout_*.json} sidecar (see {@link LayoutSidecar}) that holds a
 * recipe's canvas node offsets.
 *
 * <p>This sidecar exists because the parser never emits x/y: embedding positions inside
 * {@code _ETL_*.json} would make {@code make regen-corpus} diff on every recipe and break
 * CLAUDE.md hard rule 3 ("parser output stays byte-identical"). Positions therefore live
 * beside the recipe, exactly as the write-history sidecar ({@code _history/}, see
 * {@link io.pure360.etl360.service.support.HistorySidecar}) does.
 */
@Service
public class LayoutService {
    private static final String RECIPE_PREFIX = "_ETL_";
    private static final String JSON_EXT = ".json";

    private final PathResolver paths;
    private final ObjectMapper mapper = new ObjectMapper();

    public LayoutService(PathResolver paths) { this.paths = paths; }

    /** The saved layout for the recipe at {@code relRecipePath}, or {@code {version:1,nodes:{}}}
     * if its sidecar is absent — a recipe that has never been dragged has no sidecar file, and
     * that is a normal empty layout, never a 404. */
    public LayoutDto layout(String relRecipePath) {
        Path sidecar = LayoutSidecar.layoutFileFor(recipeFile(relRecipePath));
        if (!Files.isRegularFile(sidecar)) {
            return new LayoutDto(1, Map.of());
        }
        try {
            return mapper.readValue(sidecar.toFile(), LayoutDto.class);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Writes {@code body} to the sidecar atomically (temp file + {@code ATOMIC_MOVE}, mirroring
     * {@code RecipeService.writeAtomic}), then returns the freshly-read result. */
    public LayoutDto save(String relRecipePath, LayoutDto body) {
        Path sidecar = LayoutSidecar.layoutFileFor(recipeFile(relRecipePath));
        writeAtomic(sidecar, body);
        return layout(relRecipePath);
    }

    /** Sandbox + shape gate shared by {@link #layout} and {@link #save}: {@code relRecipePath}
     * must end {@code .json}, resolve inside the corpus, and have an {@code _ETL_}-prefixed
     * basename — otherwise {@link InvalidCorpusPathException} (400). Mirrors
     * {@code RecipeService.writableRecipeFile}. */
    private Path recipeFile(String relRecipePath) {
        if (!relRecipePath.endsWith(JSON_EXT)) {
            throw new InvalidCorpusPathException("Recipe path must end with .json: " + relRecipePath);
        }
        Path file = paths.insideCorpus(relRecipePath); // throws InvalidCorpusPathException on sandbox escape
        if (!file.getFileName().toString().startsWith(RECIPE_PREFIX)) {
            throw new InvalidCorpusPathException("Not a recipe file (must be " + RECIPE_PREFIX
                + "*.json): " + relRecipePath);
        }
        return file;
    }

    private void writeAtomic(Path file, LayoutDto content) {
        try {
            Files.createDirectories(file.getParent());
            Path tmp = file.resolveSibling("." + file.getFileName() + ".tmp");
            mapper.writerWithDefaultPrettyPrinter().writeValue(tmp.toFile(), content);
            Files.move(tmp, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
