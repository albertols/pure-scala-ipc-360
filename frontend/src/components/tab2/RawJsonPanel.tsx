import type { RecipeJson } from '../../api/recipeAdapter'
import { CopyButton } from '../shared/CopyButton'
import { ghostButtonStyle } from './SaveBar'

// ─── Raw JSON editor (UX round 3, issue 4) ──────────────────────────────────
//
// Was a read-only `<pre>` capped at 400px inside a 420px-wide dropdown. The
// Modifier's whole point is to end up with a well-formed `_ETL_*.json`, so the
// document itself is now directly editable — for the shapes no widget covers
// yet (`unionTables[].fieldMapping`'s nested objects, chief among them) this is
// the only way to author them at all.
//
// The draft is NEVER touched by typing. `text` is local until Apply, so a
// half-typed document can't blank the canvas, can't fill the undo stack a
// keystroke at a time, and can't spam the debounced conformance validate. Apply
// hands the parsed object to the caller's `applyEdit` funnel, exactly like the
// Inspector and the config dialog do, so undo/redo, the dirty count and the
// IPC conformance chip all follow with no special-casing.

/** Widest the panel is allowed to get, and the ceiling on the editor's own
 * height. Both clamp against the viewport so the panel can't overflow a small
 * window — it is an absolutely-positioned dropdown inside a toolbar. */
const PANEL_W = 'min(820px, 92vw)'
const EDITOR_H = 'min(52vh, 460px)'

/** Serializes with the same 2-space indent the read-only view used, so toggling
 * the panel open shows a byte-identical document to what it showed before. */
export function serializeRecipe(content: unknown): string {
  return JSON.stringify(content ?? {}, null, 2)
}

type ParseResult =
  | { ok: true; value: RecipeJson }
  | { ok: false; message: string }

/** A recipe document is a JSON OBJECT. `JSON.parse` happily accepts `[]`,
 * `"x"`, `42` and `null` too, and every one of those would break the adapters
 * downstream in a far less legible place than here. */
export function parseRecipeText(text: string): ParseResult {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: 'A recipe must be a JSON object (got ' + (Array.isArray(value) ? 'an array' : String(value === null ? 'null' : typeof value)) + ').' }
  }
  return { ok: true, value: value as RecipeJson }
}

export function RawJsonPanel({
  json,
  readOnly,
  onApply,
  metadata,
  text,
  onTextChange,
}: {
  /** The serialized CURRENT content — the live draft normally, the archived
   * version while viewing one. */
  json: string
  /** True while viewing an archived version: the document is shown but neither
   * editable nor appliable, matching every other editing affordance. */
  readOnly: boolean
  onApply: (next: RecipeJson) => void
  /** The Path / Size bytes / Modified block, composed by the caller (it needs
   * the RecipeDto, which this component has no business knowing about). */
  metadata: React.ReactNode
  /** In-progress edit text, or `null` for "mirroring `json`". Owned by the
   * CALLER rather than this component because the `{ raw JSON }` dropdown
   * unmounts the panel every time it is toggled shut — local state would throw
   * away a half-written document on a stray click of the very button used to
   * open it. The caller clears it wherever the draft is re-baselined (recipe
   * change, Discard, save, rollback). */
  text: string | null
  onTextChange: (next: string | null) => void
}) {
  // While `text` is null the panel re-reads the draft on every render, so an
  // edit made on the canvas with the panel open shows up immediately. Once the
  // operator types, `text` takes over and upstream changes are deliberately NOT
  // merged in: silently rewriting someone's half-finished document out from
  // under them is worse than letting the two diverge until Apply or Revert.
  const editing = text !== null
  const value = text ?? json
  const parsed = editing ? parseRecipeText(value) : null

  const apply = () => {
    if (!parsed?.ok) return
    onApply(parsed.value)
    onTextChange(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: PANEL_W, maxWidth: '92vw' }}>
      {metadata}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 10px', background: 'var(--surface-2)',
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 10, color: '#4a5570' }}>Raw JSON</span>
        {editing && (
          <span style={{ fontSize: 10, color: '#fbbf24', fontFamily: 'JetBrains Mono, monospace' }}>
            unapplied edits
          </span>
        )}
        <div style={{ flex: 1 }} />
        <CopyButton value={value} size={11} />
        {!readOnly && (
          <>
            <button
              onClick={() => onTextChange(null)}
              disabled={!editing}
              style={{ ...ghostButtonStyle, opacity: editing ? 1 : 0.4, cursor: editing ? 'pointer' : 'default' }}
            >Revert</button>
            <button
              onClick={apply}
              disabled={!parsed?.ok}
              style={{
                padding: '5px 14px', borderRadius: 5,
                background: 'rgba(79,156,249,0.15)', border: '1px solid #4f9cf9',
                color: '#4f9cf9', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                opacity: parsed?.ok ? 1 : 0.4,
                cursor: parsed?.ok ? 'pointer' : 'default',
              }}
            >Apply</button>
          </>
        )}
      </div>
      <textarea
        data-testid="raw-json-editor"
        aria-label="Raw JSON"
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        onChange={e => onTextChange(e.target.value)}
        style={{
          margin: 0, padding: '10px 12px',
          height: EDITOR_H, resize: 'vertical',
          background: 'var(--bg)', border: 'none', borderRadius: 0,
          borderBottom: '1px solid var(--border)',
          fontSize: 11, color: '#c8d3e8',
          fontFamily: 'JetBrains Mono, monospace',
          lineHeight: 1.6, outline: 'none', whiteSpace: 'pre',
        }}
      />
      {parsed && !parsed.ok && (
        <div style={{ padding: '8px 12px', color: 'var(--red)', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div>{parsed.message}</div>
          <div style={{ color: '#4a5570', fontSize: 10 }}>The draft is untouched until this parses.</div>
        </div>
      )}
    </div>
  )
}
