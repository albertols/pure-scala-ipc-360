import type { OperationalCard as CardData, CardDensity } from '../../types'
import type { RunT } from '../../api/clusterQueries'
import type { AppConfig } from '../../api/queries'
import { buildLoggingUrl, buildDataprocJobUrl } from '../../api/gcpLinks'
import { RunPicker, pickDefaultRun } from './RunPicker'
import { GCPIcon } from './GCPIcon'
import { InfoTooltip } from './InfoTooltip'

export type { CardDensity } from '../../types'

const STATUS_COLOR: Record<string, string> = {
  OK: '#34d399',
  KO: '#f87171',
  RUNNING: '#fbbf24',
  PENDING: '#4a5570',
}

const STATUS_BG: Record<string, string> = {
  OK: 'rgba(52,211,153,0.08)',
  KO: 'rgba(248,113,113,0.08)',
  RUNNING: 'rgba(251,191,36,0.08)',
  PENDING: 'rgba(74,85,112,0.08)',
}

export function OperationalCard({
  card, density = 'detailed', selected = false, onClick,
  runs = [], selectedRunDate = null, onSelectRun, config,
}: {
  card: CardData
  density?: CardDensity
  selected?: boolean
  onClick?: () => void
  /** Newest-first, from useRuns(). Empty -> no picker, and links fall back to card.jobId. */
  runs?: RunT[]
  selectedRunDate?: string | null
  onSelectRun?: (run: RunT) => void
  config?: AppConfig
}) {
  const color = STATUS_COLOR[card.status]
  const bg = STATUS_BG[card.status]

  const selectedRun = pickDefaultRun(runs, selectedRunDate)
  const linkJobId = selectedRun?.jobId || card.jobId || ''
  const loggingHref = buildLoggingUrl(config, {
    jobId: linkJobId,
    cursorTimestamp: selectedRun?.appStartIso ?? '',
  })
  const jobHref = buildDataprocJobUrl(config, { jobId: linkJobId })

  if (density === 'minimal') {
    return (
      <div
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: 26, padding: '0 8px',
          background: 'var(--surface)',
          border: `1px solid ${selected ? color : 'var(--border)'}`,
          borderRadius: 6,
          cursor: onClick ? 'pointer' : 'default',
          minWidth: 160,
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{
          fontSize: 10, color: '#e2e8f8', flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {card.layer} · {card.name}
        </span>
        <span style={{ fontSize: 9, fontWeight: 700, color, flexShrink: 0, fontFamily: 'JetBrains Mono, monospace' }}>
          {card.status}
        </span>
      </div>
    )
  }

  if (density === 'compact') {
    return (
      <div
        onClick={onClick}
        style={{
          background: 'var(--surface)',
          border: `1px solid ${selected ? color : 'var(--border)'}`,
          borderLeft: `3px solid ${color}`,
          borderRadius: 8,
          padding: '8px 10px',
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: onClick ? 'pointer' : 'default',
          minWidth: 200,
        }}
      >
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0,
          boxShadow: card.status === 'RUNNING' ? `0 0 8px ${color}` : 'none',
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {card.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <span style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 3,
              background: card.kind === 'table' ? 'rgba(79,156,249,0.15)' : 'rgba(251,191,36,0.15)',
              color: card.kind === 'table' ? '#4f9cf9' : '#fbbf24',
              fontFamily: 'JetBrains Mono, monospace',
            }}>{card.layer}</span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{card.kind}</span>
          </div>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
          background: bg, color, border: `1px solid ${color}44`,
          fontFamily: 'JetBrains Mono, monospace', flexShrink: 0,
        }}>{card.status}</span>
      </div>
    )
  }

  const fmt = (n: number) => n >= 60 ? `${(n / 60).toFixed(1)}m` : `${n}s`
  const fmtCount = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
  const timeAgo = (iso: string) => {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
  }

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${selected ? color : 'var(--border)'}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        padding: '12px 14px',
        cursor: onClick ? 'pointer' : 'default',
        minWidth: 240,
        boxShadow: selected ? `0 0 0 1px ${color}44` : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 3,
          boxShadow: card.status === 'RUNNING' ? `0 0 8px ${color}` : 'none',
          animation: card.status === 'RUNNING' ? 'pulse 1.5s infinite' : 'none',
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {card.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <span style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 3,
              background: card.kind === 'table' ? 'rgba(79,156,249,0.15)' : 'rgba(251,191,36,0.15)',
              color: card.kind === 'table' ? '#4f9cf9' : '#fbbf24',
              fontFamily: 'JetBrains Mono, monospace',
            }}>{card.layer}</span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{card.kind}</span>
            {card.kind === 'table'
              ? <GCPIcon service="bigquery" size={12} />
              : <GCPIcon service="dataproc" size={12} />
            }
          </div>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
          background: bg, color, border: `1px solid ${color}44`,
          fontFamily: 'JetBrains Mono, monospace', flexShrink: 0,
        }}>{card.status}</span>
      </div>

      {/* last run */}
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>
        Last run: <span style={{ color: '#7b88aa' }}>{timeAgo(card.lastRun)}</span>
      </div>

      {/* run history */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          History (last {Math.min(runs.length, 10) || card.history.length})
          <InfoTooltip text="Each bar is one run. Click a bar to point the job_id and Logging links at that execution." placement="top" />
        </div>
        {runs.length > 0
          ? <RunPicker runs={runs} selectedDate={selectedRunDate} onSelect={r => onSelectRun?.(r)} />
          : <div style={{ display: 'flex', gap: 1.5 }}>
              {card.history.map((s, i) => (
                <div key={i} title={`Run ${card.history.length - i}: ${s}`} style={{
                  width: 5, height: 14, borderRadius: 1.5, flexShrink: 0,
                  background: s === 'OK' ? '#34d399' : s === 'KO' ? '#f87171' : '#2a3050',
                }} />
              ))}
            </div>}
      </div>

      {/* stats — only for recipe kind */}
      {card.kind === 'recipe' && card.stats.avg_time_s > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px',
          background: 'var(--surface-2)', borderRadius: 5, padding: '7px 9px', marginBottom: 10,
          fontSize: 10,
        }}>
          {[
            { label: 'avg', val: fmt(card.stats.avg_time_s), tip: 'Average execution time across all recorded runs' },
            { label: 'p50', val: fmt(card.stats.p50), tip: 'Median execution time (50th percentile)' },
            { label: 'p95', val: fmt(card.stats.p95), tip: '95th percentile — 1 in 20 runs takes longer than this' },
            { label: 'p99', val: fmt(card.stats.p99), tip: '99th percentile — outlier upper bound' },
          ].map(({ label, val, tip }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
              <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                {label} <InfoTooltip text={tip} placement="top" />
              </span>
              <span style={{ color: '#c8d3e8', fontFamily: 'JetBrains Mono, monospace' }}>{val}</span>
            </div>
          ))}
          <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
              avg rows <InfoTooltip text="Average number of rows processed per run" placement="top" />
            </span>
            <span style={{ color: '#c8d3e8', fontFamily: 'JetBrains Mono, monospace' }}>{fmtCount(card.stats.avg_count)}</span>
          </div>
        </div>
      )}

      {/* GCP links — both built from the served templates, never hand-assembled here */}
      {linkJobId !== '' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a
            href={jobHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 10, color: '#4f9cf9', textDecoration: 'none',
              background: 'rgba(79,156,249,0.1)', padding: '2px 7px',
              borderRadius: 4, border: '1px solid rgba(79,156,249,0.25)',
            }}
          >
            <GCPIcon service="dataproc" size={11} />
            job_id ↗
          </a>
          <a
            href={loggingHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 10, color: '#818cf8', textDecoration: 'none',
              background: 'rgba(129,140,248,0.1)', padding: '2px 7px',
              borderRadius: 4, border: '1px solid rgba(129,140,248,0.25)',
            }}
          >
            <GCPIcon service="logging" size={11} />
            Logging ↗
          </a>
        </div>
      )}
    </div>
  )
}
