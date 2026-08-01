import { describe, expect, it, vi, beforeAll, afterEach, afterAll } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import type { RecipeJson } from '../../api/recipeAdapter'
import type { IpcConnections, IpcKeySpec } from '../../api/queries'
import { NodeConfigDialog } from './NodeConfigDialog'

afterEach(cleanup)

// A slice of the real backend/src/main/resources/ipc/ipc-rules.json keySchema,
// covering exactly the kinds these tests exercise (Task 12's Inspector.test.tsx
// uses the same "fixed literal slice, no network" idiom).
const KEY_SCHEMA: Record<string, IpcKeySpec[]> = {
  'target:sourceQualifier': [
    { key: 'name', parserType: 'String', required: true, widget: 'text' },
    { key: 'type', parserType: 'String', required: true, widget: 'text' },
    { key: 'fields', parserType: 'List[Field]', required: true, widget: 'fieldTable' },
    { key: 'selectDistinct', parserType: 'Boolean', required: true, widget: 'toggle', ruleId: 'IPC-TYP-SOURCEQUALIFIER-001' },
  ],
  'target:aggregator': [
    { key: 'name', parserType: 'String', required: true, widget: 'text' },
    { key: 'type', parserType: 'String', required: true, widget: 'text' },
    { key: 'fields', parserType: 'List[Field]', required: true, widget: 'fieldTable' },
    { key: 'groupByFields', parserType: 'List[String]', required: true, widget: 'stringList', ruleId: 'IPC-TYP-AGGREGATOR-001' },
  ],
  'target:filter': [
    { key: 'name', parserType: 'String', required: true, widget: 'text' },
    { key: 'type', parserType: 'String', required: true, widget: 'text' },
    { key: 'fields', parserType: 'List[Field]', required: true, widget: 'fieldTable' },
    { key: 'filterCondition', parserType: 'RecipeTransformation', required: false, widget: 'formula' },
  ],
}

// A slice of the real ipc-rules.json connections map (Task 9) — only the
// pairwise legality this file's tests exercise.
const CONNECTIONS: IpcConnections = {
  // `active` is nullable at the wire (`table`/`java` genuinely carry JSON
  // `null` — see IpcConnectionDto), but the generated TS type only admits
  // `boolean | undefined`; omitted here rather than typed as `null` to stay
  // within that generated contract — this dialog doesn't consume `active` at
  // all (the fan-in rule it would drive is backend/Task-9-only).
  table: { mayFeed: ['sourceQualifier', 'table', 'normalizer'] },
  sourceQualifier: {
    mayFeed: ['table', 'unionInput', 'filter', 'joinerInput', 'aggregator', 'router', 'normalizer', 'java', 'storedProcedure'],
    active: true,
  },
  filter: {
    mayFeed: ['table', 'unionInput', 'filter', 'joinerInput', 'aggregator', 'router', 'normalizer', 'java', 'storedProcedure'],
    active: true,
  },
  aggregator: {
    mayFeed: ['table', 'unionInput', 'filter', 'joinerInput', 'aggregator', 'router', 'normalizer', 'java', 'storedProcedure'],
    active: true,
  },
}

const MINI: RecipeJson = {
  steps: [
    { target: { name: 'T', type: 'table', fields: [] }, sources: [{ name: 'S', type: 'table' }] },
  ],
  table: { targetTableNames: ['T'], sourceTableNames: ['S'] },
}

let lastValidateBody: RecipeJson | null = null
let validateResponse: { valid: boolean; errors: { path: string; message: string }[]; warnings: { path: string; message: string }[]; checks: unknown[] } = {
  valid: true, errors: [], warnings: [], checks: [],
}
const server = setupServer(
  http.post('/api/recipes/validate', async ({ request }) => {
    lastValidateBody = (await request.json()) as RecipeJson
    return HttpResponse.json(validateResponse)
  }),
)
beforeAll(() => server.listen())
afterEach(() => {
  server.resetHandlers()
  lastValidateBody = null
  validateResponse = { valid: true, errors: [], warnings: [], checks: [] }
})
afterAll(() => server.close())

function renderDialog(overrides: {
  kind: string
  draft?: RecipeJson
  keySchema?: Record<string, IpcKeySpec[]>
  connections?: IpcConnections
}) {
  const onCancel = vi.fn()
  const onInsert = vi.fn()
  const utils = render(
    <NodeConfigDialog
      kind={overrides.kind}
      draft={overrides.draft ?? MINI}
      keySchema={overrides.keySchema ?? KEY_SCHEMA}
      connections={overrides.connections ?? CONNECTIONS}
      onCancel={onCancel}
      onInsert={onInsert}
    />,
  )
  return { ...utils, onCancel, onInsert }
}

describe('NodeConfigDialog — schema-driven properties', () => {
  it('renders a toggle widget for sourceQualifier.selectDistinct (a required key)', () => {
    renderDialog({ kind: 'sourceQualifier' })
    expect(screen.getByText('selectDistinct')).toBeInTheDocument()
    expect(screen.getByText('Off')).toBeInTheDocument()
  })

  it('renders a string-list widget for aggregator.groupByFields (a required key)', () => {
    renderDialog({ kind: 'aggregator' })
    expect(screen.getByText('groupByFields')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('add…')).toBeInTheDocument()
  })
})

describe('NodeConfigDialog — name gate', () => {
  // Both tests wait for the debounced preview validate to SETTLE (the mock
  // default is zero errors) before asserting — otherwise `isValidating`
  // alone would keep Insert disabled during the debounce window regardless
  // of the name, and the assertion would pass for the wrong reason.
  it('disables Insert while the name is empty', async () => {
    renderDialog({ kind: 'filter' })
    await waitFor(() => expect(lastValidateBody).not.toBeNull(), { timeout: 2000 })

    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
  })

  it('disables Insert with a visible reason when the name duplicates an existing node', async () => {
    renderDialog({ kind: 'filter' })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'T' } })
    await waitFor(() => expect(lastValidateBody).not.toBeNull(), { timeout: 2000 })

    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
    expect(screen.getByText(/"T" is already used in this recipe/)).toBeInTheDocument()
  })
})

describe('NodeConfigDialog — connection picker', () => {
  it('lists only nodes the matrix permits, and renders forbidden ones disabled with a reason', () => {
    const draft: RecipeJson = {
      steps: [
        { target: { name: 'SRC1', type: 'table', fields: [] }, sources: [] },
        { target: { name: 'FLT1', type: 'filter', fields: [] }, sources: [] },
      ],
      table: { targetTableNames: ['SRC1', 'FLT1'], sourceTableNames: [] },
    }
    // Dialog kind 'sourceQualifier': only 'table' may feed it (per CONNECTIONS,
    // 'filter' is not in any mayFeed list that names 'sourceQualifier').
    renderDialog({ kind: 'sourceQualifier', draft })
    const fedBySection = within(screen.getByTestId('node-config-fedby'))

    const legal = fedBySection.getByRole('button', { name: /SRC1/ })
    const forbidden = fedBySection.getByRole('button', { name: /FLT1/ })

    expect(legal).not.toBeDisabled()
    expect(forbidden).toBeDisabled()
    expect(forbidden).toHaveAttribute('title', expect.stringContaining('filter'))
  })
})

describe('NodeConfigDialog — validation gate', () => {
  it('keeps Insert disabled while the previewed draft has validation errors', async () => {
    validateResponse = {
      valid: false,
      errors: [{ path: '$.steps[1]', message: 'orphan step' }],
      warnings: [],
      checks: [{ ruleId: 'IPC-FLW-003', severity: 'error', status: 'fail', path: '$.steps[1]', message: 'orphan step' }],
    }
    renderDialog({ kind: 'filter' })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'FLT2' } })

    await waitFor(() => expect(lastValidateBody).not.toBeNull(), { timeout: 2000 })
    await waitFor(() => expect(screen.getByText(/1 error/)).toBeInTheDocument(), { timeout: 2000 })

    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
  })

  it('onInsert fires with a draft containing the fully-formed step once the preview validates clean', async () => {
    validateResponse = { valid: true, errors: [], warnings: [], checks: [] }
    const { onInsert, onCancel } = renderDialog({ kind: 'filter' })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'FLT2' } })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Insert' })).not.toBeDisabled(), { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(onInsert).toHaveBeenCalledTimes(1)
    const [next] = onInsert.mock.calls[0] as [RecipeJson]
    const added = next.steps!.find(s => s.target?.name === 'FLT2')!
    expect(added.target!.type).toBe('filter')
    expect(added.target!.fields).toEqual([])
    expect(onCancel).not.toHaveBeenCalled()
  })
})

describe('NodeConfigDialog — cancel', () => {
  it('Cancel calls onCancel and never onInsert', () => {
    const { onCancel, onInsert } = renderDialog({ kind: 'filter' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('clicking the scrim cancels; clicking inside the panel does not', () => {
    const { onCancel } = renderDialog({ kind: 'filter' })
    fireEvent.click(screen.getByLabelText('Name'))
    expect(onCancel).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('node-config-scrim'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('pressing Escape cancels', () => {
    const { onCancel } = renderDialog({ kind: 'filter' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('NodeConfigDialog — focus', () => {
  it('focuses the name input on mount', () => {
    renderDialog({ kind: 'filter' })
    expect(document.activeElement).toBe(screen.getByLabelText('Name'))
  })
})
