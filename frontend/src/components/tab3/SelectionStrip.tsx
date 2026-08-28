import { setOperationalView, useOperationalView } from '../../state/operationalView'

// ─── SelectionStrip (Task 13) ───────────────────────────────────────────────
//
// Keeps the current cluster selection legible without opening `ClusterPane`:
// a chip per selected cluster plus the aggregate the scoped fetch resolved to
// (recipes/dates/OK/KO/nodes, and how many of those nodes are 1-hop
// neighbours pulled in from clusters the user did NOT select — spec §7.1).

export interface SelectionSummary {
  recipes: number
  dates: number
  ok: number
  ko: number
  nodes: number
  neighbors: number
}

const nf = new Intl.NumberFormat('en-US')

const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 999,
  padding: '2px 8px', fontSize: 11, color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace',
}

const removeButtonStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
  color: 'var(--text-muted)', fontSize: 10, lineHeight: 1,
}

export function SelectionStrip({ summary }: { summary: SelectionSummary | null }) {
  const { selectedClusters } = useOperationalView()
  if (selectedClusters.length === 0) return null

  const s = summary ?? { recipes: 0, dates: 0, ok: 0, ko: 0, nodes: 0, neighbors: 0 }

  const removeCluster = (name: string) =>
    setOperationalView({ selectedClusters: selectedClusters.filter(c => c !== name) })
  const clearSelection = () => setOperationalView({ selectedClusters: [] })

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '6px 10px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {selectedClusters.map(name => (
          <span key={name} style={chipStyle}>
            <span>{name}</span>
            <button aria-label={`Remove ${name}`} onClick={() => removeCluster(name)} style={removeButtonStyle}>
              {'✕'}
            </button>
          </span>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
        {`${nf.format(selectedClusters.length)} clusters · ${nf.format(s.recipes)} recipes · ${nf.format(s.dates)} dates · ${nf.format(s.ok)} OK · ${nf.format(s.ko)} KO · ${nf.format(s.nodes)} nodes · ${nf.format(s.neighbors)} from neighbours`}
      </div>
      <button
        aria-label="Clear clusters"
        onClick={clearSelection}
        style={{
          marginLeft: 'auto', background: 'transparent', border: '1px solid var(--border)',
          borderRadius: 5, color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', padding: '2px 8px',
        }}
      >
        {/* NOT "Clear selection": the graph's own floating button (pre-existing Figma copy)
            already owns that phrase for the selected NODE. This one drops the cluster scope, and
            sits directly beside the cluster chips it clears. */}
        Clear clusters
      </button>
    </div>
  )
}
