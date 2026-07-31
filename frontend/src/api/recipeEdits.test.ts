import { describe, expect, it } from 'vitest'
import {
  addSourceTable,
  addStep,
  deleteEdge,
  deleteNode,
  editFieldDataType,
  parseFormulaText,
  refsInto,
  renameNode,
  setFieldTransformation,
} from './recipeEdits'
import { renderFormula } from './recipeAdapter'
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
      addStep(MINI, 'table'),
      addSourceTable(MINI, 'T'),
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
})

describe('addStep', () => {
  it('appends {name: NEW_<TYPE>_<n>, type, fields: []}', () => {
    const out = addStep(MINI, 'table')
    expect(out.steps).toHaveLength(2)
    const added = out.steps![1].target!
    expect(added.name).toMatch(/^NEW_TABLE_\d+$/)
    expect(added.type).toBe('table')
    expect(added.fields).toEqual([])
  })

  it('type table also appends the new name to targetTableNames', () => {
    const out = addStep(MINI, 'table')
    const added = out.steps![1].target!
    expect(out.table!.targetTableNames).toContain(added.name)
  })

  it('non-table types do not touch targetTableNames', () => {
    const out = addStep(MINI, 'filter')
    expect(out.table!.targetTableNames).toEqual(['T'])
  })

  it('picks a fresh unique name across repeated calls', () => {
    const once = addStep(MINI, 'table')
    const twice = addStep(once, 'table')
    const names = twice.steps!.map(s => s.target?.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('addSourceTable', () => {
  it('appends {name, type: table} into the named step sources[] + sourceTableNames', () => {
    const out = addSourceTable(MINI, 'T')
    const step = out.steps!.find(s => s.target?.name === 'T')!
    expect(step.sources).toHaveLength(2)
    const added = step.sources!.find(s => s.name !== 'S')!
    expect(added.type).toBe('table')
    expect(out.table!.sourceTableNames).toContain(added.name)
  })

  it('falls back to the first step when stepName is omitted', () => {
    const out = addSourceTable(MINI)
    expect(out.steps![0].sources).toHaveLength(2)
  })

  it('creates a stub table-typed step when the recipe has no steps at all', () => {
    const empty: RecipeJson = {}
    const out = addSourceTable(empty)
    expect(out.steps).toHaveLength(1)
    expect(out.steps![0].target!.type).toBe('table')
    expect(out.steps![0].sources).toHaveLength(1)
    expect(out.table!.sourceTableNames).toHaveLength(1)
  })
})

describe('deleteNode / refsInto', () => {
  it('refsInto counts dot-ref occurrences into the named node', () => {
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
    const withTwoSteps = addStep(MINI, 'table')
    const addedName = withTwoSteps.steps![1].target!.name!
    const out = deleteNode(withTwoSteps, addedName)
    expect(out.steps).toHaveLength(1)
    expect(out.table!.targetTableNames).not.toContain(addedName)
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
