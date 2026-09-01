import type { ReactNode } from 'react'
import type { OperationalCard as CardData } from '../../types'
import type { AppConfig } from '../../api/queries'
import type { RunT } from '../../api/clusterQueries'
import { OperationalCard } from './OperationalCard'
import { pickDefaultRun } from './RunPicker'
import { GCPIcon } from './GCPIcon'
import { buildLoggingUrl, buildDataprocClusterUrl, buildBigQueryUrl } from '../../api/gcpLinks'

/**
 * The Details body, rendered by BOTH Tab 3's side panel and the lineage dock.
 *
 * One component on purpose: the dock shipped as a second, thinner panel and immediately drifted —
 * it never gained Preview or the GCP links, so an operator inspecting a node inside the lineage
 * had to close the whole overlay to reach them. This is the same anti-drift argument
 * `RelatedOverlay` makes for its window/tab pair.
 *
 * The host owns the sized container and the splitter; this renders the CONTENT only. Host-specific
 * pieces are props, not forks: Tab 3 passes `related` (its ◀ ▶ trail and neighbour list), the dock
 * passes `hopLabel` and `onCenterLineage`. The dock deliberately gets no `related` — the flow it
 * sits beside already IS that list, in a better form.
 */
export function NodeDetails({
  card,
  runs = [],
  selectedRunDate = null,
  onSelectRun,
  config,
  previewTarget,
  onPreview,
  fallbackClusterName = '',
  clusters = [],
  hopLabel = null,
  onCenterLineage,
  related = null,
  onClose,
}: {
  card: CardData
  runs?: RunT[]
  selectedRunDate?: string | null
  onSelectRun?: (run: RunT) => void
  config?: AppConfig
  previewTarget: { recipePath: string | null; mappingPath: string | null }
  onPreview: () => void
  /** Used for the Dataproc link when no run is selected — the host knows the card's last cluster. */
  fallbackClusterName?: string
  clusters?: string[]
  hopLabel?: string | null
  onCenterLineage?: () => void
  related?: ReactNode
  onClose: () => void
}) {
  // Every URL comes from `gcpLinks.ts`'s builders over the served templates (ADR-0015) — anchored
  // on the SELECTED run (its job id and its `app_start_iso` cursor) when one exists, degrading to
  // the card's own last job id when the run history is unavailable.
  const selectedRun = pickDefaultRun(runs, selectedRunDate)
  const linkJobId = selectedRun?.jobId || card.jobId || ''
  const clusterName = selectedRun?.clusterName || fallbackClusterName
  const loggingHref = buildLoggingUrl(config, {
    jobId: linkJobId,
    cursorTimestamp: selectedRun?.appStartIso ?? '',
  })
  const monitoringHref = buildDataprocClusterUrl(config, { clusterName })
  const bigQueryHref = buildBigQueryUrl(config)

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f8', flex: 1 }}>Details</span>
        <button
          aria-label="Close details"
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#4a5570', cursor: 'pointer' }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path
              d="M2 2l9 9M11 2L2 11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <OperationalCard
        card={card}
        selected
        runs={runs}
        selectedRunDate={selectedRunDate}
        onSelectRun={onSelectRun}
        config={config}
      />

      {onCenterLineage && (
        <button
          aria-label="Center lineage here"
          onClick={onCenterLineage}
          style={{
            padding: '5px 8px',
            borderRadius: 4,
            fontSize: 10,
            width: '100%',
            cursor: 'pointer',
            background: 'var(--surface-3)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          ⌖ center lineage here
        </button>
      )}

      {related}

      {clusters.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 8 }}>Clusters</div>
          {clusters.map(c => (
            <div
              key={c}
              style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                fontFamily: 'JetBrains Mono, monospace',
                padding: '2px 0',
              }}
            >
              {c}
            </div>
          ))}
        </div>
      )}

      {hopLabel && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{hopLabel}</div>}

      <div>
        <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 8 }}>Preview</div>
        <PreviewButton enabled={!!previewTarget.recipePath} onClick={onPreview} />
      </div>

      <div>
        <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 8 }}>GCP Quick Links</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <GCPLink icon="bigquery" label="Open in BigQuery" href={bigQueryHref} />
          <GCPLink icon="monitoring" label="Monitoring Dashboard" href={monitoringHref} />
          <GCPLink icon="logging" label="Cloud Logging" href={loggingHref} />
        </div>
      </div>
    </>
  )
}

/** Task 9's "Open preview" affordance — same row markup as `GCPLink` below
 * (no new tokens), a `<button>` in place of an `<a>` since it opens the
 * overlay rather than navigating. Disabled (dim, non-interactive) when the
 * selected card's recipe/mapping path can't be resolved. */
function PreviewButton({ enabled, onClick }: { enabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        width: '100%',
        padding: '6px 10px',
        borderRadius: 5,
        textAlign: 'left',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        color: enabled ? '#7b88aa' : '#3a4160',
        fontSize: 11,
        cursor: enabled ? 'pointer' : 'default',
        fontFamily: 'inherit',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      Open preview
      <span style={{ marginLeft: 'auto', fontSize: 10 }}>↗</span>
    </button>
  )
}

function GCPLink({
  icon,
  label,
  href,
}: {
  icon: Parameters<typeof GCPIcon>[0]['service']
  label: string
  href: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '6px 10px',
        borderRadius: 5,
        textDecoration: 'none',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        color: '#7b88aa',
        fontSize: 11,
        transition: 'border-color 0.1s',
      }}
    >
      <GCPIcon service={icon} size={14} />
      {label}
      <span style={{ marginLeft: 'auto', fontSize: 10 }}>↗</span>
    </a>
  )
}
