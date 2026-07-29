package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.XmlNodeDto;
import io.pure360.etl360.service.support.PathResolver;
import io.pure360.etl360.service.support.XmlUnparsableException;
import org.springframework.stereotype.Service;
import org.w3c.dom.*;
import org.xml.sax.SAXException;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class DomService {
    private record CacheEntry(long mtime, XmlNodeDto dom) {}
    private final PathResolver paths;
    private final Map<String, CacheEntry> cache = new ConcurrentHashMap<>();

    public DomService(PathResolver paths) { this.paths = paths; }

    public XmlNodeDto dom(String mappingPath) {
        Path file = paths.xmlFile(mappingPath);
        try {
            long mtime = Files.getLastModifiedTime(file).toMillis();
            CacheEntry hit = cache.get(mappingPath);
            if (hit != null && hit.mtime() == mtime) return hit.dom();
            XmlNodeDto dom = convert(parse(file).getDocumentElement());
            cache.put(mappingPath, new CacheEntry(mtime, dom));
            return dom;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private Document parse(Path file) {
        try {
            DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
            f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            f.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            f.setFeature("http://xml.org/sax/features/external-general-entities", false);
            f.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            f.setExpandEntityReferences(false);
            return f.newDocumentBuilder().parse(file.toFile());
        } catch (SAXException e) {
            throw new XmlUnparsableException("XML parse failed for " + file.getFileName() + ": "
                + e.getMessage() + " (if this mentions an undeclared entity, suspect anonymizer damage)");
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private XmlNodeDto convert(Element el) {
        Map<String, String> attrs = new LinkedHashMap<>();
        NamedNodeMap map = el.getAttributes();
        for (int i = 0; i < map.getLength(); i++) {
            attrs.put(map.item(i).getNodeName(), map.item(i).getNodeValue());
        }
        List<XmlNodeDto> children = new ArrayList<>();
        StringBuilder text = new StringBuilder();
        NodeList nodes = el.getChildNodes();
        for (int i = 0; i < nodes.getLength(); i++) {
            Node n = nodes.item(i);
            if (n.getNodeType() == Node.ELEMENT_NODE) children.add(convert((Element) n));
            else if (n.getNodeType() == Node.TEXT_NODE || n.getNodeType() == Node.CDATA_SECTION_NODE) {
                text.append(n.getNodeValue());
            }
        }
        String t = text.toString().strip();
        return new XmlNodeDto(el.getTagName(), attrs.isEmpty() ? null : attrs,
            t.isEmpty() ? null : t, children.isEmpty() ? null : children);
    }
}
