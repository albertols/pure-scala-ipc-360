import { CopyButton } from '../shared/CopyButton'

/** Real DDL JSON shape (parser `<TABLE>.json` output) — BigQuery field list. */
export interface DdlColumnJson {
  name?: string
  type?: string
  mode?: string
  description?: string
}

export function DDLViewer({ cols }: { cols: DdlColumnJson[] }) {
  if (cols.length === 0) return null

  const modeColor: Record<string, string> = {
    REQUIRED: '#34d399',
    NULLABLE: '#4a5570',
    REPEATED: '#818cf8',
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto 2fr',
          background: 'var(--surface-2)',
          padding: '6px 10px',
          borderBottom: '1px solid var(--border)',
          fontSize: 9,
          color: '#4a5570',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        <span>Column</span>
        <span style={{ textAlign: 'right', paddingRight: 12 }}>BQ Type</span>
        <span style={{ textAlign: 'right', paddingRight: 12 }}>Mode</span>
        <span>Description</span>
      </div>
      {cols.map((col, i) => (
        <div
          key={i}
          className="port-row"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto auto 2fr',
            padding: '6px 10px',
            borderBottom: i < cols.length - 1 ? '1px solid var(--border-subtle)' : 'none',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#c8d3e8' }}
            >
              {col.name}
            </span>
            <CopyButton value={col.name ?? ''} size={11} />
          </div>
          <span
            style={{
              fontSize: 9,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#4f9cf9',
              textAlign: 'right',
              paddingRight: 12,
            }}
          >
            {col.type}
          </span>
          <span
            style={{
              fontSize: 8,
              fontFamily: 'JetBrains Mono, monospace',
              textAlign: 'right',
              paddingRight: 12,
              color: modeColor[col.mode ?? ''] ?? '#4a5570',
            }}
          >
            {col.mode}
          </span>
          <span
            style={{
              fontSize: 10,
              color: '#4a5570',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {col.description || '—'}
          </span>
        </div>
      ))}
    </div>
  )
}
