import type { ReactNode } from 'react'
import { Spinner } from '../shared/Spinner'
import { ghostButtonStyle } from './SaveBar'

// ─── EditorToolbar (Task 4) ─────────────────────────────────────────────────
//
// The single fixed row `EditorLayout`'s `toolbar` slot renders: identity
// (filename + layer chip) on the left, a flexible spacer, then the
// conformance chip (an opaque slot — `ConformanceChip` itself, composed one
// level up in ETLModifier.tsx, same as the brief's "regions reach EditorLayout
// as opaque ReactNodes" idiom applied one level down), then the action row —
// the `{ history }` / `⤢` / `{ raw JSON }` buttons moved verbatim from the old
// scrolling header (same styles, same handlers, now owned by the caller and
// threaded down as props), plus the wire-mode chip / dirty-count indicator /
// Discard / Save controls that used to live in `SaveBar` (superseded — its
// component is gone, but `ghostButtonStyle`/the blue Save style it defined
// are reused here verbatim).
//
// Undo/redo controls are added to this same action row in Task 5.

export function EditorToolbar({
  fileName,
  layerChip,
  conformance,
  historyOpen,
  onToggleHistory,
  onOpenFocus,
  showRaw,
  onToggleRaw,
  rawContent,
  changes,
  wireFrom,
  onCancelWire,
  onSave,
  onDiscard,
  saving,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  fileName: string
  layerChip: string
  /** `ConformanceChip` itself — an opaque slot, composed by the caller (which
   * holds the validation state) rather than reimplemented here. */
  conformance: ReactNode
  historyOpen: boolean
  onToggleHistory: () => void
  onOpenFocus: () => void
  showRaw: boolean
  onToggleRaw: () => void
  /** The `{ raw JSON }` dropdown's content — Path/Size bytes/Modified (moved
   * out of the always-visible header card, spec §5.2: reference metadata, not
   * per-second information) plus the raw JSON `<pre>` block, composed by the
   * caller since it needs the live recipe/draft state. */
  rawContent: ReactNode
  changes: number
  wireFrom: { nodeId: string; portName: string } | null
  onCancelWire: () => void
  onSave: () => void
  onDiscard: () => void
  /** Task 17: true while the validate+PUT round trip is in flight — drives the
   * inline spinner and disables the Save button so a slow save can't be
   * double-submitted. */
  saving: boolean
  /** Task 5: undo/redo — always rendered (not gated by `changes > 0` like
   * Discard/Save), since redoing back to a dirty state must stay reachable
   * even once an undo has walked `changes` back down to 0. Disabled state is
   * the affordance instead of hiding. */
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 16px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
    }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#e2e8f8', whiteSpace: 'nowrap' }}>{fileName}</h2>
      <span style={{
        fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
        background: 'rgba(79,156,249,0.15)',
        color: '#4f9cf9',
        border: '1px solid rgba(79,156,249,0.3)',
        fontFamily: 'JetBrains Mono, monospace',
        whiteSpace: 'nowrap',
      }}>{layerChip}</span>

      <div style={{ flex: 1 }} />

      {conformance}

      <button onClick={onToggleHistory} style={{
        padding: '5px 12px', borderRadius: 5,
        background: historyOpen ? 'var(--surface-3)' : 'transparent', border: '1px solid var(--border)',
        color: '#7b88aa', fontSize: 11, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
      }}>{'{ history }'}</button>

      {/* Focus mode deep link (Task 15) — opens THIS recipe alone, full-viewport,
          in a new tab. */}
      <button
        onClick={onOpenFocus}
        title="Open in a new tab, isolated"
        style={{
          padding: '5px 12px', borderRadius: 5,
          background: 'transparent', border: '1px solid var(--border)',
          color: '#7b88aa', fontSize: 11, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
        }}>{'⤢'}</button>

      <div style={{ position: 'relative' }}>
        <button onClick={onToggleRaw} style={{
          padding: '5px 12px', borderRadius: 5,
          background: showRaw ? 'var(--surface-3)' : 'transparent', border: '1px solid var(--border)',
          color: '#7b88aa', fontSize: 11, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
        }}>{'{ raw JSON }'}</button>

        {showRaw && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 20,
            width: 420,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
            overflow: 'hidden',
          }}>
            {rawContent}
          </div>
        )}
      </div>

      {/* Wire-mode indicator (Task 9) — moved verbatim from SaveBar, which used
          to mount for this alone even with zero dirty ops. */}
      {wireFrom && (
        <div
          onClick={onCancelWire}
          title="Click to cancel"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 10px', borderRadius: 5,
            background: 'rgba(79,156,249,0.15)', border: '1px solid #4f9cf9',
            color: '#4f9cf9', fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >{`wire: ${wireFrom.nodeId}.${wireFrom.portName} → click an IN port`}</div>
      )}

      {changes > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: '#fbbf24', whiteSpace: 'nowrap',
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" stroke="#fbbf24" strokeWidth="1.2" />
            <line x1="6" y1="3.5" x2="6" y2="6.5" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="6" cy="8.5" r="0.8" fill="#fbbf24" />
          </svg>
          {changes} unsaved change{changes !== 1 ? 's' : ''}
        </div>
      )}

      {/* Undo/redo (Task 5) — left of Discard, unconditionally rendered so
          `canRedo` stays reachable even after undoing back to 0 unsaved
          changes (which would hide a `changes > 0`-gated redo button along
          with Discard/Save). Disabled via `opacity: 0.4` on the existing
          ghost style — no new colour token (ADR-0005). */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="Undo"
        title="Undo"
        style={{ ...ghostButtonStyle, opacity: canUndo ? 1 : 0.4, cursor: canUndo ? 'pointer' : 'default' }}
      >{'↶'}</button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        aria-label="Redo"
        title="Redo"
        style={{ ...ghostButtonStyle, opacity: canRedo ? 1 : 0.4, cursor: canRedo ? 'pointer' : 'default' }}
      >{'↷'}</button>

      {changes > 0 && (
        <>
          <button onClick={onDiscard} style={ghostButtonStyle}>Discard</button>
          <button onClick={onSave} disabled={saving} style={{
            padding: '5px 16px', borderRadius: 5,
            background: 'rgba(79,156,249,0.15)', border: '1px solid #4f9cf9',
            color: '#4f9cf9', fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
            cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.6 : 1,
            whiteSpace: 'nowrap',
          }}>
            {saving && <Spinner size={11} />}
            Save Changes
          </button>
        </>
      )}
    </div>
  )
}
