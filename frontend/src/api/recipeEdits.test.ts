import { describe, expect, it } from 'vitest'
import {
  addField,
  buildStep,
  deleteEdge,
  deleteNode,
  deleteTargetProperty,
  editFieldDataType,
  insertConfiguredStep,
  insertSourceTable,
  parseFormulaText,
  refsInto,
  renameNode,
  setFieldTransformation,
  setSourceProperty,
  setTargetProperty,
} from './recipeEdits'
import { recipeToCanvas, renderFormula } from './recipeAdapter'
import type { RecipeJson } from './recipeAdapter'
import bizlink from './__fixtures__/recipe_m_DM_INFOHUB_BIZLINK.json'

// MINI mirrors ETLModifier.test.tsx's fixture: a target T with a plain-value field
// A and a dot-ref field B ("S.B"), fed by a single table source S.
const MINI: RecipeJson = {
  steps: [
    {
      target: {
        name: 'T',
        type: 'table',
        fields: [
          { name: 'A', dataType: 'String', transformation: { value: '1' } },
          { name: 'B', dataType: 'String', transformation: { source: 'S.B' } },
        ],
      },
      sources: [{ name: 'S', type: 'table' }],
    },
  ],
  table: { targetTableNames: ['T'], sourceTableNames: ['S'] },
}

describe('recipeEdits — every helper is pure', () => {
  it('returns a new object per call and never mutates the input', () => {
    const before = JSON.stringify(MINI)
    const outs = [
      setFieldTransformation(MINI, 'T', 'A', { value: '2' }),
      renameNode(MINI, 'T', 'T2'),
      editFieldDataType(MINI, 'T', 'A', 'Long'),
      insertConfiguredStep(MINI, buildStep('table', 'NEWTGT', {}, [], [], [])),
      insertSourceTable(MINI, 'NEWSRC', {}, ['T']),
      addField(MINI, { stepName: 'T', fieldName: 'NEWX' }),
      deleteNode(MINI, 'S'),
      deleteEdge(MINI, 'T', 'B'),
    ]
    for (const out of outs) expect(out).not.toBe(MINI)
    expect(JSON.stringify(MINI)).toBe(before)
  })
})

describe('setFieldTransformation', () => {
  it('writes the dot-ref verbatim on an existing field', () => {
    const out = setFieldTransformation(MINI, 'T', 'B', { source: 'S.B' })
    const field = out.steps![0].target!.fields!.find(f => f.name === 'B')!
    expect(field.transformation).toEqual({ source: 'S.B' })
  })

  it('creates the field {name, dataType: String, transformation} when absent', () => {
    const out = setFieldTransformation(MINI, 'T', 'C', { source: 'S.C' })
    const created = out.steps![0].target!.fields!.find(f => f.name === 'C')
    expect(created).toEqual({ name: 'C', dataType: 'String', transformation: { source: 'S.C' } })
  })

  it('on a weststone-keyed clone writes into weststone, not fields', () => {
    const damaged = JSON.parse(JSON.stringify(MINI).replaceAll('"fields":', '"weststone":')) as RecipeJson & {
      steps: { target: { weststone: { name?: string; transformation?: unknown }[]; fields?: unknown } }[]
    }
    const out = setFieldTransformation(damaged, 'T', 'A', { value: '9' }) as typeof damaged
    const target = out.steps[0].target
    expect(target.fields).toBeUndefined()
    expect(target.weststone.find(f => f.name === 'A')!.transformation).toEqual({ value: '9' })
  })
})

describe('renameNode', () => {
  it('rewrites all 60 SQ_ff_BIZLINK.* refs and no others', () => {
    const recipe = bizlink as RecipeJson
    expect(refsInto(recipe, 'SQ_ff_BIZLINK')).toBe(60)

    const out = renameNode(recipe, 'SQ_ff_BIZLINK', 'SQ_X')

    expect(refsInto(out, 'SQ_ff_BIZLINK')).toBe(0)
    expect(refsInto(out, 'SQ_X')).toBe(60)
    expect(out.steps!.some(s => s.target?.name === 'SQ_ff_BIZLINK')).toBe(false)
    expect(out.steps!.some(s => s.target?.name === 'SQ_X')).toBe(true)
    // The BIZLINK step's sources[] entry is also renamed.
    const bizlinkStep = out.steps!.find(s => s.target?.name === 'BIZLINK')!
    expect(bizlinkStep.sources!.some(s => s.name === 'SQ_X')).toBe(true)
    // Untouched: the other node (ff_BIZLINK) and its dot-refs are unaffected.
    expect(out.steps!.some(s => s.target?.name === 'ff_BIZLINK')).toBe(false) // ff_BIZLINK is a source, not a step target
    expect(refsInto(out, 'ff_BIZLINK')).toBe(refsInto(recipe, 'ff_BIZLINK'))
  })

  it('renames step target, sources[], and table-list entries', () => {
    const out = renameNode(MINI, 'S', 'S2')
    expect(out.steps![0].sources).toEqual([{ name: 'S2', type: 'table' }])
    expect(out.table!.sourceTableNames).toEqual(['S2'])
    // S is never a step target in MINI, so no target rename happens; the dot-ref
    // "S.B" IS a reference into S, so it moves too.
    expect(out.steps![0].target!.fields!.find(f => f.name === 'B')!.transformation).toEqual({ source: 'S2.B' })
  })

  it('does not touch a longer name that merely starts with the same token', () => {
    const withDecoy: RecipeJson = {
      steps: [
        {
          target: {
            name: 'T', type: 'table',
            fields: [
              { name: 'A', dataType: 'String', transformation: { source: 'S.A' } },
              { name: 'B', dataType: 'String', transformation: { source: 'S2.B' } },
            ],
          },
          sources: [{ name: 'S', type: 'table' }, { name: 'S2', type: 'table' }],
        },
      ],
      table: { targetTableNames: ['T'], sourceTableNames: ['S', 'S2'] },
    }
    const out = renameNode(withDecoy, 'S', 'S_RENAMED')
    expect(out.steps![0].target!.fields!.find(f => f.name === 'A')!.transformation).toEqual({ source: 'S_RENAMED.A' })
    expect(out.steps![0].target!.fields!.find(f => f.name === 'B')!.transformation).toEqual({ source: 'S2.B' })
    expect(out.steps![0].sources!.map(s => s.name).sort()).toEqual(['S2', 'S_RENAMED'])
  })
})

describe('editFieldDataType', () => {
  it('updates an existing field dataType, leaving everything else alone', () => {
    const out = editFieldDataType(MINI, 'T', 'A', 'Long')
    expect(out.steps![0].target!.fields!.find(f => f.name === 'A')!.dataType).toBe('Long')
    expect(out.steps![0].target!.fields!.find(f => f.name === 'B')!.dataType).toBe('String')
  })

  it('no-ops when the step or field does not exist', () => {
    expect(editFieldDataType(MINI, 'NOPE', 'A', 'Long')).toEqual(MINI)
    expect(editFieldDataType(MINI, 'T', 'NOPE', 'Long')).toEqual(MINI)
  })

  // Final-review finding: the no-op path used to call the MUTATING
  // fieldsArrayFor before checking whether the field existed. That's invisible
  // on MINI's 'T' (already carries a populated `fields` array — `fieldsArrayFor`
  // is a no-op there either way), so it needs a target with NEITHER `fields`
  // nor `weststone` present at all to actually surface the stamped `fields: []`.
  it('leaves a target with no fields/weststone key untouched when the field name does not exist', () => {
    const bare: RecipeJson = { steps: [{ target: { name: 'T', type: 'table' }, sources: [] }] }
    const out = editFieldDataType(bare, 'T', 'GHOST', 'Long')
    expect(out).toEqual(bare)
    expect(out.steps![0].target!.fields).toBeUndefined()
  })
})

describe('buildStep / insertConfiguredStep', () => {
  it('buildStep assembles target {name, type: kind, ...props, fields} and sources[] from fedBy', () => {
    const step = buildStep(
      'filter',
      'FLT2',
      { filterCondition: { source: 'S.A' } },
      [],
      [{ name: 'SQ1', kind: 'sourceQualifier' }],
      [],
    )
    expect(step.target).toEqual({
      name: 'FLT2', type: 'filter', filterCondition: { source: 'S.A' }, fields: [],
    })
    expect(step.sources).toEqual([{ name: 'SQ1', type: 'sourceQualifier' }])
  })

  // Fix round 1: IPC-FLW-003 ("no orphan step") reads outbound dot-refs off
  // FIELD FORMULAS, not sources[] membership — a fieldless step always failed
  // it regardless of connections, so Insert could never enable. mappedFields
  // is what makes a step genuinely connected.
  it('mappedFields become real {name, dataType, transformation: {source}} field entries', () => {
    const step = buildStep(
      'filter',
      'FLT2',
      {},
      [],
      [],
      [{ name: 'A', dataType: 'String', source: 'SQ1.A' }, { name: 'B_RENAMED', dataType: 'Long', source: 'SQ1.B' }],
    )
    expect(step.target!.fields).toEqual([
      { name: 'A', dataType: 'String', transformation: { source: 'SQ1.A' } },
      { name: 'B_RENAMED', dataType: 'Long', transformation: { source: 'SQ1.B' } },
    ])
  })

  // Task 16: NodeConfigDialog's target-DDL offer authors a field per DDL column —
  // it knows the column's name and type but NOT where the data comes from. An
  // empty `source` therefore means "not mapped yet" and must emit the same shape
  // `addField` produces ({name, dataType}, no transformation), never an empty
  // `{source: ""}` formula claiming a reference it doesn't have.
  it('a mappedField with an empty source becomes an UNMAPPED field — no transformation key at all', () => {
    const step = buildStep(
      'table',
      'DWH_ORDERS_FACT',
      {},
      [],
      [],
      [{ name: 'ORDER_ID', dataType: 'String', source: '' }, { name: 'A', dataType: 'Long', source: 'SQ1.A' }],
    )
    expect(step.target!.fields).toEqual([
      { name: 'ORDER_ID', dataType: 'String' },
      { name: 'A', dataType: 'Long', transformation: { source: 'SQ1.A' } },
    ])
    expect(Object.keys(step.target!.fields![0])).toEqual(['name', 'dataType'])
  })

  it('fields is spread in AFTER props, so a props.fields key can never silently override it', () => {
    const step = buildStep(
      'filter',
      'FLT2',
      { fields: 'should never survive' },
      [],
      [],
      [{ name: 'A', dataType: 'String', source: 'SQ1.A' }],
    )
    expect(step.target!.fields).toEqual([{ name: 'A', dataType: 'String', transformation: { source: 'SQ1.A' } }])
  })

  it('insertConfiguredStep appends the step immutably and never mutates its inputs', () => {
    const before = JSON.stringify(MINI)
    const step = buildStep('filter', 'FLT2', {}, [], [{ name: 'T', kind: 'table' }], [{ name: 'X', dataType: 'String', source: 'T.X' }])
    const stepBefore = JSON.stringify(step)

    const out = insertConfiguredStep(MINI, step)

    expect(out).not.toBe(MINI)
    expect(JSON.stringify(MINI)).toBe(before)
    expect(JSON.stringify(step)).toBe(stepBefore)
    expect(out.steps).toHaveLength(2)
    expect(out.steps![1]).toEqual({
      target: { name: 'FLT2', type: 'filter', fields: [{ name: 'X', dataType: 'String', transformation: { source: 'T.X' } }] },
      sources: [{ name: 'T', type: 'table' }],
    })
  })

  it('appends the new name to table.targetTableNames when kind is table', () => {
    const step = buildStep('table', 'NEWTGT', {}, [], [], [])
    const out = insertConfiguredStep(MINI, step)
    expect(out.table!.targetTableNames).toContain('NEWTGT')
  })

  it('a non-table kind does not touch table.targetTableNames', () => {
    const step = buildStep('filter', 'FLT2', {}, [], [], [])
    const out = insertConfiguredStep(MINI, step)
    expect(out.table!.targetTableNames).toEqual(['T'])
  })

  it('adds this node as a sources[] entry of every consuming step named in feeds', () => {
    const step = buildStep('filter', 'FLT2', {}, ['T'], [], [])
    const out = insertConfiguredStep(MINI, step)
    const consumer = out.steps!.find(s => s.target?.name === 'T')!
    expect(consumer.sources).toContainEqual({ name: 'FLT2', type: 'filter' })
    // The original 'S' source survives untouched.
    expect(consumer.sources).toContainEqual({ name: 'S', type: 'table' })
  })

  it('a feeds name that does not resolve to a step target is a safe no-op', () => {
    const step = buildStep('filter', 'FLT2', {}, ['GHOST'], [], [])
    const out = insertConfiguredStep(MINI, step)
    expect(out.steps).toHaveLength(2)
    expect(out.steps!.some(s => s.target?.name === 'GHOST')).toBe(false)
  })
})

// Task 11 design ruling: a source table is a ROOT (reads a physical table, no
// upstream of its own) and structurally isn't even a step — `insertSourceTable`
// is `NodeConfigDialog`'s write path for that one kind, never touching
// `d.steps` at all (unlike `insertConfiguredStep`, which always appends one).
describe('insertSourceTable', () => {
  it('appends {name, type: table, ...props} into every feeds step\'s sources[], plus table.sourceTableNames', () => {
    const out = insertSourceTable(MINI, 'NEWSRC', { primaryKeys: ['ID'] }, ['T'])
    const step = out.steps!.find(s => s.target?.name === 'T')!
    const added = step.sources!.find(s => s.name === 'NEWSRC')!
    expect(added).toEqual({ name: 'NEWSRC', type: 'table', primaryKeys: ['ID'] })
    expect(out.table!.sourceTableNames).toContain('NEWSRC')
  })

  it('never appends a step to d.steps — a source table is not a step', () => {
    const out = insertSourceTable(MINI, 'NEWSRC', {}, ['T'])
    expect(out.steps).toHaveLength(1)
  })

  it('attaches to every named consuming step when feeds names more than one', () => {
    const twoSteps: RecipeJson = {
      steps: [
        { target: { name: 'T1', type: 'table', fields: [] }, sources: [] },
        { target: { name: 'T2', type: 'sourceQualifier', fields: [] }, sources: [] },
      ],
      table: { targetTableNames: ['T1'], sourceTableNames: [] },
    }
    const out = insertSourceTable(twoSteps, 'NEWSRC', {}, ['T1', 'T2'])
    expect(out.steps![0].sources!.some(s => s.name === 'NEWSRC')).toBe(true)
    expect(out.steps![1].sources!.some(s => s.name === 'NEWSRC')).toBe(true)
  })

  it('a feeds name that does not resolve to an existing step is a safe no-op for that entry, but the table is still recorded', () => {
    const out = insertSourceTable(MINI, 'NEWSRC', {}, ['GHOST'])
    expect(out.steps!.every(s => (s.sources ?? []).every(src => src.name !== 'NEWSRC'))).toBe(true)
    expect(out.table!.sourceTableNames).toContain('NEWSRC')
  })

  it('is pure: returns a new object, never mutates the input', () => {
    const before = JSON.stringify(MINI)
    const out = insertSourceTable(MINI, 'NEWSRC', {}, ['T'])
    expect(out).not.toBe(MINI)
    expect(JSON.stringify(MINI)).toBe(before)
  })
})

// Final-review finding: a freshly-inserted node can legitimately carry an
// empty fields[] (a dialog-built step's own "map fields" section leaves room
// for more than what it mapped at insert time) — ports derive 1:1 from
// fields, so a field the dialog didn't map could never be wired. addField is
// the minimal creation path the
// new EditPanel "+ field" affordance calls.
describe('addField', () => {
  it('appends {name, dataType: String} with no transformation when dataType is omitted', () => {
    const out = addField(MINI, { stepName: 'T', fieldName: 'C' })
    const added = out.steps![0].target!.fields!.find(f => f.name === 'C')!
    expect(added).toEqual({ name: 'C', dataType: 'String' })
    expect(added.transformation).toBeUndefined()
  })

  it('uses the given dataType when provided', () => {
    const out = addField(MINI, { stepName: 'T', fieldName: 'C', dataType: 'Long' })
    expect(out.steps![0].target!.fields!.find(f => f.name === 'C')!.dataType).toBe('Long')
  })

  it('is pure: returns a new object, never mutates the input', () => {
    const before = JSON.stringify(MINI)
    const out = addField(MINI, { stepName: 'T', fieldName: 'C' })
    expect(out).not.toBe(MINI)
    expect(JSON.stringify(MINI)).toBe(before)
  })

  it('on a weststone-keyed clone writes into weststone, not fields', () => {
    const damaged = JSON.parse(JSON.stringify(MINI).replaceAll('"fields":', '"weststone":')) as RecipeJson & {
      steps: { target: { weststone: { name?: string; dataType?: string }[]; fields?: unknown } }[]
    }
    const out = addField(damaged, { stepName: 'T', fieldName: 'C' }) as typeof damaged
    expect(out.steps[0].target.fields).toBeUndefined()
    expect(out.steps[0].target.weststone.find(f => f.name === 'C')).toEqual({ name: 'C', dataType: 'String' })
  })

  it('no-ops when stepName does not resolve to a step target', () => {
    expect(addField(MINI, { stepName: 'NOPE', fieldName: 'C' })).toEqual(MINI)
  })

  it('gives a freshly-inserted step (fields: []) its first field', () => {
    const fresh = insertConfiguredStep(MINI, buildStep('table', 'NEWTGT', {}, [], [], []))
    const out = addField(fresh, { stepName: 'NEWTGT', fieldName: 'F1' })
    expect(out.steps![1].target!.fields).toEqual([{ name: 'F1', dataType: 'String' }])
  })
})

describe('deleteNode / refsInto', () => {
  it('refsInto counts distinct FIELDS referencing the named node (field granularity)', () => {
    expect(refsInto(MINI, 'S')).toBe(1)
    expect(refsInto(MINI, 'NOPE')).toBe(0)
  })

  it('clears exactly refsInto(d, name) transformations, then removes the node', () => {
    const before = refsInto(MINI, 'S')
    expect(before).toBe(1)

    const out = deleteNode(MINI, 'S')

    expect(refsInto(out, 'S')).toBe(0)
    expect(out.steps![0].sources).toEqual([])
    expect(out.table!.sourceTableNames).toEqual([])
    const fieldB = out.steps![0].target!.fields!.find(f => f.name === 'B')!
    expect(fieldB.transformation).toBeUndefined()
    // Field A never referenced S — untouched.
    const fieldA = out.steps![0].target!.fields!.find(f => f.name === 'A')!
    expect(fieldA.transformation).toEqual({ value: '1' })
  })

  it('removes a step-target node and its targetTableNames mention', () => {
    const withTwoSteps = insertConfiguredStep(MINI, buildStep('table', 'NEWTGT', {}, [], [], []))
    const out = deleteNode(withTwoSteps, 'NEWTGT')
    expect(out.steps).toHaveLength(1)
    expect(out.table!.targetTableNames).not.toContain('NEWTGT')
  })

  // Regression (final review, task-8): the real corpus has 469 fields whose
  // formula references the same table more than once in one expression tree
  // (e.g. _ETL_m_ODS_CEDARHOLLOW_12_DEALS.json, target ODS_CEDARHOLLOW_12_DEALS,
  // field CEDARLAKE references SQ_STG_CEDARHOLLOW_12_DEALS 3x). refsInto must
  // count that as ONE field, not three occurrences — deleteNode only ever does
  // one `delete field.transformation` per field, so an occurrence-count would
  // inflate the Task 9 delete-confirm hint above what actually gets cleared.
  it('a field referencing the same table twice counts once, matching deleteNode exactly (CEDARHOLLOW-shaped fixture)', () => {
    const multiRef: RecipeJson = {
      steps: [
        {
          target: {
            name: 'ODS_CEDARHOLLOW_12_DEALS',
            type: 'table',
            fields: [
              {
                name: 'CEDARLAKE',
                dataType: 'String',
                // Two dot-refs into the SAME table within one expression tree.
                transformation: {
                  name: 'CONCAT',
                  parameters: [
                    { source: 'SQ_STG_CEDARHOLLOW_12_DEALS.A' },
                    { source: 'SQ_STG_CEDARHOLLOW_12_DEALS.B' },
                  ],
                },
              },
              {
                name: 'OTHER',
                dataType: 'String',
                transformation: { source: 'SQ_STG_CEDARHOLLOW_12_DEALS.C' },
              },
            ],
          },
          sources: [{ name: 'SQ_STG_CEDARHOLLOW_12_DEALS', type: 'sourceQualifier' }],
        },
      ],
      table: { targetTableNames: ['ODS_CEDARHOLLOW_12_DEALS'], sourceTableNames: [] },
    }

    // 3 dot-ref occurrences across 2 FIELDS -> field-granularity count is 2, not 3.
    expect(refsInto(multiRef, 'SQ_STG_CEDARHOLLOW_12_DEALS')).toBe(2)

    const out = deleteNode(multiRef, 'SQ_STG_CEDARHOLLOW_12_DEALS')
    const fields = out.steps![0].target!.fields!
    expect(fields.find(f => f.name === 'CEDARLAKE')!.transformation).toBeUndefined()
    expect(fields.find(f => f.name === 'OTHER')!.transformation).toBeUndefined()
    // The count refsInto reported is exactly the number of fields deleteNode cleared.
    expect(refsInto(out, 'SQ_STG_CEDARHOLLOW_12_DEALS')).toBe(0)
  })
})

describe('deleteEdge', () => {
  it('clears just that field transformation, leaving siblings alone', () => {
    const out = deleteEdge(MINI, 'T', 'B')
    expect(out.steps![0].target!.fields!.find(f => f.name === 'B')!.transformation).toBeUndefined()
    expect(out.steps![0].target!.fields!.find(f => f.name === 'A')!.transformation).toEqual({ value: '1' })
  })

  it('no-ops when the step or field does not exist', () => {
    expect(deleteEdge(MINI, 'NOPE', 'B')).toEqual(MINI)
    expect(deleteEdge(MINI, 'T', 'NOPE')).toEqual(MINI)
  })
})

// Review finding (Task 9 fix round): deriveConnections synthesizes a blank
// fromPort/toPort "center-anchor" edge for a sources[] entry with zero
// field-level dot-refs landing on its step (recipeAdapter.test.ts's
// "field-less source entry" case). deleteEdge(d, toStep, '') used to look up
// a field literally named '' and find nothing — a silent no-op even though
// the UI treated it as a real, selectable, deletable edge.
describe('deleteEdge — center-anchor (blank toPort) edges', () => {
  const centerAnchor: RecipeJson = {
    steps: [
      {
        target: { name: 'T', type: 'table', fields: [{ name: 'A', dataType: 'String', transformation: { value: '1' } }] },
        sources: [{ name: 'S', type: 'table' }],
      },
    ],
    table: { targetTableNames: ['T'], sourceTableNames: ['S'] },
  }

  it('removes the matching sources[] entry (by fromNode); canvas re-derivation drops the edge; the draft actually changes', () => {
    const before = recipeToCanvas(centerAnchor, 'x')
    expect(before.connections).toEqual([{ fromNode: 'S', fromPort: '', toNode: 'T', toPort: '' }])

    const out = deleteEdge(centerAnchor, 'T', '', 'S')

    expect(out).not.toBe(centerAnchor)
    expect(out).not.toEqual(centerAnchor) // a REAL change — not the prior silent no-op
    expect(out.steps![0].sources).toEqual([])
    // Kept simple per review: table.sourceTableNames is NOT touched here (that's
    // deleteNode's job) — S may still be meaningful bookkeeping even though no
    // step references it anymore.
    expect(out.table!.sourceTableNames).toEqual(['S'])

    const after = recipeToCanvas(out, 'x')
    expect(after.connections).toEqual([])
  })

  it('is a no-op when fromNode is omitted — nothing identifies which sources[] entry to drop', () => {
    expect(deleteEdge(centerAnchor, 'T', '')).toEqual(centerAnchor)
  })

  it('only removes the target step\'s own sources[] entry — a sibling step referencing the same table is untouched', () => {
    const shared: RecipeJson = {
      steps: [
        { target: { name: 'T1', type: 'table', fields: [] }, sources: [{ name: 'S', type: 'table' }] },
        { target: { name: 'T2', type: 'table', fields: [] }, sources: [{ name: 'S', type: 'table' }] },
      ],
      table: { targetTableNames: ['T1', 'T2'], sourceTableNames: ['S'] },
    }
    const out = deleteEdge(shared, 'T1', '', 'S')
    expect(out.steps![0].sources).toEqual([])
    expect(out.steps![1].sources).toEqual([{ name: 'S', type: 'table' }])
  })
})

describe('parseFormulaText', () => {
  it('round-trips a call tree through renderFormula to itself', () => {
    const text = "EXP_TO_CHAR(A.B, 'X')"
    expect(renderFormula(parseFormulaText(text))).toBe(text)
  })

  it('round-trips the full BIZLINK ID_OAKBLUFF nested call tree', () => {
    const text =
      "EXP_TO_DECIMAL(EXP_TO_CHAR(EXP_ADD_TO_DATE(EXP_TO_DATE(SQ_ff_BIZLINK.FCH_DATAENTRY, 'YYYYMMDD'), 'MM', -1), 'ROWANFIELD'))"
    expect(renderFormula(parseFormulaText(text))).toBe(text)
  })

  it('bare T.F -> {source}', () => {
    expect(parseFormulaText('T.F')).toEqual({ source: 'T.F' })
  })

  it('anything else -> {value}', () => {
    expect(parseFormulaText('hello')).toEqual({ value: 'hello' })
    expect(parseFormulaText("'ROWANFIELD'")).toEqual({ value: "'ROWANFIELD'" })
    expect(parseFormulaText('-1')).toEqual({ value: '-1' })
  })

  it('no-args call -> {name, parameters: []}', () => {
    expect(parseFormulaText('NOW()')).toEqual({ name: 'NOW', parameters: [] })
  })
})

// ─── Task 12: generic property mutators (Inspector) ──────────────────────────

// Not explicitly typed RecipeJson — `groups` isn't part of RecipeTargetJson's
// closed interface (it's schema-driven, not hand-typed here), so this fixture
// stays a plain object literal and reaches recipeEdits' `RecipeJson`-typed
// parameters only by reference (no excess-property check on a variable).
const PROPS = {
  steps: [
    {
      target: {
        name: 'RTR', type: 'router',
        fields: [{ name: 'X', dataType: 'String' }],
        groups: [{ name: 'A', filterCondition: 'X=1', default: false }],
      },
      sources: [{ name: 'S', type: 'table' }],
    },
    {
      target: { name: 'T2', type: 'table', fields: [] },
      sources: [{ name: 'S', type: 'table' }],
    },
  ],
  table: { targetTableNames: ['RTR', 'T2'], sourceTableNames: ['S'] },
}

describe('setTargetProperty / deleteTargetProperty / setSourceProperty — every helper is pure', () => {
  it('returns a new object per call and never mutates the input', () => {
    const before = JSON.stringify(PROPS)
    const outs = [
      setTargetProperty(PROPS, 'RTR', 'selectDistinct', true),
      deleteTargetProperty(PROPS, 'RTR', 'groups'),
      setSourceProperty(PROPS, 'RTR', 'S', 'group', 'A'),
    ]
    for (const out of outs) expect(out).not.toBe(PROPS)
    expect(JSON.stringify(PROPS)).toBe(before)
  })
})

describe('setTargetProperty', () => {
  it('sets a scalar (boolean) on the named step\'s target', () => {
    const out = setTargetProperty(PROPS, 'T2', 'selectDistinct', true)
    expect(out.steps![1].target).toMatchObject({ selectDistinct: true })
  })

  it('sets an array on the named step\'s target', () => {
    const out = setTargetProperty(PROPS, 'RTR', 'groupByFields', ['A', 'B'])
    expect((out.steps![0].target as unknown as Record<string, unknown>).groupByFields).toEqual(['A', 'B'])
  })

  it('sets a nested object on the named step\'s target', () => {
    const out = setTargetProperty(PROPS, 'RTR', 'filterCondition', { source: 'S.A' })
    expect((out.steps![0].target as unknown as Record<string, unknown>).filterCondition).toEqual({ source: 'S.A' })
  })

  it('replaces an existing key without touching sibling keys', () => {
    const out = setTargetProperty(PROPS, 'RTR', 'groups', [{ name: 'B', filterCondition: 'X=2', default: true }])
    expect((out.steps![0].target as unknown as Record<string, unknown>).groups).toEqual([
      { name: 'B', filterCondition: 'X=2', default: true },
    ])
    // sibling field `fields` is untouched.
    expect(out.steps![0].target!.fields).toEqual([{ name: 'X', dataType: 'String' }])
  })

  it('is a no-op (unchanged clone) when stepName does not resolve to a step target', () => {
    const out = setTargetProperty(PROPS, 'NOPE', 'selectDistinct', true)
    expect(out).toEqual(PROPS)
  })
})

describe('deleteTargetProperty', () => {
  it('removes a key from the named step\'s target', () => {
    const out = deleteTargetProperty(PROPS, 'RTR', 'groups')
    expect((out.steps![0].target as unknown as Record<string, unknown>).groups).toBeUndefined()
    expect('groups' in (out.steps![0].target as unknown as Record<string, unknown>)).toBe(false)
  })

  it('is a no-op when the key is already absent', () => {
    const out = deleteTargetProperty(PROPS, 'T2', 'selectDistinct')
    expect(out.steps![1].target).toEqual(PROPS.steps![1].target)
  })
})

describe('setSourceProperty', () => {
  it('targets the right sources[] entry by (stepName, sourceName) — the SAME source name under a DIFFERENT step is untouched', () => {
    const out = setSourceProperty(PROPS, 'RTR', 'S', 'group', 'A')
    expect((out.steps![0].sources![0] as unknown as Record<string, unknown>).group).toBe('A')
    // T2's own "S" source entry is a distinct object and stays untouched.
    expect('group' in (out.steps![1].sources![0] as unknown as Record<string, unknown>)).toBe(false)
  })

  it('is a no-op when stepName resolves but sourceName does not', () => {
    const out = setSourceProperty(PROPS, 'RTR', 'NOPE', 'group', 'A')
    expect(out).toEqual(PROPS)
  })

  it('is a no-op when stepName does not resolve at all', () => {
    const out = setSourceProperty(PROPS, 'NOPE', 'S', 'group', 'A')
    expect(out).toEqual(PROPS)
  })
})
