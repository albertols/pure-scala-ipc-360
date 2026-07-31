package io.pure360.etl360.api.dto;

/**
 * Sanitized runtime config for the frontend: GCP project id (gcpProjectId) and region, URL templates
 * (Dataproc cluster/job, Logging), and the active data mode (real/mock/absent) per
 * fallback-backed source. Nothing secret-ish (no credentials, no internal filesystem
 * layout beyond the corpus root itself) belongs here.
 */
public record AppConfigDto(String gcpProjectId, String region, String dataprocJobUrl,
                            String dataprocClusterUrl, String loggingUrl,
                            String dwhControlMode, String composerMode, String corpusRoot) {}
