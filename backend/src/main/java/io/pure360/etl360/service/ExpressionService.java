package io.pure360.etl360.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.pure360.etl360.api.dto.ExpressionEntryDto;
import io.pure360.etl360.api.dto.XmlNodeDto;
import io.pure360.etl360.service.support.FormulaRenderer;
import io.pure360.etl360.service.support.PathResolver;
import io.pure360.etl360.service.support.XmlUnparsableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Cross-corpus archive of expression formulas, merged from two origins: {@code "xml"}
 * (every {@code TRANSFORMFIELD} EXPRESSION attribute in the mapping DOM, Task 4's original
 * behavior) and {@code "recipe"} (Task 11 — every {@code _ETL_*.json} recipe's target field
 * whose transformation is a call tree, rendered via {@link FormulaRenderer}, the exact Java
 * mirror of the frontend's {@code renderFormula}). No separate aggregate cache is kept: every
 * call re-walks {@link CorpusService#allXmlPaths()}/{@link CorpusService#allRecipePaths()} —
 * the DOM walk goes through {@link DomService}, which already caches per-file by mtime — so
 * rebuilding the aggregate here is cheap and always fresh.
 */
@Service
public class ExpressionService {
    private static final Logger log = LoggerFactory.getLogger(ExpressionService.class);

    private final CorpusService corpus;
    private final DomService dom;
    private final PathResolver paths;
    private final ObjectMapper mapper = new ObjectMapper();

    public ExpressionService(CorpusService corpus, DomService dom, PathResolver paths) {
        this.corpus = corpus;
        this.dom = dom;
        this.paths = paths;
    }

    public List<ExpressionEntryDto> all() {
        List<ExpressionEntryDto> result = new ArrayList<>();
        for (String mappingPath : corpus.allXmlPaths()) {
            XmlNodeDto root;
            try {
                root = dom.dom(mappingPath);
            } catch (XmlUnparsableException e) {
                log.warn("Skipping unparsable mapping {} in expressions archive: {}", mappingPath, e.getMessage());
                continue;
            }
            String layer = layerOf(mappingPath);
            collect(root, mappingPath, layer, result);
        }
        for (String recipePath : corpus.allRecipePaths()) {
            collectRecipe(recipePath, result);
        }
        return result;
    }

    /**
     * Recipe-origin walk (Task 11): every step target's field (under {@code fields} or the
     * anonymizer-renamed {@code weststone} key — both tolerated, mirroring the frontend's
     * {@code fieldsOf}) whose {@code transformation} carries a non-blank {@code name} (a call
     * tree, per the ƒ rule — a plain {@code source}/{@code value} leaf is not an "expression")
     * yields one entry. {@code transformation()} here is the step/target name; {@code port()}
     * is the field name — same shape as the xml-origin entries, just sourced differently.
     */
    private void collectRecipe(String recipePath, List<ExpressionEntryDto> out) {
        JsonNode root;
        try {
            root = mapper.readTree(paths.insideCorpus(recipePath).toFile());
        } catch (IOException e) {
            log.warn("Skipping unreadable recipe {} in expressions archive: {}", recipePath, e.getMessage());
            return;
        }
        String layer = layerOf(recipePath);
        JsonNode steps = root.path("steps");
        if (!steps.isArray()) return;
        for (JsonNode step : steps) {
            JsonNode target = step.path("target");
            String stepName = target.path("name").asText("");
            JsonNode fields = target.has("fields") ? target.get("fields") : target.get("weststone");
            if (fields == null || !fields.isArray()) continue;
            for (JsonNode field : fields) {
                JsonNode transformation = field.path("transformation");
                String name = transformation.path("name").asText("");
                if (name.isBlank()) continue;
                String fieldName = field.path("name").asText("");
                String formula = FormulaRenderer.render(transformation);
                out.add(new ExpressionEntryDto(recipePath, layer, stepName, fieldName, formula, "recipe"));
            }
        }
    }

    private void collect(XmlNodeDto node, String mappingPath, String layer, List<ExpressionEntryDto> out) {
        if ("TRANSFORMATION".equals(node.name())) {
            String transformationName = attr(node, "NAME");
            List<XmlNodeDto> children = node.children();
            if (children != null) {
                for (XmlNodeDto child : children) {
                    if (!"TRANSFORMFIELD".equals(child.name())) continue;
                    String expression = attr(child, "EXPRESSION");
                    String portName = attr(child, "NAME");
                    if (expression == null || expression.isBlank()) continue;
                    if (expression.equals(portName)) continue;
                    out.add(new ExpressionEntryDto(mappingPath, layer, transformationName, portName, expression, "xml"));
                }
            }
        }
        List<XmlNodeDto> children = node.children();
        if (children != null) {
            for (XmlNodeDto child : children) {
                collect(child, mappingPath, layer, out);
            }
        }
    }

    private static String attr(XmlNodeDto node, String name) {
        Map<String, String> attrs = node.attributes();
        return attrs == null ? null : attrs.get(name);
    }

    private static String layerOf(String mappingPath) {
        int slash = mappingPath.indexOf('/');
        return slash < 0 ? mappingPath : mappingPath.substring(0, slash);
    }
}
