package io.pure360.etl360.api.dto;

import java.util.List;

/** Wire shape of {@link io.pure360.etl360.service.ipc.IpcConnectionRule}: which target kinds
 * {@code sourceKind} may legally feed, plus the {@code joinerInput} cardinality constraint
 * and the {@code active}/passive classification the fan-in rule needs (Task 9, spec §6.2). */
public record IpcConnectionDto(String sourceKind, List<String> mayFeed,
                               Integer exactly, List<String> namedInputs, Boolean active) {}
