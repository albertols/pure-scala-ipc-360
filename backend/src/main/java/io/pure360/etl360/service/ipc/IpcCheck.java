package io.pure360.etl360.service.ipc;

/**
 * One rule outcome. {@code status} is {@code "pass"} or {@code "fail"}; {@code severity} is
 * copied from the catalogue entry so a consumer never has to join back to it.
 */
public record IpcCheck(String ruleId, String severity, String status, String path, String message) {
    public static IpcCheck fail(String ruleId, String severity, String path, String message) {
        return new IpcCheck(ruleId, severity, "fail", path, message);
    }

    public static IpcCheck pass(String ruleId, String severity) {
        return new IpcCheck(ruleId, severity, "pass", "$", "");
    }
}
