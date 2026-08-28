import type { AppConfig } from './queries'

// Byte-mirror of the backend application.yml gcp templates. The served AppConfigDto normally
// supplies them; these keep the app usable if /api/config has not resolved yet.
export const DEFAULT_DATAPROC_JOB_URL =
  'https://console.cloud.google.com/dataproc/jobs/{jobId}?project={project}&region={region}'
export const DEFAULT_DATAPROC_CLUSTER_URL =
  'https://console.cloud.google.com/dataproc/clusters/{clusterName}?project={project}&region={region}'
export const DEFAULT_LOGGING_URL =
  'https://console.cloud.google.com/logs/query;query=resource.labels.job_id%3D%22{jobId}%22;cursorTimestamp={cursorTimestamp};duration={duration}?project={project}'

export const DEFAULT_LOGGING_DURATION = 'P31D'

export const DEFAULT_BIGQUERY_URL = 'https://console.cloud.google.com/bigquery?project={project}'

/**
 * Placeholders that land inside a `;key=value` PATH MATRIX segment rather than a query string.
 * The Cloud Logging console reads those segments literally and does not accept a percent-encoded
 * colon there, so an RFC-3339 timestamp must keep its colons. Everything else is encoded in full.
 */
const MATRIX_SAFE = new Set(['cursorTimestamp', 'duration'])

/** `;key=` with nothing after it, immediately before another segment, the query string, or the end. */
const EMPTY_MATRIX_SEGMENT = /;[A-Za-z0-9_]+=(?=[;?]|$)/g

/**
 * Substitutes `{placeholder}`s in a URL template.
 *
 * Two rules beyond plain substitution, both required for the produced URL to actually work:
 * matrix-safe placeholders keep their colons, and a matrix segment left empty is removed
 * entirely — never emitted as a bare `;key=`.
 */
export function fillGcpUrl(template: string | undefined, fallback: string,
    vars: Record<string, string>): string {
  const filled = (template || fallback).replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = vars[key] ?? ''
    if (value === '') return ''
    const encoded = encodeURIComponent(value)
    return MATRIX_SAFE.has(key) ? encoded.replace(/%3A/g, ':') : encoded
  })
  return filled.replace(EMPTY_MATRIX_SEGMENT, '')
}

/**
 * Cloud Logging, scoped to one Dataproc job and — when a run is selected — anchored at that run's
 * start. Without a cursor the link degrades to the job-id-only query, which is the shape that
 * works today; it never degrades to a broken one.
 */
export function buildLoggingUrl(cfg: AppConfig | undefined,
    v: { jobId: string; cursorTimestamp?: string }): string {
  return fillGcpUrl(cfg?.loggingUrl, DEFAULT_LOGGING_URL, {
    jobId: v.jobId,
    cursorTimestamp: v.cursorTimestamp ?? '',
    duration: cfg?.loggingDuration || DEFAULT_LOGGING_DURATION,
    project: cfg?.gcpProjectId ?? '',
  })
}

export function buildDataprocJobUrl(cfg: AppConfig | undefined, v: { jobId: string }): string {
  return fillGcpUrl(cfg?.dataprocJobUrl, DEFAULT_DATAPROC_JOB_URL, {
    jobId: v.jobId, project: cfg?.gcpProjectId ?? '', region: cfg?.region ?? '',
  })
}

export function buildDataprocClusterUrl(cfg: AppConfig | undefined, v: { clusterName: string }): string {
  return fillGcpUrl(cfg?.dataprocClusterUrl, DEFAULT_DATAPROC_CLUSTER_URL, {
    clusterName: v.clusterName, project: cfg?.gcpProjectId ?? '', region: cfg?.region ?? '',
  })
}

export function buildBigQueryUrl(cfg: AppConfig | undefined): string {
  return fillGcpUrl(cfg?.bigQueryUrl, DEFAULT_BIGQUERY_URL, { project: cfg?.gcpProjectId ?? '' })
}
