import { useEffect, useState } from 'react'
import type { RecipeTransformationJson } from '../../api/recipeAdapter'
import { parseFormulaText } from '../../api/recipeEdits'
import { renderFormula } from '../../api/recipeAdapter'

// ─── Widget primitives (Task 12) ────────────────────────────────────────────────
//
// Every widget is chosen by the backend key schema (`GET /api/ipc/rules`'
// `keySchema[...].widget`) — Inspector.tsx picks WHICH of these to render per key,
// never this module. Styling is lifted verbatim from ETLModifier.tsx's
// EditableField/FieldEditor (`var(--surface-2)` background, `1px solid
// var(--border)`, `#c8d3e8` text, JetBrains Mono for mono/formula fields, the blue
// `#4f9cf9` focus border) so the Inspector reads as the same surface the rest of
// Tab 2 already uses — no new tokens (ADR-0005).

const labelStyle: React.CSSProperties = { fontSize: 10, color: '#4a5570', marginBottom: 3 }

function inputStyle(mono: boolean): React.CSSProperties {
  return {
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
}

function focusHandlers() {
  return {
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { e.target.style.borderColor = '#4f9cf9' },
  }
}

// ─── TextWidget ──────────────────────────────────────────────────────────────

/** Single-line text field. Keystrokes stay in local state; `onChange` fires once,
 * on blur, and only when the value actually changed — mirrors EditableField's
 * on-blur commit convention verbatim. */
export function TextWidget({
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
  const [local, setLocal] = useState(value)
  useEffect(() => { setLocal(value) }, [value])

  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <input
        value={local}
        onChange={e => setLocal(e.target.value)}
        style={inputStyle(mono)}
        {...focusHandlers()}
        onBlur={e => {
          e.target.style.borderColor = 'var(--border)'
          if (local !== value) onChange(local)
        }}
      />
    </div>
  )
}

// ─── ToggleWidget ────────────────────────────────────────────────────────────

/** Two-state pill: `--green` when on, `--border` when off (no new tokens). Commits
 * immediately (a discrete click, not a text field — no blur semantics apply). */
export function ToggleWidget({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <button
        onClick={() => onChange(!value)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '5px 10px', borderRadius: 12, cursor: 'pointer', width: 'fit-content',
          background: value ? 'rgba(52,211,153,0.12)' : 'var(--surface-2)',
          border: `1px solid ${value ? 'var(--green)' : 'var(--border)'}`,
          color: value ? 'var(--green)' : '#7b88aa',
          fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: value ? 'var(--green)' : '#4a5570',
        }} />
        {value ? 'On' : 'Off'}
      </button>
    </div>
  )
}

// ─── TextareaWidget ──────────────────────────────────────────────────────────

/** Multi-line text field (sourceFilter/sqlQuery/userDefinedJoin/javaCode/…) — same
 * local-state-until-blur convention as TextWidget, textarea styling lifted from
 * FieldEditor's formula box. */
export function TextareaWidget({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => { setLocal(value) }, [value])

  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <textarea
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onChange(local) }}
        rows={3}
        style={{
          width: '100%', resize: 'vertical',
          background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
          color: '#c8d3e8', fontSize: 11, padding: '5px 8px',
          fontFamily: 'JetBrains Mono, monospace', outline: 'none',
        }}
      />
    </div>
  )
}

// ─── FormulaWidget ───────────────────────────────────────────────────────────

/** A `RecipeTransformationJson` rendered/edited as formula text, via the same
 * `renderFormula`/`parseFormulaText` round-trip the field-level formula editor
 * uses. `onFocus` is optional — the field-table's per-field formula editor
 * (Inspector.tsx) supplies it to drive the "All Expressions" registry's Insert
 * affordance; a property-level formula field (e.g. filter's `filterCondition`)
 * omits it. */
export function FormulaWidget({
  label,
  value,
  onChange,
  onFocus,
}: {
  label: string
  value: RecipeTransformationJson | undefined
  onChange: (v: RecipeTransformationJson) => void
  onFocus?: () => void
}) {
  const original = renderFormula(value)
  const [text, setText] = useState(original)
  useEffect(() => { setText(original) }, [original])

  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onFocus={onFocus}
        onBlur={() => { if (text !== original) onChange(parseFormulaText(text)) }}
        rows={2}
        style={{
          width: '100%', resize: 'vertical',
          background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
          color: '#c8d3e8', fontSize: 11, padding: '5px 8px',
          fontFamily: 'JetBrains Mono, monospace', outline: 'none',
        }}
      />
    </div>
  )
}

// ─── StringListWidget ────────────────────────────────────────────────────────

const rowInputStyle: React.CSSProperties = {
  flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 4, color: '#c8d3e8', fontSize: 11, padding: '5px 8px',
  fontFamily: 'JetBrains Mono, monospace', outline: 'none',
}

const xButtonStyle: React.CSSProperties = {
  padding: '5px 9px', borderRadius: 4,
  background: 'rgba(248,113,113,0.1)', border: '1px solid var(--border)',
  color: '#7b88aa', fontSize: 11, cursor: 'pointer',
}

const addButtonStyle: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 4,
  background: 'rgba(79,156,249,0.15)', border: '1px solid #4f9cf9',
  color: '#4f9cf9', fontSize: 11, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
}

/** A column of string rows (joinerTables/groupByFields/primaryKeys/…), each with a
 * text input + `×` remover, plus an "+ add" row reusing AddFieldControl's idiom. */
export function StringListWidget({
  label,
  value,
  onChange,
}: {
  label: string
  value: string[]
  onChange: (v: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const commitAdd = () => {
    const trimmed = draft.trim()
    if (trimmed === '') return
    onChange([...value, trimmed])
    setDraft('')
  }

  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {value.map((v, i) => (
          <div key={i} style={{ display: 'flex', gap: 4 }}>
            <input
              value={v}
              onChange={e => onChange(value.map((x, j) => (j === i ? e.target.value : x)))}
              style={rowInputStyle}
            />
            <button onClick={() => onChange(value.filter((_, j) => j !== i))} style={xButtonStyle}>×</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitAdd() }}
            placeholder="add…"
            style={rowInputStyle}
          />
          <button onClick={commitAdd} style={addButtonStyle}>+ add</button>
        </div>
      </div>
    </div>
  )
}

// ─── RowTableWidget ──────────────────────────────────────────────────────────

export interface RowTableColumn {
  key: string
  label: string
  widget: 'text' | 'toggle'
}

/** An array-of-objects (groups/normalizedFields/unionTables/…) rendered as a grid,
 * same header/row styling idiom as DDLViewer. `columns` is supplied by the caller
 * (Inspector.tsx derives it from the row VALUES at runtime, not from any per-kind
 * knowledge — see `deriveRowTableColumns`) — this component only knows how to lay
 * out whatever columns it's given. Editing a cell replaces that row via a shallow
 * spread, so any column NOT in `columns` (e.g. a group's own nested `fields`
 * array) survives untouched. */
export function RowTableWidget({
  label,
  value,
  columns,
  onChange,
}: {
  label: string
  value: Record<string, unknown>[]
  columns: RowTableColumn[]
  onChange: (v: Record<string, unknown>[]) => void
}) {
  const setCell = (rowIndex: number, key: string, cellValue: unknown) => {
    onChange(value.map((row, i) => (i === rowIndex ? { ...row, [key]: cellValue } : row)))
  }

  return (
    <div>
      <div style={labelStyle}>{label}</div>
      {value.length === 0 ? (
        <div style={{ color: '#4a5570', fontSize: 11 }}>No rows.</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
            background: 'var(--surface-2)', padding: '6px 10px',
            borderBottom: '1px solid var(--border)',
            fontSize: 9, color: '#4a5570', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            {columns.map(c => <span key={c.key}>{c.label}</span>)}
          </div>
          {value.map((row, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
              padding: '6px 10px', borderBottom: i < value.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              alignItems: 'center', gap: 6,
            }}>
              {columns.map(c => {
                const cell = row[c.key]
                if (c.widget === 'toggle') {
                  const on = Boolean(cell)
                  return (
                    <button key={c.key} onClick={() => setCell(i, c.key, !on)} style={{
                      padding: '3px 8px', borderRadius: 10, cursor: 'pointer', width: 'fit-content',
                      background: on ? 'rgba(52,211,153,0.12)' : 'var(--surface-2)',
                      border: `1px solid ${on ? 'var(--green)' : 'var(--border)'}`,
                      color: on ? 'var(--green)' : '#7b88aa',
                      fontSize: 9, fontFamily: 'JetBrains Mono, monospace',
                    }}>{on ? 'On' : 'Off'}</button>
                  )
                }
                return (
                  <input
                    key={c.key}
                    value={String(cell ?? '')}
                    onChange={e => setCell(i, c.key, e.target.value)}
                    style={{
                      background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
                      color: '#c8d3e8', fontSize: 10, padding: '3px 6px',
                      fontFamily: 'JetBrains Mono, monospace', outline: 'none', width: '100%',
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
