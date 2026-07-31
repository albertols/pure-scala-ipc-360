package io.pure360.etl360.service.support;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;

/**
 * EXACT mirror of the frontend's {@code renderFormula}
 * ({@code frontend/src/api/recipeAdapter.ts}) — Task 11's cross-language determinism
 * contract (see task-5-report.md, task-11-brief.md). Both sides must render the exact
 * same string for the exact same recipe transformation tree; drift here silently breaks
 * the expression registry's recipe-origin formulas.
 * <p>
 * Rendering rules, applied recursively with no exceptions:
 * <ul>
 *   <li>{@code {name, parameters[]}} -&gt; {@code NAME(p1, p2, …)}, params joined with {@code ", "}.
 *       A Field-shaped parameter (an object carrying a {@code transformation} key — the
 *       {@code {name, dataType, transformation}} bind-var wrapper lookup calls use for their
 *       arguments) renders its nested {@code transformation} instead of itself.</li>
 *   <li>{@code {source: "T.F"}} -&gt; {@code T.F} verbatim — dot-refs are never normalized.</li>
 *   <li>{@code {value: "v"}} -&gt; {@code v} verbatim.</li>
 *   <li>{@code null} / no recognized shape -&gt; {@code ""}.</li>
 * </ul>
 */
public final class FormulaRenderer {
    private FormulaRenderer() {}

    public static String render(JsonNode transformation) {
        if (transformation == null || transformation.isMissingNode() || transformation.isNull()) return "";

        String name = textOrNull(transformation, "name");
        if (!isBlank(name)) {
            JsonNode parameters = transformation.path("parameters");
            List<String> rendered = new ArrayList<>();
            if (parameters.isArray()) {
                for (JsonNode param : parameters) rendered.add(renderParam(param));
            }
            return name + "(" + String.join(", ", rendered) + ")";
        }

        String source = textOrNull(transformation, "source");
        if (!isBlank(source)) return source;

        String value = textOrNull(transformation, "value");
        if (!isBlank(value)) return value;

        return "";
    }

    private static String renderParam(JsonNode param) {
        if (isFieldShaped(param)) return render(param.get("transformation"));
        return render(param);
    }

    /** True if {@code param} is Field-shaped (carries a {@code transformation} key) rather
     * than a bare transformation-tree node ({@code source}/{@code value}/{@code name,parameters}). */
    private static boolean isFieldShaped(JsonNode param) {
        return param != null && param.isObject() && param.has("transformation");
    }

    private static String textOrNull(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }

    private static boolean isBlank(String s) {
        return s == null || s.isEmpty();
    }
}
