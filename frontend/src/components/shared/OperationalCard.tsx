import type { OperationalCard as CardData } from '../../types'
import { GCPIcon } from './GCPIcon'
import { InfoTooltip } from './InfoTooltip'

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

function HistoryBar({ history }: { history: string[] }) {
  return (
    <div style={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
      {history.map((s, i) => (
        <div
          key={i}
          title={`Run ${history.length - i}: ${s}`}
          style={{
            width: 5, height: 14, borderRadius: 1.5,
            background: s === 'OK' ? '#34d399' : s === 'KO' ? '#f87171' : s === 'RUNNING' ? '#fbbf24' : '#2a3050',
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  )
}

const GCP_LOGGING_BASE = 'https://console.cloud.google.com/logs/query'
const GCP_JOBS_BASE = 'https://console.cloud.google.com/dataproc/jobs'

export function OperationalCard({
  card,
  compact = false,
  selected = false,
  onClick,
}: {
  card: CardData
  compact?: boolean
  selected?: boolean
  onClick?: () => void
}) {
  const color = STATUS_COLOR[card.status]
  const bg = STATUS_BG[card.status]

  if (compact) {
    return (
      <div
        onClick={onClick}
        style={{
          padding: '4px 10px',
          background: bg,
          border: `1px solid ${color}44`,
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: onClick ? 'pointer' : 'default',
          whiteSpace: 'nowrap',
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: color,
          boxShadow: card.status === 'RUNNING' ? `0 0 6px ${color}` : 'none' }} />
        <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#c8d3e8' }}>
          {card.name.length > 22 ? '…' + card.name.slice(-20) : card.name}
        </span>
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
            <span style={{ fontSize: 9, color: '#4a5570' }}>{card.kind}</span>
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
      <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 8 }}>
        Last run: <span style={{ color: '#7b88aa' }}>{timeAgo(card.lastRun)}</span>
      </div>

      {/* history sparkline */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: '#4a5570', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          History (last {card.history.length})
          <InfoTooltip text="Each bar = one run. Green = OK, Red = KO, Yellow = RUNNING." placement="top" />
        </div>
        <HistoryBar history={card.history} />
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
              <span style={{ color: '#4a5570', display: 'flex', alignItems: 'center', gap: 3 }}>
                {label} <InfoTooltip text={tip} placement="top" />
              </span>
              <span style={{ color: '#c8d3e8', fontFamily: 'JetBrains Mono, monospace' }}>{val}</span>
            </div>
          ))}
          <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#4a5570', display: 'flex', alignItems: 'center', gap: 3 }}>
              avg rows <InfoTooltip text="Average number of rows processed per run" placement="top" />
            </span>
            <span style={{ color: '#c8d3e8', fontFamily: 'JetBrains Mono, monospace' }}>{fmtCount(card.stats.avg_count)}</span>
          </div>
        </div>
      )}

      {/* GCP links */}
      {(card.jobId || card.appId) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {card.jobId && (
            <a
              href={`${GCP_JOBS_BASE}/${card.jobId}`}
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
          )}
          {card.appId && (
            <a
              href={`${GCP_LOGGING_BASE}?resource.type=dataproc_job&resource.labels.job_id=${card.appId}`}
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
              app_id ↗
            </a>
          )}
        </div>
      )}
    </div>
  )
}
