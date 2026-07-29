package io.pure360.etl360.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.pure360.etl360.api.dto.RecipeDto;
import io.pure360.etl360.service.support.InvalidCorpusPathException;
import io.pure360.etl360.service.support.NotFoundException;
import io.pure360.etl360.service.support.PathResolver;
import io.pure360.etl360.service.support.UnreadableFileException;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Stream;

@Service
public class RecipeService {
    private final PathResolver paths;
    private final ObjectMapper mapper = new ObjectMapper();

    public RecipeService(PathResolver paths) { this.paths = paths; }

    public RecipeDto recipe(String relJsonPath) {
        if (!relJsonPath.endsWith(".json")) {
            throw new InvalidCorpusPathException("Recipe path must end with .json: " + relJsonPath);
        }
        Path file = paths.insideCorpus(relJsonPath);
        if (!Files.isRegularFile(file)) {
            throw new NotFoundException("No recipe file at " + relJsonPath);
        }
        JsonNode content = readJson(file);
        try {
            return new RecipeDto(relJsonPath, file.getFileName().toString(), Files.size(file),
                Files.getLastModifiedTime(file).toInstant().atOffset(ZoneOffset.UTC).toString(), content);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
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

    private JsonNode readJson(Path file) {
        try {
            return mapper.readTree(file.toFile());
        } catch (JsonProcessingException e) {
            throw new UnreadableFileException("Malformed JSON in " + file.getFileName() + ": " + e.getMessage());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
