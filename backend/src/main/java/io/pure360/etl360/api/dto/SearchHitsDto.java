package io.pure360.etl360.api.dto;

import java.util.List;

/**
 * Cross-index search over the b15 run history and the relationships graph.
 *
 * <p>This performs the recipe -> table -> cluster join ADR-0014 deliberately kept OFF the client.
 * Recipe names are in the b15 index, which Tab 3 already loads; <b>table</b> names exist only in
 * the L2L relationships graph, which is never fetched unscoped on a real export — so a
 * client-side search structurally cannot see tables at all, and "which cluster runs
 * {@code DWH.DWH_F_CONTR_LTV_RC_D}?" had no answer short of guessing a cluster and looking.
 *
 * <p>Bounded by construction (min query length, capped limit, explicit {@code truncated}) so this
 * endpoint cannot re-become the scale problem ADR-0014 exists to solve. See ADR-0019.
 *
 * @param truncated whether matches were dropped to honour {@code limit} — stated rather than
 *                  implied, so a caller never reads a capped list as a complete one.
 */
public record SearchHitsDto(List<HitDto> hits, boolean truncated) {

    /**
     * One match.
     *
     * @param kind     {@code "recipe"} or {@code "table"}
     * @param clusters the b15 clusters that reach it — for a recipe, the clusters it ran in; for a
     *                 table, the union over every recipe joined to it by an edge in either
     *                 direction. Empty is meaningful: a table nothing in b15 touches, or a recipe
     *                 the control schema declares but which has never run.
     */
    public record HitDto(String kind, String name, String layer, List<String> clusters) {}
}
