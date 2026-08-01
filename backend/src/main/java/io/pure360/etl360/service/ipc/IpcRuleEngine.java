package io.pure360.etl360.service.ipc;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Runs every registered {@link IpcRule} over a recipe and returns one {@link IpcCheck} per
 * violation plus a synthesized {@code pass} check for each rule that produced none — so a
 * consumer can render "42 checks, 40 passed" without knowing the catalogue.
 */
@Service
public class IpcRuleEngine {
    private final IpcCatalog catalog;
    private final List<IpcRule> rules;

    public IpcRuleEngine(IpcCatalog catalog) {
        this.catalog = catalog;
        List<IpcRule> all = new ArrayList<>();
        all.addAll(StructuralRules.all(catalog));
        all.addAll(TypeShapeRules.all(catalog));
        this.rules = List.copyOf(all);
    }

    public List<IpcCheck> run(JsonNode recipe) {
        RuleContext ctx = new RuleContext(recipe);
        List<IpcCheck> out = new ArrayList<>();
        for (IpcRule rule : rules) {
            int before = out.size();
            rule.check(ctx, out);
            if (out.size() == before) {
                out.add(IpcCheck.pass(rule.id(), catalog.severity(rule.id())));
            }
        }
        return List.copyOf(out);
    }

    /** Rule ids registered here, for the contract test's parity assertion. */
    public List<String> ruleIds() { return rules.stream().map(IpcRule::id).toList(); }
}
