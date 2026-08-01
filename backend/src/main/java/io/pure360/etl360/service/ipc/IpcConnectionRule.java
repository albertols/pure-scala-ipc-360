package io.pure360.etl360.service.ipc;

import java.util.List;

/**
 * One entry of the IPC adjacency matrix ({@code connections} in {@code ipc-rules.json}):
 * which target kinds a source kind may legally feed, plus an optional cardinality
 * constraint on the number/naming of inputs.
 *
 * <p>Authored from IPC semantics and the parser's step model — see
 * {@code IpcConnectionsContractTest} and spec §6.2. {@code sourceKind} is carried
 * explicitly (mirroring {@link IpcCatalog.IpcRuleMeta#id()}) even though it duplicates the
 * map key in {@link IpcCatalog#connections()}, so a rule is self-describing on its own.
 *
 * <p>{@code exactly}/{@code namedInputs} are non-null only for the {@code joinerInput}
 * entry, which is a target kind (not a source kind) carried here because its
 * MASTER/DETAIL cardinality is part of the adjacency model, not a source-kind rule.
 */
public record IpcConnectionRule(String sourceKind, List<String> mayFeed,
                                Integer exactly, List<String> namedInputs) {}
