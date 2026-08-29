package io.pure360.etl360.api.dto;

import java.util.List;

/**
 * One node's transitive upstream AND downstream closure — the lineage a failed table's operator
 * actually needs, rather than the one-hop neighbour set.
 *
 * <p>Bounded by node count and seeded from a single node, so it fetches a purposeful slice and
 * never the whole graph. It is deliberately NOT cluster-scoped: lineage crosses cluster
 * boundaries by nature, and truncating it at the current selection would draw a
 * complete-looking flow that is not one. See ADR-0020 and spec §13.
 *
 * @param totalReachable how many nodes the closure actually contains, whether or not they fit in
 *                       {@code nodes} — so the view can say how much it is NOT showing instead of
 *                       implying completeness.
 */
public record LineageDto(String seed, List<LineageNodeDto> nodes,
                         List<RelationshipsDto.EdgeDto> edges,
                         boolean truncated, int totalReachable) {

    /**
     * @param hop signed distance from the seed: negative upstream, {@code 0} for the seed itself,
     *            positive downstream. This is the view's x-axis, which is why it is computed here
     *            (during the traversal that actually knows the direction) rather than re-derived
     *            client-side from the edges.
     */
    public record LineageNodeDto(String id, String kind, String name, String layer, int hop,
                                 List<String> clusters) {}
}
