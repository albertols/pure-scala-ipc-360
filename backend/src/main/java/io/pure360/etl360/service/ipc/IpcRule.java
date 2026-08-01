package io.pure360.etl360.service.ipc;

import java.util.List;

/**
 * One conformance rule. Implementations append a {@link IpcCheck#fail} per violation and
 * nothing on success — {@link IpcRuleEngine} synthesizes the passing check.
 */
public interface IpcRule {
    String id();
    void check(RuleContext ctx, List<IpcCheck> out);
}
