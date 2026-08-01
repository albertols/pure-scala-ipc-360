package io.pure360.etl360.api.dto;

/** Wire shape of {@link io.pure360.etl360.service.ipc.IpcCatalog.IpcRuleMeta}. */
public record IpcRuleMetaDto(String id, String severity, String statement,
                             String parserRef, String ipcRef, String wikiRef) {}
