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
    { key: 'selectDistinct', parserType: 'Boolean', required: true, widget: 'toggle', ruleId: 'IPC-TYP-SOURCEQUALIFIER-001' },
    { key: 'sourceFilter', parserType: 'Option[String]', required: false, widget: 'textarea' },
    { key: 'sqlQuery', parserType: 'Option[String]', required: false, widget: 'textarea' },
    { key: 'userDefinedJoin', parserType: 'Option[String]', required: false, widget: 'textarea' },
  ],
  'target:aggregator': [
    { key: 'name', parserType: 'String', required: true, widget: 'text' },
    { key: 'type', parserType: 'String', required: true, widget: 'text' },
    { key: 'fields', parserType: 'List[Field]', required: true, widget: 'fieldTable' },
    { key: 'groupByFields', parserType: 'List[String]', required: true, widget: 'stringList', ruleId: 'IPC-TYP-AGGREGATOR-001' },
  ],
  'target:router': [
    { key: 'name', parserType: 'String', required: true, widget: 'text' },
    { key: 'type', parserType: 'String', required: true, widget: 'text' },
    { key: 'fields', parserType: 'List[Field]', required: true, widget: 'fieldTable' },
    { key: 'groups', parserType: 'List[RouterGroup]', required: true, widget: 'rowTable', ruleId: 'IPC-TYP-ROUTER-001' },
  ],
  'target:java': [
    { key: 'name', parserType: 'String', required: true, widget: 'text' },
    { key: 'type', parserType: 'String', required: true, widget: 'text' },
    { key: 'fields', parserType: 'List[Field]', required: true, widget: 'fieldTable' },
    { key: 'javaCode', parserType: 'String', required: true, widget: 'textarea', ruleId: 'IPC-TYP-JAVA-001' },
  ],
  'target:filter': [
    { key: 'name', parserType: 'String', required: true, widget: 'text' },
    { key: 'type', parserType: 'String', required: true, widget: 'text' },
    { key: 'fields', parserType: 'List[Field]', required: true, widget: 'fieldTable' },
    { key: 'filterCondition', parserType: 'RecipeTransformation', required: false, widget: 'formula' },
  ],
}

const KEY_ALIASES = { greencliff: 'groups', weststone: 'fields' }

function node(id: string, type: ETLNode['type']): ETLNode {
  return { id, type, label: type.toUpperCase(), name: id, x: 0, y: 0, ports: [], properties: {}, file: 'f.xml' }
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
  it('target:sourceQualifier renders a toggle for selectDistinct; flipping it calls onChange with setTargetProperty\'s result', () => {
    const draft = {
      steps: [{ target: { name: 'SQ1', type: 'sourceQualifier', fields: [], selectDistinct: false }, sources: [] }],
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
      steps: [{ target: { name: 'AGG1', type: 'aggregator', fields: [], groupByFields: ['A'] }, sources: [] }],
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
      steps: [{
        target: {
          name: 'RTR1', type: 'router', fields: [],
          groups: [{ name: 'A', filterCondition: 'X=1', default: false }],
        },
        sources: [],
      }],
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
      steps: [{ target: { name: 'JAV1', type: 'java', fields: [], javaCode: 'return 1;' }, sources: [] }],
      table: emptyTable(),
    }
    renderInspector({ draft, node: node('JAV1', 'expression') })

    const el = screen.getByDisplayValue('return 1;')
    expect(el.tagName).toBe('TEXTAREA')
  })

  it('target:filter renders a formula field for filterCondition', () => {
    const draft = {
      steps: [{ target: { name: 'FLT1', type: 'filter', fields: [], filterCondition: { source: 'S.A' } }, sources: [] }],
      table: emptyTable(),
    }
    renderInspector({ draft, node: node('FLT1', 'filter') })

    expect(screen.getByText('filterCondition')).toBeInTheDocument()
    expect(screen.getByDisplayValue('S.A')).toBeInTheDocument()
  })

  it('a key present on the node but absent from the schema renders read-only in an "Unrecognized keys" group', () => {
    const draft = {
      steps: [{
        target: { name: 'FLT1', type: 'filter', fields: [], someAnonymizedKey: 42 },
        sources: [],
      }],
      table: emptyTable(),
    }
    renderInspector({ draft, node: node('FLT1', 'filter') })

    expect(screen.getByText('Unrecognized keys')).toBeInTheDocument()
    expect(screen.getByText('someAnonymizedKey')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('a router node whose groups live under the anonymized greencliff key still renders the row table via keyAliases', () => {
    const draft = {
      steps: [{
        target: {
          name: 'RTR2', type: 'router', fields: [],
          greencliff: [{ name: 'A', filterCondition: 'X=1', default: true }],
        },
        sources: [],
      }],
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
})

describe('Inspector — name (rename) and delete', () => {
  it('renaming commits via renameNode and reports the new id back through onChange\'s second argument', () => {
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
