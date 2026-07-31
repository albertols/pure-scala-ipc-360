import { useState, useRef, useCallback, useMemo } from 'react'
import type { OperationalCard as CardData } from '../../types'
import type { ApiError } from '../../api/client'
import { useRelationships, useOperationalSummary } from '../../api/queries'
import { toOperationalGraph, type OperationalEdge } from '../../api/relationshipsAdapter'
import { OperationalCard } from '../shared/OperationalCard'
import { TimePicker, type TimeSelection } from '../shared/TimePicker'
import { GCPIcon } from '../shared/GCPIcon'
import { InfoTooltip } from '../shared/InfoTooltip'

function StatusSummary({ cards }: { cards: CardData[] }) {
  const counts = { OK: 0, KO: 0, RUNNING: 0, PENDING: 0 }
  cards.forEach(c => { counts[c.status]++ })
  const color: Record<string, string> = { OK: '#34d399', KO: '#f87171', RUNNING: '#fbbf24', PENDING: '#4a5570' }
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      {Object.entries(counts).map(([s, n]) => n > 0 && (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: color[s] }} />
          <span style={{ fontSize: 11, color: '#c8d3e8', fontFamily: 'JetBrains Mono, monospace' }}>{n}</span>
          <span style={{ fontSize: 11, color: '#4a5570' }}>{s}</span>
        </div>
      ))}
    </div>
  )
}

function RelationshipGraph({
  cards,
  edges,
  selected,
  onSelect,
  zoom,
}: {
  cards: CardData[]
  edges: OperationalEdge[]
  selected: string | null
  onSelect: (id: string | null) => void
  zoom: number
}) {
  const [pan, setPan] = useState({ x: 40, y: 40 })
  const dragging = useRef(false)
  const lastPan = useRef({ x: 0, y: 0 })

  const byId = Object.fromEntries(cards.map(c => [c.id, c]))
  const visibleEdges = edges.filter(e => byId[e.fromId] && byId[e.toId])

  // Computed maxima from card coordinates + margins (was a static 1200x700;
  // real layouts can exceed that, and floor stays for small/empty graphs).
  const CANVAS_W = Math.max(1200, ...cards.map(c => (c.x ?? 0) + 280))
  const CANVAS_H = Math.max(700, ...cards.map(c => (c.y ?? 0) + 220))

  const compact = zoom < 0.65

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest('[data-card]')) return
    dragging.current = true
    lastPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }, [pan])
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    setPan({ x: e.clientX - lastPan.current.x, y: e.clientY - lastPan.current.y })
  }, [])
  const onMouseUp = useCallback(() => { dragging.current = false }, [])
  const onWheel = useCallback((e: React.WheelEvent) => { e.stopPropagation() }, [])

  return (
    <div
      style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--bg)', cursor: 'grab' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
    >
      {/* dot grid */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs>
          <pattern id="odot" x={pan.x % 24} y={pan.y % 24} width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="12" cy="12" r="0.7" fill="rgba(42,48,80,0.7)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#odot)" />
      </svg>

      <div style={{
        transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
        transformOrigin: '0 0',
        position: 'absolute',
        width: CANVAS_W,
        height: CANVAS_H,
      }}>
        {/* SVG edges */}
        <svg
          width={CANVAS_W} height={CANVAS_H}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        >
          <defs>
            <marker id="oa" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
              <path d="M0 1 L6 3.5 L0 6 Z" fill="rgba(42,48,80,1)" />
            </marker>
            <marker id="oa-hi" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
              <path d="M0 1 L6 3.5 L0 6 Z" fill="#4f9cf9" />
            </marker>
          </defs>
          {visibleEdges.map((e, i) => {
            const from = byId[e.fromId]!
            const to = byId[e.toId]!
            const fx = (from.x ?? 0) + 120
            const fy = (from.y ?? 0) + 50
            const tx = (to.x ?? 0)
            const ty = (to.y ?? 0) + 50
            const hi = selected === e.fromId || selected === e.toId
            const dx = Math.abs(tx - fx) * 0.45
            return (
              <path key={i}
                d={`M ${fx} ${fy} C ${fx + dx} ${fy} ${tx - dx} ${ty} ${tx} ${ty}`}
                fill="none"
                stroke={hi ? '#4f9cf9' : '#1e2438'}
                strokeWidth={hi ? 2 : 1.5}
                strokeDasharray={e.kind === 'lookup' ? '5 4' : undefined}
                markerEnd={hi ? 'url(#oa-hi)' : 'url(#oa)'}
              />
            )
          })}
        </svg>

        {/* Cards */}
        {cards.map(card => (
          <div
            key={card.id}
            data-card="1"
            style={{
              position: 'absolute',
              left: card.x ?? 0,
              top: card.y ?? 0,
              width: compact ? 'auto' : 252,
              zIndex: selected === card.id ? 10 : 1,
            }}
            onClick={e => { e.stopPropagation(); onSelect(selected === card.id ? null : card.id) }}
          >
            <OperationalCard card={card} compact={compact} selected={selected === card.id} onClick={undefined} />
          </div>
        ))}
      </div>

      {/* click to deselect */}
      {selected && (
        <button
          onClick={() => onSelect(null)}
          style={{
            position: 'absolute', top: 12, right: 12,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 5, color: '#7b88aa', fontSize: 11, cursor: 'pointer',
            padding: '4px 10px',
          }}
        >Clear selection</button>
      )}
    </div>
  )
}

export function ETLOperational() {
  const [selected, setSelected] = useState<string | null>(null)
  const [zoom, setZoom] = useState(0.85)
  const [timeVal, setTimeVal] = useState<TimeSelection>({
    date: new Date().toISOString().slice(0, 10),
    hour: new Date().getUTCHours(),
    precision: 'hour',
    isNow: true,
  })
  const [layerFilter, setLayerFilter] = useState<string>('ALL')
  const [kindFilter, setKindFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  const rel = useRelationships()
  const summary = useOperationalSummary()
  // Task 8 wires this to the TimePicker; for now the latest known date governs.
  const selectedDate = summary.data?.dates?.at(-1) ?? null

  const view = useMemo(
    () => (rel.data ? toOperationalGraph(rel.data, summary.data, selectedDate) : null),
    [rel.data, summary.data, selectedDate],
  )

  if (rel.isLoading || summary.isLoading) {
    return <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: 16 }}>Loading relationships…</div>
  }

  const apiError = (rel.error ?? summary.error) as ApiError | null
  if (apiError) {
    return (
      <div style={{ color: 'var(--red)', fontSize: 12, padding: 16 }}>
        <div>{apiError.title}</div>
        {apiError.detail && <div>{apiError.detail}</div>}
      </div>
    )
  }

  if (!view || view.cards.length === 0) {
    return <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: 16 }}>No relationship entries</div>
  }

  const cards = view.cards.filter(c => {
    if (layerFilter !== 'ALL' && c.layer !== layerFilter) return false
    if (kindFilter !== 'ALL' && c.kind !== kindFilter) return false
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false
    if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const selectedCard = selected ? view.cards.find(c => c.id === selected) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* toolbar */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
      }}>
        {/* search */}
        <div style={{ position: 'relative' }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
            style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="5.5" cy="5.5" r="4" stroke="#4a5570" strokeWidth="1.4" />
            <line x1="8.5" y1="8.5" x2="11.5" y2="11.5" stroke="#4a5570" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search tables / recipes…"
            style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 5, color: '#c8d3e8', fontSize: 11, padding: '5px 10px 5px 26px',
              outline: 'none', width: 200, fontFamily: 'Inter, sans-serif',
            }}
          />
        </div>

        {/* filters — options are data-driven from the real graph */}
        <FilterChips label="Layer" options={['ALL', ...view.layers]} value={layerFilter} onChange={setLayerFilter} />
        <FilterChips label="Kind" options={['ALL', 'recipe', 'table']} value={kindFilter} onChange={setKindFilter} />
        {/* RUNNING isn't a real operational state (mock/real history only ever
            resolves OK/KO/PENDING) — swapped for PENDING per the plan's ledger note. */}
        <FilterChips label="Status" options={['ALL', 'OK', 'KO', 'PENDING']} value={statusFilter} onChange={setStatusFilter}
          colors={{ OK: '#34d399', KO: '#f87171', PENDING: '#4a5570' }} />

        <div style={{ flex: 1 }} />
        <StatusSummary cards={view.cards} />

        {/* zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setZoom(z => Math.max(0.3, z - 0.15))} style={zoomBtn}>−</button>
          <span style={{ fontSize: 10, color: '#4a5570', fontFamily: 'JetBrains Mono, monospace', width: 34, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.15))} style={zoomBtn}>+</button>
        </div>
      </div>

      {/* time picker */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <TimePicker value={timeVal} onChange={setTimeVal} />
      </div>

      {/* main area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <RelationshipGraph
          cards={cards}
          edges={view.edges}
          selected={selected}
          onSelect={setSelected}
          zoom={zoom}
        />

        {/* detail side panel */}
        {selectedCard && (
          <div style={{
            width: 300, flexShrink: 0,
            background: 'var(--surface)', borderLeft: '1px solid var(--border)',
            overflow: 'auto', padding: '16px',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f8', flex: 1 }}>Details</span>
              <button onClick={() => setSelected(null)}
                style={{ background: 'none', border: 'none', color: '#4a5570', cursor: 'pointer' }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2 2l9 9M11 2L2 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <OperationalCard card={selectedCard} selected />

            {/* related cards */}
            <div>
              <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                Related ({selectedCard.relations.length})
                <InfoTooltip text="Tables and recipes that directly exchange data with this node." placement="right" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selectedCard.relations.map(rid => {
                  const relCard = view.cards.find(c => c.id === rid)
                  if (!relCard) return null
                  return (
                    <div key={rid} onClick={() => setSelected(rid)} style={{ cursor: 'pointer' }}>
                      <OperationalCard card={relCard} compact />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* GCP quick links */}
            <div>
              <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 8 }}>GCP Quick Links</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <GCPLink icon="bigquery" label="Open in BigQuery" href={`https://console.cloud.google.com/bigquery?project=my-project`} />
                <GCPLink icon="monitoring" label="Monitoring Dashboard" href={`https://console.cloud.google.com/monitoring`} />
                <GCPLink icon="logging" label="Cloud Logging" href={`https://console.cloud.google.com/logs`} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function GCPLink({ icon, label, href }: { icon: Parameters<typeof GCPIcon>[0]['service']; label: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '6px 10px', borderRadius: 5, textDecoration: 'none',
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        color: '#7b88aa', fontSize: 11,
        transition: 'border-color 0.1s',
      }}
    >
      <GCPIcon service={icon} size={14} />
      {label}
      <span style={{ marginLeft: 'auto', fontSize: 10 }}>↗</span>
    </a>
  )
}

function FilterChips({
  label, options, value, onChange, colors,
}: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
  colors?: Record<string, string>
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 10, color: '#4a5570', marginRight: 2 }}>{label}:</span>
      {options.map(o => {
        const c = colors?.[o]
        return (
          <button key={o} onClick={() => onChange(o)} style={{
            padding: '2px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace',
            background: value === o ? (c ? `${c}22` : 'var(--surface-3)') : 'transparent',
            border: `1px solid ${value === o ? (c ?? 'var(--border)') : 'transparent'}`,
            color: value === o ? (c ?? '#e2e8f8') : '#4a5570',
          }}>{o}</button>
        )
      })}
    </div>
  )
}

const zoomBtn: React.CSSProperties = {
  width: 24, height: 24, background: 'var(--surface-2)',
  border: '1px solid var(--border)', borderRadius: 4,
  color: '#7b88aa', cursor: 'pointer', fontSize: 14,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'monospace',
}
