package io.pure360.etl360.service.ipc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Rule metadata, alias table and per-kind key schema, loaded once from
 * {@code classpath:/ipc/ipc-rules.json}. Rule LOGIC lives in the {@link IpcRule}
 * implementations; only metadata lives here, and {@code IpcRulesContractTest} asserts the two
 * id sets match (spec §5.4).
 */
@Component
public class IpcCatalog {
    public record IpcRuleMeta(String id, String severity, String statement,
                              String parserRef, String ipcRef, String wikiRef) {}

    /** {@code ruleId} is the {@code IPC-TYP-*} id that fires when a {@code required} key is
     * missing; blank for optional keys. Carried explicitly rather than derived from array
     * position, so the JSON and the emitted check ids cannot drift apart. */
    public record IpcKeySpec(String key, String parserType, boolean required,
                             String widget, String ruleId) {}

    private final Map<String, IpcRuleMeta> byId = new LinkedHashMap<>();
    private final Map<String, List<IpcKeySpec>> keySchema = new LinkedHashMap<>();
    private final Map<String, String> typeAliases = new LinkedHashMap<>();
    private final Map<String, String> keyAliases = new LinkedHashMap<>();

    public IpcCatalog() {
        ObjectMapper mapper = new ObjectMapper();
        try (InputStream in = IpcCatalog.class.getResourceAsStream("/ipc/ipc-rules.json")) {
            if (in == null) throw new IllegalStateException("Missing classpath:/ipc/ipc-rules.json");
            JsonNode root = mapper.readTree(in);
            for (JsonNode r : root.path("rules")) {
                IpcRuleMeta meta = new IpcRuleMeta(
                    r.path("id").asText(), r.path("severity").asText(),
                    r.path("statement").asText(), r.path("parserRef").asText(),
                    r.path("ipcRef").asText(), r.path("wikiRef").asText());
                byId.put(meta.id(), meta);
            }
            root.path("keySchema").fields().forEachRemaining(e -> {
                List<IpcKeySpec> specs = new ArrayList<>();
                for (JsonNode k : e.getValue()) {
                    specs.add(new IpcKeySpec(k.path("key").asText(), k.path("parserType").asText(),
                        k.path("required").asBoolean(false), k.path("widget").asText(),
                        k.path("ruleId").asText("")));
                }
                keySchema.put(e.getKey(), List.copyOf(specs));
            });
            root.path("typeAliases").fields()
                .forEachRemaining(e -> typeAliases.put(e.getKey(), e.getValue().asText()));
            root.path("keyAliases").fields()
                .forEachRemaining(e -> keyAliases.put(e.getKey(), e.getValue().asText()));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public IpcRuleMeta meta(String ruleId) { return byId.get(ruleId); }

    /** Severity for a rule id; {@code "error"} when the id is unknown, so a missing catalogue
     * entry never silently downgrades a real violation to a warning. */
    public String severity(String ruleId) {
        IpcRuleMeta m = byId.get(ruleId);
        return m == null ? "error" : m.severity();
    }

    public List<IpcRuleMeta> rules() { return List.copyOf(byId.values()); }
    public Map<String, List<IpcKeySpec>> keySchema() { return Map.copyOf(keySchema); }
    public Map<String, String> typeAliases() { return Map.copyOf(typeAliases); }
    public Map<String, String> keyAliases() { return Map.copyOf(keyAliases); }
}
