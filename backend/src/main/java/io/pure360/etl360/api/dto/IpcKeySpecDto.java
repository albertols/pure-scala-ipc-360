package io.pure360.etl360.api.dto;

/** Wire shape of {@link io.pure360.etl360.service.ipc.IpcCatalog.IpcKeySpec}. */
public record IpcKeySpecDto(String key, String parserType, boolean required, String widget, String ruleId) {}
