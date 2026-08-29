import type { OperationalCard as CardData, CardDensity } from '../../types'
import type { RunT } from '../../api/clusterQueries'
import type { AppConfig } from '../../api/queries'
import { buildLoggingUrl, buildDataprocJobUrl } from '../../api/gcpLinks'
import { RunPicker, pickDefaultRun } from './RunPicker'
import { GCPIcon } from './GCPIcon'
import { InfoTooltip } from './InfoTooltip'
import {
  layerColor, kindPalette, statusColor, statusBg, CARD_SHADOW, STATUS_EDGE_PX,
} from '../../theme/semanticColors'

export type { CardDensity } from '../../types'

// Colour comes from `theme/semanticColors.ts` — the one place that maps a layer, a kind or a
// status to a value (ADR-0017). The local STATUS_COLOR/STATUS_BG maps that used to live here
// were half of the problem: the other half was the LAYER chip reading `card.kind`, so the same
// layer rendered in two different colours depending on what kind of node carried it.

/** Chip for the node's LAYER — medallion tier, never the kind accent. */
function LayerChip({ layer }: { layer: string }) {
  const c = layerColor(layer)
  return (
    <span data-testid="layer-chip" style={{
      fontSize: 9, padding: '1px 5px', borderRadius: 3,
      background: `${c}26`, color: c, border: `1px solid ${c}44`,
      fontFamily: 'JetBrains Mono, monospace', flexShrink: 0,
    }}>{layer}</span>
  )
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
  const color = statusColor(card.status)
  const bg = statusBg(card.status)
  const kp = kindPalette(card.kind)
  // The status bar's EDGE encodes the kind: left for a recipe, top for a table — so kind stays
  // readable from geometry, not hue alone.
  const edge = kp.statusEdge === 'left'
    ? { borderLeftWidth: STATUS_EDGE_PX, borderLeftColor: color, borderLeftStyle: 'solid' as const }
    : { borderTopWidth: STATUS_EDGE_PX, borderTopColor: color, borderTopStyle: 'solid' as const }

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
        data-testid="operational-card"
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          height: 26, padding: '0 7px',
          background: kp.body,
          border: `1px solid ${selected ? color : kp.border}`,
          ...edge,
          borderRadius: 6,
          boxShadow: CARD_SHADOW,
          cursor: onClick ? 'pointer' : 'default',
          minWidth: 160,
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <LayerChip layer={card.layer} />
        <span style={{
          fontSize: 10, color: '#e2e8f8', flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {card.name}
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
        data-testid="operational-card"
        onClick={onClick}
        style={{
          background: kp.body,
          border: `1px solid ${selected ? color : kp.border}`,
          ...edge,
          boxShadow: CARD_SHADOW,
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
            <LayerChip layer={card.layer} />
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
      data-testid="operational-card"
      onClick={onClick}
      style={{
        background: kp.body,
        border: `1px solid ${selected ? color : kp.border}`,
        ...edge,
        borderRadius: 8,
        padding: '12px 14px',
        cursor: onClick ? 'pointer' : 'default',
        minWidth: 240,
        boxShadow: selected ? `${CARD_SHADOW}, 0 0 0 1px ${color}44` : CARD_SHADOW,
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
            <LayerChip layer={card.layer} />
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
          {/* The click instruction is true only on the RunPicker path below. In the
              `card.history` fallback the bars are inert divs, so telling the operator to click
              one is an instruction that cannot be followed. */}
          <InfoTooltip
            text={runs.length > 0
              ? 'Each bar is one run. Click a bar to point the job_id and Logging links at that execution.'
              : 'Each bar is one run, oldest first. Run-by-run detail needs the run history, which is not loaded for this card.'}
            placement="top" />
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
