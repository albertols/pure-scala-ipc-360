package io.pure360.etl360.service.ipc;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import static io.pure360.etl360.service.ipc.StructuralRules.rule;

/**
 * The {@code IPC-EXP-*} family — expression call-tree and operator-literal vocabulary
 * (spec §5.4).
 *
 * <p>{@link #PREDEFINED_FUNCTIONS} and the four operator sets below are a Java COPY of
 * {@code RecipeConstants.scala:48-57} ({@code PredefinedFunctions}, {@code ArithmeticOperators},
 * {@code ComparisonOperators}, {@code LogicalOperators}, {@code StringOperators}) — the backend
 * depends on the parser module, so Scala interop was possible, but this copy is deliberate to
 * keep Scala 2.12 collection interop out of backend Java (human ruling, Task 4 brief). This copy
 * MUST be updated together with the Scala source whenever it changes.
 */
public final class ExpressionRules {
    private ExpressionRules() {}

    /** {@code RecipeConstants.scala:48-51} — verbatim copy. NOTE: the Scala source declares
     * 35 entries, not the 36 the Task 4 brief expected; verified by counting the quoted string
     * literals in {@code PredefinedFunctions = List(...)} directly. Declared {@code public}: Task
     * 6's contract test (a different package) reads it. */
    public static final Set<String> PREDEFINED_FUNCTIONS = Set.of(
        "TO_DATE", "TO_CHAR", "LPAD", "RPAD", "SUBSTR", "REPLACECHR", "TO_DECIMAL",
        "REPLACESTR", "CONCAT", "TRUNC", "TO_INTEGER", "LENGTH", "UPPER", "ISNULL", "IS_NUMBER", "INSTR", "IN", "IIF",
        "COUNT", "MAX", "MIN", "GREATEST", "IS_SPACES", "DECODE", "ABS", "ADD_TO_DATE", "LAST_DAY", "SUM", "DATE_DIFF",
        "GET_DATE_PART", "IS_DATE", "CHR", "REG_MATCH", "LEAST", "REG_REPLACE");

    /** {@code RecipeConstants.scala:54} — verbatim copy. */
    static final Set<String> ARITHMETIC_OPERATORS = Set.of("+", "-", "*", "/");

    /** {@code RecipeConstants.scala:55} — verbatim copy. */
    static final Set<String> COMPARISON_OPERATORS = Set.of("<=", ">=", "<>", "!=", "^=", "=", ">", "<");

    /** {@code RecipeConstants.scala:56} — verbatim copy. Leading/trailing spaces are part of the
     * literal: {@code identifyOperator} (parser/.../ExpressionParserUtils.scala:23-44) captures
     * the exact list entry into the embedded {@code RecipeTransformationValue}, so " AND " (with
     * spaces) is the value that actually lands in recipe JSON, not "AND". */
    static final Set<String> LOGICAL_OPERATORS = Set.of(" AND ", " and ", " OR ", " or ");

    /** {@code RecipeConstants.scala:57} — verbatim copy. */
    static final Set<String> STRING_OPERATORS = Set.of("||");

    private static final Set<String> ALL_OPERATORS = union();

    private static Set<String> union() {
        Set<String> all = new LinkedHashSet<>();
        all.addAll(ARITHMETIC_OPERATORS);
        all.addAll(COMPARISON_OPERATORS);
        all.addAll(LOGICAL_OPERATORS);
        all.addAll(STRING_OPERATORS);
        return all;
    }

    /** The three call-tree markers whose parser encoding embeds the raw operator token as the
     * middle element of a 3-parameter list ({@code ExpressionParsing.scala:98-121}) — the shape
     * IPC-EXP-002 validates. {@code EXP_CONCAT} does not: {@code ExpressionParsing.scala:93-97}
     * discards the {@code ||} token itself, keeping only the two operands. */
    private static final Set<String> OPERATOR_MARKERS = Set.of("EXP_ARITHMETIC", "EXP_COMPARISON", "EXP_LOGICAL");

    private static final Set<String> VALID_MATCH_POLICIES = Set.of("Any", "First", "Last");

    static List<IpcRule> all(IpcCatalog catalog) {
        List<IpcRule> rules = new ArrayList<>();

        rules.add(rule("IPC-EXP-001", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                JsonNode target = ctx.steps().get(i).path("target");
                JsonNode fields = ctx.fieldsOf(target);
                if (!fields.isArray()) continue;
                for (int j = 0; j < fields.size(); j++) {
                    JsonNode field = fields.get(j);
                    String basePath = ctx.stepPath(i) + ".target." + ctx.fieldsKey(target) + "[" + j
                        + "].transformation";
                    List<CallSite> calls = new ArrayList<>();
                    collectCallSites(field.path("transformation"), basePath, calls);
                    for (CallSite call : calls) {
                        if (call.name().startsWith("EXP_")) continue;
                        if (PREDEFINED_FUNCTIONS.contains(call.name())) continue;
                        out.add(IpcCheck.fail("IPC-EXP-001", sev, call.path(),
                            "call-tree name \"" + call.name()
                                + "\" is neither an EXP_* marker nor a predefined function"));
                    }
                }
            }
        }));

        rules.add(rule("IPC-EXP-002", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                JsonNode target = ctx.steps().get(i).path("target");
                JsonNode fields = ctx.fieldsOf(target);
                if (!fields.isArray()) continue;
                for (int j = 0; j < fields.size(); j++) {
                    JsonNode field = fields.get(j);
                    String basePath = ctx.stepPath(i) + ".target." + ctx.fieldsKey(target) + "[" + j
                        + "].transformation";
                    checkOperatorLiterals(field.path("transformation"), basePath, sev, out);
                }
            }
        }));

        rules.add(rule("IPC-EXP-003", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                JsonNode target = ctx.steps().get(i).path("target");
                JsonNode fields = ctx.fieldsOf(target);
                if (!fields.isArray()) continue;
                for (int j = 0; j < fields.size(); j++) {
                    JsonNode field = fields.get(j);
                    String basePath = ctx.stepPath(i) + ".target." + ctx.fieldsKey(target) + "[" + j
                        + "].transformation";
                    List<JsonNode> lookups = new ArrayList<>();
                    collectLookups(field.path("transformation"), lookups);
                    for (JsonNode lookup : lookups) {
                        String policy = lookup.path("matchPolicy").asText("");
                        if (!VALID_MATCH_POLICIES.contains(policy)) {
                            out.add(IpcCheck.fail("IPC-EXP-003", sev, basePath + ".matchPolicy",
                                "EXP_LOOKUP matchPolicy \"" + policy + "\" is not one of Any, First, Last"));
                        }
                    }
                }
            }
        }));

        return rules;
    }

    /** One call-tree node's {@code name}, tagged with its JSON path for error reporting. */
    private record CallSite(String name, String path) {}

    /** Walks every node of a transformation tree (not just dot-refs) and records every non-blank
     * {@code name}, recursing into {@code parameters} with the same Field-shaped unwrapping
     * {@code ReferentialRules.collectRefs} uses. */
    private static void collectCallSites(JsonNode t, String path, List<CallSite> out) {
        if (t == null || !t.isObject()) return;
        String name = t.path("name").asText("");
        if (!name.isBlank()) out.add(new CallSite(name, path));
        JsonNode params = t.path("parameters");
        if (!params.isArray()) return;
        for (int k = 0; k < params.size(); k++) {
            JsonNode param = params.get(k);
            if (isFieldShaped(param)) {
                collectCallSites(param.path("transformation"), path + ".parameters[" + k + "].transformation", out);
            } else {
                collectCallSites(param, path + ".parameters[" + k + "]", out);
            }
        }
    }

    /** For the three operator markers, {@code parameters[1]} is the operator token itself,
     * embedded as a bare {@code {value}} node ({@code ExpressionParsing.scala:98-121}); its value
     * must belong to the union of the four operator sets. */
    private static void checkOperatorLiterals(JsonNode t, String path, String sev, List<IpcCheck> out) {
        if (t == null || !t.isObject()) return;
        String name = t.path("name").asText("");
        JsonNode params = t.path("parameters");
        if (OPERATOR_MARKERS.contains(name) && params.isArray() && params.size() == 3) {
            JsonNode opNode = params.get(1);
            if (opNode.isObject() && !opNode.path("value").isMissingNode()
                && opNode.path("name").asText("").isBlank() && opNode.path("source").asText("").isBlank()) {
                String value = opNode.path("value").asText("");
                if (!ALL_OPERATORS.contains(value)) {
                    out.add(IpcCheck.fail("IPC-EXP-002", sev, path + ".parameters[1].value",
                        "operator literal \"" + value + "\" is not a member of the arithmetic/comparison/"
                            + "logical/string operator sets"));
                }
            }
        }
        if (!params.isArray()) return;
        for (int k = 0; k < params.size(); k++) {
            JsonNode param = params.get(k);
            if (isFieldShaped(param)) {
                checkOperatorLiterals(param.path("transformation"), path + ".parameters[" + k + "].transformation",
                    sev, out);
            } else {
                checkOperatorLiterals(param, path + ".parameters[" + k + "]", sev, out);
            }
        }
    }

    /** Finds every {@code EXP_LOOKUP} node in a transformation tree, same walk shape as
     * {@link #collectCallSites}. */
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
}
