import { Spinner } from '../shared/Spinner'

/** Delete idiom (Task 9): the SaveBar's existing "Save Changes"/"Discard" button
 * pair, recomposed with the `--red` token in place of the blue one — no new
 * tokens introduced. */
export const dangerButtonStyle: React.CSSProperties = {
  padding: '5px 14px', borderRadius: 5,
  background: 'rgba(248,113,113,0.15)', border: '1px solid var(--red)',
  color: 'var(--red)', fontSize: 12, cursor: 'pointer', fontWeight: 600,
}
export const ghostButtonStyle: React.CSSProperties = {
  padding: '5px 14px', borderRadius: 5,
  background: 'transparent', border: '1px solid var(--border)',
  color: '#7b88aa', fontSize: 12, cursor: 'pointer',
}

/** Task 9: the wire-mode indicator lives in the same sticky row as the dirty
 * indicator/Save/Discard controls — the bar now also mounts while a wire is
 * in progress (dirty count 0), not only while there are unsaved changes. */
export function SaveBar({
  changes,
  wireFrom,
  onCancelWire,
  onSave,
  onDiscard,
  saving,
}: {
  changes: number
  wireFrom: { nodeId: string; portName: string } | null
  onCancelWire: () => void
  onSave: () => void
  onDiscard: () => void
  /** Task 17: true while `handleSave`'s validate+PUT round trip is in
   * flight — drives the inline spinner and disables the button so a slow
   * save can't be double-submitted. Re-enabled by the caller's `finally` on
   * both success and failure. */
  saving: boolean
}) {
  if (changes === 0 && !wireFrom) return null
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
      {wireFrom && (
        <div
          onClick={onCancelWire}
          title="Click to cancel"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 10px', borderRadius: 5,
            background: 'rgba(79,156,249,0.15)', border: '1px solid #4f9cf9',
            color: '#4f9cf9', fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
            cursor: 'pointer',
          }}
        >{`wire: ${wireFrom.nodeId}.${wireFrom.portName} → click an IN port`}</div>
      )}
      {changes > 0 && (
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
      )}
      <div style={{ flex: 1 }} />
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
          }}>
            {saving && <Spinner size={11} />}
            Save Changes
          </button>
        </>
      )}
    </div>
  )
}
