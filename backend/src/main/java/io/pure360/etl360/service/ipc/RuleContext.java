package io.pure360.etl360.service.ipc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.MissingNode;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** The parsed recipe plus the indexes every rule family needs, computed once per run. */
public final class RuleContext {
    private final JsonNode recipe;
    private final List<JsonNode> steps = new ArrayList<>();
    private final Set<String> targetNames = new LinkedHashSet<>();
    private final Set<String> sourceNames = new LinkedHashSet<>();
    private final Set<String> tableSourceNames = new LinkedHashSet<>();

    public RuleContext(JsonNode recipe) {
        this.recipe = recipe == null ? MissingNode.getInstance() : recipe;
        JsonNode s = this.recipe.path("steps");
        if (s.isArray()) s.forEach(steps::add);
        for (JsonNode step : steps) {
            String tn = step.path("target").path("name").asText("");
            if (!tn.isBlank()) targetNames.add(tn);
            JsonNode srcs = step.path("sources");
            if (srcs.isArray()) {
                for (JsonNode src : srcs) {
                    String n = src.path("name").asText("");
                    if (!n.isBlank()) sourceNames.add(n);
                }
            }
        }
        JsonNode st = this.recipe.path("table").path("sourceTableNames");
        if (st.isArray()) for (JsonNode n : st) if (n.isTextual()) tableSourceNames.add(n.asText());
    }

    public JsonNode recipe() { return recipe; }
    public List<JsonNode> steps() { return steps; }
    public Set<String> targetNames() { return targetNames; }
    public Set<String> sourceNames() { return sourceNames; }
    public Set<String> tableSourceNames() { return tableSourceNames; }

    public String stepPath(int i) { return "$.steps[" + i + "]"; }

    /** Canonical target type for a step target, alias-resolved. */
    public String targetType(JsonNode target) {
        return IpcVocabulary.canonicalTargetType(target.path("type").asText(""));
    }

    public String sourceType(JsonNode source) {
        return IpcVocabulary.canonicalSourceType(source.path("type").asText(""));
    }

    /** {@code fields} or the pre-repair {@code weststone} spelling; never null. */
    public JsonNode fieldsOf(JsonNode target) {
        JsonNode f = target.path("fields");
        if (f.isArray()) return f;
        JsonNode w = target.path("weststone");
        return w.isArray() ? w : MissingNode.getInstance();
    }

    /** The literal key {@link #fieldsOf} read, for error paths. */
    public String fieldsKey(JsonNode target) {
        return target.path("fields").isArray() ? "fields" : "weststone";
    }

    /** Case-insensitive membership across every name a dot-ref may address. */
    public boolean resolvesAsRefTarget(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        return containsIgnoreCase(targetNames, lower)
            || containsIgnoreCase(sourceNames, lower)
            || containsIgnoreCase(tableSourceNames, lower);
    }

    private static boolean containsIgnoreCase(Set<String> set, String lower) {
        for (String s : set) if (s.toLowerCase(Locale.ROOT).equals(lower)) return true;
        return false;
    }
}
