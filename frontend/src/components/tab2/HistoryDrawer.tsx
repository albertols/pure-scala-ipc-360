// ─── History drawer — view + rollback (Task 10) ────────────────────────────
//
// Right-side panel, same idiom as Palette (fixed-width strip, `--surface`
// background, `--border` divider) with rows composed from the existing card
// idiom (bordered, `--border-subtle`, mono JetBrains labels). Two internal
// concerns live here rather than in ETLModifier:
//   - the version LIST query (`GET /recipes/history/{path}`, no `?version`),
//   - the RESTORE mutation (`POST /recipes/rollback/{path}?version=`).
// Loading an individual archived version's CONTENT for the canvas is the
// parent's job (`onView` — spec: "parent loads apiGet(.../history/{path}
// ?version={v}) read-only into the canvas") since only ETLModifier owns the
// draft/graph derivation. `onRestored` lets the parent invalidate the live
// recipe query and drop its own view-mode state once the rollback lands.

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiSend } from '../../api/client'
import type { ApiError } from '../../api/client'
import type { RecipeHistoryEntry } from '../../api/queries'
import { LoadingState } from '../shared/Spinner'

const viewButtonStyle: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: 4,
  background: 'transparent',
  border: '1px solid var(--border)',
  color: '#7b88aa',
  fontSize: 10,
  cursor: 'pointer',
  fontFamily: 'JetBrains Mono, monospace',
}

const restoreButtonStyle: React.CSSProperties = {
  padding: '5px 12px',
  borderRadius: 5,
  background: 'rgba(251,191,36,0.15)',
  border: '1px solid var(--yellow)',
  color: 'var(--yellow)',
  fontSize: 11,
  cursor: 'pointer',
  fontWeight: 600,
}

export function HistoryDrawer({
  recipePath,
  onView,
  onRestored,
}: {
  recipePath: string
  /** Parent loads `apiGet(/recipes/history/{recipePath}?version={v})` read-only into the canvas. */
  onView: (version: string) => void
  /** Parent invalidates ['recipe', recipePath] and clears its own view-mode state. */
  onRestored: () => void
}) {
  const queryClient = useQueryClient()
  const history = useQuery({
    queryKey: ['recipeHistory', recipePath],
    queryFn: () => apiGet<RecipeHistoryEntry[]>(`/recipes/history/${recipePath}`),
    enabled: !!recipePath,
  })

  const [viewingVersion, setViewingVersion] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState<{ title: string; detail?: string } | null>(null)

  const handleView = (version: string) => {
    setViewingVersion(version)
    setError(null)
    onView(version)
  }

  const handleRestore = async () => {
    if (!viewingVersion) return
    setRestoring(true)
    setError(null)
    try {
      await apiSend('POST', `/recipes/rollback/${recipePath}?version=${viewingVersion}`, {})
      await queryClient.invalidateQueries({ queryKey: ['recipeHistory', recipePath] })
      setViewingVersion(null)
      onRestored()
    } catch (e) {
      const err = e as ApiError
      setError({ title: err.title ?? 'Restore failed', detail: err.detail })
    } finally {
      setRestoring(false)
    }
  }

  const entries = history.data ?? []

  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: 10,
        gap: 10,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: '#4a5570',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          padding: '2px 2px 0',
        }}
      >
        History
      </div>

      {viewingVersion && (
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 5,
            background: 'rgba(251,191,36,0.1)',
            border: '1px solid var(--yellow)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 10, color: 'var(--yellow)' }}>
            {`Viewing archived version ${viewingVersion} — read-only`}
          </span>
          <button onClick={handleRestore} disabled={restoring} style={restoreButtonStyle}>
            {restoring ? 'Restoring…' : 'Restore this version'}
          </button>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 10, color: 'var(--red)' }}>
          <div>{error.title}</div>
          {error.detail && <div>{error.detail}</div>}
        </div>
      )}

      {history.isLoading ? (
        <LoadingState label="Loading history…" />
      ) : history.error ? (
        <div style={{ fontSize: 11, color: 'var(--red)' }}>Failed to load history.</div>
      ) : entries.length === 0 ? (
        <div style={{ fontSize: 11, color: '#4a5570' }}>No saved versions yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {entries.map((entry, i) => (
            <div
              key={entry.version ?? i}
              style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: 5,
                padding: '6px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <span
                style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#c8d3e8' }}
              >
                {entry.timestamp}
              </span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                }}
              >
                <span
                  style={{ fontSize: 9, color: '#4a5570', fontFamily: 'JetBrains Mono, monospace' }}
                >
                  {`${entry.sizeBytes ?? 0} bytes`}
                </span>
                <button onClick={() => handleView(entry.version ?? '')} style={viewButtonStyle}>
                  View
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
