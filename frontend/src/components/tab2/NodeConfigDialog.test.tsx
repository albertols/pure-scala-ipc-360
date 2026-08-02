import { describe, expect, it, vi, beforeAll, afterEach, afterAll } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import type { RecipeJson } from '../../api/recipeAdapter'
import type { IpcConnections, IpcKeySpec } from '../../api/queries'
import type { Registry } from '../../api/registryQueries'
import { NodeConfigDialog } from './NodeConfigDialog'
import { SOURCE_TABLE_TYPE } from './Palette'

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
  // Task 11: a source table's schema is `source:table`, not `target:table` — no
  // `fields` key at all (a bare `sources[]` entry carries no field list).
  'source:table': [
    { key: 'name', parserType: 'String', required: true, widget: 'text' },
    { key: 'type', parserType: 'String', required: true, widget: 'text' },
    { key: 'primaryKeys', parserType: 'List[String]', required: false, widget: 'stringList' },
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

// A draft carrying an upstream step target with real, named fields — used for
// the "map fields" tests (fix round 1) so a step-target-derived field list
// has something to offer.
const DRAFT_WITH_FIELDS: RecipeJson = {
  steps: [
    {
      target: {
        name: 'SQ1', type: 'sourceQualifier',
        fields: [{ name: 'A', dataType: 'String' }, { name: 'B', dataType: 'Long' }],
      },
      sources: [],
    },
  ],
  table: { targetTableNames: [], sourceTableNames: [] },
}

// Task 11: a draft with two consuming-step CANDIDATES for a source table's
// "feeds" picker — SQ1 (sourceQualifier, a legal consumer per CONNECTIONS'
// `table.mayFeed`) and FLT1 (filter, not in that list — the forbidden case).
const SOURCE_MODE_DRAFT: RecipeJson = {
  steps: [
    { target: { name: 'SQ1', type: 'sourceQualifier', fields: [{ name: 'A', dataType: 'String' }] }, sources: [] },
    { target: { name: 'FLT1', type: 'filter', fields: [] }, sources: [] },
  ],
  table: { targetTableNames: ['SQ1', 'FLT1'], sourceTableNames: [] },
}

let lastValidateBody: RecipeJson | null = null
let validateResponse: { valid: boolean; errors: { path: string; message: string }[]; warnings: { path: string; message: string }[]; checks: unknown[] } = {
  valid: true, errors: [], warnings: [], checks: [],
}
// Task 13: the registry picker's fixture — deliberately distinct source vs.
// target names so a test can prove the dialog asks RegistrySearch for the
// right kind rather than whichever list happens to render first.
const REGISTRY_FIXTURE: Registry = {
  sourceTables: [{ name: 'STG_L_ORDERS', columns: [], usedByRecipes: ['STG/m_A/_ETL_m_A.json'] }],
  targetTables: [{ name: 'DWH_ORDERS_FACT', columns: [], usedByRecipes: ['DWH/m_C/_ETL_m_C.json'] }],
  ddlTables: [],
  layers: [],
}
let registryResponse: Registry = REGISTRY_FIXTURE
const server = setupServer(
  http.post('/api/recipes/validate', async ({ request }) => {
    lastValidateBody = (await request.json()) as RecipeJson
    return HttpResponse.json(validateResponse)
  }),
  http.get('/api/registry', () => HttpResponse.json(registryResponse)),
)
beforeAll(() => server.listen())
afterEach(() => {
  server.resetHandlers()
  lastValidateBody = null
  validateResponse = { valid: true, errors: [], warnings: [], checks: [] }
  registryResponse = REGISTRY_FIXTURE
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

/** Same render as `renderDialog`, but wrapped in a `QueryClientProvider` —
 * needed only by the registry-picker tests (Task 13), since `RegistrySearch`
 * calls `useRegistry()` (a TanStack query) once mounted. Every other
 * `renderDialog` call in this file deliberately has NO provider: the "Pick
 * from registry" affordance must stay unmounted until clicked, or every
 * existing test in this file (none of which supply a QueryClient) would
 * throw the instant the dialog renders. */
function renderDialogWithQuery(overrides: {
  kind: string
  draft?: RecipeJson
  keySchema?: Record<string, IpcKeySpec[]>
  connections?: IpcConnections
}) {
  const onCancel = vi.fn()
  const onInsert = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={client}>
      <NodeConfigDialog
        kind={overrides.kind}
        draft={overrides.draft ?? MINI}
        keySchema={overrides.keySchema ?? KEY_SCHEMA}
        connections={overrides.connections ?? CONNECTIONS}
        onCancel={onCancel}
        onInsert={onInsert}
      />
    </QueryClientProvider>,
  )
  return { ...utils, onCancel, onInsert }
}

/** Selects 'SQ1' as a "fed by" candidate and maps its field 'A' — the minimal
 * "would otherwise be valid" baseline several gate-isolation tests build on
 * top of (name-gate tests still need this so the NEW mapped-field gate,
 * fix round 1, doesn't confound the condition each test means to isolate). */
function selectSQ1AndMapFieldA() {
  fireEvent.click(within(screen.getByTestId('node-config-fedby')).getByRole('button', { name: 'SQ1 — sourceQualifier' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'A' }))
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
  // Both tests select a fed-by node AND map one of its fields (the fix-round-1
  // gate, see below) before asserting, then wait for the debounced preview
  // validate to SETTLE (the mock default is zero errors) — otherwise EITHER
  // `isValidating` OR the empty-mapped-fields gate would keep Insert disabled
  // regardless of the name, and the assertion would pass for the wrong reason.
  it('disables Insert while the name is empty', async () => {
    renderDialog({ kind: 'filter', draft: DRAFT_WITH_FIELDS })
    selectSQ1AndMapFieldA()
    await waitFor(() => expect(lastValidateBody).not.toBeNull(), { timeout: 2000 })

    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
  })

  it('disables Insert with a visible reason when the name duplicates an existing node', async () => {
    renderDialog({ kind: 'filter', draft: DRAFT_WITH_FIELDS })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'SQ1' } })
    selectSQ1AndMapFieldA()
    await waitFor(() => expect(lastValidateBody).not.toBeNull(), { timeout: 2000 })

    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
    expect(screen.getByText(/"SQ1" is already used in this recipe/)).toBeInTheDocument()
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

// Fix round 1 (task-10-report.md): IPC-FLW-003 ("no orphan step") reads
// outbound dot-refs off FIELD FORMULAS, not sources[] membership. A
// `fields: []` step always failed it regardless of connections, so Insert
// could never enable — the reviewer proved this with a JUnit probe against
// the real IpcRuleEngine, for both a zero-connection AND a fully-connected
// step. These tests cover the honest replacement: mapping at least one field
// from a selected "fed by" node is what makes a step genuinely connected.
describe('NodeConfigDialog — map fields', () => {
  it("offers a step-target upstream's own fields with dataType; checking one adds it to the preview's fields[]", () => {
    renderDialog({ kind: 'filter', draft: DRAFT_WITH_FIELDS })
    fireEvent.click(within(screen.getByTestId('node-config-fedby')).getByRole('button', { name: 'SQ1 — sourceQualifier' }))

    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('(String)')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('(Long)')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'A' }))

    expect(screen.getByText(/"source": "SQ1\.A"/)).toBeInTheDocument()
  })

  it('mapped field name and dataType default to the upstream field\'s own and stay editable', () => {
    renderDialog({ kind: 'filter', draft: DRAFT_WITH_FIELDS })
    fireEvent.click(within(screen.getByTestId('node-config-fedby')).getByRole('button', { name: 'SQ1 — sourceQualifier' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'A' }))

    expect(screen.getByDisplayValue('A')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('A mapped field name'), { target: { value: 'A_RENAMED' } })

    expect(screen.getByText(/"name": "A_RENAMED"/)).toBeInTheDocument()
    expect(screen.getByText(/"source": "SQ1\.A"/)).toBeInTheDocument()
  })

  it('an upstream step target with no fields yet shows an honest empty state, not a fabricated field', () => {
    renderDialog({ kind: 'sourceQualifier', draft: MINI })
    fireEvent.click(within(screen.getByTestId('node-config-fedby')).getByRole('button', { name: 'T — table' }))

    expect(screen.getByText('No fields on this node yet.')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('an upstream with no step target (a bare table source) offers free-text entry, never a fabricated name', () => {
    renderDialog({ kind: 'sourceQualifier', draft: MINI })
    fireEvent.click(within(screen.getByTestId('node-config-fedby')).getByRole('button', { name: 'S — table' }))

    // No field list exists to enumerate — nothing is invented.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    const addInput = screen.getByPlaceholderText('add…')
    fireEvent.change(addInput, { target: { value: 'CUSTOM_COL' } })
    fireEvent.click(screen.getByText('+ add'))

    expect(screen.getByText(/"source": "S\.CUSTOM_COL"/)).toBeInTheDocument()
  })

  it('keeps Insert disabled when no field is mapped, even with a valid unique name and a legal connection', async () => {
    validateResponse = { valid: true, errors: [], warnings: [], checks: [] }
    renderDialog({ kind: 'filter', draft: DRAFT_WITH_FIELDS })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'FLT2' } })
    fireEvent.click(within(screen.getByTestId('node-config-fedby')).getByRole('button', { name: 'SQ1 — sourceQualifier' }))

    await waitFor(() => expect(lastValidateBody).not.toBeNull(), { timeout: 2000 })

    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
  })
})

describe('NodeConfigDialog — validation gate', () => {
  it('keeps Insert disabled on a realistic IPC-FLW-003 orphan-step error even though the name, connection and a mapped field are otherwise satisfied', async () => {
    validateResponse = {
      valid: false,
      errors: [{ path: '$.steps[1]', message: 'step "FLT2" has no outbound reference' }],
      warnings: [],
      checks: [{
        ruleId: 'IPC-FLW-003', severity: 'error', status: 'fail', path: '$.steps[1]',
        message: 'step "FLT2" has no outbound reference',
      }],
    }
    renderDialog({ kind: 'filter', draft: DRAFT_WITH_FIELDS })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'FLT2' } })
    selectSQ1AndMapFieldA()

    await waitFor(() => expect(screen.getByText(/1 error/)).toBeInTheDocument(), { timeout: 2000 })

    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
  })

  it('onInsert fires with a draft containing the fully-formed, field-mapped step once the preview validates clean', async () => {
    validateResponse = { valid: true, errors: [], warnings: [], checks: [] }
    const { onInsert, onCancel } = renderDialog({ kind: 'filter', draft: DRAFT_WITH_FIELDS })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'FLT2' } })
    selectSQ1AndMapFieldA()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Insert' })).not.toBeDisabled(), { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(onInsert).toHaveBeenCalledTimes(1)
    const [next] = onInsert.mock.calls[0] as [RecipeJson]
    const added = next.steps!.find(s => s.target?.name === 'FLT2')!
    expect(added.target!.type).toBe('filter')
    expect(added.target!.fields).toEqual([{ name: 'A', dataType: 'String', transformation: { source: 'SQ1.A' } }])
    expect(added.sources).toEqual([{ name: 'SQ1', type: 'sourceQualifier' }])
    expect(onCancel).not.toHaveBeenCalled()
  })
})

// Task 11 design ruling: a source table is a ROOT (reads a physical table, no
// upstream of its own) and structurally isn't even a step — the dialog switches
// into a distinct MODE for the palette's SOURCE_TABLE_TYPE sentinel: no "fed
// by", no "map fields"; "feeds" instead asks which EXISTING step consumes the
// table, required non-empty, and commits via `insertSourceTable` — a
// `sources[]` entry on the chosen step(s) plus `table.sourceTableNames`, never
// a new `steps[]` entry (the shape `buildStep`/`insertConfiguredStep` produce
// for every other kind).
describe('NodeConfigDialog — source-table mode (Task 11)', () => {
  it('renders the source:table schema (primaryKeys), never target:table\'s name/type/fields widgets', () => {
    renderDialog({ kind: SOURCE_TABLE_TYPE, draft: SOURCE_MODE_DRAFT })
    expect(screen.getByText('Add source table')).toBeInTheDocument()
    expect(screen.getByText('primaryKeys')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('add…')).toBeInTheDocument()
  })

  it('has no "fed by" or "map fields" section at all — a source table is a root with no upstream', () => {
    renderDialog({ kind: SOURCE_TABLE_TYPE, draft: SOURCE_MODE_DRAFT })
    expect(screen.queryByTestId('node-config-fedby')).not.toBeInTheDocument()
    expect(screen.queryByTestId('node-config-fieldmap')).not.toBeInTheDocument()
  })

  it('"feeds" lists only nodes the matrix permits, and renders forbidden ones disabled with a reason', () => {
    renderDialog({ kind: SOURCE_TABLE_TYPE, draft: SOURCE_MODE_DRAFT })
    const feedsSection = within(screen.getByTestId('node-config-feeds'))

    const legal = feedsSection.getByRole('button', { name: /SQ1/ })
    const forbidden = feedsSection.getByRole('button', { name: /FLT1/ })

    expect(legal).not.toBeDisabled()
    expect(forbidden).toBeDisabled()
    expect(forbidden).toHaveAttribute('title', expect.stringContaining('table may not feed filter'))
  })

  it('keeps Insert disabled until at least one consuming step is selected — no mapped field required at all', async () => {
    renderDialog({ kind: SOURCE_TABLE_TYPE, draft: SOURCE_MODE_DRAFT })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'NEWSRC' } })
    // Wait for the preview validate to SETTLE before asserting — otherwise
    // `isValidating` alone would keep Insert disabled and this assertion would
    // pass for the wrong reason, masking whether the "at least one feeds"
    // gate itself is doing any work.
    await waitFor(() => expect(lastValidateBody).not.toBeNull(), { timeout: 2000 })

    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()

    fireEvent.click(within(screen.getByTestId('node-config-feeds')).getByRole('button', { name: /SQ1/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Insert' })).not.toBeDisabled(), { timeout: 2000 })
  })

  it('onInsert commits via insertSourceTable: appends to the chosen step\'s sources[] and table.sourceTableNames, never a new step', async () => {
    const { onInsert } = renderDialog({ kind: SOURCE_TABLE_TYPE, draft: SOURCE_MODE_DRAFT })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'NEWSRC' } })
    fireEvent.click(within(screen.getByTestId('node-config-feeds')).getByRole('button', { name: /SQ1/ }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Insert' })).not.toBeDisabled(), { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(onInsert).toHaveBeenCalledTimes(1)
    const [next] = onInsert.mock.calls[0] as [RecipeJson]
    // Same step count as the input draft — a source table never appends to steps[].
    expect(next.steps).toHaveLength(SOURCE_MODE_DRAFT.steps!.length)
    const consumer = next.steps!.find(s => s.target?.name === 'SQ1')!
    // primaryKeys: [] rides along too — the Properties section's own
    // stringList default (defaultPropValue), spread in via `...props` same as
    // every other kind's schema-driven properties.
    expect(consumer.sources).toEqual([{ name: 'NEWSRC', type: 'table', primaryKeys: [] }])
    expect(next.table!.sourceTableNames).toContain('NEWSRC')
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

// Task 13: the Name field gains a "pick from registry" affordance — but only
// for the two kinds whose `name` IS a physical table name (a target table
// step, and source-table mode). Every other kind's `name` is a transformation
// instance ("FLT2", "AGG1", …), which the registry (Task 12) never indexes,
// so the affordance would offer nothing honest to pick from.
describe('NodeConfigDialog — registry picker (Task 13)', () => {
  it('kind "table" (target table) shows the affordance; picking a row fills Name from targetTables', async () => {
    renderDialogWithQuery({ kind: 'table' })

    fireEvent.click(screen.getByRole('button', { name: /pick from registry/i }))
    await waitFor(() => expect(screen.getByText('DWH_ORDERS_FACT')).toBeInTheDocument())
    // sourceTables entries must not leak into the target picker.
    expect(screen.queryByText('STG_L_ORDERS')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('DWH_ORDERS_FACT'))
    expect(screen.getByLabelText('Name')).toHaveValue('DWH_ORDERS_FACT')
  })

  it('source-table mode picks from sourceTables, not targetTables', async () => {
    renderDialogWithQuery({ kind: SOURCE_TABLE_TYPE, draft: SOURCE_MODE_DRAFT })

    fireEvent.click(screen.getByRole('button', { name: /pick from registry/i }))
    await waitFor(() => expect(screen.getByText('STG_L_ORDERS')).toBeInTheDocument())
    expect(screen.queryByText('DWH_ORDERS_FACT')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('STG_L_ORDERS'))
    expect(screen.getByLabelText('Name')).toHaveValue('STG_L_ORDERS')
  })

  it('a non-table kind (e.g. filter) has no registry affordance at all', () => {
    renderDialogWithQuery({ kind: 'filter' })
    expect(screen.queryByRole('button', { name: /pick from registry/i })).not.toBeInTheDocument()
  })

  it('free text stays allowed — typing a name directly works without ever opening the registry picker (and without a QueryClient in scope)', () => {
    renderDialog({ kind: 'table' })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'BRAND_NEW_TABLE' } })
    expect(screen.getByLabelText('Name')).toHaveValue('BRAND_NEW_TABLE')
  })
})
