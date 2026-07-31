import { useMemo, useState } from 'react'
import type { FSFile, FSDir } from '../../types'
import type { ApiError } from '../../api/client'
import { useRecipe, useDdl } from '../../api/queries'
import { recipeToCanvas } from '../../api/recipeAdapter'
import type { RecipeJson } from '../../api/recipeAdapter'
import { Sidebar } from '../shared/Sidebar'
import { useFilesystem } from '../shared/useFilesystem'
import { EtlCanvas } from '../shared/EtlCanvas'
import { CopyButton } from '../shared/CopyButton'
import { GCPIcon } from '../shared/GCPIcon'

const EMPTY_FS: FSDir = { name: 'xmltobq', layer: 'root', children: [] }

/** Real DDL JSON shape (parser `<TABLE>.json` output) — BigQuery field list. */
interface DdlColumnJson {
  name?: string
  type?: string
  mode?: string
  description?: string
}

// ─── Save Bar ─────────────────────────────────────────────────────────────────

function SaveBar({ changes, onSave, onDiscard }: { changes: number; onSave: () => void; onDiscard: () => void }) {
  if (changes === 0) return null
  return (
    <div style={{
      position: 'sticky', bottom: 0,
      background: 'var(--surface)',
      borderTop: '1px solid #fbbf2444',
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      zIndex: 10,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 11, color: '#fbbf24',
      }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="5" stroke="#fbbf24" strokeWidth="1.2" />
          <line x1="6" y1="3.5" x2="6" y2="6.5" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="6" cy="8.5" r="0.8" fill="#fbbf24" />
        </svg>
        {changes} unsaved change{changes !== 1 ? 's' : ''}
      </div>
      <div style={{ flex: 1 }} />
      <button onClick={onDiscard} style={{
        padding: '5px 14px', borderRadius: 5,
        background: 'transparent', border: '1px solid var(--border)',
        color: '#7b88aa', fontSize: 12, cursor: 'pointer',
      }}>Discard</button>
      <button onClick={onSave} style={{
        padding: '5px 16px', borderRadius: 5,
        background: 'rgba(79,156,249,0.15)', border: '1px solid #4f9cf9',
        color: '#4f9cf9', fontSize: 12, cursor: 'pointer', fontWeight: 600,
      }}>Save Changes</button>
    </div>
  )
}

// ─── Editable Field ───────────────────────────────────────────────────────────

function EditableField({
  label,
  value,
  onChange,
  mono = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  mono?: boolean
}) {
  const sharedStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: '#c8d3e8',
    fontSize: mono ? 11 : 12,
    padding: '5px 8px',
    fontFamily: mono ? 'JetBrains Mono, monospace' : 'Inter, sans-serif',
    outline: 'none',
  }

  return (
    <div>
      <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
        <input value={value} onChange={e => onChange(e.target.value)}
          style={sharedStyle}
          onFocus={e => { e.target.style.borderColor = '#4f9cf9' }}
          onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
        />
        <CopyButton value={value} />
      </div>
    </div>
  )
}

// ─── DDL Viewer ───────────────────────────────────────────────────────────────

function DDLViewer({ cols }: { cols: DdlColumnJson[] }) {
  if (cols.length === 0) return null

  const modeColor: Record<string, string> = { REQUIRED: '#34d399', NULLABLE: '#4a5570', REPEATED: '#818cf8' }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto auto 2fr',
        background: 'var(--surface-2)', padding: '6px 10px',
        borderBottom: '1px solid var(--border)',
        fontSize: 9, color: '#4a5570', textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        <span>Column</span>
        <span style={{ textAlign: 'right', paddingRight: 12 }}>BQ Type</span>
        <span style={{ textAlign: 'right', paddingRight: 12 }}>Mode</span>
        <span>Description</span>
      </div>
      {cols.map((col, i) => (
        <div key={i} className="port-row" style={{
          display: 'grid', gridTemplateColumns: '1fr auto auto 2fr',
          padding: '6px 10px', borderBottom: i < cols.length - 1 ? '1px solid var(--border-subtle)' : 'none',
          alignItems: 'center', gap: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#c8d3e8' }}>{col.name}</span>
            <CopyButton value={col.name ?? ''} size={11} />
          </div>
          <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#4f9cf9', textAlign: 'right', paddingRight: 12 }}>{col.type}</span>
          <span style={{
            fontSize: 8, fontFamily: 'JetBrains Mono, monospace', textAlign: 'right', paddingRight: 12,
            color: modeColor[col.mode ?? ''] ?? '#4a5570',
          }}>{col.mode}</span>
          <span style={{ fontSize: 10, color: '#4a5570', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.description || '—'}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ icon, label, color, extra }: { icon: string; label: string; color: string; extra?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 14, color, fontFamily: 'JetBrains Mono, monospace' }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f8' }}>{label}</span>
      {extra}
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

// ─── Table name list (Source / Target cards) ───────────────────────────────────

function TableNameList({ names, emptyLabel }: { names: string[]; emptyLabel: string }) {
  if (names.length === 0) {
    return <div style={{ color: '#4a5570', fontSize: 11 }}>{emptyLabel}</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {names.map(name => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#c8d3e8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </span>
          <CopyButton value={name} size={11} />
        </div>
      ))}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ETLModifier({ searchQuery }: { searchQuery: string }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [recipePath, setRecipePath] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const { fs, loading, error } = useFilesystem()

  const rec = useRecipe(recipePath ?? '')
  const recError = rec.error as ApiError | null
  const content = rec.data?.content as RecipeJson | undefined

  const graph = useMemo(
    () => (rec.data ? recipeToCanvas(rec.data.content as RecipeJson, recipePath!) : null),
    [rec.data, recipePath],
  )

  const recipeSlash = recipePath ? recipePath.lastIndexOf('/') : -1
  const recipeDir = recipeSlash >= 0 ? recipePath!.slice(0, recipeSlash) : ''
  const ddl = useDdl(recipeDir)
  const ddlEntries = ddl.data ? Object.entries(ddl.data as Record<string, DdlColumnJson[]>) : []

  const exprPorts = graph?.nodes.flatMap(n => n.ports).filter(p => p.expression) ?? []

  const handleSelectFile = (f: FSFile) => {
    setSelectedPath(f.path)
    if (f.recipe) {
      setRecipePath(f.recipe)
      setSelectedNodeId(null)
      setShowRaw(false)
    }
  }

  const sidebarExtra = loading ? (
    <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: 12 }}>Loading corpus…</div>
  ) : error ? (
    <div style={{ color: 'var(--red)', fontSize: 12, padding: 12 }}>
      <div>{error.title}</div>
      {error.detail && <div>{error.detail}</div>}
    </div>
  ) : null

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <Sidebar
        searchQuery={searchQuery}
        selectedPath={selectedPath}
        onSelectFile={handleSelectFile}
        filesystem={fs ?? EMPTY_FS}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(c => !c)}
        extraContent={sidebarExtra}
      />

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {!recipePath ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5570', flexDirection: 'column', gap: 8 }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect x="8" y="4" width="24" height="32" rx="3" stroke="#2a3050" strokeWidth="1.5" fill="none" />
              <line x1="13" y1="12" x2="27" y2="12" stroke="#2a3050" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="13" y1="18" x2="27" y2="18" stroke="#2a3050" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="13" y1="24" x2="20" y2="24" stroke="#2a3050" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 12 }}>Select an _ETL_*.json recipe to edit</span>
          </div>
        ) : rec.isLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
            Loading recipe…
          </div>
        ) : recError ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4, color: 'var(--red)', fontSize: 12 }}>
            <div>{recError.title}</div>
            {recError.detail && <div>{recError.detail}</div>}
          </div>
        ) : rec.data && graph ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* recipe header */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 16,
              padding: '16px 20px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, width: '100%' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#e2e8f8' }}>{rec.data.fileName}</h2>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                      background: 'rgba(79,156,249,0.15)',
                      color: '#4f9cf9',
                      border: '1px solid rgba(79,156,249,0.3)',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}>{(rec.data.path ?? '').split('/')[0]}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                    <EditableField label="Path" value={rec.data.path ?? ''} onChange={() => {}} mono />
                    <EditableField label="Size bytes" value={String(rec.data.sizeBytes ?? '')} onChange={() => {}} mono />
                    <EditableField label="Modified" value={rec.data.modifiedAt ?? ''} onChange={() => {}} mono />
                  </div>
                </div>
                <button onClick={() => setShowRaw(r => !r)} style={{
                  padding: '5px 12px', borderRadius: 5,
                  background: showRaw ? 'var(--surface-3)' : 'transparent', border: '1px solid var(--border)',
                  color: '#7b88aa', fontSize: 11, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
                  flexShrink: 0,
                }}>{'{ raw JSON }'}</button>
              </div>

              {showRaw && (
                <div style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 10px', background: 'var(--surface-2)',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <span style={{ fontSize: 10, color: '#4a5570', flex: 1 }}>Raw JSON</span>
                    <CopyButton value={JSON.stringify(rec.data.content, null, 2)} size={11} />
                  </div>
                  <pre style={{
                    margin: 0, padding: '10px 12px', maxHeight: 400, overflow: 'auto',
                    fontSize: 10, color: '#c8d3e8',
                    fontFamily: 'JetBrains Mono, monospace',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6,
                  }}>{JSON.stringify(rec.data.content, null, 2)}</pre>
                </div>
              )}
            </div>

            {/* source */}
            <section>
              <SectionHeader icon="→" label="Source" color="#34d399" />
              <div style={{
                padding: '16px', background: 'var(--surface)',
                border: '1px solid rgba(52,211,153,0.2)', borderRadius: 7,
              }}>
                <TableNameList names={content?.table?.sourceTableNames ?? []} emptyLabel="No source tables found in this recipe." />
              </div>
            </section>

            {/* canvas */}
            <section>
              <SectionHeader icon="⇄" label={`Canvas (${graph.nodes.length} nodes)`} color="#818cf8" />
              <div style={{ height: 420, border: '1px solid var(--border)', borderRadius: 8, position: 'relative', overflow: 'hidden' }}>
                <EtlCanvas
                  nodes={graph.nodes}
                  connections={graph.connections}
                  selectedNode={selectedNodeId}
                  onSelectNode={id => setSelectedNodeId(id === selectedNodeId ? null : id)}
                  highlightIds={[]}
                />
              </div>
            </section>

            {/* target */}
            <section>
              <SectionHeader icon="⬡" label="Target" color="#f87171" extra={<GCPIcon service="bigquery" size={16} />} />
              <div style={{
                padding: '16px', background: 'var(--surface)',
                border: '1px solid rgba(248,113,113,0.2)', borderRadius: 7,
              }}>
                <TableNameList names={content?.table?.targetTableNames ?? []} emptyLabel="No target tables found in this recipe." />
              </div>
            </section>

            {/* expressions collector (interim until Task 11's registry) */}
            <section>
              <SectionHeader icon="ƒ" label="All Expressions" color="#a78bfa" />
              {exprPorts.length === 0 ? (
                <div style={{ color: '#4a5570', fontSize: 11 }}>No expressions found in this recipe.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {exprPorts.map((p, i) => (
                    <div key={i} style={{ border: '1px solid rgba(167,139,250,0.2)', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '5px 10px', background: 'rgba(167,139,250,0.05)',
                        borderBottom: '1px solid rgba(167,139,250,0.15)',
                      }}>
                        <span style={{ fontSize: 10, color: '#c8d3e8', fontFamily: 'JetBrains Mono, monospace', flex: 1 }}>{p.name}</span>
                        {p.dataType && (
                          <span style={{ fontSize: 9, color: '#4a5570', fontFamily: 'JetBrains Mono, monospace' }}>{p.dataType}</span>
                        )}
                        <CopyButton value={p.expression!} size={11} />
                      </div>
                      <pre style={{
                        margin: 0, padding: '6px 10px',
                        fontSize: 10, color: '#a78bfa',
                        fontFamily: 'JetBrains Mono, monospace',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6,
                      }}>{p.expression}</pre>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* DDL — hidden entirely when the map is empty or errored */}
            {!ddl.error && ddlEntries.length > 0 && (
              <section>
                <SectionHeader icon="⬡" label="BigQuery DDL Schema" color="#4f9cf9" extra={<GCPIcon service="bigquery" size={16} />} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {ddlEntries.map(([table, cols]) => (
                    <div key={table}>
                      <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 6, fontFamily: 'JetBrains Mono, monospace' }}>{table}</div>
                      <DDLViewer cols={cols} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div style={{ height: 60 }} />
          </div>
        ) : null}

        <SaveBar changes={0} onSave={() => {}} onDiscard={() => {}} />
      </div>
    </div>
  )
}
