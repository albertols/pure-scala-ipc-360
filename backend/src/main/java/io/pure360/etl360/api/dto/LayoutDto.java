package io.pure360.etl360.api.dto;

import java.util.Map;

/**
 * {@code GET}/{@code PUT /api/layouts/{*path}} body: the saved canvas node offsets for one
 * recipe, persisted in {@code <mappingDir>/_layout_<mapping>.json} (see
 * {@link io.pure360.etl360.service.support.LayoutSidecar}). {@code version} is the sidecar
 * schema version, currently always {@code 1} — {@code nodes} maps node id to
 * {@link NodeOffsetDto}. A recipe that has never been dragged has no sidecar file on disk at
 * all; {@code GET} still returns {@code {version:1,nodes:{}}} rather than 404, because a
 * missing layout is a normal state, not an error.
 */
public record LayoutDto(int version, Map<String, NodeOffsetDto> nodes) {}
