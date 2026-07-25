import type { Port } from '../../types'
import { CopyButton } from '../shared/CopyButton'

export function PortTable({ ports, color }: { ports: Port[]; color: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto auto auto',
        background: 'var(--surface-2)', padding: '5px 8px',
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 9, color: '#4a5570', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Name</span>
        <span style={{ fontSize: 9, color: '#4a5570', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Type</span>
        <span style={{ fontSize: 9, color: '#4a5570', textTransform: 'uppercase', letterSpacing: '0.06em', paddingLeft: 8, textAlign: 'right' }}>Dir</span>
        <span style={{ fontSize: 9, color: '#4a5570', paddingLeft: 6, textAlign: 'right' }}>Lnk</span>
      </div>
      {ports.map((p, i) => (
        <div key={i}>
          <div
            className="port-row"
            style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto auto',
              padding: '5px 8px',
              borderBottom: '1px solid var(--border-subtle)',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#c8d3e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
              </span>
              <CopyButton value={p.name} size={11} />
            </div>
            <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#4a5570', textAlign: 'right', paddingLeft: 4 }}>
              {p.dataType}
            </span>
            <span style={{ fontSize: 8, color: '#4a5570', paddingLeft: 8, fontFamily: 'JetBrains Mono, monospace' }}>
              {p.direction}
            </span>
            <div style={{ paddingLeft: 6, display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.linked ? color : '#2a3050' }} />
            </div>
          </div>
          {p.expression && (
            <div style={{
              padding: '4px 8px 6px',
              background: 'rgba(129,140,248,0.05)',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                <span style={{ fontSize: 8, color: '#818cf8', fontFamily: 'JetBrains Mono, monospace', marginTop: 1, flexShrink: 0 }}>ƒ(x)</span>
                <pre style={{
                  margin: 0, flex: 1,
                  fontSize: 9.5, color: '#a78bfa',
                  fontFamily: 'JetBrains Mono, monospace',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  lineHeight: 1.5,
                }}>{p.expression}</pre>
                <CopyButton value={p.expression} size={11} />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
