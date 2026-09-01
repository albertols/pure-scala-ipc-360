package io.pure360.etl360.api.dto;

import java.util.List;

/**
 * One node's transitive upstream AND downstream closure — the lineage a failed table's operator
 * actually needs, rather than the one-hop neighbour set.
 *
 * <p>Bounded by node count and seeded from a single node, so it fetches a purposeful slice and
 * never the whole graph (ADR-0020).
 *
 * <p>Optionally CLUSTER-SCOPED (ADR-0021). ADR-0020 refused scoping because truncating at the
 * selection would draw a complete-looking flow that is not one; that objection is answered by
 * {@link LineageNodeDto#gateway()}, which makes every cluster crossing an explicit, named,
 * clickable node. With no {@code cluster} the response is unscoped and identical to ADR-0020's.
 *
 * @param activeCluster   the cluster actually scoped to, or {@code null} when unscoped.
 * @param clusterOptions  the SEED's own candidate clusters, count-descending then name — the
 *                        switcher's contents. Deliberately not "every cluster the lineage
 *                        touches": reaching a distant cluster is a gateway walk.
 * @param totalReachable  how many nodes the closure actually contains, whether or not they fit in
 *                        {@code nodes} — so the view can say how much it is NOT showing instead of
 *                        implying completeness. When scoped, this measures the SCOPED closure
 *                        (seed + in-scope nodes + gateways), not the whole graph.
 */
public record LineageDto(String seed, List<LineageNodeDto> nodes,
                         List<RelationshipsDto.EdgeDto> edges,
                         boolean truncated, int totalReachable,
                         String activeCluster, List<ClusterOptionDto> clusterOptions) {

    /**
     * @param hop signed distance from the seed: negative upstream, {@code 0} for the seed itself,
     *            positive downstream. This is the view's x-axis, which is why it is computed here
     *            (during the traversal that actually knows the direction) rather than re-derived
     *            client-side from the edges.
     * @param gateway true for a node OUTSIDE the active cluster's scope that touches one inside it
     *            — a recipe touching an in-scope table, or (when the seed itself is a recipe not
     *            in the cluster) a table touching no recipe of the cluster. The traversal stops
     *            there; it is drawn as a stub naming its cluster, so the flow never looks complete
     *            where it is not. Always {@code false} when unscoped.
     */
    public record LineageNodeDto(String id, String kind, String name, String layer, int hop,
                                 List<String> clusters, boolean gateway) {}

    /** @param recipes the cluster's OWN size in the b15 index, not a count within this lineage —
     *                 a stable property, so the "largest" tie-break cannot shift with the budget. */
    public record ClusterOptionDto(String name, int recipes) {}
}
