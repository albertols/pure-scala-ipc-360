// ─── Palette — designer strip (Task 9) ──────────────────────────────────────
//
// Right-side vertical strip of IPC primitives. Every entry is both click-to-add
// (onAdd) and HTML5-draggable (drop target lives on IpcCanvas via onDropType,
// reading the same 'text/etl-type' payload). `type` is the raw recipe `type`
// string ETLModifier hands to `NodeConfigDialog` (Task 11: neither a click nor a
// drop inserts anything directly anymore — both only open the dialog, which
// gathers the rest and commits via recipeEdits' `buildStep`/`insertConfiguredStep`,
// or, for `SOURCE_TABLE_TYPE`, `insertSourceTable`) — see recipeAdapter's
// RECIPE_KIND/FIXED_LABEL maps for how each `type` resolves to a canvas kind.
// Colors are read straight from NodeBox's NODE_STYLES tokens — no new palette
// introduced (Figma contract §6/§9).

import { NODE_STYLES } from '../tab1/NodeBox'

/** Sentinel `type` `NodeConfigDialog` switches into its source-table mode for
 * — a root with no upstream and no step of its own (`insertSourceTable`, not
 * `insertConfiguredStep`) — everything else is a literal recipe step `type`
 * string. */
export const SOURCE_TABLE_TYPE = 'sourceTable'

export const PALETTE: { type: string; label: string; color: string }[] = [
  { type: SOURCE_TABLE_TYPE, label: 'source table', color: NODE_STYLES.source.color },
  { type: 'sourceQualifier', label: 'sourceQualifier', color: NODE_STYLES.sq.color },
  { type: 'filter', label: 'filter', color: NODE_STYLES.filter.color },
  { type: 'joiner', label: 'joiner', color: NODE_STYLES.joiner.color },
  { type: 'aggregator', label: 'aggregator', color: NODE_STYLES.aggregator.color },
  { type: 'router', label: 'router', color: NODE_STYLES.router.color },
  { type: 'union', label: 'union', color: NODE_STYLES.expression.color },
  { type: 'normalizer', label: 'normalizer', color: NODE_STYLES.expression.color },
  { type: 'java', label: 'java', color: NODE_STYLES.expression.color },
  { type: 'storedProcedure', label: 'storedProcedure', color: NODE_STYLES.expression.color },
  { type: 'table', label: 'target table', color: NODE_STYLES.target.color },
  // No `expression` entry, deliberately (residuals pass, 2026-08-03). In this
  // recipe model an EXPRESSION transformation is not a node at all: its logic
  // lives in each target field's `transformation` call tree — the thing the
  // Inspector's formula widget edits and `ExpressionDock`/`_sqlTranslations_*`
  // walk. `expression` is absent from all 20 `keySchema` kinds, from all 11
  // `connections` entries and from every `mayFeed` list in `ipc-rules.json`, and
  // appears as a `type` on no source or target in any corpus recipe;
  // `NODE_STYLES.expression` above is the canvas's generic fallback STYLE, not a
  // kind. An entry here could therefore only ever open a NodeConfigDialog with
  // every candidate disabled and Insert permanently dead (probed: 13 candidates
  // offered, 0 enabled). Palette.test.tsx pins this.
]

export function Palette({ onAdd }: { onAdd: (type: string) => void }) {
  return (
    <div style={{
      width: 132, flexShrink: 0,
      background: 'var(--surface)',
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      padding: 8, gap: 4,
      overflowY: 'auto',
    }}>
      <div style={{ fontSize: 9, color: '#4a5570', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 4px 4px' }}>
        Add node
      </div>
      {PALETTE.map(entry => (
        <button
          key={entry.type}
          type="button"
          draggable
          onDragStart={e => e.dataTransfer.setData('text/etl-type', entry.type)}
          onClick={() => onAdd(entry.type)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 8px', borderRadius: 5,
            background: 'transparent', border: '1px solid var(--border)',
            cursor: 'grab', textAlign: 'left',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 3, background: entry.color, flexShrink: 0 }} />
          <span style={{
            fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#c8d3e8',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{entry.label}</span>
        </button>
      ))}
    </div>
  )
}
