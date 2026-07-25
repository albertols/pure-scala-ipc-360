import type { ETLNode } from '../../types'
import { NODE_STYLES } from './NodeBox'
import { PortTable } from './PortTable'
import { CopyButton } from '../shared/CopyButton'

export function DetailPanel({ node, onClose }: { node: ETLNode; onClose: () => void }) {
  const style = NODE_STYLES[node.type] ?? NODE_STYLES.source
  const inPorts = node.ports.filter(p => p.direction === 'IN' || p.direction === 'IN/OUT')
  const outPorts = node.ports.filter(p => p.direction === 'OUT' || p.direction === 'IN/OUT')
  const exprPorts = node.ports.filter(p => p.expression)

  return (
    <div style={{
      width: 310,
      flexShrink: 0,
      background: 'var(--surface)',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{
        padding: '14px 16px 12px',
        borderBottom: '1px solid var(--border)',
        background: `${style.color}08`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}>
        <div style={{
          padding: '3px 8px',
          background: `${style.color}20`,
          border: `1px solid ${style.border}`,
          borderRadius: 4,
          color: style.color,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          fontWeight: 700,
          flexShrink: 0,
          marginTop: 1,
        }}>{style.abbr}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {node.name}
            </span>
            <CopyButton value={node.name} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
            <span style={{ fontSize: 10, color: '#4a5570', fontFamily: 'JetBrains Mono, monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {node.file}
            </span>
            <CopyButton value={node.file} size={11} />
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#4a5570', cursor: 'pointer', padding: 2, flexShrink: 0 }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Properties */}
        <section>
          <SectionLabel>Properties</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {Object.entries(node.properties).map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 2 }}>{k}</div>
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 4,
                  background: 'var(--surface-2)', padding: '4px 7px', borderRadius: 4,
                }}>
                  <span style={{
                    fontSize: 10.5, color: '#c8d3e8', fontFamily: 'JetBrains Mono, monospace',
                    flex: 1, wordBreak: 'break-all', lineHeight: 1.5,
                  }}>{v}</span>
                  <CopyButton value={v} size={11} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Expressions summary */}
        {exprPorts.length > 0 && (
          <section>
            <SectionLabel>Expressions ({exprPorts.length})</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {exprPorts.map((p, i) => (
                <div key={i} style={{ border: '1px solid rgba(129,140,248,0.2)', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 8px', background: 'rgba(129,140,248,0.05)',
                    borderBottom: '1px solid rgba(129,140,248,0.15)',
                  }}>
                    <span style={{ fontSize: 9, color: '#818cf8', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>OUT</span>
                    <span style={{ fontSize: 11, color: '#c8d3e8', fontFamily: 'JetBrains Mono, monospace', flex: 1 }}>{p.name}</span>
                    <span style={{ fontSize: 9, color: '#4a5570', fontFamily: 'JetBrains Mono, monospace' }}>{p.dataType}</span>
                    <CopyButton value={p.expression!} size={11} />
                  </div>
                  <pre style={{
                    margin: 0, padding: '6px 8px',
                    fontSize: 10, color: '#a78bfa',
                    fontFamily: 'JetBrains Mono, monospace',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6,
                  }}>{p.expression}</pre>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Input Ports */}
        {inPorts.length > 0 && (
          <section>
            <SectionLabel>Input Ports ({inPorts.length})</SectionLabel>
            <PortTable ports={inPorts} color={style.color} />
          </section>
        )}

        {/* Output Ports */}
        {outPorts.length > 0 && (
          <section>
            <SectionLabel>Output Ports ({outPorts.length})</SectionLabel>
            <PortTable ports={outPorts} color={style.color} />
          </section>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9.5, fontWeight: 700, letterSpacing: '0.09em',
      color: '#4a5570', textTransform: 'uppercase', marginBottom: 8,
    }}>{children}</div>
  )
}
