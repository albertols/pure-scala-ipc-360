/** Delete idiom (Task 9): the `SaveBar` component's original "Save Changes"/
 * "Discard" button pair, recomposed with the `--red` token in place of the
 * blue one — no new tokens introduced.
 *
 * Task 4: the `SaveBar` component itself is gone — its Save/Discard/dirty-
 * count/wire-mode-chip controls moved into `EditorToolbar` (verbatim styling,
 * new home), since the fixed-height editor no longer has a page bottom for a
 * sticky bar to dock to. These two style constants outlive it: `Inspector`'s
 * delete control and `EditorToolbar`'s own Discard button still import them
 * directly, so this file stays. */
export const dangerButtonStyle: React.CSSProperties = {
  padding: '5px 14px',
  borderRadius: 5,
  background: 'rgba(248,113,113,0.15)',
  border: '1px solid var(--red)',
  color: 'var(--red)',
  fontSize: 12,
  cursor: 'pointer',
  fontWeight: 600,
}
export const ghostButtonStyle: React.CSSProperties = {
  padding: '5px 14px',
  borderRadius: 5,
  background: 'transparent',
  border: '1px solid var(--border)',
  color: '#7b88aa',
  fontSize: 12,
  cursor: 'pointer',
}
