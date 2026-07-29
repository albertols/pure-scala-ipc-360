package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.MappingModelDto;
import io.pure360.etl360.api.dto.PowermartMapper;
import io.pure360.etl360.service.support.PathResolver;
import io.pure360.ipc.xmltojson.XMLParser;
import io.pure360.ipc.xmltojson.nodes.XMLRoot;
import org.springframework.stereotype.Service;
import java.io.UncheckedIOException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class SemanticModelService {
    private record CacheEntry(long mtime, MappingModelDto model) {}
    private final PathResolver paths;
    private final Map<String, CacheEntry> cache = new ConcurrentHashMap<>();

    public SemanticModelService(PathResolver paths) { this.paths = paths; }

    public MappingModelDto model(String mappingPath) {
        Path file = paths.xmlFile(mappingPath);
        try {
            long mtime = Files.getLastModifiedTime(file).toMillis();
            CacheEntry hit = cache.get(mappingPath);
            if (hit != null && hit.mtime() == mtime) return hit.model();
            XMLRoot.Powermart pm = XMLParser.getParsedXml(file.toFile());
            MappingModelDto dto = PowermartMapper.toDto(pm);
            cache.put(mappingPath, new CacheEntry(mtime, dto));
            return dto;
        } catch (IOException e) { throw new UncheckedIOException(e); }
    }
}
