import { useState } from 'react'
import type { FSDir, FSFile } from '../../types'

const LAYER_COLORS: Record<string, string> = {
  CDM: '#4f9cf9',
  ODS: '#a78bfa',
  SRC: '#34d399',
  TGT: '#f87171',
  root: '#4a5570',
}

function FileIcon({ type }: { type: 'json' | 'xml' }) {
  return (
    <span style={{
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 8,
      fontWeight: 700,
      padding: '1px 4px',
      borderRadius: 3,
      background: type === 'json' ? 'rgba(251,191,36,0.15)' : 'rgba(34,211,238,0.15)',
      color: type === 'json' ? '#fbbf24' : '#22d3ee',
      border: `1px solid ${type === 'json' ? 'rgba(251,191,36,0.3)' : 'rgba(34,211,238,0.3)'}`,
      flexShrink: 0,
    }}>
      {type.toUpperCase()}
    </span>
  )
}

function TreeItem({
  node,
  depth,
  searchQuery,
  selectedPath,
  onSelectFile,
  defaultExpanded,
}: {
  node: FSDir | FSFile
  depth: number
  searchQuery: string
  selectedPath: string | null
  onSelectFile: (f: FSFile) => void
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? depth < 2)

  if ('children' in node) {
    const dir = node as FSDir
    const layerColor = dir.layer && dir.layer !== 'root' ? LAYER_COLORS[dir.layer] : undefined

    const visible = !searchQuery ||
      JSON.stringify(dir.children).toLowerCase().includes(searchQuery.toLowerCase()) ||
      dir.name.toLowerCase().includes(searchQuery.toLowerCase())
    if (!visible) return null

    return (
      <div>
        <div
          onClick={() => setExpanded(e => !e)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: `4px 8px 4px ${8 + depth * 13}px`,
            cursor: 'pointer',
            color: '#b0bdd6',
            borderRadius: 4,
            borderLeft: layerColor ? `2px solid ${layerColor}` : undefined,
            marginLeft: layerColor ? 0 : undefined,
          }}
          className="tree-item"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
            <path d={expanded ? 'M1 3l4 4 4-4' : 'M3 1l4 4-4 4'} stroke="#4a5570" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <svg width="13" height="12" viewBox="0 0 13 12" fill="none" style={{ flexShrink: 0 }}>
            {expanded
              ? <path d="M1 4h11l-1 6H2L1 4zM1 4V3a1 1 0 011-1h3l1 1.5H11a1 1 0 011 1" stroke={layerColor ?? '#7b88aa'} strokeWidth="1.1" fill={layerColor ? `${layerColor}18` : 'rgba(123,136,170,0.1)'} />
              : <path d="M1 4h11v5.5a.5.5 0 01-.5.5h-10a.5.5 0 01-.5-.5V4zM1 4V3a1 1 0 011-1h3l1 1.5H1z" stroke={layerColor ?? '#4a5570'} strokeWidth="1.1" fill="rgba(74,85,112,0.1)" />
            }
          </svg>
          <span style={{ fontSize: 12, fontWeight: layerColor ? 600 : 400, color: layerColor ?? '#8494b8' }}>
            {dir.name}
          </span>
          {layerColor && (
            <span style={{
              fontSize: 8, padding: '1px 4px', borderRadius: 3, marginLeft: 2,
              background: `${layerColor}18`, color: layerColor,
              border: `1px solid ${layerColor}33`, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
            }}>{dir.layer}</span>
          )}
        </div>
        {expanded && dir.children.map((child, i) => (
          <TreeItem
            key={i}
            node={child}
            depth={depth + 1}
            searchQuery={searchQuery}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
            defaultExpanded={depth < 1}
          />
        ))}
      </div>
    )
  }

  const file = node as FSFile
  const matches = !searchQuery || file.name.toLowerCase().includes(searchQuery.toLowerCase())
  if (!matches) return null
  const isActive = selectedPath === file.path
  const isEtl = file.name.startsWith('_ETL_')
  const isDdl = file.name.startsWith('_DDL_')

  return (
    <div
      onClick={() => onSelectFile(file)}
      className={`tree-item${isActive ? ' active' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: `4px 8px 4px ${8 + depth * 13}px`,
        cursor: 'pointer',
        borderRadius: 4,
        color: isActive ? '#e2e8f8' : '#6b7a9c',
        background: isActive ? 'var(--surface-3)' : undefined,
      }}
    >
      <span style={{ width: 10 }} />
      {isEtl && <span style={{ fontSize: 8, color: '#34d399', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>ETL</span>}
      {isDdl && <span style={{ fontSize: 8, color: '#4f9cf9', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>DDL</span>}
      {!isEtl && !isDdl && <span style={{ width: 14 }} />}
      <span style={{
        fontSize: 11, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontFamily: 'JetBrains Mono, monospace',
        color: isEtl ? '#34d399' : isDdl ? '#4f9cf9' : isActive ? '#e2e8f8' : '#6b7a9c',
      }}>
        {file.name}
      </span>
      <FileIcon type={file.type} />
    </div>
  )
}

export function Sidebar({
  searchQuery,
  selectedPath,
  onSelectFile,
  filesystem,
  extraContent,
}: {
  searchQuery: string
  selectedPath: string | null
  onSelectFile: (f: FSFile) => void
  filesystem: FSDir
  extraContent?: React.ReactNode
}) {
  return (
    <div style={{
      width: 240,
      flexShrink: 0,
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{
        padding: '10px 12px 8px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <rect x="1" y="1" width="11" height="11" rx="2" stroke="#4a5570" strokeWidth="1.2" fill="none" />
          <line x1="1" y1="5" x2="12" y2="5" stroke="#4a5570" strokeWidth="1.2" />
          <line x1="5" y1="5" x2="5" y2="12" stroke="#4a5570" strokeWidth="1.2" />
        </svg>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#4a5570', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Explorer
        </span>
      </div>

      {/* tree */}
      <div style={{ flex: 1, overflow: 'auto', padding: '6px 4px' }}>
        <TreeItem
          node={filesystem}
          depth={0}
          searchQuery={searchQuery}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          defaultExpanded
        />
      </div>

      {extraContent}
    </div>
  )
}
