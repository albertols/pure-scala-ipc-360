package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.ExpressionEntryDto;
import io.pure360.etl360.api.dto.XmlNodeDto;
import io.pure360.etl360.service.support.XmlUnparsableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Cross-corpus archive of expression formulas. No separate aggregate cache is kept: every
 * call re-walks {@link CorpusService#allXmlPaths()} and re-fetches each mapping's DOM via
 * {@link DomService}, which already caches per-file by mtime — so rebuilding the aggregate
 * here is cheap and always fresh.
 */
@Service
public class ExpressionService {
    private static final Logger log = LoggerFactory.getLogger(ExpressionService.class);

    private final CorpusService corpus;
    private final DomService dom;

    public ExpressionService(CorpusService corpus, DomService dom) {
        this.corpus = corpus;
        this.dom = dom;
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
        return result;
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
