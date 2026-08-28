import { describe, expect, it } from 'vitest'
import {
  fillGcpUrl, buildLoggingUrl, buildDataprocJobUrl, buildDataprocClusterUrl, buildBigQueryUrl,
  DEFAULT_LOGGING_URL, DEFAULT_BIGQUERY_URL,
} from './gcpLinks'
import type { AppConfig } from './queries'

const CFG: AppConfig = {
  gcpProjectId: 'example-project',
  region: 'europe-southwest1',
  dataprocJobUrl: 'https://console.cloud.google.com/dataproc/jobs/{jobId}?project={project}&region={region}',
  dataprocClusterUrl: 'https://console.cloud.google.com/dataproc/clusters/{clusterName}?project={project}&region={region}',
  loggingUrl: DEFAULT_LOGGING_URL,
  loggingDuration: 'P31D',
  bigQueryUrl: DEFAULT_BIGQUERY_URL,
  dwhControlMode: 'mock',
  composerMode: 'mock',
  corpusRoot: '/mock',
}

describe('fillGcpUrl', () => {
  it('percent-encodes ordinary placeholders', () => {
    expect(fillGcpUrl('https://x/{a}?p={b}', 'unused', { a: 'v 1', b: 'w' }))
      .toBe('https://x/v%201?p=w')
  })

  it('prefers the served template over the fallback', () => {
    expect(fillGcpUrl('https://served/{a}', 'https://fallback/{a}', { a: 'z' }))
      .toBe('https://served/z')
    expect(fillGcpUrl(undefined, 'https://fallback/{a}', { a: 'z' }))
      .toBe('https://fallback/z')
  })

  // The console reads ;key=value as a path matrix segment; %3A there is not accepted.
  it('keeps the colons in a matrix-safe placeholder', () => {
    const url = fillGcpUrl('https://x/q;cursorTimestamp={cursorTimestamp}?p=1', 'unused',
      { cursorTimestamp: '2026-07-29T04:52:00Z' })
    expect(url).toBe('https://x/q;cursorTimestamp=2026-07-29T04:52:00Z?p=1')
    expect(url).not.toContain('%3A')
  })

  it('still encodes a non-matrix placeholder that contains a colon', () => {
    expect(fillGcpUrl('https://x/{a}', 'unused', { a: 'a:b' })).toBe('https://x/a%3Ab')
  })

  it('drops a matrix segment whose value is empty rather than emitting ";key="', () => {
    expect(fillGcpUrl('https://x/q;cursorTimestamp={cursorTimestamp};duration={duration}?p=1',
      'unused', { cursorTimestamp: '', duration: 'P31D' }))
      .toBe('https://x/q;duration=P31D?p=1')
  })

  it('drops a trailing empty matrix segment before the query string', () => {
    expect(fillGcpUrl('https://x/q;duration={duration}?p=1', 'unused', { duration: '' }))
      .toBe('https://x/q?p=1')
  })

  it('drops an empty matrix segment at the very end of the url', () => {
    expect(fillGcpUrl('https://x/q;duration={duration}', 'unused', { duration: '' }))
      .toBe('https://x/q')
  })
})

describe('buildLoggingUrl', () => {
  it('scopes the query to the job id and carries the run cursor and duration', () => {
    const url = buildLoggingUrl(CFG, { jobId: 'application_1_0001', cursorTimestamp: '2026-07-29T04:52:00Z' })

    expect(url).toContain('logs/query')
    expect(url).toContain('query=resource.labels.job_id')
    expect(url).toContain('application_1_0001')
    expect(url).toContain(';cursorTimestamp=2026-07-29T04:52:00Z')
    expect(url).toContain(';duration=P31D')
    expect(url).toContain('project=example-project')
  })

  // Degradation, not breakage: this is the shape that already works today.
  it('degrades to the job-id-only query when no run resolves', () => {
    const url = buildLoggingUrl(CFG, { jobId: 'application_1_0001' })

    expect(url).not.toContain('cursorTimestamp')
    expect(url).toContain('query=resource.labels.job_id')
    expect(url).toContain('application_1_0001')
  })

  it('falls back to the default duration when the config omits one', () => {
    expect(buildLoggingUrl({ ...CFG, loggingDuration: undefined }, {
      jobId: 'j', cursorTimestamp: '2026-07-29T04:52:00Z',
    })).toContain(';duration=P31D')
  })

  it('produces a usable url with no config at all', () => {
    expect(buildLoggingUrl(undefined, { jobId: 'j' })).toContain('logs/query')
  })
})

describe('buildDataprocJobUrl / buildDataprocClusterUrl', () => {
  it('fill project and region from the served config', () => {
    expect(buildDataprocJobUrl(CFG, { jobId: 'j1' }))
      .toBe('https://console.cloud.google.com/dataproc/jobs/j1?project=example-project&region=europe-southwest1')
    expect(buildDataprocClusterUrl(CFG, { clusterName: 'c1' }))
      .toBe('https://console.cloud.google.com/dataproc/clusters/c1?project=example-project&region=europe-southwest1')
  })
})

describe('buildBigQueryUrl', () => {
  it('fills the project from the served config', () => {
    expect(buildBigQueryUrl(CFG)).toBe('https://console.cloud.google.com/bigquery?project=example-project')
  })

  it('produces a usable url with no config at all', () => {
    expect(buildBigQueryUrl(undefined)).toBe(DEFAULT_BIGQUERY_URL.replace('{project}', ''))
  })
})
