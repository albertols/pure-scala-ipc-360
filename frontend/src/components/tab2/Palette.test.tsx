import { describe, expect, it } from 'vitest'
import { PALETTE, SOURCE_TABLE_TYPE } from './Palette'
import type { IpcConnections } from '../../api/queries'
import ipcRulesJson from '../../../../backend/src/main/resources/ipc/ipc-rules.json'

// ─── The palette may only offer primitives the IPC matrix backs ─────────────
//
// Reads the REAL `backend/src/main/resources/ipc/ipc-rules.json`, not a
// hand-copied slice (the idiom every other Tab 2 suite uses). A slice would
// have to be edited in the same breath as the palette to keep a dead entry
// green, which is exactly the failure this file exists to prevent: the
// `expression` entry shipped for a whole sub-project as a button that opened a
// dialog whose Insert could never enable, because `expression` is not an IPC
// kind in this recipe model at all. An EXPRESSION transformation's logic lives
// in each target field's `transformation` call tree (what `ExpressionDock` and
// `_sqlTranslations_*` walk), never as a node — `NODE_STYLES.expression` is the
// canvas's generic fallback STYLE, not a kind.

const RULES = ipcRulesJson as unknown as { connections: IpcConnections }

/** Every kind that appears on the right-hand side of some `mayFeed` — i.e.
 * every kind that something is permitted to feed. A palette primitive absent
 * from this set can never gather a "fed by" upstream, therefore never a mapped
 * field, therefore never an enabled Insert (`NodeConfigDialog`'s `canInsert`
 * requires `hasMappedField` for every kind but the source-table sentinel). */
const FEEDABLE = new Set(
  Object.values(RULES.connections ?? {}).flatMap(c => c?.mayFeed ?? []),
)

/** The palette's own `type` strings, minus the source-table sentinel — a root
 * that deliberately has no upstream and is gated on "feeds" instead. */
const OFFERED = PALETTE.map(e => e.type).filter(t => t !== SOURCE_TABLE_TYPE)

describe('Palette — every offered primitive is backed by the IPC matrix', () => {
  it('offers no type the connection matrix does not name at all', () => {
    const unknown = OFFERED.filter(t => !(t in (RULES.connections ?? {})))
    expect(unknown).toEqual([])
  })

  // A characterization pin, NOT a blessing. `joiner` and `union` are named by
  // the matrix as SOURCE kinds (they have their own `mayFeed`), but neither
  // appears in any `mayFeed` list — only `joinerInput`/`unionInput` do — and
  // neither has a `target:` key schema. Probed against the real rules file with
  // a draft carrying a node of all 13 kinds: both offered 13 candidates with 0
  // enabled and Insert permanently disabled, exactly as `expression` did. They
  // are left in place because removing them was outside this pass's brief; this
  // assertion makes the residual loud, so that ADDING a new unbacked primitive
  // fails here, and so does FIXING one of these two without noting it.
  it('pins the two remaining unbacked primitives — nothing may feed a joiner or a union node', () => {
    expect(OFFERED.filter(t => !FEEDABLE.has(t)).sort()).toEqual(['joiner', 'union'])
  })
})
