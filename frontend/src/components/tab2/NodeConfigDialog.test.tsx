import { describe, expect, it, vi, beforeAll, afterEach, afterAll } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import type { RecipeJson } from '../../api/recipeAdapter'
import type { IpcConnections, IpcKeySpec } from '../../api/queries'
import type { Registry } from '../../api/registryQueries'
import { NodeConfigDialog, scalaTypeForDdlType } from './NodeConfigDialog'
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

// Task 15: a genuinely blank canvas — `ETLModifier`'s authoring-mode seed.
// Nothing has EVER been inserted: zero steps, zero source/target names.
const EMPTY_DRAFT: RecipeJson = {
  steps: [],
  table: { targetTableNames: [], sourceTableNames: [] },
}

let lastValidateBody: RecipeJson | null = null
let validateResponse: { valid: boolean; errors: { path: string; message: string }[]; warnings: { path: string; message: string }[]; checks: unknown[] } = {
  valid: true, errors: [], warnings: [], checks: [],
}
// Task 13: the registry picker's fixture — deliberately distinct source vs.
// target names so a test can prove the dialog asks RegistrySearch for the
// right kind rather than whichever list happens to render first.
//
// Task 16: `ddlTables` carries the three shapes the target-DDL offer must tell
// apart — one canonical definition (DWH_ORDERS_FACT), one definition that also
// shares a column name with an upstream step target (DWH_JOINED_FACT), and a
// genuinely DIVERGENT name whose two real files disagree (DWH_SPLIT_FACT: 3 and
// 2 columns, union 4 — the union is what must never be offered).
const REGISTRY_FIXTURE: Registry = {
  sourceTables: [{ name: 'STG_L_ORDERS', columns: [], usedByRecipes: ['STG/m_A/_ETL_m_A.json'], variants: [] }],
  targetTables: [{ name: 'DWH_ORDERS_FACT', columns: [], usedByRecipes: ['DWH/m_C/_ETL_m_C.json'], variants: [] }],
  ddlTables: [
    {
      name: 'DWH_ORDERS_FACT',
      columns: ['AMOUNT', 'LOADED_AT', 'ORDER_ID', 'PAYLOAD'],
      usedByRecipes: ['DWH/m_C/_ETL_m_C.json'],
      variants: [{
        columns: [
          { name: 'ORDER_ID', type: 'STRING' },
          { name: 'AMOUNT', type: 'NUMERIC' },
          { name: 'LOADED_AT', type: 'TIMESTAMP' },
          { name: 'PAYLOAD', type: 'ARRAY<STRING>' },
        ],
        mappingDirs: ['DWH/m_C'],
      }],
    },
    {
      name: 'DWH_JOINED_FACT',
      columns: ['A', 'Z'],
      usedByRecipes: ['DWH/m_J/_ETL_m_J.json'],
      variants: [{
        columns: [{ name: 'A', type: 'STRING' }, { name: 'Z', type: 'INT64' }],
        mappingDirs: ['DWH/m_J'],
      }],
    },
    {
      name: 'DWH_SPLIT_FACT',
      columns: ['A', 'B', 'C', 'D'],
      usedByRecipes: ['CDM/m_X/_ETL_m_X.json', 'ODS/m_Y/_ETL_m_Y.json'],
      variants: [
        {
          columns: [{ name: 'A', type: 'STRING' }, { name: 'B', type: 'NUMERIC' }, { name: 'C', type: 'INT64' }],
          mappingDirs: ['CDM/m_X'],
        },
        {
          columns: [{ name: 'A', type: 'STRING' }, { name: 'D', type: 'DATE' }],
          mappingDirs: ['ODS/m_Y', 'ODS/m_Z'],
        },
      ],
    },
  ],
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

// Final whole-branch review, BLOCKING 3. `IpcConnections.fanInVerdict` — the
// PowerCenter constraint pairwise `mayFeed` adjacency cannot express, which the
// user explicitly ruled in during planning ("add fan-in now") — had no
// production caller: only `IpcConnectionsContractTest` invoked it, and this
// picker read `mayFeed` alone. It is now asked over `POST /api/ipc/fan-in`
// (server-side, so the rule keeps ONE implementation) and rendered through the
// SAME disabled-candidate mechanism `mayFeed` already uses.
describe('NodeConfigDialog — fan-in verdicts (final review, BLOCKING 3)', () => {
  // Two ACTIVE upstreams (sourceQualifier, filter), each with an empty
  // `sources[]` of its own — so the only non-empty input group in play is the
  // one the NEW node is assembling in its "fed by" picker.
  const FANIN_DRAFT: RecipeJson = {
    steps: [
      { target: { name: 'SQ1', type: 'sourceQualifier', fields: [{ name: 'A', dataType: 'String' }] }, sources: [] },
      { target: { name: 'FLT1', type: 'filter', fields: [{ name: 'C', dataType: 'String' }] }, sources: [] },
    ],
    table: { targetTableNames: ['SQ1', 'FLT1'], sourceTableNames: [] },
  }

  let lastFanInBody: { pairings: { key: string; existingSourceKinds: string[]; candidateKind: string }[] } | null = null
  function serveFanIn(verdicts: Record<string, string>) {
    server.use(http.post('/api/ipc/fan-in', async ({ request }) => {
      lastFanInBody = await request.json() as typeof lastFanInBody
      return HttpResponse.json({ verdicts })
    }))
  }
  afterEach(() => { lastFanInBody = null })

  it('asks only about candidates joining a NON-EMPTY input group, and never asks about a candidate joining itself', async () => {
    serveFanIn({})
    renderDialog({ kind: 'aggregator', draft: FANIN_DRAFT })

    // Nothing selected yet: every candidate would join an EMPTY group, where
    // fan-in cannot be violated (both `block` conditions require a non-empty
    // existing group) — so there is nothing to ask.
    expect(lastFanInBody).toBeNull()

    fireEvent.click(within(screen.getByTestId('node-config-fedby')).getByRole('button', { name: 'SQ1 — sourceQualifier' }))

    await waitFor(() => expect(lastFanInBody).not.toBeNull(), { timeout: 2000 })
    // Exactly one question: may `filter` join a group already holding
    // `sourceQualifier`? SQ1 itself is excluded — removing it from its own
    // group leaves an empty one, which is trivially fine.
    expect(lastFanInBody!.pairings).toEqual([
      { key: 'fedBy:FLT1', existingSourceKinds: ['sourceQualifier'], candidateKind: 'filter' },
    ])
  })

  it('a block verdict disables the candidate and states the fan-in reason', async () => {
    serveFanIn({ 'fedBy:FLT1': 'block' })
    renderDialog({ kind: 'aggregator', draft: FANIN_DRAFT })
    const fedBy = within(screen.getByTestId('node-config-fedby'))
    fireEvent.click(fedBy.getByRole('button', { name: 'SQ1 — sourceQualifier' }))

    await waitFor(() => expect(fedBy.getByRole('button', { name: /FLT1/ })).toBeDisabled(), { timeout: 2000 })
    expect(fedBy.getByRole('button', { name: /FLT1/ })).toHaveAttribute('title', expect.stringMatching(/fan-in/i))
    // SQ1 stays clickable — but only VACUOUSLY here (residuals pass): SQ1's own
    // group is empty after self-exclusion, so it is never asked about and its
    // verdict is `undefined`, which no `blocked` expression could disable. The
    // escape hatch itself is pinned by the two tests below, where a SELECTED
    // candidate genuinely carries a `block`.
    expect(fedBy.getByRole('button', { name: 'SQ1 — sourceQualifier' })).not.toBeDisabled()
  })

  // Residuals pass (2026-08-03), finding 3. The escape hatch at
  // `NodeConfigDialog.tsx`'s `blocked` expressions (`&& !fedBy.includes(...)` /
  // `&& !feeds.includes(...)`) had no test that could fail: dropping BOTH
  // clauses left all 42 tests in this file green. It is reachable through a
  // verdict race — two selections land before the batched POST resolves, and
  // the answer then blocks one of them. Without the hatch the operator is
  // trapped: the only way out of an illegal group is to click the very
  // candidate that is now disabled.
  it('a SELECTED "fed by" candidate that turns out to be blocked stays clickable — the only way out of the group', async () => {
    // Answered only for SQ1, so FLT1 is never blocked and both clicks below land
    // on enabled buttons; SQ1's group ({filter}) becomes non-empty only once
    // FLT1 is also selected, which is exactly the race.
    serveFanIn({ 'fedBy:SQ1': 'block' })
    renderDialog({ kind: 'aggregator', draft: FANIN_DRAFT })
    const fedBy = within(screen.getByTestId('node-config-fedby'))

    // Both selections happen before any response can land.
    fireEvent.click(fedBy.getByRole('button', { name: 'SQ1 — sourceQualifier' }))
    fireEvent.click(fedBy.getByRole('button', { name: 'FLT1 — filter' }))

    await waitFor(
      () => expect(fedBy.getByRole('button', { name: 'SQ1 — sourceQualifier' }))
        .toHaveAttribute('title', expect.stringMatching(/fan-in/i)),
      { timeout: 2000 },
    )
    expect(fedBy.getByRole('button', { name: 'SQ1 — sourceQualifier' })).not.toBeDisabled()
    // ...and clicking it genuinely deselects, rather than being inert.
    fireEvent.click(fedBy.getByRole('button', { name: 'SQ1 — sourceQualifier' }))
    expect(screen.queryByText('From SQ1')).not.toBeInTheDocument()
  })

  it('a SELECTED "feeds" candidate that turns out to be blocked stays clickable too', async () => {
    // MINI's T already reads S (a `table`), so `feeds:T` is asked on mount with
    // a non-empty group — the click below lands before that answer does.
    serveFanIn({ 'feeds:T': 'block' })
    renderDialog({ kind: 'filter', draft: MINI })
    const feeds = within(screen.getByTestId('node-config-feeds'))

    fireEvent.click(feeds.getByRole('button', { name: 'T — table' }))

    await waitFor(
      () => expect(feeds.getByRole('button', { name: 'T — table' }))
        .toHaveAttribute('title', expect.stringMatching(/fan-in/i)),
      { timeout: 2000 },
    )
    expect(feeds.getByRole('button', { name: 'T — table' })).not.toBeDisabled()
  })

  // Residuals pass (2026-08-03), finding 2. `fanInWarned` did not filter on
  // `c.legal` while `fanInTitle` did, so a candidate that is BOTH illegal by
  // `mayFeed` and `warn` by fan-in rendered disabled with "filter may not feed
  // sourceQualifier" while the yellow banner simultaneously named it and said
  // "The link is allowed". Two mutually exclusive statements about one button.
  it('the fan-in warning banner never names a candidate the matrix has already forbidden', async () => {
    const draft: RecipeJson = {
      steps: [
        { target: { name: 'SRC1', type: 'table', fields: [{ name: 'A', dataType: 'String' }] }, sources: [] },
        { target: { name: 'SRC2', type: 'table', fields: [{ name: 'B', dataType: 'String' }] }, sources: [] },
        { target: { name: 'FLT1', type: 'filter', fields: [{ name: 'C', dataType: 'String' }] }, sources: [] },
      ],
      table: { targetTableNames: ['SRC1', 'SRC2', 'FLT1'], sourceTableNames: [] },
    }
    // Both candidates warn. SRC2 is a LEGAL upstream for a sourceQualifier
    // (`table.mayFeed` names it) and so belongs in the banner; FLT1 is not
    // (`filter.mayFeed` has no `sourceQualifier`) and must not appear.
    serveFanIn({ 'fedBy:SRC2': 'warn', 'fedBy:FLT1': 'warn' })
    renderDialog({ kind: 'sourceQualifier', draft })
    const fedBy = within(screen.getByTestId('node-config-fedby'))
    fireEvent.click(fedBy.getByRole('button', { name: 'SRC1 — table' }))

    const banner = await screen.findByTestId('node-config-fanin-warning', {}, { timeout: 2000 })
    expect(banner).toHaveTextContent(/SRC2/)
    expect(banner).not.toHaveTextContent(/FLT1/)
    // The contradiction this pins: FLT1 states the opposite on its own button.
    expect(fedBy.getByRole('button', { name: /FLT1/ })).toBeDisabled()
    expect(fedBy.getByRole('button', { name: /FLT1/ }))
      .toHaveAttribute('title', 'filter may not feed sourceQualifier')
    // ...and the same contradiction in VISUAL form: the warn-yellow border is
    // for candidates the banner speaks about, so an already-forbidden candidate
    // must not wear it either. SRC2 (legal + warn) proves the assertion is not
    // vacuous — it DOES wear it.
    expect(fedBy.getByRole('button', { name: /SRC2/ }).getAttribute('style')).toContain('--yellow')
    expect(fedBy.getByRole('button', { name: /FLT1/ }).getAttribute('style')).not.toContain('--yellow')
  })

  it('a warn verdict is surfaced without blocking — "cannot be determined" never refuses a link', async () => {
    serveFanIn({ 'fedBy:FLT1': 'warn' })
    renderDialog({ kind: 'aggregator', draft: FANIN_DRAFT })
    const fedBy = within(screen.getByTestId('node-config-fedby'))
    fireEvent.click(fedBy.getByRole('button', { name: 'SQ1 — sourceQualifier' }))

    await waitFor(
      () => expect(fedBy.getByRole('button', { name: /FLT1/ })).toHaveAttribute('title', expect.stringMatching(/fan-in/i)),
      { timeout: 2000 },
    )
    expect(fedBy.getByRole('button', { name: /FLT1/ })).not.toBeDisabled()
    // ...and it is legible, not title-only.
    expect(screen.getByTestId('node-config-fanin-warning')).toHaveTextContent(/FLT1/)
  })

  it('a failed fan-in request never blocks a candidate — refusing an unproven link is worse than permitting it', async () => {
    server.use(http.post('/api/ipc/fan-in', () => new HttpResponse(null, { status: 500 })))
    renderDialog({ kind: 'aggregator', draft: FANIN_DRAFT })
    const fedBy = within(screen.getByTestId('node-config-fedby'))
    fireEvent.click(fedBy.getByRole('button', { name: 'SQ1 — sourceQualifier' }))

    await waitFor(() => expect(screen.getByText(/error/)).toBeInTheDocument(), { timeout: 2000 })
    expect(fedBy.getByRole('button', { name: /FLT1/ })).not.toBeDisabled()
    expect(screen.queryByTestId('node-config-fanin-warning')).not.toBeInTheDocument()
  })

  it("a feeds candidate is judged against the DOWNSTREAM step's own existing sources", async () => {
    serveFanIn({})
    // T already reads S (a `table`), so a new node feeding T would make two
    // inputs — the fan-in question the "feeds" picker has to ask, with a
    // different existing group per candidate.
    renderDialog({ kind: 'filter', draft: MINI })

    await waitFor(() => expect(lastFanInBody).not.toBeNull(), { timeout: 2000 })
    expect(lastFanInBody!.pairings).toEqual([
      { key: 'feeds:T', existingSourceKinds: ['table'], candidateKind: 'filter' },
    ])
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

  // Final whole-branch review, BLOCKING 2: every OTHER test in this file
  // resolves `POST /api/recipes/validate`. On a REJECTED validate,
  // `useValidation` returns `{checks: [], errors: [], warnings: [],
  // isValidating: false, failed: true}` — so the colour/text ternaries here,
  // which never consulted `validation.failed`, deterministically took the
  // green branch and printed "0 errors · 0 warnings" while `canInsert`
  // (which DOES consult `failed`) held Insert disabled with no stated reason.
  // A green all-clear next to a dead button. Same class of bug the team
  // already fixed once for `ConformanceChip`; `ValidationState`'s javadoc
  // named only that one consumer.
  it('a REJECTED validate renders as an explicit failure, never as a green "0 errors · 0 warnings"', async () => {
    server.use(http.post('/api/recipes/validate', () => new HttpResponse(null, { status: 500 })))
    renderDialog({ kind: 'filter', draft: DRAFT_WITH_FIELDS })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'FLT2' } })
    selectSQ1AndMapFieldA()

    expect(await screen.findByText(/Conformance check failed to run/i, {}, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.queryByText(/0 errors · 0 warnings/)).not.toBeInTheDocument()
    // The disabled Insert now has a stated reason rather than being mute.
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
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

// Task 15: the empty-draft ordering problem. A blank canvas has zero steps, so
// EVERY existing-node picker (fed-by/feeds) is empty — no non-source kind can
// ever gather a mapped field (nothing upstream to map FROM), and source-table
// mode's OWN "at least one consuming step" gate (tested above, SOURCE_MODE_DRAFT)
// can't be satisfied either (nothing downstream to consume it yet). Nothing can
// be inserted first under that full gate. The break: a source table is the one
// kind that can legitimately exist with NO step referencing it (it lives in
// `table.sourceTableNames`, not `steps[]`), so source-table mode alone relaxes
// its "feeds required" gate AND the whole-recipe-validates-clean gate while the
// draft is still step-less — `{steps: []}` structurally cannot pass
// `IPC-STR-001` ("steps must be a non-empty array") no matter what gets
// inserted, so gating on it here would make the empty draft permanently stuck.
// This bypass is scoped to `isSourceTable && noStepsYet` only — SOURCE_MODE_DRAFT
// above already has two steps, so its own "keeps Insert disabled..." test is
// this fix's regression guard: a non-empty draft keeps today's gate intact.
describe('NodeConfigDialog — empty-draft accommodation (Task 15)', () => {
  it('a source table can insert with zero feeds on a genuinely empty draft, even while the whole-recipe validate call reports real errors', async () => {
    // Simulates the honest backend response for a `{steps: []}` draft
    // (IPC-STR-001) — proves the bypass is real, not just incidentally
    // passing because the mock defaults to `valid: true`.
    validateResponse = {
      valid: false,
      errors: [{ path: '$.steps', message: 'steps must be a non-empty array' }],
      warnings: [], checks: [],
    }
    renderDialog({ kind: SOURCE_TABLE_TYPE, draft: EMPTY_DRAFT })

    // Nothing to feed — genuinely nothing exists yet, not a stale render.
    expect(within(screen.getByTestId('node-config-feeds')).getByText('No existing nodes.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'NEWSRC' } })
    await waitFor(() => expect(lastValidateBody).not.toBeNull(), { timeout: 2000 })

    expect(screen.getByRole('button', { name: 'Insert' })).not.toBeDisabled()
  })

  it('a non-source kind still cannot be inserted first on an empty draft — nothing upstream to map fields from', () => {
    renderDialog({ kind: 'sourceQualifier', draft: EMPTY_DRAFT })

    expect(within(screen.getByTestId('node-config-fedby')).getByText('No existing nodes.')).toBeInTheDocument()
    expect(screen.queryByTestId('node-config-fieldmap')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'SQ_FIRST' } })
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
  })

  // Residuals pass (2026-08-03), finding 4. The failure banner's second clause
  // was unconditional, but `canInsert` short-circuits on
  // `bypassWholeRecipeValidation` — so this exact case (source table, blank
  // canvas, validate rejecting) printed "Insert stays disabled until it
  // succeeds" beside an ENABLED Insert. The sentence has to know about the
  // bypass the gate already knows about.
  it('the failed-validate banner does not claim Insert is disabled when the empty-draft bypass has already enabled it', async () => {
    server.use(http.post('/api/recipes/validate', () => new HttpResponse(null, { status: 500 })))
    renderDialog({ kind: SOURCE_TABLE_TYPE, draft: EMPTY_DRAFT })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'NEWSRC' } })

    expect(await screen.findByText(/Conformance check failed to run/i, {}, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Insert' })).not.toBeDisabled()
    expect(screen.queryByText(/Insert stays disabled/i)).not.toBeInTheDocument()
  })

  it('a bare source table with no consuming step yet still becomes a legal "fed by" candidate for the next node', () => {
    const draftAfterFirstInsert: RecipeJson = {
      steps: [],
      table: { targetTableNames: [], sourceTableNames: ['NEWSRC'] },
    }
    renderDialog({ kind: 'sourceQualifier', draft: draftAfterFirstInsert })

    const candidate = within(screen.getByTestId('node-config-fedby')).getByRole('button', { name: /NEWSRC/ })
    expect(candidate).not.toBeDisabled()
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

  // Task 16 amended this test's wrapper: a target-table dialog now consults the
  // registry itself (the DDL offer below), so `kind: 'table'` genuinely needs a
  // QueryClient in scope. The "no provider needed" guarantee still holds for
  // every kind that has no registry affordance — every `renderDialog` call in
  // the rest of this file (filter / sourceQualifier / source-table mode) proves
  // it, and the `filter` case is asserted directly above.
  it('free text stays allowed — typing a name directly works without ever opening the registry picker', () => {
    renderDialogWithQuery({ kind: 'table' })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'BRAND_NEW_TABLE' } })
    expect(screen.getByLabelText('Name')).toHaveValue('BRAND_NEW_TABLE')
  })
})

// ─── Task 16: the matching DDL's columns as a new target's authored fields ───
//
// 212 raw `<TABLE>.json` files collapse to 180 names; 25 recur and 11 of those
// carry genuinely different column sets across mapping dirs (verified against
// the live `GET /api/registry` — see the task report). `RegistryTableDto.columns`
// unions them, so for those 11 the list (and its count) matches no real file on
// disk — DWH_MAPLESHORE_MAPLEBARN_MEMBERS unions 110 and 99 columns into 116.
// The offer below is therefore driven by `variants[]` (one entry per DISTINCT
// column set, with the mapping dirs that carry it), never by `columns`: a single
// variant is adopted with no ceremony, a divergent name names the conflict and
// makes the operator choose, and whatever lands in `fields[]` is exactly one
// real file's columns.
describe('NodeConfigDialog — target DDL columns as fields (Task 16)', () => {
  it('maps every BigQuery type the corpus uses to a ScalaType, and anything else to Unknown', () => {
    expect(scalaTypeForDdlType('STRING')).toBe('String')
    expect(scalaTypeForDdlType('NUMERIC')).toBe('BigDecimal')
    expect(scalaTypeForDdlType('BIGNUMERIC')).toBe('BigDecimal')
    expect(scalaTypeForDdlType('INT64')).toBe('Long')
    expect(scalaTypeForDdlType('TIMESTAMP')).toBe('Timestamp')
    expect(scalaTypeForDdlType('DATETIME')).toBe('LocalDateTime')
    expect(scalaTypeForDdlType('DATE')).toBe('LocalDate')
    expect(scalaTypeForDdlType('BOOL')).toBe('Boolean')
    // Unknown is itself a legal ScalaType (ScalaType.scala:7) and passes
    // IPC-STR-008 — an unrecognized type never produces an invalid recipe.
    expect(scalaTypeForDdlType('ARRAY<STRING>')).toBe('Unknown')
    expect(scalaTypeForDdlType('')).toBe('Unknown')
    expect(scalaTypeForDdlType(undefined)).toBe('Unknown')
  })

  it('a single matching DDL definition offers its columns; adopting them fields the step with DDL types mapped to ScalaType', async () => {
    const { onInsert } = renderDialogWithQuery({ kind: 'table', draft: DRAFT_WITH_FIELDS })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'DWH_ORDERS_FACT' } })

    const offer = await screen.findByTestId('node-config-targetddl')
    expect(within(offer).getByText(/1 DDL definition/i)).toBeInTheDocument()

    fireEvent.click(within(offer).getByRole('button', { name: /Use 4 columns/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Insert' })).not.toBeDisabled(), { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))

    const [next] = onInsert.mock.calls[0] as [RecipeJson]
    const added = next.steps!.find(s => s.target?.name === 'DWH_ORDERS_FACT')!
    expect(added.target!.fields).toEqual([
      { name: 'ORDER_ID', dataType: 'String' },
      { name: 'AMOUNT', dataType: 'BigDecimal' },
      { name: 'LOADED_AT', dataType: 'Timestamp' },
      { name: 'PAYLOAD', dataType: 'Unknown' },
    ])
  })

  it('declining the offer leaves fields: [] — nothing is adopted implicitly', async () => {
    renderDialogWithQuery({ kind: 'table', draft: DRAFT_WITH_FIELDS })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'DWH_ORDERS_FACT' } })

    await screen.findByTestId('node-config-targetddl')

    expect(screen.getByText(/"fields": \[\]/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
  })

  it('a name matching no DDL offers nothing and shows no error', async () => {
    renderDialogWithQuery({ kind: 'table', draft: DRAFT_WITH_FIELDS })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'BRAND_NEW_TABLE' } })

    // The registry query has settled (a matching name would have rendered by now).
    await waitFor(() => expect(screen.getByText(/error/)).toBeInTheDocument(), { timeout: 2000 })
    expect(screen.queryByTestId('node-config-targetddl')).not.toBeInTheDocument()
    expect(screen.queryByText(/DDL/)).not.toBeInTheDocument()
    // ...and the healthy-registry no-match state says nothing about a failure.
    expect(screen.queryByTestId('node-config-targetddl-unavailable')).not.toBeInTheDocument()
  })

  // Final whole-branch review, BLOCKING 2 (second half): `TargetDdlOffer`
  // destructured only `data`, so a FAILED `GET /api/registry` produced
  // `variants.length === 0` -> `return null` — byte-identical to the genuine
  // no-match state directly above, which this component's own doc comment
  // documents as explicitly NOT an error ("the normal case for a table being
  // authored for the first time"). An operator authoring a target that DOES
  // already exist in the corpus would be told, silently, that it is new.
  it('a FAILED registry fetch is distinguishable from a genuine no-match', async () => {
    server.use(http.get('/api/registry', () => new HttpResponse(null, { status: 500 })))
    renderDialogWithQuery({ kind: 'table', draft: DRAFT_WITH_FIELDS })
    // A name that DOES exist in the corpus fixture — with a healthy registry
    // this would render the one-variant offer; the failure must not silently
    // present it as "no match".
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'DWH_ORDERS_FACT' } })

    const note = await screen.findByTestId('node-config-targetddl-unavailable', {}, { timeout: 2000 })
    expect(note).toHaveTextContent(/could not be checked/i)
    expect(screen.queryByTestId('node-config-targetddl')).not.toBeInTheDocument()
  })

  it('a divergent name never offers the union — it names the conflict and requires a choice', async () => {
    renderDialogWithQuery({ kind: 'table', draft: DRAFT_WITH_FIELDS })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'DWH_SPLIT_FACT' } })

    const offer = await screen.findByTestId('node-config-targetddl')
    expect(within(offer).getByText(/2 conflicting DDL definitions/i)).toBeInTheDocument()
    // The union is 4 columns (A, B, C, D) and matches neither real file — it may
    // never be offered, nor counted, as if it were this table's definition.
    expect(within(offer).queryByText(/4 columns/)).not.toBeInTheDocument()
    expect(within(offer).getByRole('button', { name: /Use 3 columns/ })).toBeInTheDocument()
    expect(within(offer).getByRole('button', { name: /Use 2 columns/ })).toBeInTheDocument()
    // Provenance, not just counts — two variants can carry the SAME count
    // (CAS_ODS_EVENTS is 4 and 4 in the real corpus).
    expect(within(offer).getByText(/ODS\/m_Y/)).toBeInTheDocument()
    expect(within(offer).getByText(/ODS\/m_Z/)).toBeInTheDocument()

    // Nothing is adopted until the operator picks one.
    expect(screen.getByText(/"fields": \[\]/)).toBeInTheDocument()
  })

  it('choosing one variant fields the step with exactly that variant\'s columns', async () => {
    const { onInsert } = renderDialogWithQuery({ kind: 'table', draft: DRAFT_WITH_FIELDS })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'DWH_SPLIT_FACT' } })

    const offer = await screen.findByTestId('node-config-targetddl')
    fireEvent.click(within(offer).getByRole('button', { name: /Use 2 columns/ }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Insert' })).not.toBeDisabled(), { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))

    const [next] = onInsert.mock.calls[0] as [RecipeJson]
    const added = next.steps!.find(s => s.target?.name === 'DWH_SPLIT_FACT')!
    expect(added.target!.fields).toEqual([
      { name: 'A', dataType: 'String' },
      { name: 'D', dataType: 'LocalDate' },
    ])
  })

  it('adopted columns coexist with upstream-mapped fields and never duplicate a mapped name', async () => {
    const { onInsert } = renderDialogWithQuery({ kind: 'table', draft: DRAFT_WITH_FIELDS })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'DWH_JOINED_FACT' } })
    selectSQ1AndMapFieldA()

    const offer = await screen.findByTestId('node-config-targetddl')
    fireEvent.click(within(offer).getByRole('button', { name: /Use 2 columns/ }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Insert' })).not.toBeDisabled(), { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))

    const [next] = onInsert.mock.calls[0] as [RecipeJson]
    const added = next.steps!.find(s => s.target?.name === 'DWH_JOINED_FACT')!
    // "A" keeps the upstream mapping the operator authored (a DDL column never
    // overwrites it); "Z" is adopted unmapped — the DDL knows the column, not
    // where its data comes from.
    expect(added.target!.fields).toEqual([
      { name: 'A', dataType: 'String', transformation: { source: 'SQ1.A' } },
      { name: 'Z', dataType: 'Long' },
    ])
  })
})
