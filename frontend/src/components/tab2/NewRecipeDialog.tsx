// ─── NewRecipeDialog — author a recipe from scratch (Task 15) ───────────────
//
// The counterpart to picking an existing recipe from the Explorer: instead of
// a click-through-the-tree, an operator names a brand-new one. Same modal
// idiom as `NodeConfigDialog` (scrim + centered card, Escape/click-outside to
// cancel) — a layer picker sourced from `useRegistry()` (Task 13, the same
// searchable-inventory endpoint the config dialog's "pick from registry"
// affordance already consumes) plus a mapping-name field, composing the exact
// `<layer>/<mapping>/_ETL_<mapping>.json` path `POST /api/recipes/{*path}`
// (Task 14) expects — shown live so there is never a surprise about where
// Create will write. This dialog only RESOLVES the path; it makes no network
// call of its own (no pre-check GET, no POST) — `ETLModifier` owns turning
// `onCreate`'s path into an authoring-mode draft and the eventual save.

import { useEffect, useRef, useState } from 'react'
import type { ApiError } from '../../api/client'
import { useRegistry } from '../../api/registryQueries'
import { LoadingState } from '../shared/Spinner'
import { ghostButtonStyle } from './SaveBar'

const labelStyle: React.CSSProperties = { fontSize: 10, color: '#4a5570', marginBottom: 3 }

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: '#c8d3e8',
  fontSize: 12,
  padding: '5px 8px',
  fontFamily: 'Inter, sans-serif',
  outline: 'none',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#4a5570',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 6,
}

const layerButtonStyle = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 10px',
  borderRadius: 4,
  fontSize: 11,
  fontFamily: 'JetBrains Mono, monospace',
  marginRight: 6,
  marginBottom: 6,
  cursor: 'pointer',
  background: active ? 'rgba(79,156,249,0.15)' : 'var(--surface-2)',
  border: `1px solid ${active ? '#4f9cf9' : 'var(--border)'}`,
  color: active ? '#4f9cf9' : '#7b88aa',
})

export function NewRecipeDialog({
  onCancel,
  onCreate,
}: {
  onCancel: () => void
  /** The resolved `<layer>/<mapping>/_ETL_<mapping>.json` path — `ETLModifier`
   * turns this into an authoring-mode draft; this dialog never fetches or
   * writes anything itself. */
  onCreate: (recipePath: string) => void
}) {
  const registry = useRegistry()
  const apiError = registry.error as ApiError | null
  const mappingInputRef = useRef<HTMLInputElement>(null)

  const [layer, setLayer] = useState('')
  const [mapping, setMapping] = useState('')

  useEffect(() => {
    mappingInputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const trimmedMapping = mapping.trim()
  const path =
    layer !== '' && trimmedMapping !== ''
      ? `${layer}/${trimmedMapping}/_ETL_${trimmedMapping}.json`
      : ''
  const canCreate = path !== ''

  const layers = registry.data?.layers ?? []

  return (
    <div
      data-testid="new-recipe-scrim"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 460,
          maxHeight: '85vh',
          overflowY: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f8' }}>New recipe</div>

        <div>
          <div style={sectionTitleStyle}>Layer</div>
          {registry.isLoading ? (
            <LoadingState label="Loading layers…" />
          ) : apiError ? (
            <div style={{ color: 'var(--red)', fontSize: 11 }}>{apiError.title}</div>
          ) : layers.length === 0 ? (
            <div style={{ fontSize: 11, color: '#4a5570' }}>No layers found.</div>
          ) : (
            <div>
              {layers.map(l => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLayer(l)}
                  style={layerButtonStyle(layer === l)}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="new-recipe-mapping" style={labelStyle}>
            Mapping name
          </label>
          <input
            id="new-recipe-mapping"
            ref={mappingInputRef}
            value={mapping}
            onChange={e => setMapping(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <div style={sectionTitleStyle}>Path</div>
          <div
            style={{
              padding: '8px 10px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 5,
              fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
              color: path ? '#c8d3e8' : '#4a5570',
              wordBreak: 'break-all',
            }}
          >
            {path || 'Pick a layer and enter a mapping name…'}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={ghostButtonStyle}>
            Cancel
          </button>
          <button
            onClick={() => canCreate && onCreate(path)}
            disabled={!canCreate}
            style={{
              padding: '5px 16px',
              borderRadius: 5,
              background: 'rgba(79,156,249,0.15)',
              border: '1px solid #4f9cf9',
              color: '#4f9cf9',
              fontSize: 12,
              fontWeight: 600,
              cursor: canCreate ? 'pointer' : 'default',
              opacity: canCreate ? 1 : 0.5,
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
