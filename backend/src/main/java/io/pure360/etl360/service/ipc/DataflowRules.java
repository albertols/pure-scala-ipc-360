package io.pure360.etl360.service.ipc;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import static io.pure360.etl360.service.ipc.StructuralRules.rule;

/** The {@code IPC-FLW-*} family — step-graph reachability and lookup bind-variable sanity
 * (spec §5.4). */
final class DataflowRules {
    private DataflowRules() {}

    static List<IpcRule> all(IpcCatalog catalog) {
        List<IpcRule> rules = new ArrayList<>();

        // IPC-FLW-001 deliberately classifies "source" steps from the STRUCTURAL sources[]
        // array (canonical source type "table"), NOT from the dot-ref graph IPC-REF-006 and
        // IPC-FLW-003 build via ReferentialRules.collectRefs. This mirrors the parser's own
        // producer/consumer graph (RecipeGenerator.sortStepsTopologically,
        // RecipeGenerator.scala:82-98), which walks `step.sources` and treats
        // `case "table" => Nil` as a chain terminator — a step reading a physical table needs
        // no upstream producer. The dot-ref graph answers a different question (does this
        // step's OWN field-level formulas reference another step's output?) and a step can
        // legitimately have sources[] wiring with fields that carry no dot-refs at all (e.g. a
        // filter/router step whose condition is the only thing referencing the source), so the
        // two graphs are not interchangeable here.
        rules.add(rule("IPC-FLW-001", catalog, (ctx, sev, out) -> {
            List<JsonNode> steps = ctx.steps();
            Map<String, Integer> indexByLowerName = new LinkedHashMap<>();
            for (int i = 0; i < steps.size(); i++) {
                String name = steps.get(i).path("target").path("name").asText("");
                if (!name.isBlank()) indexByLowerName.putIfAbsent(name.toLowerCase(Locale.ROOT), i);
            }
            boolean[] isSource = new boolean[steps.size()];
            List<Set<Integer>> forward = new ArrayList<>();
            for (int i = 0; i < steps.size(); i++) forward.add(new LinkedHashSet<>());
            for (int i = 0; i < steps.size(); i++) {
                JsonNode sources = steps.get(i).path("sources");
                if (!sources.isArray()) continue;
                for (JsonNode src : sources) {
                    if ("table".equals(ctx.sourceType(src))) isSource[i] = true;
                    String sname = src.path("name").asText("");
                    if (sname.isBlank()) continue;
                    Integer predIdx = indexByLowerName.get(sname.toLowerCase(Locale.ROOT));
                    if (predIdx != null && predIdx != i) forward.get(predIdx).add(i);
                }
            }
            boolean[] visited = new boolean[steps.size()];
            Deque<Integer> queue = new ArrayDeque<>();
            for (int i = 0; i < steps.size(); i++) {
                if (isSource[i] && !visited[i]) { visited[i] = true; queue.add(i); }
            }
            while (!queue.isEmpty()) {
                int cur = queue.poll();
                for (int next : forward.get(cur)) {
                    if (!visited[next]) { visited[next] = true; queue.add(next); }
                }
            }
            for (int i = 0; i < steps.size(); i++) {
                if (isSource[i] || visited[i]) continue;
                String name = steps.get(i).path("target").path("name").asText("");
                out.add(IpcCheck.fail("IPC-FLW-001", sev, ctx.stepPath(i) + ".target.name",
                    "step \"" + name + "\" is not reachable from any source-reading step"));
            }
        }));

        rules.add(rule("IPC-FLW-002", catalog, (ctx, sev, out) -> {
            JsonNode ttn = ctx.recipe().path("table").path("targetTableNames");
            if (!ttn.isArray()) return;
            for (int k = 0; k < ttn.size(); k++) {
                JsonNode n = ttn.get(k);
                if (!n.isTextual()) continue;
                String name = n.asText();
                if (!containsIgnoreCase(ctx.targetNames(), name)) {
                    out.add(IpcCheck.fail("IPC-FLW-002", sev, "$.table.targetTableNames[" + k + "]",
                        "targetTableNames entry \"" + name + "\" is not a step target"));
                }
            }
        }));

        rules.add(rule("IPC-FLW-003", catalog, (ctx, sev, out) -> {
            List<ReferentialRules.Ref> refs = ReferentialRules.collectRefs(ctx);
            for (int i = 0; i < ctx.steps().size(); i++) {
                String name = ctx.steps().get(i).path("target").path("name").asText("");
                if (name.isBlank()) continue;
                boolean outbound = refs.stream().anyMatch(r -> r.toStep().equalsIgnoreCase(name));
                boolean inbound = refs.stream().anyMatch(r -> r.table().equalsIgnoreCase(name));
                if (!outbound && !inbound) {
                    out.add(IpcCheck.fail("IPC-FLW-003", sev, ctx.stepPath(i) + ".target.name",
                        "step target \"" + name + "\" has neither inbound nor outbound references (orphan)"));
                }
            }
        }));

        rules.add(rule("IPC-FLW-004", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                JsonNode target = ctx.steps().get(i).path("target");
                JsonNode fields = ctx.fieldsOf(target);
                if (!fields.isArray()) continue;
                for (int j = 0; j < fields.size(); j++) {
                    JsonNode field = fields.get(j);
                    String path = ctx.stepPath(i) + ".target." + ctx.fieldsKey(target) + "[" + j + "].transformation";
                    List<JsonNode> lookups = new ArrayList<>();
                    collectLookups(field.path("transformation"), lookups);
                    for (JsonNode lookup : lookups) {
                        String condition = lookup.path("condition").asText("");
                        List<String> bindVars = new ArrayList<>();
                        for (JsonNode p : lookup.path("parameters")) {
                            String pname = p.path("name").asText("");
                            if (!pname.isBlank()) bindVars.add(pname);
                        }
                        if (bindVars.isEmpty()) continue; // nothing to reference — not this rule's concern
                        boolean referenced = bindVars.stream().anyMatch(v ->
                            Pattern.compile("\\b" + Pattern.quote(v) + "\\b").matcher(condition).find());
                        if (!referenced) {
                            out.add(IpcCheck.fail("IPC-FLW-004", sev, path + ".condition",
                                "EXP_LOOKUP condition \"" + condition + "\" references none of its own bind "
                                    + "variables " + bindVars));
                        }
                    }
                }
            }
        }));

        return rules;
    }

    /** Finds every {@code EXP_LOOKUP} node in a transformation tree, recursing into
     * {@code parameters} the same way {@code ReferentialRules.collectRefs} does (a Field-shaped
     * parameter is unwrapped via its {@code .transformation}). */
    private static void collectLookups(JsonNode t, List<JsonNode> out) {
        if (t == null || !t.isObject()) return;
        if ("EXP_LOOKUP".equals(t.path("name").asText(""))) out.add(t);
        JsonNode params = t.path("parameters");
        if (!params.isArray()) return;
        for (JsonNode param : params) {
            JsonNode next = isFieldShaped(param) ? param.path("transformation") : param;
            collectLookups(next, out);
        }
    }

    private static boolean isFieldShaped(JsonNode param) {
        return param.isObject() && param.has("transformation");
    }

    private static boolean containsIgnoreCase(Set<String> set, String name) {
        for (String s : set) if (s.equalsIgnoreCase(name)) return true;
        return false;
    }
}
