package io.pure360.etl360.service.ipc;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

import static io.pure360.etl360.service.ipc.StructuralRules.rule;

/** The {@code IPC-TYP-*} family — per-kind required keys and shape constraints (spec §5.4). */
final class TypeShapeRules {
    private TypeShapeRules() {}

    private static final Pattern JOINER_INPUT_NAME = Pattern.compile("^.+\\.(MASTER|DETAIL)$");

    static List<IpcRule> all(IpcCatalog catalog) {
        List<IpcRule> rules = new ArrayList<>();
        rules.add(requiredKeys(catalog));
        rules.add(rule("IPC-TYP-ROUTER-002", catalog, (ctx, sev, out) ->
            forEachTarget(ctx, "router", (i, target) -> {
                JsonNode groups = keyOf(target, "groups");
                if (!groups.isArray()) return;
                int defaults = 0;
                for (JsonNode g : groups) if (g.path("default").asBoolean(false)) defaults++;
                if (defaults > 1) {
                    out.add(IpcCheck.fail("IPC-TYP-ROUTER-002", sev,
                        ctx.stepPath(i) + ".target.groups",
                        "router has " + defaults + " default groups; IPC allows at most one"));
                }
            })));
        rules.add(rule("IPC-TYP-NORMALIZER-002", catalog, (ctx, sev, out) ->
            forEachTarget(ctx, "normalizer", (i, target) -> {
                JsonNode nf = keyOf(target, "normalizedFields");
                if (!nf.isArray()) return;
                for (int j = 0; j < nf.size(); j++) {
                    JsonNode refSource = nf.get(j).path("refSource");
                    if (!refSource.isArray() || refSource.isEmpty()) {
                        out.add(IpcCheck.fail("IPC-TYP-NORMALIZER-002", sev,
                            ctx.stepPath(i) + ".target.normalizedFields[" + j + "].refSource",
                            "normalized field must reference at least one input field"));
                    }
                }
            })));
        rules.add(rule("IPC-TYP-JOINERINPUT-001", catalog, (ctx, sev, out) ->
            forEachTarget(ctx, "joinerInput", (i, target) -> {
                String name = target.path("name").asText("");
                if (!JOINER_INPUT_NAME.matcher(name).matches()) {
                    out.add(IpcCheck.fail("IPC-TYP-JOINERINPUT-001", sev,
                        ctx.stepPath(i) + ".target.name",
                        "joiner input name must be <joiner>.MASTER or <joiner>.DETAIL, got \""
                            + name + "\""));
                }
            })));
        rules.add(rule("IPC-TYP-UNION-001", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                JsonNode sources = ctx.steps().get(i).path("sources");
                if (!sources.isArray()) continue;
                for (int j = 0; j < sources.size(); j++) {
                    if (!"union".equals(ctx.sourceType(sources.get(j)))) continue;
                    JsonNode tables = keyOf(sources.get(j), "unionTables");
                    if (!tables.isArray()) continue;
                    for (int k = 0; k < tables.size(); k++) {
                        for (JsonNode fm : tables.get(k).path("fieldMapping")) {
                            if (fm.path("origin").asText("").isBlank()
                                || fm.path("union").asText("").isBlank()) {
                                out.add(IpcCheck.fail("IPC-TYP-UNION-001", sev,
                                    ctx.stepPath(i) + ".sources[" + j + "].unionTables[" + k
                                        + "].fieldMapping",
                                    "every field mapping needs both origin and union"));
                            }
                        }
                    }
                }
            }
        }));
        return rules;
    }

    /** One rule id per required key, driven entirely by the catalogue's key schema. */
    private static IpcRule requiredKeys(IpcCatalog catalog) {
        return new IpcRule() {
            @Override public String id() { return "IPC-TYP-REQUIRED-KEYS"; }
            @Override public void check(RuleContext ctx, List<IpcCheck> out) {
                for (int i = 0; i < ctx.steps().size(); i++) {
                    JsonNode step = ctx.steps().get(i);
                    JsonNode target = step.path("target");
                    if (target.isObject()) {
                        checkNode(catalog, ctx, out, target, "target:" + ctx.targetType(target),
                            ctx.stepPath(i) + ".target");
                    }
                    JsonNode sources = step.path("sources");
                    if (!sources.isArray()) continue;
                    for (int j = 0; j < sources.size(); j++) {
                        JsonNode src = sources.get(j);
                        checkNode(catalog, ctx, out, src, "source:" + ctx.sourceType(src),
                            ctx.stepPath(i) + ".sources[" + j + "]");
                    }
                }
            }
        };
    }

    private static void checkNode(IpcCatalog catalog, RuleContext ctx, List<IpcCheck> out,
                                  JsonNode node, String schemaKey, String path) {
        List<IpcCatalog.IpcKeySpec> specs = catalog.keySchema().get(schemaKey);
        if (specs == null) return; // unknown kind — IPC-STR-005 owns that
        for (IpcCatalog.IpcKeySpec spec : specs) {
            if (!spec.required() || spec.ruleId().isBlank()) continue; // name/type/fields: other rules own them
            if (!keyOf(node, spec.key()).isMissingNode()) continue;
            out.add(IpcCheck.fail(spec.ruleId(), catalog.severity(spec.ruleId()),
                path + "." + spec.key(),
                "required key \"" + spec.key() + "\" is missing for kind " + schemaKey));
        }
    }

    /** Reads a key through the alias table, so {@code greencliff} answers a {@code groups} lookup. */
    private static JsonNode keyOf(JsonNode node, String canonicalKey) {
        JsonNode direct = node.path(canonicalKey);
        if (!direct.isMissingNode()) return direct;
        var it = node.fields();
        while (it.hasNext()) {
            var e = it.next();
            if (canonicalKey.equals(IpcVocabulary.canonicalKey(e.getKey()))) return e.getValue();
        }
        return com.fasterxml.jackson.databind.node.MissingNode.getInstance();
    }

    @FunctionalInterface
    private interface TargetVisitor { void visit(int stepIndex, JsonNode target); }

    private static void forEachTarget(RuleContext ctx, String canonicalKind, TargetVisitor v) {
        for (int i = 0; i < ctx.steps().size(); i++) {
            JsonNode t = ctx.steps().get(i).path("target");
            if (t.isObject() && canonicalKind.equals(ctx.targetType(t))) v.visit(i, t);
        }
    }
}
