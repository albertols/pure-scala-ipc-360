// ─── CorpusSummary (Task 16) ────────────────────────────────────────────────
//
// View-aware corpus summary chip, spec §7.1: a compact "value label · value
// label" line each tab's left rail (or, for Tab 3 — no left rail — a floating
// bottom-left chip) renders below its own tree/list. Deliberately
// layout-agnostic: no border/background/positioning of its own — each host
// (Sidebar footer, DagExplorer footer, Tab 3's floating chip) supplies its
// own chrome around this, the same way `sidebarExtra` blocks already do in
// ETLViewer.tsx/ETLModifier.tsx.

export interface SummaryItem {
  label: string
  value: number | string
}

const itemStyle: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 10,
  color: '#4a5570',
  whiteSpace: 'nowrap',
}

export function CorpusSummary({ items }: { items: SummaryItem[] }) {
  if (items.length === 0) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
      {items.map((item, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <span aria-hidden="true" style={{ ...itemStyle, opacity: 0.6 }}>·</span>}
          <span style={itemStyle}>{item.value} {item.label}</span>
        </span>
      ))}
    </div>
  )
}
