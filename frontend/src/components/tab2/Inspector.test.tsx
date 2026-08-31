import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { ETLNode } from '../../types'
import type { RecipeJson } from '../../api/recipeAdapter'
import type { IpcKeySpec } from '../../api/queries'
import { setTargetProperty } from '../../api/recipeEdits'
import { Inspector } from './Inspector'

afterEach(cleanup)

// Fixed keySchema literal (Task 12 brief: feed it in as a prop with a fixed
// literal rather than hitting the network) — a slice of the real
// backend/src/main/resources/ipc/ipc-rules.json keySchema covering exactly the
// kinds these tests exercise.
const KEY_SCHEMA: Record<string, IpcKeySpec[]> = {
  'target:sourceQualifier': [
    { key: 'name', parserType: 'String', required: true, widget: 'text' },
    { key: 'type', parserType: 'String', required: true, widget: 'text' },
    { key: 'fields', parserType: 'List[Field]', required: true, widget: 'fieldTable' },
    {
      key: 'selectDistinct',
      parserType: 'Boolean',
      required: true,
      widget: 'toggle',
      ruleId: 'IPC-TYP-SOURCEQUALIFIER-001',
    },
    { key: 'sourceFilter', parserType: 'Option[String]', required: false, widget: 'textarea' },
    { key: 'sqlQuery', parserType: 'Option[String]', required: false, widget: 'textarea' },
    { key: 'userDefinedJoin', parserType: 'Option[String]', required: false, widget: 'textarea' },
  ],
  'target:aggregator': [
    { key: 'name', parserType: 'String', required: true, widget: 'text' },
    { key: 'type', parserType: 'String', required: true, widget: 'text' },
    { key: 'fields', parserType: 'List[Field]', required: true, widget: 'fieldTable' },
    {
      key: 'groupByFields',
      parserType: 'List[String]',
      required: true,
      widget: 'stringList',
      ruleId: 'IPC-TYP-AGGREGATOR-001',
    },
  ],
  'target:router': [
    { key: 'name', parserType: 'String', required: true, widget: 'text' },
    { key: 'type', parserType: 'String', required: true, widget: 'text' },
    { key: 'fields', parserType: 'List[Field]', required: true, widget: 'fieldTable' },
    {
      key: 'groups',
      parserType: 'List[RouterGroup]',
      required: true,
      widget: 'rowTable',
      ruleId: 'IPC-TYP-ROUTER-001',
    },
  ],
  'target:java': [
    { key: 'name', parserType: 'String', required: true, widget: 'text' },
    { key: 'type', parserType: 'String', required: true, widget: 'text' },
    { key: 'fields', parserType: 'List[Field]', required: true, widget: 'fieldTable' },
    {
      key: 'javaCode',
      parserType: 'String',
      required: true,
      widget: 'textarea',
      ruleId: 'IPC-TYP-JAVA-001',
    },
  ],
  'target:filter': [
    { key: 'name', parserType: 'String', required: true, widget: 'text' },
    { key: 'type', parserType: 'String', required: true, widget: 'text' },
    { key: 'fields', parserType: 'List[Field]', required: true, widget: 'fieldTable' },
    {
      key: 'filterCondition',
      parserType: 'RecipeTransformation',
      required: false,
      widget: 'formula',
    },
  ],
  'target:normalizer': [
    { key: 'name', parserType: 'String', required: true, widget: 'text' },
    { key: 'type', parserType: 'String', required: true, widget: 'text' },
    { key: 'fields', parserType: 'List[Field]', required: true, widget: 'fieldTable' },
    {
      key: 'normalizedFields',
      parserType: 'List[NormalizedField]',
      required: true,
      widget: 'rowTable',
      ruleId: 'IPC-TYP-NORMALIZER-001',
    },
  ],
  'source:union': [
    { key: 'name', parserType: 'String', required: true, widget: 'text' },
    { key: 'type', parserType: 'String', required: true, widget: 'text' },
    {
      key: 'unionTables',
      parserType: 'List[UnionTable]',
      required: true,
      widget: 'rowTable',
      ruleId: 'IPC-TYP-UNION-001',
    },
  ],
}

const KEY_ALIASES = { greencliff: 'groups', weststone: 'fields' }

function node(id: string, type: ETLNode['type']): ETLNode {
  return {
    id,
    type,
    label: type.toUpperCase(),
    name: id,
    x: 0,
    y: 0,
    ports: [],
    properties: {},
    file: 'f.xml',
  }
}

function emptyTable() {
  return { targetTableNames: [] as string[], sourceTableNames: [] as string[] }
}

function renderInspector(overrides: {
  draft: RecipeJson
  node: ETLNode
  keyAliases?: Record<string, string>
}) {
  const onChange = vi.fn()
  const onDelete = vi.fn()
  const onFocusFormula = vi.fn()
  const utils = render(
    <Inspector
      draft={overrides.draft}
      node={overrides.node}
      keySchema={KEY_SCHEMA}
      keyAliases={overrides.keyAliases ?? {}}
      onChange={onChange}
      onDelete={onDelete}
      onFocusFormula={onFocusFormula}
    />,
  )
  return { ...utils, onChange, onDelete, onFocusFormula }
}

describe('Inspector — widget class per key (Task 12)', () => {
  it("target:sourceQualifier renders a toggle for selectDistinct; flipping it calls onChange with setTargetProperty's result", () => {
    const draft = {
      steps: [
        {
          target: { name: 'SQ1', type: 'sourceQualifier', fields: [], selectDistinct: false },
          sources: [],
        },
      ],
      table: emptyTable(),
    }
    const { onChange } = renderInspector({ draft, node: node('SQ1', 'sq') })

    expect(screen.getByText('selectDistinct')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Off'))

    expect(onChange).toHaveBeenCalledTimes(1)
    const [next] = onChange.mock.calls[0]
    expect(next).toEqual(setTargetProperty(draft, 'SQ1', 'selectDistinct', true))
  })

  it('target:aggregator renders a string list for groupByFields; adding an entry appends', () => {
    const draft = {
      steps: [
        {
          target: { name: 'AGG1', type: 'aggregator', fields: [], groupByFields: ['A'] },
          sources: [],
        },
      ],
      table: emptyTable(),
    }
    const { onChange } = renderInspector({ draft, node: node('AGG1', 'aggregator') })

    expect(screen.getByText('groupByFields')).toBeInTheDocument()
    expect(screen.getByDisplayValue('A')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('add…'), { target: { value: 'B' } })
    fireEvent.click(screen.getByText('+ add'))

    expect(onChange).toHaveBeenCalledTimes(1)
    const [next] = onChange.mock.calls[0]
    expect(next).toEqual(setTargetProperty(draft, 'AGG1', 'groupByFields', ['A', 'B']))
  })

  it('target:router renders a row table for groups with columns name, filterCondition, default', () => {
    const draft = {
      steps: [
        {
          target: {
            name: 'RTR1',
            type: 'router',
            fields: [],
            groups: [{ name: 'A', filterCondition: 'X=1', default: false }],
          },
          sources: [],
        },
      ],
      table: emptyTable(),
    }
    renderInspector({ draft, node: node('RTR1', 'router') })

    expect(screen.getByText('groups')).toBeInTheDocument()
    expect(screen.getByText('name')).toBeInTheDocument()
    expect(screen.getByText('filterCondition')).toBeInTheDocument()
    expect(screen.getByText('default')).toBeInTheDocument()
    expect(screen.getByDisplayValue('A')).toBeInTheDocument()
    expect(screen.getByDisplayValue('X=1')).toBeInTheDocument()
    expect(screen.getByText('Off')).toBeInTheDocument()
  })

  it('target:java renders a textarea for javaCode', () => {
    const draft = {
      steps: [
        { target: { name: 'JAV1', type: 'java', fields: [], javaCode: 'return 1;' }, sources: [] },
      ],
      table: emptyTable(),
    }
    renderInspector({ draft, node: node('JAV1', 'expression') })

    const el = screen.getByDisplayValue('return 1;')
    expect(el.tagName).toBe('TEXTAREA')
  })

  it('target:filter renders a formula field for filterCondition', () => {
    const draft = {
      steps: [
        {
          target: { name: 'FLT1', type: 'filter', fields: [], filterCondition: { source: 'S.A' } },
          sources: [],
        },
      ],
      table: emptyTable(),
    }
    renderInspector({ draft, node: node('FLT1', 'filter') })

    expect(screen.getByText('filterCondition')).toBeInTheDocument()
    expect(screen.getByDisplayValue('S.A')).toBeInTheDocument()
  })

  it('a key present on the node but absent from the schema renders read-only in an "Unrecognized keys" group', () => {
    const draft = {
      steps: [
        {
          target: { name: 'FLT1', type: 'filter', fields: [], someAnonymizedKey: 42 },
          sources: [],
        },
      ],
      table: emptyTable(),
    }
    renderInspector({ draft, node: node('FLT1', 'filter') })

    expect(screen.getByText('Unrecognized keys')).toBeInTheDocument()
    expect(screen.getByText('someAnonymizedKey')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('a router node whose groups live under the anonymized greencliff key still renders the row table via keyAliases', () => {
    const draft = {
      steps: [
        {
          target: {
            name: 'RTR2',
            type: 'router',
            fields: [],
            greencliff: [{ name: 'A', filterCondition: 'X=1', default: true }],
          },
          sources: [],
        },
      ],
      table: emptyTable(),
    }
    renderInspector({ draft, node: node('RTR2', 'router'), keyAliases: KEY_ALIASES })

    // The label shown is the SCHEMA's canonical key ("groups"), not the raw
    // anonymized wire key ("greencliff") — but the row DATA comes from greencliff.
    expect(screen.getByText('groups')).toBeInTheDocument()
    expect(screen.queryByText('greencliff')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('A')).toBeInTheDocument()
    expect(screen.getByDisplayValue('X=1')).toBeInTheDocument()
    expect(screen.getByText('On')).toBeInTheDocument()
  })

  // Coordinator follow-up (post-review): a row-table cell whose value is a nested
  // array of OBJECTS (unionTables[].fieldMapping — 2197 pairs across 7 real
  // recipes) is not representable as a single text/toggle cell, but it must still
  // be VISIBLE — "nothing is hidden" is non-negotiable even where nested editing
  // is out of scope (recorded as an explicit deferred deviation in the task-12
  // report). Rendered read-only, same label/value idiom as the unrecognized-keys
  // group, so the actual origin/union values are real text nodes, not just a
  // column header.
  it("a source:union node renders unionTables' nested fieldMapping pairs read-only — the origin/union VALUES are visible, not just the column label", () => {
    const draft = {
      steps: [
        {
          target: { name: 'TGT', type: 'table', fields: [] },
          sources: [
            {
              name: 'UNI1',
              type: 'union',
              unionTables: [
                { name: 'T1', fieldMapping: [{ origin: 'SRC_A.COL1', union: 'COL_OUT' }] },
              ],
            },
          ],
        },
      ],
      table: { targetTableNames: ['TGT'], sourceTableNames: [] },
    }
    renderInspector({ draft, node: node('UNI1', 'source') })

    expect(screen.getByText('unionTables')).toBeInTheDocument()
    expect(screen.getByText('fieldMapping')).toBeInTheDocument()
    // The nested pair's own VALUES render as real text — not just the "fieldMapping"
    // column header, and not swallowed into an opaque summary.
    expect(screen.getByText('SRC_A.COL1')).toBeInTheDocument()
    expect(screen.getByText('COL_OUT')).toBeInTheDocument()
  })

  // Coordinator follow-up: refSource is a plain List[String] — reuse
  // StringListWidget inside the row cell rather than leaving it read-only.
  it("target:normalizer's normalizedFields row table renders refSource as an EDITABLE string list; adding an entry commits via setTargetProperty", () => {
    const draft = {
      steps: [
        {
          target: {
            name: 'NRM1',
            type: 'normalizer',
            fields: [],
            normalizedFields: [
              { name: 'N', refSource: ['N_in'], generatedColumnId: false, generatedKey: false },
            ],
          },
          sources: [],
        },
      ],
      table: emptyTable(),
    }
    const { onChange } = renderInspector({ draft, node: node('NRM1', 'expression') })

    expect(screen.getByText('normalizedFields')).toBeInTheDocument()
    expect(screen.getByText('refSource')).toBeInTheDocument()
    expect(screen.getByDisplayValue('N_in')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('add…'), { target: { value: 'N_in2' } })
    fireEvent.click(screen.getByText('+ add'))

    expect(onChange).toHaveBeenCalledTimes(1)
    const [next] = onChange.mock.calls[0]
    expect(next).toEqual(
      setTargetProperty(draft, 'NRM1', 'normalizedFields', [
        { name: 'N', refSource: ['N_in', 'N_in2'], generatedColumnId: false, generatedKey: false },
      ]),
    )
  })
})

describe('Inspector — name (rename) and delete', () => {
  it("renaming commits via renameNode and reports the new id back through onChange's second argument", () => {
    const draft = {
      steps: [{ target: { name: 'FLT1', type: 'filter', fields: [] }, sources: [] }],
      table: { targetTableNames: ['FLT1'], sourceTableNames: [] },
    }
    const { onChange } = renderInspector({ draft, node: node('FLT1', 'filter') })

    const nameInput = screen.getByDisplayValue('FLT1')
    fireEvent.change(nameInput, { target: { value: 'FLT2' } })
    fireEvent.blur(nameInput)

    expect(onChange).toHaveBeenCalledTimes(1)
    const [next, selectId] = onChange.mock.calls[0]
    expect(next.steps[0].target.name).toBe('FLT2')
    expect(selectId).toBe('FLT2')
  })

  it('arms a confirm hint on Delete and calls onDelete with the node id on confirm', () => {
    const draft = {
      steps: [{ target: { name: 'FLT1', type: 'filter', fields: [] }, sources: [] }],
      table: emptyTable(),
    }
    const { onDelete } = renderInspector({ draft, node: node('FLT1', 'filter') })

    fireEvent.click(screen.getByText('Delete'))
    expect(screen.getByText(/Removes FLT1/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Confirm delete'))

    expect(onDelete).toHaveBeenCalledWith('FLT1')
  })
})

// ─── Declared source tables (UX round 3, issue 3) ────────────────────────────
//
// `recipeToCanvas` now paints a node for a `table.sourceTableNames` entry that
// no step references (the first insertion into an empty draft, and four real
// corpus lookup tables). Such a node resolves to NEITHER a step target NOR a
// `sources[]` occurrence, so the schema lookup has nothing to read and the
// Inspector used to bail out with `null` — the node was clickable and the dock
// mounted empty. It gets its own honest panel instead: rename and delete both
// work (`renameNode`/`deleteNode` already maintain `table.sourceTableNames`),
// but there is no `sources[]` entry to hang per-kind properties off, so none
// are offered rather than faked.
describe('Inspector — declared source table', () => {
  const declaredDraft: RecipeJson = {
    steps: [{ target: { name: 'T', type: 'table', fields: [] }, sources: [] }],
    table: { targetTableNames: ['T'], sourceTableNames: ['LKP_ONLY'] },
  }

  it('renders a panel (not nothing) and says why there are no properties yet', () => {
    renderInspector({ draft: declaredDraft, node: node('LKP_ONLY', 'source') })

    expect(screen.getByText('Edit — LKP_ONLY')).toBeInTheDocument()
    expect(screen.getByDisplayValue('LKP_ONLY')).toBeInTheDocument()
    expect(screen.getByText(/no step reads from it yet/i)).toBeInTheDocument()
  })

  it('renaming it reports the new id so the Inspector stays attached', () => {
    const { onChange } = renderInspector({ draft: declaredDraft, node: node('LKP_ONLY', 'source') })

    fireEvent.change(screen.getByDisplayValue('LKP_ONLY'), { target: { value: 'LKP_RENAMED' } })
    fireEvent.blur(screen.getByDisplayValue('LKP_RENAMED'))

    const [next, selectId] = onChange.mock.calls[0]
    expect(next.table.sourceTableNames).toEqual(['LKP_RENAMED'])
    expect(selectId).toBe('LKP_RENAMED')
  })

  it('deletes through the same confirm control as every other node', () => {
    const { onDelete } = renderInspector({ draft: declaredDraft, node: node('LKP_ONLY', 'source') })

    fireEvent.click(screen.getByText('Delete'))
    fireEvent.click(screen.getByText('Confirm delete'))
    expect(onDelete).toHaveBeenCalledWith('LKP_ONLY')
  })

  it('still renders nothing for a node that is in neither the steps nor the table lists', () => {
    const { container } = renderInspector({ draft: declaredDraft, node: node('GHOST', 'source') })
    expect(container).toBeEmptyDOMElement()
  })
})

// ─── UX round 4: explicit close affordance ───────────────────────────────────
//
// Closing used to require re-clicking the very node that opened the panel — a
// hidden gesture (and impossible once the panel covered that node). The header
// now carries an explicit ✕ wired to `onClose`; when the caller passes none
// (older embeddings, tests that don't care) no button renders at all.

describe('Inspector — close affordance (UX round 4)', () => {
  const draft = {
    steps: [
      {
        target: { name: 'SQ1', type: 'sourceQualifier', fields: [], selectDistinct: false },
        sources: [],
      },
    ],
    table: emptyTable(),
  }

  it('renders a ✕ that fires onClose', () => {
    const onClose = vi.fn()
    render(
      <Inspector
        draft={draft}
        node={node('SQ1', 'sq')}
        keySchema={KEY_SCHEMA}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onFocusFormula={vi.fn()}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close inspector' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders no close button when onClose is not provided', () => {
    renderInspector({ draft, node: node('SQ1', 'sq') })
    expect(screen.queryByRole('button', { name: 'Close inspector' })).not.toBeInTheDocument()
  })

  it('the declared-source-table panel (no step occurrence) carries the same ✕', () => {
    const onClose = vi.fn()
    render(
      <Inspector
        draft={{ steps: [], table: { targetTableNames: [], sourceTableNames: ['LONE'] } }}
        node={node('LONE', 'source')}
        keySchema={KEY_SCHEMA}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onFocusFormula={vi.fn()}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close inspector' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
