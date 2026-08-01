package io.pure360.etl360.api.dto;

/** Wire shape of {@link io.pure360.etl360.service.ipc.IpcCheck} — one rule outcome. */
public record IpcCheckDto(String ruleId, String severity, String status, String path, String message) {}
