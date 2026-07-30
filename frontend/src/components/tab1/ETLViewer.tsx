import { useState, useMemo } from 'react'
import type { FSFile, FSDir } from '../../types'
import type { ApiError } from '../../api/client'
import { useMappingDom, useMappingModel } from '../../api/queries'
import { toCanvas } from '../../api/mappingAdapter'
import { findElementForNode } from '../../api/domSlice'
import { Sidebar } from '../shared/Sidebar'
import { useFilesystem } from '../shared/useFilesystem'
import { EtlCanvas } from '../shared/EtlCanvas'
import { NODE_STYLES } from './NodeBox'
import { DetailPanel } from './DetailPanel'

const EMPTY_FS: FSDir = { name: 'xmltobq', layer: 'root', children: [] }

const LEGEND = [
  { type: 'source', label: 'Source' },
  { type: 'sq', label: 'Src Qualifier' },
  { type: 'expression', label: 'Expression' },
  { type: 'lookup', label: 'Lookup' },
  { type: 'joiner', label: 'Joiner' },
  { type: 'aggregator', label: 'Aggregator' },
  { type: 'router', label: 'Router' },
  { type: 'filter', label: 'Filter' },
  { type: 'target', label: 'Target' },
] as const

export function ETLViewer({ searchQuery }: { searchQuery: string }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [mappingPath, setMappingPath] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const { fs, loading, error } = useFilesystem()
  const model = useMappingModel(mappingPath ?? '')
  const dom = useMappingDom(mappingPath ?? '')
  const modelError = model.error as ApiError | null

  const graph = useMemo(
    () => (model.data ? toCanvas(model.data, mappingPath!) : null),
    [model.data, mappingPath],
  )

  const selectedNode = graph?.nodes.find(n => n.id === selectedNodeId) ?? null

  // Global search reuse (Task 5, spec §3.4 deviation — no canvas toolbar on
  // Tab 1): matches by node name OR any port name, trimmed/lowercased query.
  const q = searchQuery.trim().toLowerCase()
  const matchIds = useMemo(
    () => (graph?.nodes ?? [])
      .filter(n => q && (n.name.toLowerCase().includes(q) || n.ports.some(p => p.name.toLowerCase().includes(q))))
      .map(n => n.id),
    [graph, q],
  )

  const domElement = useMemo(
    () => (selectedNode && dom.data && graph
      ? findElementForNode(dom.data, selectedNode.name, selectedNode.type, graph.renderedMapping)
      : null),
    [selectedNode, dom.data, graph],
  )

  const handleSelectFile = (f: FSFile) => {
    setSelectedPath(f.path)
    if (f.type === 'xml' && f.mapping) {
      setMappingPath(f.mapping)
      setSelectedNodeId(null)
    }
  }

  const sidebarExtra = loading ? (
    <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: 12 }}>Loading corpus…</div>
  ) : error ? (
    <div style={{ color: 'var(--red)', fontSize: 12, padding: 12 }}>
      <div>{error.title}</div>
      {error.detail && <div>{error.detail}</div>}
    </div>
  ) : mappingPath ? (
    <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', background: 'var(--surface-2)' }}>
      <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 6 }}>Active Mapping</div>
      <div style={{
        padding: '4px 8px', borderRadius: 4, textAlign: 'left',
        background: 'var(--surface-3)',
        border: '1px solid var(--border)',
        color: '#e2e8f8',
        fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {mappingPath.split('/').pop()}
      </div>
    </div>
  ) : null

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <Sidebar
        searchQuery={searchQuery}
        selectedPath={selectedPath}
        onSelectFile={handleSelectFile}
        filesystem={fs ?? EMPTY_FS}
        extraContent={sidebarExtra}
      />

      {!mappingPath ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5570', flexDirection: 'column', gap: 8 }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect x="8" y="4" width="24" height="32" rx="3" stroke="#2a3050" strokeWidth="1.5" fill="none" />
            <line x1="13" y1="12" x2="27" y2="12" stroke="#2a3050" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="13" y1="18" x2="27" y2="18" stroke="#2a3050" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="13" y1="24" x2="20" y2="24" stroke="#2a3050" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 12 }}>Select an .xml mapping to view</span>
        </div>
      ) : model.isLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
          Loading mapping…
        </div>
      ) : modelError ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4, color: 'var(--red)', fontSize: 12 }}>
          <div>{modelError.title}</div>
          {modelError.detail && <div>{modelError.detail}</div>}
        </div>
      ) : graph ? (
        <EtlCanvas
          nodes={graph.nodes}
          connections={graph.connections}
          selectedNode={selectedNodeId}
          onSelectNode={id => setSelectedNodeId(id === selectedNodeId ? null : id)}
          highlightIds={matchIds}
        />
      ) : null}

      {selectedNode && (
        <DetailPanel node={selectedNode} domElement={domElement} onClose={() => setSelectedNodeId(null)} />
      )}

      {/* status bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 240, right: selectedNode ? 310 : 0,
        height: 24, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px',
        background: 'var(--surface)', borderTop: '1px solid var(--border)', pointerEvents: 'none',
      }}>
        {LEGEND.map(({ type, label }) => {
          const s = NODE_STYLES[type]
          return (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
              <span style={{ fontSize: 9, color: '#4a5570' }}>{label}</span>
            </div>
          )
        })}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: '#2a3050', fontFamily: 'JetBrains Mono, monospace' }}>
          {graph && `${graph.nodes.length} nodes · ${graph.connections.length} connections · Informatica PowerCenter${graph.mappingNames.length > 1 ? ` · mapping 1 of ${graph.mappingNames.length}: ${graph.renderedMapping}` : ''}`}
        </span>
      </div>
    </div>
  )
}
