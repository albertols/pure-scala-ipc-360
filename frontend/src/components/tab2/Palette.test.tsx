import { describe, expect, it } from 'vitest'
import { PALETTE, SOURCE_TABLE_TYPE } from './Palette'
import type { IpcConnections, IpcKeySpec } from '../../api/queries'
import ipcRulesJson from '../../../../backend/src/main/resources/ipc/ipc-rules.json'

// ─── The palette may only offer primitives that can actually be inserted ────
//
// Reads the REAL `backend/src/main/resources/ipc/ipc-rules.json`, not a
// hand-copied slice (the idiom every other Tab 2 suite uses). A slice would
// have to be edited in the same breath as the palette to keep a dead entry
// green, which is exactly the failure this file exists to prevent: `expression`
// shipped for a whole sub-project as a button that opened a dialog whose Insert
// could never enable, and `joiner`/`union` were dead the same way until they
// were swapped for the input kinds this model actually admits.
//
// The two conditions below are jointly what "insertable" MEANS in
// `NodeConfigDialog`, not a proxy for it:
//
//  1. Something may feed it. `canInsert` requires `hasMappedField` for every
//     kind but the source-table sentinel, and a mapped field can only come from
//     a selected "fed by" upstream — so a kind absent from every `mayFeed` list
//     can never enable Insert, however well-formed it otherwise is.
//  2. It has a `target:` key schema — the shape a step target of that kind
//     actually takes. Without one the dialog has no properties to gather and
//     the kind is not a step target in this recipe model at all.
//
// NOT asserted: membership in `connections`'s own KEYS. That governs what a kind
// may feed DOWNSTREAM, which Insert does not require (`feeds` is optional for
// every non-source-table kind), and it is not even populated consistently —
// `joinerInput` carries an explicit `mayFeed: []` while `unionInput` has no
// entry at all, though both feed nothing. Pinning on it would fail `unionInput`
// for a reason unrelated to whether it can be inserted.

const RULES = ipcRulesJson as unknown as {
  connections: IpcConnections
  keySchema: Record<string, IpcKeySpec[]>
}

/** Every kind on the right-hand side of some `mayFeed` — i.e. every kind that
 * something is permitted to feed. */
const FEEDABLE = new Set(Object.values(RULES.connections ?? {}).flatMap(c => c?.mayFeed ?? []))

/** The palette's own `type` strings, minus the source-table sentinel — a root
 * that deliberately has no upstream, is gated on "feeds" instead, and whose
 * schema is `source:table` rather than any `target:` key. */
const OFFERED = PALETTE.map(e => e.type).filter(t => t !== SOURCE_TABLE_TYPE)

describe('Palette — every offered primitive can actually be inserted', () => {
  it('offers nothing that no kind may feed — an unfeedable primitive is a dead button', () => {
    expect(OFFERED.filter(t => !FEEDABLE.has(t))).toEqual([])
  })

  it('offers nothing without a `target:` key schema — the step shape the dialog gathers', () => {
    expect(OFFERED.filter(t => !(`target:${t}` in (RULES.keySchema ?? {})))).toEqual([])
  })

  it('backs the source-table sentinel with its own `source:table` schema', () => {
    expect('source:table' in (RULES.keySchema ?? {})).toBe(true)
  })

  // Stronger than the subset checks above happen to need, and true today: the
  // FEEDABLE set and the set of `target:` schemas are identical (10 kinds), and
  // the palette offers exactly those 10. Asserted as the equality of the two
  // BACKING sets only — not as "the palette equals them" — so that consciously
  // withholding a kind from the palette stays possible without rewriting this
  // file, while a rules file that drifts between the two notions is caught.
  it('the two backing sets agree — every feedable kind is a step target kind and vice versa', () => {
    const targets = Object.keys(RULES.keySchema ?? {})
      .filter(k => k.startsWith('target:'))
      .map(k => k.slice('target:'.length))
    expect([...FEEDABLE].sort()).toEqual(targets.sort())
  })
})
