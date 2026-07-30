import { useState, useCallback } from 'react'
import type { FSFile, FSDir, ETLRecipe, RecipeTransformation } from '../../types'
import { ETL_RECIPES, DDL_SCHEMAS } from '../../mockData'
import { Sidebar } from '../shared/Sidebar'
import { useFilesystem } from '../shared/useFilesystem'
import { CopyButton } from '../shared/CopyButton'
import { InfoTooltip } from '../shared/InfoTooltip'
import { GCPIcon } from '../shared/GCPIcon'

const EMPTY_FS: FSDir = { name: 'xmltobq', layer: 'root', children: [] }

const TYPE_COLORS: Record<string, string> = {
  EXPRESSION: '#818cf8',
  LOOKUP: '#a78bfa',
  AGGREGATOR: '#fb923c',
  JOINER: '#fbbf24',
  ROUTER: '#f472b6',
  FILTER: '#67e8f9',
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
  multiline = false,
  placeholder = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  mono?: boolean
  multiline?: boolean
  placeholder?: string
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
    resize: multiline ? 'vertical' : 'none',
  }

  return (
    <div>
      <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
        {multiline
          ? <textarea rows={3} value={value} onChange={e => onChange(e.target.value)}
              placeholder={placeholder} style={{ ...sharedStyle, minHeight: 58 }}
              onFocus={e => { e.target.style.borderColor = '#4f9cf9' }}
              onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
            />
          : <input value={value} onChange={e => onChange(e.target.value)}
              placeholder={placeholder} style={sharedStyle}
              onFocus={e => { e.target.style.borderColor = '#4f9cf9' }}
              onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
            />
        }
        <CopyButton value={value} />
      </div>
    </div>
  )
}

// ─── Transformation Card ──────────────────────────────────────────────────────

function TransformCard({
  tx,
  onChange,
}: {
  tx: RecipeTransformation
  onChange: (updated: RecipeTransformation) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const color = TYPE_COLORS[tx.type] ?? '#4a5570'

  const updatePort = (i: number, field: 'name' | 'expression', val: string) => {
    const ports = [...(tx.ports ?? [])]
    ports[i] = { ...ports[i], [field]: val }
    onChange({ ...tx, ports })
  }

  return (
    <div style={{
      border: `1px solid ${color}44`,
      borderTop: `2px solid ${color}`,
      borderRadius: 7,
      background: 'var(--surface)',
      overflow: 'hidden',
      minWidth: 260,
      flexShrink: 0,
    }}>
      {/* header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px', cursor: 'pointer',
          background: `${color}0c`,
        }}
      >
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
          background: `${color}22`, color, border: `1px solid ${color}44`,
          fontFamily: 'JetBrains Mono, monospace',
        }}>{tx.type}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f8', flex: 1 }}>{tx.name}</span>
        <span style={{ fontSize: 10, color: '#4a5570' }}>{tx.id}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d={expanded ? 'M1 3l4 4 4-4' : 'M3 1l4 4-4 4'} stroke="#4a5570" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>

      {expanded && (
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <EditableField label="Name" value={tx.name} onChange={v => onChange({ ...tx, name: v })} />

          {tx.lookup_table && (
            <EditableField label="Lookup Table" value={tx.lookup_table} onChange={v => onChange({ ...tx, lookup_table: v })} mono />
          )}
          {tx.lookup_condition && (
            <EditableField label="Lookup Condition" value={tx.lookup_condition} onChange={v => onChange({ ...tx, lookup_condition: v })} mono multiline />
          )}
          {tx.cache_type && (
            <EditableField label="Cache Type" value={tx.cache_type} onChange={v => onChange({ ...tx, cache_type: v })} />
          )}
          {tx.join_type && (
            <EditableField label="Join Type" value={tx.join_type} onChange={v => onChange({ ...tx, join_type: v })} />
          )}
          {tx.join_condition && (
            <EditableField label="Join Condition" value={tx.join_condition} onChange={v => onChange({ ...tx, join_condition: v })} mono multiline />
          )}
          {tx.filter_condition && (
            <EditableField label="Filter Condition" value={tx.filter_condition} onChange={v => onChange({ ...tx, filter_condition: v })} mono multiline />
          )}
          {tx.group_by && (
            <EditableField label="Group By" value={tx.group_by.join(', ')} onChange={v => onChange({ ...tx, group_by: v.split(',').map(s => s.trim()) })} mono />
          )}

          {tx.ports && tx.ports.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                Ports / Expressions
                <InfoTooltip text="Edit the transformation formula for each output port. Uses Informatica expression syntax." placement="right" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tx.ports.map((p, i) => (
                  <div key={i} style={{
                    border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 8px', background: 'var(--surface-2)',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <input value={p.name} onChange={e => updatePort(i, 'name', e.target.value)}
                        style={{
                          flex: 1, background: 'transparent', border: 'none', outline: 'none',
                          fontSize: 10, color: '#c8d3e8', fontFamily: 'JetBrains Mono, monospace',
                        }} />
                      {p.dataType && (
                        <span style={{ fontSize: 9, color: '#4a5570', fontFamily: 'JetBrains Mono, monospace' }}>{p.dataType}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', padding: '5px 8px', gap: 4 }}>
                      <span style={{ fontSize: 9, color: color, fontFamily: 'JetBrains Mono, monospace', marginTop: 1, flexShrink: 0 }}>ƒ</span>
                      <textarea
                        rows={2}
                        value={p.expression}
                        onChange={e => updatePort(i, 'expression', e.target.value)}
                        style={{
                          flex: 1, background: 'transparent', border: 'none', outline: 'none',
                          fontSize: 10, color: '#a78bfa', fontFamily: 'JetBrains Mono, monospace',
                          resize: 'vertical', lineHeight: 1.5,
                        }}
                      />
                      <CopyButton value={p.expression} size={11} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── DDL Viewer ───────────────────────────────────────────────────────────────

function DDLViewer({ recipeId }: { recipeId: string }) {
  const cols = DDL_SCHEMAS[recipeId] ?? []
  if (cols.length === 0) return <div style={{ color: '#4a5570', fontSize: 11, padding: '8px 0' }}>No DDL schema found for this recipe.</div>

  const modeColor = { REQUIRED: '#34d399', NULLABLE: '#4a5570', REPEATED: '#818cf8' }

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
            <CopyButton value={col.name} size={11} />
          </div>
          <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#4f9cf9', textAlign: 'right', paddingRight: 12 }}>{col.bq_type}</span>
          <span style={{
            fontSize: 8, fontFamily: 'JetBrains Mono, monospace', textAlign: 'right', paddingRight: 12,
            color: modeColor[col.mode] ?? '#4a5570',
          }}>{col.mode}</span>
          <span style={{ fontSize: 10, color: '#4a5570', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.description ?? '—'}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Expression Collector ─────────────────────────────────────────────────────

function ExpressionList({ recipe }: { recipe: ETLRecipe }) {
  const allExprs = recipe.transformations.flatMap(tx =>
    (tx.ports ?? []).filter(p => p.expression).map(p => ({ tx: tx.name, port: p.name, expr: p.expression, type: tx.type }))
  )
  if (allExprs.length === 0) return <div style={{ color: '#4a5570', fontSize: 11 }}>No expressions found in this recipe.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {allExprs.map((e, i) => {
        const color = TYPE_COLORS[e.type] ?? '#818cf8'
        return (
          <div key={i} style={{
            border: `1px solid ${color}30`,
            borderLeft: `3px solid ${color}`,
            borderRadius: 5,
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 10px', background: `${color}08`,
              borderBottom: `1px solid ${color}20`,
            }}>
              <span style={{ fontSize: 9, color, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{e.tx}</span>
              <span style={{ fontSize: 10, color: '#c8d3e8', fontFamily: 'JetBrains Mono, monospace' }}>{e.port}</span>
              <div style={{ flex: 1 }} />
              <CopyButton value={e.expr} size={11} />
            </div>
            <pre style={{
              margin: 0, padding: '6px 10px',
              fontSize: 10, color: '#a78bfa',
              fontFamily: 'JetBrains Mono, monospace',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6,
            }}>{e.expr}</pre>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ETLModifier({ searchQuery }: { searchQuery: string }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null)
  const [recipes, setRecipes] = useState<Record<string, ETLRecipe>>(
    Object.fromEntries(Object.entries(ETL_RECIPES).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]))
  )
  const [originalRecipes] = useState<Record<string, ETLRecipe>>(ETL_RECIPES)
  const [saved, setSaved] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { fs, loading, error } = useFilesystem()

  const recipe = activeRecipeId ? recipes[activeRecipeId] : null
  const original = activeRecipeId ? originalRecipes[activeRecipeId] : null

  const changes = recipe && original
    ? JSON.stringify(recipe) !== JSON.stringify(original) ? 1 : 0
    : 0

  const handleSelectFile = (f: FSFile) => {
    setSelectedPath(f.path)
    if (f.recipe) setActiveRecipeId(f.recipe)
  }

  const updateRecipe = useCallback((updater: (r: ETLRecipe) => ETLRecipe) => {
    if (!activeRecipeId) return
    setRecipes(prev => ({ ...prev, [activeRecipeId]: updater(prev[activeRecipeId]) }))
    setSaved(false)
  }, [activeRecipeId])

  const updateTransformation = (i: number, tx: RecipeTransformation) => {
    updateRecipe(r => {
      const txs = [...r.transformations]
      txs[i] = tx
      return { ...r, transformations: txs }
    })
  }

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleDiscard = () => {
    if (!activeRecipeId) return
    setRecipes(prev => ({
      ...prev,
      [activeRecipeId]: JSON.parse(JSON.stringify(originalRecipes[activeRecipeId])),
    }))
  }

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <Sidebar
        searchQuery={searchQuery}
        selectedPath={selectedPath}
        onSelectFile={handleSelectFile}
        filesystem={fs ?? EMPTY_FS}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(c => !c)}
        extraContent={
          loading ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: 12 }}>Loading corpus…</div>
          ) : error ? (
            <div style={{ color: 'var(--red)', fontSize: 12, padding: 12 }}>
              <div>{error.title}</div>
              {error.detail && <div>{error.detail}</div>}
            </div>
          ) : (
            <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', background: 'var(--surface-2)' }}>
              <div style={{ fontSize: 9, color: '#4a5570', marginBottom: 4 }}>Select an _ETL_*.json file to edit</div>
              {Object.keys(ETL_RECIPES).map(id => (
                <button key={id} onClick={() => setActiveRecipeId(id)}
                  style={{
                    display: 'block', width: '100%', padding: '3px 6px',
                    textAlign: 'left', background: activeRecipeId === id ? 'var(--surface-3)' : 'transparent',
                    border: 'none', color: activeRecipeId === id ? '#e2e8f8' : '#4a5570',
                    fontSize: 9, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
                    borderRadius: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{id}</button>
              ))}
            </div>
          )
        }
      />

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {!recipe ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5570', flexDirection: 'column', gap: 8 }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect x="8" y="4" width="24" height="32" rx="3" stroke="#2a3050" strokeWidth="1.5" fill="none" />
              <line x1="13" y1="12" x2="27" y2="12" stroke="#2a3050" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="13" y1="18" x2="27" y2="18" stroke="#2a3050" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="13" y1="24" x2="20" y2="24" stroke="#2a3050" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 12 }}>Select an _ETL_*.json recipe to edit</span>
          </div>
        ) : (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* recipe header */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 16,
              padding: '16px 20px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#e2e8f8' }}>{recipe.recipe_id}</h2>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                    background: recipe.layer === 'CDM' ? 'rgba(79,156,249,0.15)' : 'rgba(167,139,250,0.15)',
                    color: recipe.layer === 'CDM' ? '#4f9cf9' : '#a78bfa',
                    border: `1px solid ${recipe.layer === 'CDM' ? 'rgba(79,156,249,0.3)' : 'rgba(167,139,250,0.3)'}`,
                    fontFamily: 'JetBrains Mono, monospace',
                  }}>{recipe.layer}</span>
                  {recipe.bpm_id && (
                    <span style={{ fontSize: 10, color: '#4a5570', fontFamily: 'JetBrains Mono, monospace' }}>{recipe.bpm_id}</span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  <EditableField label="Version" value={recipe.metadata.version}
                    onChange={v => updateRecipe(r => ({ ...r, metadata: { ...r.metadata, version: v } }))} mono />
                  <EditableField label="Owner" value={recipe.metadata.owner}
                    onChange={v => updateRecipe(r => ({ ...r, metadata: { ...r.metadata, owner: v } }))} />
                  <EditableField label="Description" value={recipe.metadata.description ?? ''}
                    onChange={v => updateRecipe(r => ({ ...r, metadata: { ...r.metadata, description: v } }))} />
                </div>
              </div>
              {saved && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#34d399', fontSize: 12 }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 7l4 4 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  Saved
                </div>
              )}
            </div>

            {/* source */}
            <section>
              <SectionHeader icon="→" label="Source" color="#34d399" />
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12,
                padding: '16px', background: 'var(--surface)',
                border: '1px solid rgba(52,211,153,0.2)', borderRadius: 7,
              }}>
                <EditableField label="DB Type" value={recipe.source.type}
                  onChange={v => updateRecipe(r => ({ ...r, source: { ...r.source, type: v } }))} />
                <EditableField label="Connection" value={recipe.source.db_connection ?? ''}
                  onChange={v => updateRecipe(r => ({ ...r, source: { ...r.source, db_connection: v } }))} mono />
                <EditableField label="Schema" value={recipe.source.schema}
                  onChange={v => updateRecipe(r => ({ ...r, source: { ...r.source, schema: v } }))} mono />
                <EditableField label="Table" value={recipe.source.table}
                  onChange={v => updateRecipe(r => ({ ...r, source: { ...r.source, table: v } }))} mono />
                <div style={{ gridColumn: '1/-1' }}>
                  <EditableField label="Filter Condition" value={recipe.source.filter}
                    onChange={v => updateRecipe(r => ({ ...r, source: { ...r.source, filter: v } }))} mono multiline />
                </div>
              </div>
            </section>

            {/* transformations */}
            <section>
              <SectionHeader icon="⇄" label={`Transformations (${recipe.transformations.length})`} color="#818cf8" />
              <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                {recipe.transformations.map((tx, i) => (
                  <TransformCard key={tx.id} tx={tx} onChange={updated => updateTransformation(i, updated)} />
                ))}
              </div>
            </section>

            {/* expressions collector */}
            <section>
              <SectionHeader icon="ƒ" label="All Expressions" color="#a78bfa" />
              <ExpressionList recipe={recipe} />
            </section>

            {/* target */}
            <section>
              <SectionHeader icon="⬡" label="Target" color="#f87171" extra={<GCPIcon service="bigquery" size={16} />} />
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12,
                padding: '16px', background: 'var(--surface)',
                border: '1px solid rgba(248,113,113,0.2)', borderRadius: 7,
              }}>
                <EditableField label="Dataset" value={recipe.target.dataset}
                  onChange={v => updateRecipe(r => ({ ...r, target: { ...r.target, dataset: v } }))} mono />
                <EditableField label="Table" value={recipe.target.table}
                  onChange={v => updateRecipe(r => ({ ...r, target: { ...r.target, table: v } }))} mono />
                <EditableField label="Load Type" value={recipe.target.load_type}
                  onChange={v => updateRecipe(r => ({ ...r, target: { ...r.target, load_type: v } }))} />
                <EditableField label="Partition Field" value={recipe.target.partition_field}
                  onChange={v => updateRecipe(r => ({ ...r, target: { ...r.target, partition_field: v } }))} mono />
                <div style={{ gridColumn: '1/-1' }}>
                  <EditableField label="Cluster Fields (comma-separated)" value={(recipe.target.cluster_fields ?? []).join(', ')}
                    onChange={v => updateRecipe(r => ({ ...r, target: { ...r.target, cluster_fields: v.split(',').map(s => s.trim()).filter(Boolean) } }))} mono />
                </div>
              </div>
            </section>

            {/* DDL */}
            <section>
              <SectionHeader icon="⬡" label="BigQuery DDL Schema" color="#4f9cf9" extra={<GCPIcon service="bigquery" size={16} />} />
              <DDLViewer recipeId={activeRecipeId!} />
            </section>

            <div style={{ height: 60 }} />
          </div>
        )}

        <SaveBar changes={changes} onSave={handleSave} onDiscard={handleDiscard} />
      </div>
    </div>
  )
}

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
