package io.pure360.etl360.service.ipc;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** The {@code IPC-STR-*} family — shape invariants that hold for every recipe (spec §5.4). */
final class StructuralRules {
    private StructuralRules() {}

    /** ScalaType.scala:7 — the nine legal field dataTypes. */
    private static final Set<String> DATA_TYPES = Set.of(
        "String", "BigDecimal", "Long", "Integer", "Timestamp",
        "LocalDateTime", "LocalDate", "Boolean", "Unknown");

    static List<IpcRule> all(IpcCatalog catalog) {
        List<IpcRule> rules = new ArrayList<>();

        rules.add(rule("IPC-STR-001", catalog, (ctx, sev, out) -> {
            JsonNode steps = ctx.recipe().path("steps");
            if (!steps.isArray() || steps.isEmpty()) {
                out.add(IpcCheck.fail("IPC-STR-001", sev, "$.steps", "steps must be a non-empty array"));
            }
        }));

        rules.add(rule("IPC-STR-002", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                if (!ctx.steps().get(i).path("target").isObject()) {
                    out.add(IpcCheck.fail("IPC-STR-002", sev, ctx.stepPath(i) + ".target",
                        "step target is missing"));
                }
            }
        }));

        rules.add(rule("IPC-STR-003", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                JsonNode t = ctx.steps().get(i).path("target");
                if (t.isObject() && t.path("name").asText("").isBlank()) {
                    out.add(IpcCheck.fail("IPC-STR-003", sev, ctx.stepPath(i) + ".target.name",
                        "step target is missing a name"));
                }
            }
        }));

        rules.add(rule("IPC-STR-004", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                JsonNode t = ctx.steps().get(i).path("target");
                if (t.isObject() && t.path("type").asText("").isBlank()) {
                    out.add(IpcCheck.fail("IPC-STR-004", sev, ctx.stepPath(i) + ".target.type",
                        "step target is missing a type"));
                }
            }
        }));

        rules.add(rule("IPC-STR-005", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                JsonNode t = ctx.steps().get(i).path("target");
                String raw = t.path("type").asText("");
                if (raw.isBlank()) continue; // IPC-STR-004 owns this
                if (!IpcVocabulary.TARGET_TYPES.contains(IpcVocabulary.canonicalTargetType(raw))) {
                    out.add(IpcCheck.fail("IPC-STR-005", sev, ctx.stepPath(i) + ".target.type",
                        "unknown step target type \"" + raw + "\""));
                }
                JsonNode sources = ctx.steps().get(i).path("sources");
                if (!sources.isArray()) continue;
                for (int j = 0; j < sources.size(); j++) {
                    String sraw = sources.get(j).path("type").asText("");
                    if (sraw.isBlank()) continue;
                    if (!IpcVocabulary.SOURCE_TYPES.contains(IpcVocabulary.canonicalSourceType(sraw))) {
                        out.add(IpcCheck.fail("IPC-STR-005", sev,
                            ctx.stepPath(i) + ".sources[" + j + "].type",
                            "unknown step source type \"" + sraw + "\""));
                    }
                }
            }
        }));

        rules.add(rule("IPC-STR-006", catalog, (ctx, sev, out) -> {
            Set<String> seen = new HashSet<>();
            for (int i = 0; i < ctx.steps().size(); i++) {
                String name = ctx.steps().get(i).path("target").path("name").asText("");
                if (name.isBlank()) continue;
                if (!seen.add(name)) {
                    out.add(IpcCheck.fail("IPC-STR-006", sev, ctx.stepPath(i) + ".target.name",
                        "duplicate step target name \"" + name + "\""));
                }
            }
        }));

        rules.add(rule("IPC-STR-007", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                JsonNode t = ctx.steps().get(i).path("target");
                JsonNode fields = ctx.fieldsOf(t);
                if (!fields.isArray()) continue;
                Set<String> seen = new HashSet<>();
                for (int j = 0; j < fields.size(); j++) {
                    String n = fields.get(j).path("name").asText("");
                    if (n.isBlank()) continue;
                    if (!seen.add(n)) {
                        out.add(IpcCheck.fail("IPC-STR-007", sev,
                            ctx.stepPath(i) + ".target." + ctx.fieldsKey(t) + "[" + j + "].name",
                            "duplicate field name \"" + n + "\""));
                    }
                }
            }
        }));

        rules.add(rule("IPC-STR-008", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                JsonNode t = ctx.steps().get(i).path("target");
                JsonNode fields = ctx.fieldsOf(t);
                if (!fields.isArray()) continue;
                for (int j = 0; j < fields.size(); j++) {
                    String dt = fields.get(j).path("dataType").asText("");
                    if (dt.isBlank() || DATA_TYPES.contains(dt)) continue;
                    out.add(IpcCheck.fail("IPC-STR-008", sev,
                        ctx.stepPath(i) + ".target." + ctx.fieldsKey(t) + "[" + j + "].dataType",
                        "unknown dataType \"" + dt + "\""));
                }
            }
        }));

        rules.add(rule("IPC-STR-009", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                JsonNode t = ctx.steps().get(i).path("target");
                JsonNode fields = ctx.fieldsOf(t);
                if (!fields.isArray()) continue;
                for (int j = 0; j < fields.size(); j++) {
                    if (fields.get(j).path("name").asText("").isBlank()) {
                        out.add(IpcCheck.fail("IPC-STR-009", sev,
                            ctx.stepPath(i) + ".target." + ctx.fieldsKey(t) + "[" + j + "]",
                            "field is missing a name"));
                    }
                }
            }
        }));

        return rules;
    }

    /** Small adapter so each rule above reads as a lambda over (ctx, severity, out). */
    @FunctionalInterface
    interface Body { void run(RuleContext ctx, String severity, List<IpcCheck> out); }

    static IpcRule rule(String id, IpcCatalog catalog, Body body) {
        return new IpcRule() {
            @Override public String id() { return id; }
            @Override public void check(RuleContext ctx, List<IpcCheck> out) {
                body.run(ctx, catalog.severity(id), out);
            }
        };
    }
}
