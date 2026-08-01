package io.pure360.etl360.service.ipc;

import org.springframework.stereotype.Component;

import java.util.List;

/**
 * The fan-in rule the pairwise {@code connections} adjacency matrix ({@link IpcConnectionRule})
 * cannot express (spec §6.2, added after Task 8's review — human ruling 2026-08-01; the block
 * condition corrected to cover both clauses in fix round 1, human ruling). PowerCenter's
 * constraint, stated completely: a downstream transformation input group may receive
 * <b>either</b> any number of passive inputs, <b>or</b> exactly one active input and nothing
 * else alongside it. Equivalently: connecting more than one active transformation, or an active
 * and a passive one, to the same downstream input group is always illegal — regardless of which
 * one connects first. Two passives fanning in is fine; one active alone is fine; an active
 * joining anything (active or passive), or anything joining an active, is not.
 *
 * <p>{@link IpcConnectionRule#active()} is nullable — {@code null} means "cannot be
 * determined" ({@code table} is not a transformation, {@code java} is configured either way
 * at creation and the recipe JSON does not say). A verdict of {@code "block"} asserts we KNOW
 * the link is illegal; anything we cannot prove illegal must warn at most, never block —
 * refusing a link we cannot prove illegal is worse than permitting one we cannot prove legal.
 * The {@code null}-precedence check therefore runs BEFORE either block condition: an unknown
 * participant anywhere in the pairing always downgrades a would-be block to a warn.
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
     * @return {@code "warn"} when the candidate's or any existing input's {@code active}
     *     classification is unknown ({@code null}) — takes precedence over both block
     *     conditions below; else {@code "block"} when the candidate is (definitely) active and
     *     {@code existingSourceKinds} is non-empty (an active input must be the ONLY input);
     *     else {@code "block"} when the candidate is (definitely) passive and at least one
     *     existing input is (definitely) active (a passive input must not join an active one);
     *     else {@code "ok"}.
     */
    public String fanInVerdict(List<String> existingSourceKinds, String candidateKind) {
        Boolean candidateActive = activeOf(candidateKind);
        if (candidateActive == null) {
            return "warn";
        }
        for (String kind : existingSourceKinds) {
            if (activeOf(kind) == null) {
                return "warn";
            }
        }
        if (candidateActive && !existingSourceKinds.isEmpty()) {
            return "block";
        }
        if (!candidateActive) {
            for (String kind : existingSourceKinds) {
                if (Boolean.TRUE.equals(activeOf(kind))) {
                    return "block";
                }
            }
        }
        return "ok";
    }

    private Boolean activeOf(String kind) {
        IpcConnectionRule rule = catalog.connections().get(kind);
        return rule == null ? null : rule.active();
    }
}
