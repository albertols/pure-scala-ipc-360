package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.LayerToLayerEntryDto;
import io.pure360.etl360.config.DataRoots;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

@Service
public class LayerToLayerService {
    private static final Logger log = LoggerFactory.getLogger(LayerToLayerService.class);
    static final List<String> LAYER_DIRS = List.of("STG", "ODS", "DWH", "CDM", "RDM", "QDM", "ETL", "OUTPUT");
    private static final String ANCHOR = "INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES";

    private final DataRoots roots;
    private List<LayerToLayerEntryDto> entries;
    private int skipped;
    private long cachedMtime = -1;

    public LayerToLayerService(DataRoots roots) { this.roots = roots; }

    public synchronized List<LayerToLayerEntryDto> entries() { load(); return entries; }
    public synchronized int skippedRows() { load(); return skipped; }

    private void load() {
        Optional<Path> dwh = roots.dwhControl();
        if (dwh.isEmpty()) { entries = List.of(); skipped = 0; return; }
        Path base = dwh.get().resolve("LAYER_TO_LAYER");
        long newest = LAYER_DIRS.stream().map(d -> base.resolve(d).resolve("statements.sql"))
            .filter(Files::isRegularFile).mapToLong(this::mtime).max().orElse(0);
        if (entries != null && newest == cachedMtime) return;
        List<LayerToLayerEntryDto> out = new ArrayList<>();
        int bad = 0;
        for (String dir : LAYER_DIRS) {
            Path f = base.resolve(dir).resolve("statements.sql");
            if (!Files.isRegularFile(f)) continue;
            for (String stmt : statements(read(f))) {
                try { out.add(parseRow(stmt)); }
                catch (RuntimeException e) { bad++; log.warn("Skipping malformed LayerToLayer row in {}: {}", f, e.getMessage()); }
            }
        }
        entries = List.copyOf(out); skipped = bad; cachedMtime = newest;
    }

    /** Extract the parenthesized VALUES(...) body of each anchored statement (balanced parens, quote-aware). */
    static List<String> statements(String content) {
        List<String> result = new ArrayList<>();
        int idx = 0;
        while ((idx = content.indexOf(ANCHOR, idx)) >= 0) {
            int open = content.indexOf('(', idx + ANCHOR.length());
            if (open < 0) break;
            int depth = 0; boolean inStr = false; int i = open;
            for (; i < content.length(); i++) {
                char c = content.charAt(i);
                if (inStr) { if (c == '\'') inStr = false; }
                else if (c == '\'') inStr = true;
                else if (c == '(') depth++;
                else if (c == ')' && --depth == 0) break;
            }
            if (depth != 0) { result.add(content.substring(open + 1)); idx = open + 1; continue; } // unbalanced → parseRow fails it; keep scanning for later statements
            result.add(content.substring(open + 1, i));
            idx = i;
        }
        return result;
    }

    static LayerToLayerEntryDto parseRow(String body) {
        Cursor c = new Cursor(body);
        String layer = c.string();      c.comma();
        String dir = c.string();        c.comma();
        String recipe = c.string();     c.comma();
        String wf = c.string();         c.comma();
        String target = c.string();     c.comma();
        int order = c.integer();        c.comma();
        List<List<Object>> srcs = c.structArray(3);  c.comma();
        List<Object> lookups = c.scalarArray();      c.comma();
        List<List<Object>> wms = c.structArray(2);   c.comma();
        List<List<Object>> parts = c.structArray(4);
        return new LayerToLayerEntryDto(layer, dir, recipe, wf, target, order,
            srcs.stream().map(s -> new LayerToLayerEntryDto.SourceRef((String) s.get(0), (Boolean) s.get(1), (Integer) s.get(2))).toList(),
            lookups.stream().map(o -> (String) o).toList(),
            wms.stream().map(s -> new LayerToLayerEntryDto.WriteMode((String) s.get(0), (String) s.get(1))).toList(),
            parts.stream().map(s -> new LayerToLayerEntryDto.Partition((String) s.get(0), (String) s.get(1), (String) s.get(2), (String) s.get(3))).toList());
    }

    /** Minimal cursor over the VALUES body: 'str' (''-escape), int, true/false, [..], STRUCT(..). */
    static final class Cursor {
        private final String s; private int p = 0;
        Cursor(String s) { this.s = s; }
        private void ws() { while (p < s.length() && Character.isWhitespace(s.charAt(p))) p++; }
        void comma() { ws(); expect(','); }
        private void expect(char ch) { if (p >= s.length() || s.charAt(p) != ch) throw new IllegalArgumentException("expected '" + ch + "' at " + p); p++; }
        String string() {
            ws(); expect('\'');
            StringBuilder b = new StringBuilder();
            while (p < s.length()) {
                char ch = s.charAt(p++);
                if (ch == '\'') { if (p < s.length() && s.charAt(p) == '\'') { b.append('\''); p++; } else return b.toString(); }
                else b.append(ch);
            }
            throw new IllegalArgumentException("unterminated string");
        }
        int integer() { ws(); int st = p; if (p < s.length() && (s.charAt(p) == '-' || s.charAt(p) == '+')) p++; while (p < s.length() && Character.isDigit(s.charAt(p))) p++; if (st == p) throw new IllegalArgumentException("expected int at " + st); return Integer.parseInt(s.substring(st, p)); }
        boolean bool() { ws(); if (s.startsWith("true", p)) { p += 4; return true; } if (s.startsWith("false", p)) { p += 5; return false; } throw new IllegalArgumentException("expected bool at " + p); }
        Object scalar() { ws(); char ch = s.charAt(p); if (ch == '\'') return string(); if (ch == 't' || ch == 'f') return bool(); return integer(); }
        List<Object> scalarArray() { ws(); expect('['); List<Object> out = new ArrayList<>(); ws(); if (s.charAt(p) == ']') { p++; return out; } while (true) { out.add(scalar()); ws(); if (s.charAt(p) == ',') { p++; continue; } expect(']'); return out; } }
        List<List<Object>> structArray(int arity) {
            ws(); expect('['); List<List<Object>> out = new ArrayList<>(); ws();
            if (s.charAt(p) == ']') { p++; return out; }
            while (true) {
                ws(); if (!s.startsWith("STRUCT", p)) throw new IllegalArgumentException("expected STRUCT at " + p); p += 6; expect('(');
                List<Object> fields = new ArrayList<>();
                for (int i = 0; i < arity; i++) { fields.add(scalar()); ws(); if (i < arity - 1) expect(','); }
                ws(); expect(')'); out.add(fields);
                ws(); if (s.charAt(p) == ',') { p++; continue; }
                expect(']'); return out;
            }
        }
    }
    private long mtime(Path p) { try { return Files.getLastModifiedTime(p).toMillis(); } catch (IOException e) { throw new UncheckedIOException(e); } }
    private String read(Path p) { try { return Files.readString(p); } catch (IOException e) { throw new UncheckedIOException(e); } }
}
