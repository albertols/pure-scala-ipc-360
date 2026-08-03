package io.pure360.etl360.api.dto;

import java.util.List;
import java.util.Map;

/** Response of {@code GET /api/ipc/rules}: the whole catalogue, alias table and per-kind key
 * schema, so the GUI can explain a failing check and derive the Inspector's schema without
 * hardcoding a second copy of the grammar. */
public record IpcRulesDto(List<IpcRuleMetaDto> rules,
                          Map<String, String> typeAliases,
                          Map<String, String> keyAliases,
                          Map<String, List<IpcKeySpecDto>> keySchema,
                          Map<String, IpcConnectionDto> connections) {}
