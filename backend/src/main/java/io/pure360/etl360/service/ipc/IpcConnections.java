package io.pure360.etl360.service.ipc;

import org.springframework.stereotype.Component;

import java.util.List;

/**
 * The fan-in rule the pairwise {@code connections} adjacency matrix ({@link IpcConnectionRule})
 * cannot express: PowerCenter's Designer will not let you connect more than one <b>active</b>
 * transformation, or an active and a passive one, to the same downstream transformation or
 * input group (spec §6.2, added after Task 8's review — human ruling 2026-08-01).
 *
 * <p>{@link IpcConnectionRule#active()} is nullable — {@code null} means "cannot be
 * determined" ({@code table} is not a transformation, {@code java} is configured either way
 * at creation and the recipe JSON does not say). A verdict of {@code "block"} asserts we KNOW
 * the link is illegal; anything we cannot prove illegal must warn at most, never block —
 * refusing a link we cannot prove illegal is worse than permitting one we cannot prove legal.
 */
@Component
public class IpcConnections {
    private final IpcCatalog catalog;

    public IpcConnections(IpcCatalog catalog) {
        this.catalog = catalog;
    }

    /**
     * @param existingSourceKinds the kinds already feeding the downstream target/input group
     * @param candidateKind the kind of the source about to be connected
     * @return {@code "block"} when the candidate is (definitely) active and at least one
     *     existing input is (definitely) active too; {@code "warn"} when the candidate's or
     *     any existing input's {@code active} classification is unknown ({@code null}); else
     *     {@code "ok"}.
     */
    public String fanInVerdict(List<String> existingSourceKinds, String candidateKind) {
        Boolean candidateActive = activeOf(candidateKind);
        boolean unknown = candidateActive == null;
        if (Boolean.TRUE.equals(candidateActive)) {
            for (String kind : existingSourceKinds) {
                Boolean active = activeOf(kind);
                if (Boolean.TRUE.equals(active)) {
                    return "block";
                }
                if (active == null) {
                    unknown = true;
                }
            }
        } else {
            for (String kind : existingSourceKinds) {
                if (activeOf(kind) == null) {
                    unknown = true;
                }
            }
        }
        return unknown ? "warn" : "ok";
    }

    private Boolean activeOf(String kind) {
        IpcConnectionRule rule = catalog.connections().get(kind);
        return rule == null ? null : rule.active();
    }
}
