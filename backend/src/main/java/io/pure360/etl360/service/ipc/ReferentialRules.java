package io.pure360.etl360.service.ipc;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static io.pure360.etl360.service.ipc.StructuralRules.rule;

/** The {@code IPC-REF-*} family — dot-ref resolution and the step reference graph (spec §5.4). */
final class ReferentialRules {
    private ReferentialRules() {}

    /** One field-level dot-ref, tagged with where it landed and its JSON path for error
     * reporting. {@code table}/{@code field} split {@code source} on the FIRST dot only —
     * a field name may itself contain dots (Router group-qualified ports). */
    record Ref(String table, String field, String toStep, String toField, String path) {}

    /** Mirrors the frontend's {@code collectRefs} ({@code recipeAdapter.ts:134-165}): descend
     * every field's transformation tree, splitting {@code source} on the FIRST dot only, and
     * recursing into {@code parameters} — a Field-shaped parameter (carries its own
     * {@code .transformation}) is unwrapped, a bare transformation-tree parameter is recursed
     * into directly. */
    static List<Ref> collectRefs(RuleContext ctx) {
        List<Ref> refs = new ArrayList<>();
        for (int i = 0; i < ctx.steps().size(); i++) {
            JsonNode target = ctx.steps().get(i).path("target");
            String toStep = target.path("name").asText("");
            JsonNode fields = ctx.fieldsOf(target);
            if (!fields.isArray()) continue;
            for (int j = 0; j < fields.size(); j++) {
                JsonNode field = fields.get(j);
                String toField = field.path("name").asText("");
                String path = ctx.stepPath(i) + ".target." + ctx.fieldsKey(target) + "[" + j + "].transformation";
                walkTransformation(field.path("transformation"), toStep, toField, path, refs);
            }
        }
        return refs;
    }

    private static void walkTransformation(JsonNode t, String toStep, String toField, String path,
                                           List<Ref> out) {
        if (t == null || !t.isObject()) return;
        String source = t.path("source").asText("");
        if (!source.isBlank() && source.contains(".")) {
            int dot = source.indexOf('.');
            String table = source.substring(0, dot);
            String field = source.substring(dot + 1);
            if (!table.isBlank() && !field.isBlank()) {
                out.add(new Ref(table, field, toStep, toField, path));
            }
        }
        JsonNode params = t.path("parameters");
        if (!params.isArray()) return;
        for (int k = 0; k < params.size(); k++) {
            JsonNode param = params.get(k);
            String paramPath = path + ".parameters[" + k + "]";
            if (isFieldShaped(param)) {
                walkTransformation(param.path("transformation"), toStep, toField, paramPath + ".transformation", out);
            } else {
                walkTransformation(param, toStep, toField, paramPath, out);
            }
        }
    }

    /** True if {@code param} is Field-shaped (carries a {@code transformation} key) rather than
     * a bare transformation-tree node ({@code source}/{@code value}/{@code name,parameters}) —
     * mirrors {@code recipeAdapter.ts}'s {@code isFieldShaped}. */
    private static boolean isFieldShaped(JsonNode param) {
        return param.isObject() && param.has("transformation");
    }

    static List<IpcRule> all(IpcCatalog catalog) {
        List<IpcRule> rules = new ArrayList<>();

        rules.add(rule("IPC-REF-001", catalog, (ctx, sev, out) -> {
            for (Ref ref : collectRefs(ctx)) {
                if (!ctx.resolvesAsRefTarget(ref.table())) {
                    out.add(IpcCheck.fail("IPC-REF-001", sev, ref.path(),
                        "dot-ref \"" + ref.table() + "." + ref.field() + "\" table \"" + ref.table()
                            + "\" does not resolve to a step target, step source, or a "
                            + "table.sourceTableNames entry"));
                }
            }
        }));

        rules.add(rule("IPC-REF-002", catalog, (ctx, sev, out) -> {
            Map<String, JsonNode> targetsByLowerName = targetsByLowerName(ctx);
            for (Ref ref : collectRefs(ctx)) {
                JsonNode target = targetsByLowerName.get(ref.table().toLowerCase(Locale.ROOT));
                if (target == null) continue; // not a step target — IPC-REF-001/003 own resolution
                if (resolvesAgainstTargetField(ctx, target, ref.field())) continue;
                out.add(IpcCheck.fail("IPC-REF-002", sev, ref.path(),
                    "dot-ref \"" + ref.table() + "." + ref.field() + "\" field \"" + ref.field()
                        + "\" not found among target \"" + ref.table() + "\"'s fields"));
            }
        }));

        rules.add(rule("IPC-REF-003", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                JsonNode sources = ctx.steps().get(i).path("sources");
                if (!sources.isArray()) continue;
                for (int j = 0; j < sources.size(); j++) {
                    String name = sources.get(j).path("name").asText("");
                    if (name.isBlank()) continue;
                    if (!containsIgnoreCase(ctx.targetNames(), name)
                        && !containsIgnoreCase(ctx.tableSourceNames(), name)) {
                        out.add(IpcCheck.fail("IPC-REF-003", sev, ctx.stepPath(i) + ".sources[" + j + "].name",
                            "source \"" + name + "\" does not resolve to a step target or a "
                                + "table.sourceTableNames entry"));
                    }
                }
            }
        }));

        rules.add(rule("IPC-REF-004", catalog, (ctx, sev, out) -> {
            for (Ref ref : collectRefs(ctx)) {
                if (!ref.toStep().isBlank() && ref.table().equalsIgnoreCase(ref.toStep())) {
                    out.add(IpcCheck.fail("IPC-REF-004", sev, ref.path(),
                        "field \"" + ref.toField() + "\" of step \"" + ref.toStep()
                            + "\" references its own step"));
                }
            }
        }));

        rules.add(rule("IPC-REF-005", catalog, (ctx, sev, out) -> {
            Set<String> targetTableNames = new LinkedHashSet<>();
            JsonNode ttn = ctx.recipe().path("table").path("targetTableNames");
            if (ttn.isArray()) for (JsonNode n : ttn) if (n.isTextual()) targetTableNames.add(n.asText());
            for (int i = 0; i < ctx.steps().size(); i++) {
                JsonNode target = ctx.steps().get(i).path("target");
                if (!"table".equals(ctx.targetType(target))) continue;
                String name = target.path("name").asText("");
                if (name.isBlank()) continue;
                if (!containsIgnoreCase(targetTableNames, name)) {
                    out.add(IpcCheck.fail("IPC-REF-005", sev, ctx.stepPath(i) + ".target.name",
                        "table target \"" + name + "\" is missing from table.targetTableNames"));
                }
            }
        }));

        rules.add(rule("IPC-REF-006", catalog, (ctx, sev, out) -> {
            Map<String, Set<String>> preds = predecessorGraph(ctx, collectRefs(ctx));
            Set<String> visited = new HashSet<>();
            Set<String> inProgress = new LinkedHashSet<>();
            Set<String> cyclic = new LinkedHashSet<>();
            for (String node : preds.keySet()) detectCycle(node, preds, visited, inProgress, cyclic);
            if (cyclic.isEmpty()) return;
            Map<String, Integer> indexByName = new LinkedHashMap<>();
            for (int i = 0; i < ctx.steps().size(); i++) {
                String n = ctx.steps().get(i).path("target").path("name").asText("");
                if (!n.isBlank()) indexByName.putIfAbsent(n, i);
            }
            for (String node : cyclic) {
                Integer idx = indexByName.get(node);
                String path = idx == null ? "$.steps" : ctx.stepPath(idx) + ".target";
                out.add(IpcCheck.fail("IPC-REF-006", sev, path,
                    "step target \"" + node + "\" participates in a reference cycle"));
            }
        }));

        return rules;
    }

    /**
     * True if {@code fieldName} resolves against {@code target}'s downstream-visible port
     * namespace. Most kinds expose that as plain {@code fields} ({@link RuleContext#fieldsOf}),
     * but three kinds have a SEPARATE namespace a dot-ref may legitimately name instead:
     * <ul>
     *   <li>{@code router} — a group-qualified port {@code <group>.<port>}
     *       ({@code AbstractTarget.scala:42-47}, {@code RouterGroup(name, ..., fields)}): split
     *       {@code fieldName} on its FIRST dot ({@code port} may itself contain further dots),
     *       find that group in {@code groups} (alias {@code greencliff}), then {@code port} in
     *       THAT GROUP's own {@code fields} — not the router target's top-level {@code fields},
     *       which hold the pre-routing INPUT ports the groups' own fields source FROM.</li>
     *   <li>{@code normalizer} — its {@code normalizedFields[].name} (OUTPUT ports); the
     *       target's plain {@code fields} holds the {@code _in}-suffixed INPUT ports instead
     *       ({@code AbstractTarget.scala:60-76}).</li>
     *   <li>{@code storedProcedure} — its {@code returnField}, a single output value that is
     *       not part of {@code fields} ({@code AbstractTarget.scala:87}).</li>
     * </ul>
     */
    private static boolean resolvesAgainstTargetField(RuleContext ctx, JsonNode target, String fieldName) {
        if (containsFieldNamed(ctx.fieldsOf(target), fieldName)) return true;
        switch (ctx.targetType(target)) {
            case "router" -> {
                int dot = fieldName.indexOf('.');
                if (dot <= 0) return false;
                String groupName = fieldName.substring(0, dot);
                String portName = fieldName.substring(dot + 1);
                JsonNode groups = groupsOf(target);
                if (!groups.isArray()) return false;
                for (JsonNode group : groups) {
                    if (groupName.equalsIgnoreCase(group.path("name").asText(""))) {
                        return containsFieldNamed(ctx.fieldsOf(group), portName);
                    }
                }
                return false;
            }
            case "normalizer" -> {
                return containsFieldNamed(target.path("normalizedFields"), fieldName);
            }
            case "storedProcedure" -> {
                return fieldName.equalsIgnoreCase(target.path("returnField").asText(""));
            }
            default -> {
                return false;
            }
        }
    }

    private static boolean containsFieldNamed(JsonNode fields, String name) {
        if (!fields.isArray()) return false;
        for (JsonNode f : fields) {
            if (name.equalsIgnoreCase(f.path("name").asText(""))) return true;
        }
        return false;
    }

    /** {@code target.groups}, alias-resolved ({@code greencliff} -> {@code groups}) — mirrors
     * {@code TypeShapeRules.keyOf}. */
    private static JsonNode groupsOf(JsonNode target) {
        JsonNode direct = target.path("groups");
        if (direct.isArray()) return direct;
        var it = target.fields();
        while (it.hasNext()) {
            var e = it.next();
            if ("groups".equals(IpcVocabulary.canonicalKey(e.getKey())) && e.getValue().isArray()) {
                return e.getValue();
            }
        }
        return com.fasterxml.jackson.databind.node.MissingNode.getInstance();
    }

    private static Map<String, JsonNode> targetsByLowerName(RuleContext ctx) {
        Map<String, JsonNode> byName = new LinkedHashMap<>();
        for (JsonNode step : ctx.steps()) {
            JsonNode target = step.path("target");
            String name = target.path("name").asText("");
            if (!name.isBlank()) byName.putIfAbsent(name.toLowerCase(Locale.ROOT), target);
        }
        return byName;
    }

    /** {@code stepName -> set of step target names its own dot-refs resolve to} — the same
     * predecessor shape {@code canvasLayout.computeLayers} builds ({@code canvasLayout.ts:32-51}). */
    private static Map<String, Set<String>> predecessorGraph(RuleContext ctx, List<Ref> refs) {
        Map<String, Set<String>> preds = new LinkedHashMap<>();
        Set<String> targetNamesLower = new HashSet<>();
        Map<String, String> canonicalByLower = new LinkedHashMap<>();
        for (JsonNode step : ctx.steps()) {
            String name = step.path("target").path("name").asText("");
            if (name.isBlank()) continue;
            preds.putIfAbsent(name, new LinkedHashSet<>());
            targetNamesLower.add(name.toLowerCase(Locale.ROOT));
            canonicalByLower.putIfAbsent(name.toLowerCase(Locale.ROOT), name);
        }
        for (Ref ref : refs) {
            if (ref.toStep().isBlank()) continue;
            String tableLower = ref.table().toLowerCase(Locale.ROOT);
            if (!targetNamesLower.contains(tableLower)) continue; // not another step target — no graph edge
            String canonicalTable = canonicalByLower.get(tableLower);
            if (canonicalTable.equalsIgnoreCase(ref.toStep())) continue; // self-ref: IPC-REF-004 owns it
            preds.computeIfAbsent(ref.toStep(), k -> new LinkedHashSet<>()).add(canonicalTable);
        }
        return preds;
    }

    /** DFS with an in-progress set: a back-edge into an in-progress (ancestor) node is a cycle,
     * treated as absent (skipped) rather than recursed into — same idiom as
     * {@code canvasLayout.computeLayers} ({@code canvasLayout.ts:32-51}). */
    private static void detectCycle(String node, Map<String, Set<String>> preds, Set<String> visited,
                                    Set<String> inProgress, Set<String> cyclic) {
        if (visited.contains(node)) return;
        inProgress.add(node);
        for (String p : preds.getOrDefault(node, Set.of())) {
            if (inProgress.contains(p)) {
                cyclic.add(node);
                cyclic.add(p);
                continue; // back-edge (cycle): treat as absent
            }
            detectCycle(p, preds, visited, inProgress, cyclic);
        }
        inProgress.remove(node);
        visited.add(node);
    }

    private static boolean containsIgnoreCase(Set<String> set, String name) {
        for (String s : set) if (s.equalsIgnoreCase(name)) return true;
        return false;
    }
}
