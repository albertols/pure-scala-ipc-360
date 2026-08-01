package io.pure360.etl360.api.dto;

/**
 * One node's saved drag offset, keyed by node id in {@link LayoutDto#nodes()}.
 *
 * <p><b>{@code dx}/{@code dy} are OFFSETS, not absolute canvas coordinates</b> — deltas added
 * to whatever the auto-layout algorithm computes for that node ({@code IpcCanvas} renders each
 * node at {@code n.x + offsets[id].dx}). The auto-layout algorithm stays authoritative for
 * structure; a drag is only a nudge on top of it, so adding a node to a recipe re-layouts
 * cleanly while the user's tweaks survive. The fields are named {@code dx}/{@code dy} rather
 * than {@code x}/{@code y} precisely so nobody reads them as canvas coordinates — Task 8's
 * implementer flagged that exact ambiguity.
 */
public record NodeOffsetDto(double dx, double dy) {}
