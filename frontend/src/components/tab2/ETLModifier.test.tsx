import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { ETLModifier } from './ETLModifier'
import { LAYOUT_DEFAULT } from './useResizableLayout'

// MINI = Task-5's field-less-source recipe literal (recipeAdapter.test.ts
// "field-less source entry gets a single node-center edge") plus one field
// carrying a dot-ref transformation, so the recipe exercises both a
// node-center edge AND a real field-level dot-ref (verbatim in raw JSON).
const MINI = {
  steps: [
    {
      target: {
        name: 'T', type: 'table',
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

// Task 14: a sibling native XML export (and a non-recipe .json, e.g. a
// generated DDL file) alongside the recipe — the Explorer's fileFilter must
// keep only `_ETL_*.json` entries, so both siblings are exercised here.
const TREE = {
  name: 'xmltobq', path: '', kind: 'dir', layer: 'root',
  children: [
    {
      name: 'CDM', path: 'CDM', kind: 'dir', layer: 'CDM',
      children: [
        { name: '_ETL_m_FIX.json', path: 'CDM/m_FIX/_ETL_m_FIX.json', kind: 'json' },
        { name: 'm_FIX.xml', path: 'CDM/m_FIX/m_FIX.xml', kind: 'xml' },
        { name: 'BIZLINK.json', path: 'CDM/m_FIX/BIZLINK.json', kind: 'json' },
      ],
    },
  ],
}

// Task 12: a slice of the real backend/src/main/resources/ipc/ipc-rules.json
// keySchema covering exactly the kinds this suite's fixtures use (target:table —
// MINI's "T" and every palette-added node; target:sourceQualifier — the
// click-wire/delete fixtures' "S" step target; source:table — MINI's own "S"
// sources[] entry). The Inspector takes keySchema as a prop rather than fetching
// it itself, but ETLModifier.tsx DOES call useIpcRules() to produce that prop, so
// this suite needs a real handler — without one, keySchema stays `{}` and the
// Inspector renders nothing (no field table, no properties).
const IPC_RULES = {
  rules: [],
  typeAliases: {},
  keyAliases: {},
  keySchema: {
    'target:table': [
      { key: 'name', parserType: 'String', required: true, widget: 'text' },
      { key: 'type', parserType: 'String', required: true, widget: 'text' },
      { key: 'fields', parserType: 'List[Field]', required: true, widget: 'fieldTable' },
      { key: 'primaryKeys', parserType: 'List[String]', required: false, widget: 'stringList' },
      { key: 'updateOverride', parserType: 'Option[String]', required: false, widget: 'textarea' },
    ],
    'target:sourceQualifier': [
      { key: 'name', parserType: 'String', required: true, widget: 'text' },
      { key: 'type', parserType: 'String', required: true, widget: 'text' },
      { key: 'fields', parserType: 'List[Field]', required: true, widget: 'fieldTable' },
      { key: 'selectDistinct', parserType: 'Boolean', required: true, widget: 'toggle', ruleId: 'IPC-TYP-SOURCEQUALIFIER-001' },
      { key: 'sourceFilter', parserType: 'Option[String]', required: false, widget: 'textarea' },
      { key: 'sqlQuery', parserType: 'Option[String]', required: false, widget: 'textarea' },
      { key: 'userDefinedJoin', parserType: 'Option[String]', required: false, widget: 'textarea' },
    ],
    'source:table': [
      { key: 'name', parserType: 'String', required: true, widget: 'text' },
      { key: 'type', parserType: 'String', required: true, widget: 'text' },
      { key: 'primaryKeys', parserType: 'List[String]', required: false, widget: 'stringList' },
    ],
  },
  // Task 11: a slice of the real ipc-rules.json connections map — only the
  // pairwise legality NodeConfigDialog's fed-by/feeds pickers exercise below
  // (table -> table/sourceQualifier, sourceQualifier -> table).
  connections: {
    table: { mayFeed: ['sourceQualifier', 'table', 'normalizer'] },
    sourceQualifier: {
      mayFeed: ['table', 'unionInput', 'filter', 'joinerInput', 'aggregator', 'router', 'normalizer', 'java', 'storedProcedure'],
      active: true,
    },
  },
}

// Task 16: static corpus counts for the Explorer footer's corpus summary.
const SUMMARY = { xmlCount: 81, recipeCount: 86, ddlCount: 212, dirCount: 119, layers: ['CDM', 'DWH', 'ETL', 'ODS', 'OUTPUT', 'QDM', 'RDM', 'STG'] }

// Task 15: the "New recipe" dialog's own layer picker — deliberately carries
// a layer ('ZTESTLAYER') found NOWHERE in SUMMARY.layers, so a test asserting
// on it proves the dialog is genuinely reading `GET /api/registry` (Task 13)
// rather than incidentally rendering an overlapping list from elsewhere.
const REGISTRY = { sourceTables: [], targetTables: [], ddlTables: [], layers: ['CDM', 'ZTESTLAYER'] }

const server = setupServer(
  http.get('/api/tree', () => HttpResponse.json(TREE)),
  http.get('/api/summary', () => HttpResponse.json(SUMMARY)),
  http.get('/api/recipes/CDM/m_FIX/_ETL_m_FIX.json', () => HttpResponse.json({
    path: 'CDM/m_FIX/_ETL_m_FIX.json',
    fileName: '_ETL_m_FIX.json',
    sizeBytes: 321,
    modifiedAt: '2026-07-31T00:00:00Z',
    content: MINI,
  })),
  http.get('/api/ddl/CDM/m_FIX', () => HttpResponse.json({})),
  http.post('/api/recipes/validate', () => HttpResponse.json({ valid: true, errors: [] })),
  http.get('/api/expressions', () => HttpResponse.json([])),
  http.get('/api/ipc/rules', () => HttpResponse.json(IPC_RULES)),
  // Task 10: unsaved-layout default (`{version:1,nodes:{}}` never 404s) — every
  // suite above this one renders the canvas, so this default keeps them
  // green without knowing about the layout sidecar at all.
  http.get('/api/layouts/CDM/m_FIX/_ETL_m_FIX.json', () => HttpResponse.json({ version: 1, nodes: {} })),
  http.get('/api/registry', () => HttpResponse.json(REGISTRY)),
)
beforeAll(() => server.listen())
afterEach(() => { server.resetHandlers(); cleanup() })
afterAll(() => server.close())

function renderModifier(searchQuery = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ETLModifier searchQuery={searchQuery} />
    </QueryClientProvider>,
  )
}

/** Loads the recipe and selects the target node T (MINI's single step target,
 * fields A={value:'1'} / B={source:'S.B'}) — the shared setup for every editing test. */
async function loadAndSelectT() {
  renderModifier()
  fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
  fireEvent.click(await screen.findByText('T', { selector: 'text' }))
  // Field A's formula textarea, seeded with renderFormula({value:'1'}) === '1'.
  return screen.findByDisplayValue('1')
}

describe('ETLModifier — real recipes on the shared canvas', () => {
  it('shows the empty hint, then renders the real recipe canvas after selecting an _ETL_*.json file', async () => {
    renderModifier()

    expect(await screen.findByText('Select an _ETL_*.json recipe to edit')).toBeInTheDocument()

    const file = await screen.findByText('_ETL_m_FIX.json')
    fireEvent.click(file)

    // { selector: 'text' } excludes NodeBox's nested <title> a11y element.
    const targetName = await screen.findByText('T', { selector: 'text' })
    expect(targetName).toBeInTheDocument()

    // Toolbar identity: fileName as title (also still present in the tree).
    expect(screen.getAllByText('_ETL_m_FIX.json').length).toBeGreaterThanOrEqual(2)

    // Source / Target lists (Task 4: moved into the drawer, not the page body)
    // don't render their table names until their own tab is opened.
    expect(screen.queryByText('S', { selector: 'span' })).not.toBeInTheDocument()

    // Raw JSON — and the Path / Size bytes / Modified metadata that now lives
    // inside its panel (Task 4 moved it out of the always-visible header card,
    // spec §5.2) — is not shown until toggled.
    expect(screen.queryByText('S.B')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('CDM/m_FIX/_ETL_m_FIX.json')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('{ raw JSON }'))
    expect(await screen.findByText(/S\.B/)).toBeInTheDocument()

    // RecipeDto metadata (Path / Size bytes / Modified) as read-only fields,
    // now inside the { raw JSON } panel (Task 4).
    expect(screen.getByDisplayValue('CDM/m_FIX/_ETL_m_FIX.json')).toBeInTheDocument()
    expect(screen.getByDisplayValue('321')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2026-07-31T00:00:00Z')).toBeInTheDocument()

    // Source / Target lists driven from table.sourceTableNames/targetTableNames
    // — still real values once their drawer tab is opened (Task 4 re-target of
    // the original "Source / Target lists" assertion, which used to be visible
    // inline with no tab to open at all).
    fireEvent.click(screen.getByRole('button', { name: /^Source$/ }))
    expect(screen.getByText('S', { selector: 'span' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Target$/ }))
    expect(screen.queryByText('S', { selector: 'span' })).not.toBeInTheDocument()
    expect(screen.getByText('T', { selector: 'span' })).toBeInTheDocument()

    // DDL section absent for an empty /api/ddl map.
    expect(screen.queryByText('BigQuery DDL Schema')).not.toBeInTheDocument()
  })

  // Superseded by Task 14's Explorer scoping (below): a non-recipe .json leaf
  // like BIZLINK.json is now excluded from Tab 2's tree entirely by
  // `fileFilter`, so "click it and confirm nothing crashes" is no longer a
  // reachable scenario — there's nothing to click. See "ETLModifier — Explorer
  // scoping + info copy (Task 14)" for the coverage that replaces it.

  // Task 16: view-aware corpus summary — Explorer footer, static corpus counts
  // PLUS (once a recipe is open) that recipe's own steps/fields/sources.
  it('renders the corpus summary in the Explorer footer, extended with the open recipe\'s steps/fields/sources', async () => {
    renderModifier()

    expect(await screen.findByText('86 recipes')).toBeInTheDocument()
    expect(screen.getByText('8 layers')).toBeInTheDocument()
    // No recipe open yet — MINI's own counts are absent.
    expect(screen.queryByText('1 steps')).not.toBeInTheDocument()

    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('T', { selector: 'text' })

    // MINI: 1 step, 2 fields on its single target, 1 source table.
    expect(await screen.findByText('1 steps')).toBeInTheDocument()
    expect(screen.getByText('2 fields')).toBeInTheDocument()
    expect(screen.getByText('1 sources')).toBeInTheDocument()
  })
})

// ─── Task 8: draft editing state — mutations, SaveBar validate+PUT ────────────

describe('ETLModifier — editing state (Task 8)', () => {
  it('editing a field formula dirties the SaveBar; Save validates then PUTs the draft with the dot-ref verbatim; SaveBar clears', async () => {
    type CapturedPut = { baseModified?: string; content?: { steps?: { target?: { name?: string; fields?: { name?: string; transformation?: unknown }[] } }[] } }
    let capturedBody: CapturedPut | null = null
    server.use(
      http.put('/api/recipes/CDM/m_FIX/_ETL_m_FIX.json', async ({ request }) => {
        capturedBody = await request.json() as CapturedPut
        return HttpResponse.json({
          path: 'CDM/m_FIX/_ETL_m_FIX.json',
          fileName: '_ETL_m_FIX.json',
          sizeBytes: 340,
          modifiedAt: '2026-07-31T00:05:00Z',
          content: capturedBody!.content,
        })
      }),
    )

    const formula = await loadAndSelectT()
    fireEvent.change(formula, { target: { value: "EXP_TO_CHAR(S.B, 'X')" } })
    fireEvent.blur(formula)

    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Save Changes'))

    await waitFor(() => expect(capturedBody).not.toBeNull())
    expect(capturedBody!.baseModified).toBe('2026-07-31T00:00:00Z')
    const fieldB = capturedBody!.content!.steps![0].target!.fields!.find(f => f.name === 'B')!
    expect(fieldB.transformation).toEqual({ source: 'S.B' })
    const fieldA = capturedBody!.content!.steps![0].target!.fields!.find(f => f.name === 'A')!
    expect(fieldA.transformation).toEqual({ name: 'EXP_TO_CHAR', parameters: [{ source: 'S.B' }, { value: "'X'" }] })

    await waitFor(() => expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument())
  })

  // Task 17: Save button spinner + disable while handleSave is in flight —
  // re-enables on both success and failure so a save that errors can never
  // leave the button permanently disabled.
  it('disables Save Changes and shows an inline spinner while the save is in flight, then re-enables on success', async () => {
    server.use(
      http.put('/api/recipes/CDM/m_FIX/_ETL_m_FIX.json', async () => {
        await new Promise(resolve => setTimeout(resolve, 60))
        return HttpResponse.json({
          path: 'CDM/m_FIX/_ETL_m_FIX.json',
          fileName: '_ETL_m_FIX.json',
          sizeBytes: 340,
          modifiedAt: '2026-07-31T00:05:00Z',
          content: MINI,
        })
      }),
    )

    const formula = await loadAndSelectT()
    fireEvent.change(formula, { target: { value: '2' } })
    fireEvent.blur(formula)
    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()

    const saveButton = screen.getByText('Save Changes').closest('button')!
    expect(saveButton).not.toBeDisabled()
    fireEvent.click(saveButton)

    await waitFor(() => expect(saveButton).toBeDisabled())
    expect(within(saveButton).getByRole('status')).toBeInTheDocument()

    await waitFor(() => expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument())
    expect(saveButton).not.toBeInTheDocument() // SaveBar unmounts once changes === 0
  })

  it('re-enables Save Changes after a failed save — never stays disabled', async () => {
    server.use(
      http.put('/api/recipes/CDM/m_FIX/_ETL_m_FIX.json', async () => {
        await new Promise(resolve => setTimeout(resolve, 60))
        return HttpResponse.json({ title: 'Conflict', detail: 'Recipe changed since you loaded it.' }, { status: 409 })
      }),
    )

    const formula = await loadAndSelectT()
    fireEvent.change(formula, { target: { value: '2' } })
    fireEvent.blur(formula)
    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()

    const saveButton = screen.getByText('Save Changes').closest('button')!
    fireEvent.click(saveButton)

    await waitFor(() => expect(saveButton).toBeDisabled())

    await screen.findByText('Recipe changed since you loaded it.')
    await waitFor(() => expect(saveButton).not.toBeDisabled())
    expect(within(saveButton).queryByRole('status')).not.toBeInTheDocument()
  })

  it('Discard re-clones the draft from the loaded recipe, clearing dirty state', async () => {
    const formula = await loadAndSelectT()
    fireEvent.change(formula, { target: { value: '999' } })
    fireEvent.blur(formula)

    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Discard'))

    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument()
    expect(await screen.findByDisplayValue('1')).toBeInTheDocument()
  })

  it('surfaces a 409 (stale) PUT conflict in the --red idiom; SaveBar stays dirty', async () => {
    server.use(
      http.put('/api/recipes/CDM/m_FIX/_ETL_m_FIX.json', () =>
        HttpResponse.json({ title: 'Conflict', detail: 'Recipe changed since you loaded it.' }, { status: 409 })),
    )

    const formula = await loadAndSelectT()
    fireEvent.change(formula, { target: { value: '2' } })
    fireEvent.blur(formula)
    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Save Changes'))

    const detail = await screen.findByText('Recipe changed since you loaded it.')
    expect(detail).toBeInTheDocument()
    expect(detail).toHaveStyle({ color: 'var(--red)' })
    // The save failed — the change is still unsaved.
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
  })

  it('surfaces validate() errors in the --red idiom without ever PUTting', async () => {
    let putCalled = false
    server.use(
      http.post('/api/recipes/validate', () => HttpResponse.json({
        valid: false,
        errors: [{ path: '$.steps[0].target.fields[0].name', message: 'Field name required' }],
      })),
      http.put('/api/recipes/CDM/m_FIX/_ETL_m_FIX.json', () => {
        putCalled = true
        return HttpResponse.json({})
      }),
    )

    const formula = await loadAndSelectT()
    fireEvent.change(formula, { target: { value: '2' } })
    fireEvent.blur(formula)
    fireEvent.click(screen.getByText('Save Changes'))

    const message = await screen.findByText('Field name required')
    expect(message).toBeInTheDocument()
    expect(message).toHaveStyle({ color: 'var(--red)' })
    expect(putCalled).toBe(false)
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
  })

  it('renaming the selected node keeps the edit panel tracking it under the new id', async () => {
    await loadAndSelectT()
    const nameField = screen.getByDisplayValue('T')
    fireEvent.change(nameField, { target: { value: 'T2' } })
    fireEvent.blur(nameField)

    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()
    // The canvas node is now T2, and the edit panel followed the rename (still
    // showing field A/B editors rather than disappearing).
    expect(await screen.findByText('T2', { selector: 'text' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('T2')).toBeInTheDocument()
  })
})

// ─── Task 9: Palette + click-wire + delete UI ─────────────────────────────────
// (extended by Task 11: every palette add routes through NodeConfigDialog)

describe('ETLModifier — palette, click-wire, delete (Task 9 + 11)', () => {
  it('palette: clicking "target table" opens the config dialog and inserts nothing until Insert is pressed', async () => {
    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('T', { selector: 'text' })

    fireEvent.click(screen.getByText('target table'))

    expect(await screen.findByText('Add table')).toBeInTheDocument()
    expect(screen.queryByText('NEW_TABLE_1', { selector: 'text' })).not.toBeInTheDocument()
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument()
  })

  it('dragging a palette entry onto the canvas opens the same dialog rather than inserting directly', async () => {
    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('T', { selector: 'text' })

    fireEvent.drop(screen.getByTestId('ipc-canvas-root'), {
      dataTransfer: { getData: (fmt: string) => (fmt === 'text/etl-type' ? 'filter' : '') },
    })

    expect(await screen.findByText('Add filter')).toBeInTheDocument()
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument()
  })

  it('Cancel leaves the draft and the dirty count unchanged', async () => {
    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('T', { selector: 'text' })

    fireEvent.click(screen.getByText('target table'))
    await screen.findByText('Add table')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('Add table')).not.toBeInTheDocument()
    expect(screen.queryByText('NEW_TABLE_1', { selector: 'text' })).not.toBeInTheDocument()
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument()
  })

  it('completing the dialog (name, connection, mapped field) and clicking Insert adds a real node and dirties the SaveBar', async () => {
    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('T', { selector: 'text' })

    fireEvent.click(screen.getByText('target table'))
    await screen.findByText('Add table')

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'NEW_TBL' } })
    fireEvent.click(within(screen.getByTestId('node-config-fedby')).getByRole('button', { name: 'T — table' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'A' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Insert' })).not.toBeDisabled(), { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(await screen.findByText('NEW_TBL', { selector: 'text' })).toBeInTheDocument()
    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()
  })

  it('click-wire: OUT port on S then IN port on T writes the dot-ref via setFieldTransformation', async () => {
    server.use(http.get('/api/recipes/CDM/m_FIX/_ETL_m_FIX.json', () => HttpResponse.json({
      path: 'CDM/m_FIX/_ETL_m_FIX.json',
      fileName: '_ETL_m_FIX.json',
      sizeBytes: 200,
      modifiedAt: '2026-07-31T00:00:00Z',
      content: {
        steps: [
          { target: { name: 'S', type: 'sourceQualifier', fields: [{ name: 'A', dataType: 'String' }] }, sources: [] },
          { target: { name: 'T', type: 'table', fields: [{ name: 'X', dataType: 'String' }] }, sources: [] },
        ],
        table: { targetTableNames: ['T'], sourceTableNames: [] },
      },
    })))

    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('S', { selector: 'text' })

    fireEvent.click(screen.getByText('A'))
    expect(await screen.findByText('wire: S.A → click an IN port')).toBeInTheDocument()

    fireEvent.click(screen.getByText('X'))

    fireEvent.click(screen.getByText('{ raw JSON }'))
    expect(await screen.findByText(/"source": "S\.A"/)).toBeInTheDocument()
  })

  // Review finding (fix round): every IN/OUT port is a valid wire-start AND a
  // valid completion target, so without a guard an armed wire could complete
  // on a different port of the SAME node — a self-referencing dot-ref. A
  // same-node completion click must be ignored (wire mode stays armed), not
  // silently write S.A as a source of another field on S itself.
  it('click-wire: a completion click on the origin node is ignored (self-wire guard); wire mode stays armed', async () => {
    server.use(http.get('/api/recipes/CDM/m_FIX/_ETL_m_FIX.json', () => HttpResponse.json({
      path: 'CDM/m_FIX/_ETL_m_FIX.json',
      fileName: '_ETL_m_FIX.json',
      sizeBytes: 200,
      modifiedAt: '2026-07-31T00:00:00Z',
      content: {
        steps: [
          { target: { name: 'S', type: 'sourceQualifier', fields: [{ name: 'A', dataType: 'String' }] }, sources: [] },
          { target: { name: 'T', type: 'table', fields: [{ name: 'X', dataType: 'String' }] }, sources: [] },
        ],
        table: { targetTableNames: ['T'], sourceTableNames: [] },
      },
    })))

    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('S', { selector: 'text' })

    fireEvent.click(screen.getByText('A'))
    expect(await screen.findByText('wire: S.A → click an IN port')).toBeInTheDocument()

    // A second click on A — same node as wireFrom, and A is IN/OUT-eligible —
    // must NOT complete the wire: no dirty change, wire chip stays exactly as is.
    fireEvent.click(screen.getByText('A'))
    expect(screen.getByText('wire: S.A → click an IN port')).toBeInTheDocument()
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument()

    // The wire is still armed: completing on a DIFFERENT node's IN port still works.
    fireEvent.click(screen.getByText('X'))
    fireEvent.click(screen.getByText('{ raw JSON }'))
    expect(await screen.findByText(/"source": "S\.A"/)).toBeInTheDocument()
  })

  it('delete: selecting node S shows a ref-count confirm hint; confirming removes it from the canvas', async () => {
    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('T', { selector: 'text' })

    fireEvent.click(screen.getByText('S', { selector: 'text' }))
    fireEvent.click(await screen.findByText('Delete'))

    expect(await screen.findByText('Removes S and clears 1 incoming reference(s)')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Confirm delete'))

    expect(screen.queryByText('S', { selector: 'text' })).not.toBeInTheDocument()
  })
})

// ─── Final-review wave: wire-state clearing + add-field affordance ───────────

describe('ETLModifier — final-review wave', () => {
  it('deleting the wire-armed node clears wireFrom: the chip disappears and a later IN-port click writes no dangling dot-ref', async () => {
    server.use(http.get('/api/recipes/CDM/m_FIX/_ETL_m_FIX.json', () => HttpResponse.json({
      path: 'CDM/m_FIX/_ETL_m_FIX.json',
      fileName: '_ETL_m_FIX.json',
      sizeBytes: 200,
      modifiedAt: '2026-07-31T00:00:00Z',
      content: {
        steps: [
          { target: { name: 'S', type: 'sourceQualifier', fields: [{ name: 'A', dataType: 'String' }] }, sources: [] },
          { target: { name: 'T', type: 'table', fields: [{ name: 'X', dataType: 'String' }] }, sources: [] },
        ],
        table: { targetTableNames: ['T'], sourceTableNames: [] },
      },
    })))

    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('S', { selector: 'text' })

    // Arm a wire from S.A.
    fireEvent.click(screen.getByText('A'))
    expect(await screen.findByText('wire: S.A → click an IN port')).toBeInTheDocument()

    // Select S and delete it — the armed wire's origin node is gone.
    fireEvent.click(screen.getByText('S', { selector: 'text' }))
    fireEvent.click(await screen.findByText('Delete'))
    fireEvent.click(screen.getByText('Confirm delete'))

    expect(screen.queryByText('S', { selector: 'text' })).not.toBeInTheDocument()
    // The delete itself is the only dirtying op — the stale wire chip is gone.
    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()
    expect(screen.queryByText(/wire: S\.A/)).not.toBeInTheDocument()

    // A completion click on T's IN port is now a no-op: no armed wire survives
    // the delete, so it can't write a dot-ref onto a node that no longer exists.
    fireEvent.click(screen.getByText('X'))
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
    fireEvent.click(screen.getByText('{ raw JSON }'))
    expect(screen.queryByText(/"source": "S\.A"/)).not.toBeInTheDocument()
  })

  // Task 11: a palette add can no longer land with fields:[] and no ports at
  // all (NodeConfigDialog requires at least one mapped field to enable
  // Insert) — but the resulting node can still legitimately carry MORE
  // fields than what got mapped at insert time, so "+ field" then
  // click-wire into the new port must keep working on a dialog-inserted node.
  it('a dialog-inserted node can still gain more fields via "+ field", then click-wire into the new port writes the dot-ref', async () => {
    server.use(http.get('/api/recipes/CDM/m_FIX/_ETL_m_FIX.json', () => HttpResponse.json({
      path: 'CDM/m_FIX/_ETL_m_FIX.json',
      fileName: '_ETL_m_FIX.json',
      sizeBytes: 200,
      modifiedAt: '2026-07-31T00:00:00Z',
      content: {
        steps: [
          { target: { name: 'S', type: 'sourceQualifier', fields: [{ name: 'A', dataType: 'String' }] }, sources: [] },
        ],
        table: { targetTableNames: [], sourceTableNames: [] },
      },
    })))

    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('S', { selector: 'text' })

    // Insert a table node via the dialog: fed by S, mapping S.A — renamed to
    // A_MAPPED so the new node's own port label never collides with S's own
    // OUT port "A" below.
    fireEvent.click(screen.getByText('target table'))
    await screen.findByText('Add table')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'NEW_TBL' } })
    fireEvent.click(within(screen.getByTestId('node-config-fedby')).getByRole('button', { name: 'S — sourceQualifier' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'A' }))
    fireEvent.change(screen.getByLabelText('A mapped field name'), { target: { value: 'A_MAPPED' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Insert' })).not.toBeDisabled(), { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))

    const newNode = await screen.findByText('NEW_TBL', { selector: 'text' })

    // Select it and use the "+ field" affordance to give it a SECOND field.
    // Selecting the node keeps its EditPanel open (its own FieldEditor also
    // renders the field name "X" as a plain label), so port clicks below use
    // { selector: 'text' } to target the SVG port text specifically — the same
    // disambiguation this suite already uses for node-label clicks.
    fireEvent.click(newNode)
    fireEvent.change(screen.getByPlaceholderText('field name…'), { target: { value: 'X' } })
    fireEvent.click(screen.getByText('+ field'))

    // The node now shows a port for the new field.
    expect(await screen.findByText('X', { selector: 'text' })).toBeInTheDocument()

    // Click-wire: OUT port S.A completes onto the freshly created IN port X.
    fireEvent.click(screen.getByText('A', { selector: 'text' }))
    expect(await screen.findByText('wire: S.A → click an IN port')).toBeInTheDocument()
    fireEvent.click(screen.getByText('X', { selector: 'text' }))

    fireEvent.click(screen.getByText('{ raw JSON }'))
    expect(await screen.findByText(/"name": "X"/)).toBeInTheDocument()
    expect(screen.getByText(/"source": "S\.A"/)).toBeInTheDocument()
  })
})

// ─── Task 11: NodeConfigDialog's source-table mode vs transformation-step mode ─
//
// A source table is a ROOT (reads a physical table, no upstream) and structurally
// is not a step — the dialog must ask which existing step CONSUMES it ("feeds"),
// never "fed by", and must not require a mapped field. Every other palette kind
// keeps Task 10's gate: at least one mapped field, or Insert never enables. These
// two tests cover both halves of that design split end-to-end through ETLModifier.
describe('ETLModifier — Task 11: source table vs transformation step', () => {
  it('adding a source table succeeds: no "fed by"/mapped field, only which step it feeds', async () => {
    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('T', { selector: 'text' })

    fireEvent.click(screen.getByText('source table'))
    await screen.findByText('Add source table')

    // Structurally different from every other kind: no "fed by" section at all.
    expect(screen.queryByTestId('node-config-fedby')).not.toBeInTheDocument()
    expect(screen.queryByTestId('node-config-fieldmap')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'NEW_SRC' } })
    // Insert stays disabled until a consuming step is picked. Wait for the
    // preview validate to SETTLE first — otherwise `isValidating` alone would
    // keep Insert disabled and this assertion would pass for the wrong
    // reason, masking whether the "at least one feeds" gate itself is doing
    // any work.
    await waitFor(() => expect(screen.queryByText('Validating…')).not.toBeInTheDocument(), { timeout: 2000 })
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()

    fireEvent.click(within(screen.getByTestId('node-config-feeds')).getByRole('button', { name: 'T — table' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Insert' })).not.toBeDisabled(), { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(await screen.findByText('NEW_SRC', { selector: 'text' })).toBeInTheDocument()
    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()

    fireEvent.click(screen.getByText('{ raw JSON }'))
    expect(await screen.findByText(/"sourceTableNames"/)).toBeInTheDocument()
    expect(screen.getByText(/"NEW_SRC"/)).toBeInTheDocument()
  })

  it('adding a transformation step with no connection still cannot insert', async () => {
    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('T', { selector: 'text' })

    fireEvent.click(screen.getByText('sourceQualifier'))
    await screen.findByText('Add sourceQualifier')

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'NEW_SQ' } })
    // No "fed by" selection at all — zero connections, zero mapped fields. Wait
    // for the preview validate to SETTLE first (the mock default is zero
    // errors) — otherwise `isValidating` alone would keep Insert disabled and
    // this assertion would pass for the wrong reason, masking whether the
    // mapped-field gate itself is doing any work.
    await waitFor(() => expect(screen.queryByText('Validating…')).not.toBeInTheDocument(), { timeout: 2000 })
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('NEW_SQ', { selector: 'text' })).not.toBeInTheDocument()
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument()
  })
})

// ─── Task 10: History drawer + rollback UI ────────────────────────────────────

describe('ETLModifier — history drawer + rollback (Task 10)', () => {
  it('lists versions, views one read-only into the canvas (editing disabled), then restores it', async () => {
    let capturedRollbackVersion: string | null = null
    server.use(
      http.get('/api/recipes/history/CDM/m_FIX/_ETL_m_FIX.json', ({ request }) => {
        const version = new URL(request.url).searchParams.get('version')
        if (!version) {
          return HttpResponse.json([
            { version: '20260731-120000-000', timestamp: '2026-07-31T12:00:00Z', sizeBytes: 100 },
          ])
        }
        return HttpResponse.json({
          path: 'CDM/m_FIX/_ETL_m_FIX.json',
          fileName: '_ETL_m_FIX.json',
          sizeBytes: 100,
          modifiedAt: '2026-07-31T12:00:00Z',
          content: {
            steps: [{ target: { name: 'T_OLD', type: 'table', fields: [] }, sources: [] }],
            table: { targetTableNames: ['T_OLD'], sourceTableNames: [] },
          },
        })
      }),
      http.post('/api/recipes/rollback/CDM/m_FIX/_ETL_m_FIX.json', ({ request }) => {
        capturedRollbackVersion = new URL(request.url).searchParams.get('version')
        return HttpResponse.json({
          path: 'CDM/m_FIX/_ETL_m_FIX.json',
          fileName: '_ETL_m_FIX.json',
          sizeBytes: 321,
          modifiedAt: '2026-07-31T13:00:00Z',
          content: MINI,
        })
      }),
    )

    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('T', { selector: 'text' })

    // Task 4: Path/Size bytes/Modified now live in the { raw JSON } panel
    // rather than an always-visible header card — open it once and leave it
    // open for the rest of this test (an independent toggle from the history
    // drawer below), so the same metadata assertions still hold from their
    // new location, live-updating as `headerRecipe` follows the archive.
    fireEvent.click(screen.getByText('{ raw JSON }'))

    // Baseline: the raw JSON panel shows the LIVE recipe's own metadata.
    expect(screen.getByDisplayValue('321')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2026-07-31T00:00:00Z')).toBeInTheDocument()

    // Open the drawer — the version row is listed (mono timestamp + sizeBytes).
    fireEvent.click(screen.getByText('{ history }'))
    expect(await screen.findByText('2026-07-31T12:00:00Z')).toBeInTheDocument()
    expect(screen.getByText('100 bytes')).toBeInTheDocument()

    // View loads the archived version read-only: banner + T_OLD on the canvas.
    fireEvent.click(screen.getByText('View'))
    expect(await screen.findByText('Viewing archived version 20260731-120000-000 — read-only')).toBeInTheDocument()
    expect(await screen.findByText('T_OLD', { selector: 'text' })).toBeInTheDocument()

    // Review finding: the raw JSON panel must follow the archive too — showing
    // the read-only banner next to the LIVE modifiedAt/sizeBytes is misleading.
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2026-07-31T12:00:00Z')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('321')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('2026-07-31T00:00:00Z')).not.toBeInTheDocument()

    // Editing affordances are gone while viewing: the palette is hidden, and
    // the live draft's node ("T") is no longer what the canvas renders.
    expect(screen.queryByText('target table')).not.toBeInTheDocument()
    expect(screen.queryByText('T', { selector: 'text' })).not.toBeInTheDocument()

    // Restore -> rollback POST captured with the viewed version; banner clears.
    fireEvent.click(screen.getByText('Restore this version'))
    await waitFor(() => expect(capturedRollbackVersion).toBe('20260731-120000-000'))
    await waitFor(() => expect(screen.queryByText(/Viewing archived version/)).not.toBeInTheDocument())

    // The raw JSON panel's LIVE values are back (the recipe query was
    // invalidated and refetched — the base GET handler's own values, since
    // this MSW fixture doesn't simulate the rollback mutating the live file
    // on disk).
    await waitFor(() => expect(screen.getByDisplayValue('321')).toBeInTheDocument())
    expect(screen.getByDisplayValue('2026-07-31T00:00:00Z')).toBeInTheDocument()
  })

  // Final whole-branch review, BLOCKING 1: three paths re-baseline the draft
  // (the recipe-change effect, handleDiscard, handleSave) and all three reset
  // the undo stack; `handleRestored` was the fourth and did not. Because
  // `recipePath` never changes across a rollback, the history-reset effect
  // (keyed on recipePath alone, deliberately) never fires — so the pre-rollback
  // snapshots survived a restore, and Undo/Redo are NOT gated on `changes > 0`
  // the way Discard/Save are (EditorToolbar.tsx), leaving a live Undo button
  // that reverts the operator's explicit rollback while the toolbar reads 0
  // changes.
  //
  // The fixture above deliberately does not simulate the rollback mutating the
  // live file; this one must, because the bug is only reachable through the
  // refetch that a CHANGED `modifiedAt` triggers (RecipeService.rollback
  // rewrites the live file, so `modifiedAt` always moves in production).
  it('clears the undo stack when a rollback rewrites the live file, so Undo cannot silently revert the restore', async () => {
    const ARCHIVED = {
      steps: [{ target: { name: 'T_OLD', type: 'table', fields: [] }, sources: [] }],
      table: { targetTableNames: ['T_OLD'], sourceTableNames: [] },
    }
    let live: { sizeBytes: number; modifiedAt: string; content: unknown } =
      { sizeBytes: 321, modifiedAt: '2026-07-31T00:00:00Z', content: MINI }
    const dto = () => ({
      path: 'CDM/m_FIX/_ETL_m_FIX.json', fileName: '_ETL_m_FIX.json', ...live,
    })
    server.use(
      http.get('/api/recipes/CDM/m_FIX/_ETL_m_FIX.json', () => HttpResponse.json(dto())),
      http.get('/api/recipes/history/CDM/m_FIX/_ETL_m_FIX.json', ({ request }) => {
        const version = new URL(request.url).searchParams.get('version')
        if (!version) {
          return HttpResponse.json([
            { version: '20260731-120000-000', timestamp: '2026-07-31T12:00:00Z', sizeBytes: 100 },
          ])
        }
        return HttpResponse.json({
          path: 'CDM/m_FIX/_ETL_m_FIX.json',
          fileName: '_ETL_m_FIX.json',
          sizeBytes: 100,
          modifiedAt: '2026-07-31T12:00:00Z',
          content: ARCHIVED,
        })
      }),
      http.post('/api/recipes/rollback/CDM/m_FIX/_ETL_m_FIX.json', () => {
        // What RecipeService.rollback actually does: the archived content
        // becomes the live file, with a fresh mtime.
        live = { sizeBytes: 100, modifiedAt: '2026-07-31T13:00:00Z', content: ARCHIVED }
        return HttpResponse.json(dto())
      }),
    )

    // Dirty the draft so the undo stack is non-empty and Undo is live.
    const formula = await loadAndSelectT()
    fireEvent.change(formula, { target: { value: '999' } })
    fireEvent.blur(formula)
    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()
    expect(screen.getByLabelText('Undo')).not.toBeDisabled()

    fireEvent.click(screen.getByText('{ history }'))
    fireEvent.click(await screen.findByText('View'))
    // Wait for the parent to actually enter view mode before restoring —
    // otherwise `handleViewVersion`'s in-flight GET resolves AFTER
    // `handleRestored` cleared view state and puts the canvas back into
    // read-only view mode, where `canUndo` is hardcoded false
    // (ETLModifier.tsx: `canUndo={isViewing ? false : history.canUndo}`) and
    // the assertion below would pass for entirely the wrong reason.
    expect(await screen.findByText('Viewing archived version 20260731-120000-000 — read-only')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Restore this version'))
    await waitFor(() => expect(screen.queryByText(/Viewing archived version/)).not.toBeInTheDocument())

    // The rollback landed: the refetched live file IS the archived content,
    // and the draft was re-baselined onto it (0 unsaved changes).
    expect(await screen.findByText('T_OLD', { selector: 'text' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('1 unsaved change')).not.toBeInTheDocument())

    // ...and the pre-rollback snapshots went with it. A live Undo here would
    // restore the pre-rollback draft behind a "0 changes" toolbar, and one
    // further edit would let Save PUT it back with a matching `baseModified`.
    expect(screen.getByLabelText('Undo')).toBeDisabled()
  })

  it('closing the drawer while viewing exits view mode back to the live draft, without discarding an in-progress unsaved edit', async () => {
    server.use(
      http.get('/api/recipes/history/CDM/m_FIX/_ETL_m_FIX.json', ({ request }) => {
        const version = new URL(request.url).searchParams.get('version')
        if (!version) {
          return HttpResponse.json([
            { version: '20260731-120000-000', timestamp: '2026-07-31T12:00:00Z', sizeBytes: 100 },
          ])
        }
        return HttpResponse.json({
          path: 'CDM/m_FIX/_ETL_m_FIX.json',
          fileName: '_ETL_m_FIX.json',
          sizeBytes: 100,
          modifiedAt: '2026-07-31T12:00:00Z',
          content: {
            steps: [{ target: { name: 'T_OLD', type: 'table', fields: [] }, sources: [] }],
            table: { targetTableNames: ['T_OLD'], sourceTableNames: [] },
          },
        })
      }),
    )

    // Dirty the draft first (field A's formula, seeded '1' -> '999') so
    // closing view mode without restoring can be shown to preserve it.
    const formula = await loadAndSelectT()
    fireEvent.change(formula, { target: { value: '999' } })
    fireEvent.blur(formula)
    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()

    fireEvent.click(screen.getByText('{ history }'))
    fireEvent.click(await screen.findByText('View'))
    expect(await screen.findByText('Viewing archived version 20260731-120000-000 — read-only')).toBeInTheDocument()
    expect(await screen.findByText('T_OLD', { selector: 'text' })).toBeInTheDocument()

    // Close the drawer — the escape hatch back to the live draft (no rollback).
    fireEvent.click(screen.getByText('{ history }'))

    expect(screen.queryByText(/Viewing archived version/)).not.toBeInTheDocument()
    expect(await screen.findByText('T', { selector: 'text' })).toBeInTheDocument()

    // The prior unsaved edit survived — viewing never touched the draft.
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
    fireEvent.click(screen.getByText('{ raw JSON }'))
    expect(await screen.findByText(/999/)).toBeInTheDocument()
  })
})

// ─── Task 10: layout sidecar wiring — drag persists, saved layout re-renders ──

describe('ETLModifier — layout sidecar wiring (Task 10)', () => {
  it('dragging a node fires a debounced PUT of its snapped position (as dx/dy) to the layout sidecar', async () => {
    type CapturedLayout = { version?: number; nodes?: Record<string, { dx: number; dy: number }> }
    let capturedBody: CapturedLayout | null = null
    server.use(
      http.put('/api/layouts/CDM/m_FIX/_ETL_m_FIX.json', async ({ request }) => {
        capturedBody = await request.json() as CapturedLayout
        return HttpResponse.json(capturedBody)
      }),
    )

    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('T', { selector: 'text' })

    const nodeGroup = screen.getByTestId('ipc-node-T')
    const canvasRoot = screen.getByTestId('ipc-canvas-root')

    fireEvent.pointerDown(nodeGroup, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(canvasRoot, { clientX: 120, clientY: 140, pointerId: 1 })
    fireEvent.pointerUp(canvasRoot, { clientX: 120, clientY: 140, pointerId: 1 })

    // Debounced 500ms — the PUT isn't immediate.
    expect(capturedBody).toBeNull()

    await waitFor(() => expect(capturedBody).not.toBeNull(), { timeout: 2000 })
    expect(capturedBody).toEqual({ version: 1, nodes: { T: { dx: 20, dy: 40 } } })
  })

  it('seeds offsets from a saved layout: the node renders shifted by its dx/dy from where it renders with no saved layout', async () => {
    // First render with the default (unsaved, {}) layout to capture node T's
    // un-offset base position.
    const first = renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('T', { selector: 'text' })
    const baseRect = screen.getByTestId('ipc-node-T').querySelectorAll('rect[width="195"]')[1]!
    const baseX = Number(baseRect.getAttribute('x'))
    const baseY = Number(baseRect.getAttribute('y'))
    first.unmount()
    cleanup()

    server.use(http.get('/api/layouts/CDM/m_FIX/_ETL_m_FIX.json', () => HttpResponse.json({
      version: 1, nodes: { T: { dx: 30, dy: -15 } },
    })))

    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('T', { selector: 'text' })

    await waitFor(() => {
      const rect = screen.getByTestId('ipc-node-T').querySelectorAll('rect[width="195"]')[1]!
      expect(rect.getAttribute('x')).toBe(String(baseX + 30))
      expect(rect.getAttribute('y')).toBe(String(baseY - 15))
    })
  })

  // Critical fix (review round 1): a layout refetch (window refocus after
  // staleTime, an invalidated ['layout', ...] query, anything) must touch
  // ONLY `offsets` — the draft-reset effect it used to share a dependency
  // array with must stay keyed to recipePath/rec.data alone (Task 8's
  // original invariant), or an in-progress edit silently vanishes with no
  // recipe switch involved at all.
  it('a layout refetch updates offsets but never wipes an in-progress recipe edit or its dirty count', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <ETLModifier searchQuery="" />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    fireEvent.click(await screen.findByText('T', { selector: 'text' }))
    const formula = await screen.findByDisplayValue('1')
    fireEvent.change(formula, { target: { value: '999' } })
    fireEvent.blur(formula)
    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()

    const baseRect = screen.getByTestId('ipc-node-T').querySelectorAll('rect[width="195"]')[1]!
    const baseX = Number(baseRect.getAttribute('x'))

    server.use(http.get('/api/layouts/CDM/m_FIX/_ETL_m_FIX.json', () => HttpResponse.json({
      version: 1, nodes: { T: { dx: 40, dy: 0 } },
    })))
    await queryClient.invalidateQueries({ queryKey: ['layout', 'CDM/m_FIX/_ETL_m_FIX.json'] })

    // Offsets DO update to the refetched layout...
    await waitFor(() => {
      const rect = screen.getByTestId('ipc-node-T').querySelectorAll('rect[width="195"]')[1]!
      expect(rect.getAttribute('x')).toBe(String(baseX + 40))
    })

    // ...but the in-progress edit and its dirty count survive untouched.
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
    expect(screen.getByDisplayValue('999')).toBeInTheDocument()
  })

  // IMPORTANT finding (review round 1): the debounce-cancel-on-recipe-switch
  // logic (layoutSaveTimer's cleanup effect, keyed [recipePath]) was correct
  // by inspection only — no test exercised it. Regression coverage: drag a
  // node on recipe 1, switch to recipe 2 well before the 500ms debounce
  // elapses, and assert recipe 1's PUT never fires.
  it('switching recipes while a drag-debounce is pending cancels it — no stale PUT for the abandoned path', async () => {
    let fix1PutCalled = false
    server.use(
      http.get('/api/tree', () => HttpResponse.json({
        name: 'xmltobq', path: '', kind: 'dir', layer: 'root',
        children: [
          {
            name: 'CDM', path: 'CDM', kind: 'dir', layer: 'CDM',
            children: [
              { name: '_ETL_m_FIX.json', path: 'CDM/m_FIX/_ETL_m_FIX.json', kind: 'json' },
              { name: '_ETL_m_FIX2.json', path: 'CDM/m_FIX2/_ETL_m_FIX2.json', kind: 'json' },
            ],
          },
        ],
      })),
      http.get('/api/recipes/CDM/m_FIX2/_ETL_m_FIX2.json', () => HttpResponse.json({
        path: 'CDM/m_FIX2/_ETL_m_FIX2.json',
        fileName: '_ETL_m_FIX2.json',
        sizeBytes: 50,
        modifiedAt: '2026-07-31T01:00:00Z',
        content: {
          steps: [{ target: { name: 'T2', type: 'table', fields: [] }, sources: [] }],
          table: { targetTableNames: ['T2'], sourceTableNames: [] },
        },
      })),
      http.get('/api/ddl/CDM/m_FIX2', () => HttpResponse.json({})),
      http.get('/api/layouts/CDM/m_FIX2/_ETL_m_FIX2.json', () => HttpResponse.json({ version: 1, nodes: {} })),
      http.put('/api/layouts/CDM/m_FIX/_ETL_m_FIX.json', () => {
        fix1PutCalled = true
        return HttpResponse.json({ version: 1, nodes: {} })
      }),
    )

    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('T', { selector: 'text' })

    const nodeGroup = screen.getByTestId('ipc-node-T')
    const canvasRoot = screen.getByTestId('ipc-canvas-root')
    fireEvent.pointerDown(nodeGroup, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(canvasRoot, { clientX: 120, clientY: 140, pointerId: 1 })
    fireEvent.pointerUp(canvasRoot, { clientX: 120, clientY: 140, pointerId: 1 })

    // Switch recipes immediately — well before the 500ms debounce elapses.
    fireEvent.click(screen.getByText('_ETL_m_FIX2.json'))
    await screen.findByText('T2', { selector: 'text' })

    // Wait comfortably past the debounce window: the abandoned path's PUT
    // must never fire.
    await new Promise(resolve => setTimeout(resolve, 700))
    expect(fix1PutCalled).toBe(false)
  })
})

// ─── Task 11/14: expression dock — recipe-origin only, relocated ─────────────
//
// Task 14 moved `ExpressionRegistry` into `ExpressionDock` (its own unit
// suite: `ExpressionDock.test.tsx`) and scoped it to `origin === 'recipe'`.
// What's left here is integration coverage through the real `/api/expressions`
// wiring + the Insert round-trip into the Inspector's formula field.

const REGISTRY_ENTRIES = [
  {
    mappingPath: 'CDM/m_DM_INFOHUB_BIZLINK', layer: 'CDM',
    transformation: 'EXP_FIX', port: 'COL_A_OUT', formula: 'LTRIM(COL_A)', origin: 'xml',
  },
  {
    mappingPath: 'ODS/m_SYN_ODS_ORDERS/_ETL_m_SYN_ODS_ORDERS.json', layer: 'ODS',
    transformation: 'ODS_SYN_ORDERS', port: 'AMOUNT',
    formula: 'ROUND(STG_L_SYN_ORDERS.AMOUNT, 2)', origin: 'recipe',
  },
  {
    mappingPath: 'CDM/m_FIX/_ETL_m_FIX.json', layer: 'CDM',
    transformation: 'FIX_STEP', port: 'B', formula: 'UPPER(S.B)', origin: 'recipe',
  },
]

describe('ETLModifier — expression dock (Task 11/14)', () => {
  it('renders only recipe-origin entries corpus-wide — the xml-origin entry is excluded', async () => {
    server.use(http.get('/api/expressions', () => HttpResponse.json(REGISTRY_ENTRIES)))

    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('T', { selector: 'text' })

    expect(await screen.findByText('ROUND(STG_L_SYN_ORDERS.AMOUNT, 2)')).toBeInTheDocument()
    expect(screen.getByText('UPPER(S.B)')).toBeInTheDocument()
    expect(screen.queryByText('LTRIM(COL_A)')).not.toBeInTheDocument()
  })

  it('filter box narrows the registry by substring', async () => {
    server.use(http.get('/api/expressions', () => HttpResponse.json(REGISTRY_ENTRIES)))

    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('T', { selector: 'text' })
    await screen.findByText('ROUND(STG_L_SYN_ORDERS.AMOUNT, 2)')

    fireEvent.change(screen.getByPlaceholderText('Filter expressions…'), { target: { value: 'AMOUNT' } })

    expect(screen.queryByText('UPPER(S.B)')).not.toBeInTheDocument()
    expect(screen.getByText('ROUND(STG_L_SYN_ORDERS.AMOUNT, 2)')).toBeInTheDocument()
  })

  it('Insert writes the entry formula into the focused formula textarea and dirties the SaveBar', async () => {
    server.use(http.get('/api/expressions', () => HttpResponse.json(REGISTRY_ENTRIES)))

    const formula = await loadAndSelectT()
    expect(screen.queryAllByText('Insert')).toHaveLength(0)

    fireEvent.focus(formula)
    const inserts = await screen.findAllByText('Insert')
    // Only the two recipe-origin entries offer Insert — the xml-origin one never rendered.
    expect(inserts).toHaveLength(2)

    fireEvent.click(inserts[0]) // the recipe-origin ROUND(...) entry

    expect(await screen.findByDisplayValue('ROUND(STG_L_SYN_ORDERS.AMOUNT, 2)')).toBeInTheDocument()
    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()
  })

  it('mounts the canvas inside a flex container so IpcCanvas flex:1 resolves to a real height', async () => {
    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    const nodeText = await screen.findByText('T', { selector: 'text' })

    // Walk up from the rendered node to the EditorLayout-owned canvas region and
    // assert every ancestor between them participates in flex layout. IpcCanvas's
    // root is `flex: 1` with absolutely-positioned children, so a non-flex parent
    // collapses it to 0px and the canvas renders invisibly (the original bug: a
    // canvas rendered above an empty box). Task 4 re-target: the old fixed
    // `height: 420` wrapper is gone — `EditorLayout`'s own `data-region="canvas"`
    // region now owns the real (dynamic, Task 2/3) height via `sizes.canvasH`,
    // so the exact-height assertion moves there instead of disappearing.
    const svg = nodeText.closest('svg')!
    const canvasRoot = svg.parentElement!            // IpcCanvas root div (flex: 1)
    const host = canvasRoot.parentElement!           // ETLModifier's own data-region="canvas" wrapper
    expect(host.style.display).toBe('flex')

    const editorRegion = host.parentElement!         // EditorLayout's own data-region="canvas" region
    expect(editorRegion.getAttribute('data-region')).toBe('canvas')
    expect(editorRegion.style.minHeight).toBe(`${LAYOUT_DEFAULT.canvasH}px`)
  })
})

// ─── Task 14: Explorer scoping + info copy ────────────────────────────────────

describe('ETLModifier — Explorer scoping + info copy (Task 14)', () => {
  it('Explorer tree shows the recipe and excludes its sibling XML and non-recipe json', async () => {
    renderModifier()

    expect(await screen.findByText('_ETL_m_FIX.json')).toBeInTheDocument()
    expect(screen.queryByText('m_FIX.xml')).not.toBeInTheDocument()
    expect(screen.queryByText('BIZLINK.json')).not.toBeInTheDocument()
  })

  it('the Explorer header exposes an info affordance naming both _ETL_*.json and the IPC ETL Viewer tab', async () => {
    const { container } = renderModifier()
    // Load the recipe first so the empty state (which carries the SAME copy,
    // per the brief) isn't also on screen, keeping the tooltip's own text
    // assertion unambiguous.
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('T', { selector: 'text' })

    const infoIcon = container.querySelector('span[style*="cursor"][style*="help"]')
    expect(infoIcon).toBeTruthy()

    fireEvent.mouseEnter(infoIcon!)
    const tooltip = await within(infoIcon!.parentElement as HTMLElement).findByText(/_ETL_\*\.json/)
    expect(tooltip.textContent).toMatch(/IPC ETL Viewer/)
  })

  it('the empty state names both _ETL_*.json and the IPC ETL Viewer tab', async () => {
    renderModifier()

    expect(await screen.findByText('Select an _ETL_*.json recipe to edit')).toBeInTheDocument()
    expect(await screen.findByText(/IPC ETL Viewer/)).toBeInTheDocument()
  })
})

// ─── Task 15: Focus mode ───────────────────────────────────────────────────────

describe('ETLModifier — focus mode (Task 15)', () => {
  it('focusRecipe seeds recipePath directly: no Sidebar, no "select a recipe" empty state, the recipe loads', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ETLModifier searchQuery="" focusRecipe="CDM/m_FIX/_ETL_m_FIX.json" />
      </QueryClientProvider>,
    )

    // Recipe header renders — no click-through-the-tree needed.
    expect(await screen.findByRole('heading', { name: '_ETL_m_FIX.json' })).toBeInTheDocument()

    // No Sidebar/Explorer, and its info-tooltip overlay is gone with it.
    expect(screen.queryByText('Explorer')).not.toBeInTheDocument()
    // No "select a recipe" empty state either.
    expect(screen.queryByText('Select an _ETL_*.json recipe to edit')).not.toBeInTheDocument()
  })

  it('a ⤢ button beside { history } opens ?focus=<encoded recipePath> in a new tab', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('T', { selector: 'text' })

    fireEvent.click(screen.getByText('⤢'))

    expect(openSpy).toHaveBeenCalledWith('?focus=CDM%2Fm_FIX%2F_ETL_m_FIX.json', '_blank')

    openSpy.mockRestore()
  })
})

// ─── Task 4: editor layout — Inspector docked beside the canvas, drawer ──────
//
// Fix for "I click a node and nothing pops up" (spec §1 defect 2): the body
// used to be a scrolling document (header/Source/canvas/Target/Inspector/
// Edge/DDL), so clicking a canvas node updated a panel ~500px below the fold.
// `ETLModifier` now composes `EditorLayout` (Task 3): the canvas is the
// dominant region, the Inspector docks beside it, and Source/Target/DDL/Edge
// move into the collapsible drawer.

describe('ETLModifier — editor layout (Task 4)', () => {
  it('renders the Inspector docked beside the canvas, not below the page fold', async () => {
    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    fireEvent.click(await screen.findByText('T', { selector: 'text' }))

    // The Inspector must be a sibling of the canvas inside the editor row — NOT
    // a later section of a scrolling document. Walk up from the Inspector to
    // the shared flex row and assert the canvas lives in the same row.
    //
    // Deviation from the brief's literal one-`parentElement` walk: `EditorLayout`
    // (Task 3, already committed) wraps its `inspector` slot in its OWN
    // width-styled sizing div (`EditorLayout.tsx`'s `sizes.inspectorW` region) —
    // confirmed empirically (a standalone probe against the committed
    // `EditorLayout` before writing this test) — so `inspector-dock`'s
    // IMMEDIATE parent is that sizing div, not the shared flex row; the row
    // (display:flex, containing both the canvas region and the inspector
    // sizing div as direct children) is one level further up. The two
    // assertions below are unchanged from the brief — only the number of
    // `parentElement` hops needed to reach them.
    const inspector = await screen.findByTestId('inspector-dock')
    const row = inspector.parentElement!.parentElement!
    expect(row.querySelector('[data-region="canvas"]')).not.toBeNull()
    expect(row.style.display).toBe('flex')
  })

  it('moves Source, Target and DDL into the drawer rather than the page body', async () => {
    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    // Drawer tabs are present…
    expect(await screen.findByRole('button', { name: /^Source$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Target$/ })).toBeInTheDocument()
    // …and their content is not rendered until the tab is opened.
    expect(screen.queryByText('S', { selector: 'span' })).not.toBeInTheDocument()
  })
})

// ─── Task 5: undo/redo ──────────────────────────────────────────────────────

describe('ETLModifier — undo/redo (Task 5)', () => {
  it('starts with Undo and Redo both disabled', async () => {
    await loadAndSelectT()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  it('three edits, undo twice steps the field value and dirty count back; redo once steps forward', async () => {
    const formula = await loadAndSelectT()

    fireEvent.change(formula, { target: { value: '2' } })
    fireEvent.blur(formula)
    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()

    fireEvent.change(await screen.findByDisplayValue('2'), { target: { value: '3' } })
    fireEvent.blur(screen.getByDisplayValue('3'))
    expect(await screen.findByText('2 unsaved changes')).toBeInTheDocument()

    fireEvent.change(await screen.findByDisplayValue('3'), { target: { value: '4' } })
    fireEvent.blur(screen.getByDisplayValue('4'))
    expect(await screen.findByText('3 unsaved changes')).toBeInTheDocument()

    // Undo twice: field value AND dirty count both step back.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByDisplayValue('3')).toBeInTheDocument()
    expect(await screen.findByText('2 unsaved changes')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByDisplayValue('2')).toBeInTheDocument()
    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()

    // Redo once: both step forward again.
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(await screen.findByDisplayValue('3')).toBeInTheDocument()
    expect(await screen.findByText('2 unsaved changes')).toBeInTheDocument()
  })

  it('pushing a new edit after an undo truncates the redo branch (standard editor semantics)', async () => {
    const formula = await loadAndSelectT()

    fireEvent.change(formula, { target: { value: '2' } })
    fireEvent.blur(formula)
    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByDisplayValue('1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redo' })).not.toBeDisabled()

    // A fresh edit from here must discard the redo branch rather than leaving
    // '2' reachable via Redo.
    fireEvent.change(await screen.findByDisplayValue('1'), { target: { value: '9' } })
    fireEvent.blur(screen.getByDisplayValue('9'))
    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  it('Discard resets the history stack — Undo goes back to disabled', async () => {
    const formula = await loadAndSelectT()
    fireEvent.change(formula, { target: { value: '2' } })
    fireEvent.blur(formula)
    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).not.toBeDisabled()

    fireEvent.click(screen.getByText('Discard'))

    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })
})

// ─── Task 15: New recipe from scratch ──────────────────────────────────────
//
// The bonus ask: author an `_ETL_*.json` on a blank canvas rather than only
// editing recipes the parser produced. `+ New recipe` opens `NewRecipeDialog`
// (its own layer/mapping-name picker, unit-tested in isolation); Create seeds
// an EMPTY draft with NO recipe GET; the ordering problem (nothing upstream
// exists yet on a blank canvas) is resolved by `NodeConfigDialog`'s
// empty-draft accommodation (also unit-tested in isolation) letting a source
// table be the first node with no consuming step yet; Save POSTs until the
// first successful create, then behaves like any other open recipe.

describe('ETLModifier — new recipe from scratch (Task 15)', () => {
  it('the New recipe control opens a dialog listing the registry layers, and Cancel leaves the canvas untouched', async () => {
    renderModifier()
    fireEvent.click(await screen.findByText('+ New recipe'))

    expect(await screen.findByRole('button', { name: 'ZTESTLAYER' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'CDM' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('New recipe')).not.toBeInTheDocument()
    expect(screen.getByText('Select an _ETL_*.json recipe to edit')).toBeInTheDocument()
  })

  it('entering a mapping name shows the exact path that will be created', async () => {
    renderModifier()
    fireEvent.click(await screen.findByText('+ New recipe'))
    fireEvent.click(await screen.findByRole('button', { name: 'CDM' }))
    fireEvent.change(screen.getByLabelText(/mapping name/i), { target: { value: 'm_NEW_ONE' } })

    expect(screen.getByText('CDM/m_NEW_ONE/_ETL_m_NEW_ONE.json')).toBeInTheDocument()
  })

  it('Create opens the editor with an empty draft and issues no recipe fetch', async () => {
    let recipeGetCalled = false
    server.use(
      http.get('/api/recipes/CDM/m_NEW_ONE/_ETL_m_NEW_ONE.json', () => {
        recipeGetCalled = true
        return HttpResponse.json({ path: 'CDM/m_NEW_ONE/_ETL_m_NEW_ONE.json' })
      }),
    )

    renderModifier()
    fireEvent.click(await screen.findByText('+ New recipe'))
    fireEvent.click(await screen.findByRole('button', { name: 'CDM' }))
    fireEvent.change(screen.getByLabelText(/mapping name/i), { target: { value: 'm_NEW_ONE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    // The toolbar identity reflects the TARGET path directly — no GET landed.
    expect(await screen.findByRole('heading', { name: '_ETL_m_NEW_ONE.json' })).toBeInTheDocument()
    // An empty draft: nothing dirtied it yet, so Save/Discard aren't shown.
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument()
    // The dialog itself is gone.
    expect(screen.queryByText('New recipe')).not.toBeInTheDocument()

    expect(recipeGetCalled).toBe(false)
  })

  it('building a node through the config dialog and saving issues a POST to the new recipe path', async () => {
    let capturedPost: unknown = null
    server.use(
      http.post('/api/recipes/CDM/m_NEW_ONE/_ETL_m_NEW_ONE.json', async ({ request }) => {
        capturedPost = await request.json()
        return HttpResponse.json({
          path: 'CDM/m_NEW_ONE/_ETL_m_NEW_ONE.json',
          fileName: '_ETL_m_NEW_ONE.json',
          sizeBytes: 80,
          modifiedAt: '2026-08-01T00:00:00Z',
          content: capturedPost,
        }, { status: 201 })
      }),
      http.get('/api/recipes/CDM/m_NEW_ONE/_ETL_m_NEW_ONE.json', () => HttpResponse.json({
        path: 'CDM/m_NEW_ONE/_ETL_m_NEW_ONE.json',
        fileName: '_ETL_m_NEW_ONE.json',
        sizeBytes: 80,
        modifiedAt: '2026-08-01T00:00:00Z',
        content: capturedPost ?? { steps: [], table: { targetTableNames: [], sourceTableNames: [] } },
      })),
      http.get('/api/ddl/CDM/m_NEW_ONE', () => HttpResponse.json({})),
      http.get('/api/layouts/CDM/m_NEW_ONE/_ETL_m_NEW_ONE.json', () => HttpResponse.json({ version: 1, nodes: {} })),
    )

    renderModifier()
    fireEvent.click(await screen.findByText('+ New recipe'))
    fireEvent.click(await screen.findByRole('button', { name: 'CDM' }))
    fireEvent.change(screen.getByLabelText(/mapping name/i), { target: { value: 'm_NEW_ONE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await screen.findByRole('heading', { name: '_ETL_m_NEW_ONE.json' })

    // The ordering problem: nothing exists yet, so the FIRST node addable is a
    // source table (NodeConfigDialog's empty-draft accommodation).
    fireEvent.click(screen.getByText('source table'))
    await screen.findByText('Add source table')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'NEWSRC' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Insert' })).not.toBeDisabled(), { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Save Changes'))

    await waitFor(() => expect(capturedPost).not.toBeNull())
    expect((capturedPost as { table: { sourceTableNames: string[] } }).table.sourceTableNames).toEqual(['NEWSRC'])
    // Saved: the draft is no longer dirty, and the recipe behaves like any
    // other open one from here (PUT thereafter — see the next test).
    await waitFor(() => expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument())
  })

  // Final whole-branch review, non-blocking 1. `useRegistry` is `staleTime:
  // Infinity` on the (once true) reasoning that nothing can make the registry
  // stale mid-session. Tasks 14/15 then added `POST /api/recipes/{*path}`, and
  // a PUT can rewrite `table.sourceTableNames` — both change what
  // `RegistryService` would walk. Without an invalidation the operator authors
  // a recipe and then cannot find its tables in the very search box built to
  // find them, for the rest of the session.
  // `useRegistry` mounts only behind the config dialog's registry picker, so
  // the symptom is not a missing live refetch — it is that REMOUNTING the
  // picker after a save serves the `staleTime: Infinity` cache without ever
  // asking the server again.
  it('re-fetches the registry after a save, so a freshly authored recipe is findable', async () => {
    let registryFetches = 0
    server.use(
      http.get('/api/registry', () => { registryFetches += 1; return HttpResponse.json(REGISTRY) }),
      http.put('/api/recipes/CDM/m_FIX/_ETL_m_FIX.json', () => HttpResponse.json({
        path: 'CDM/m_FIX/_ETL_m_FIX.json',
        fileName: '_ETL_m_FIX.json',
        sizeBytes: 321,
        modifiedAt: '2026-07-31T12:00:00Z',
        content: MINI,
      })),
    )
    const openRegistryPicker = async () => {
      fireEvent.click(screen.getByText('source table'))
      await screen.findByText('Add source table')
      fireEvent.click(screen.getByRole('button', { name: 'Pick from registry' }))
    }

    // Any edit at all — the point is the save, not what changed.
    const formula = await loadAndSelectT()

    await openRegistryPicker()
    await waitFor(() => expect(registryFetches).toBe(1))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    fireEvent.change(formula, { target: { value: '2' } })
    fireEvent.blur(formula)
    expect(await screen.findByText(/unsaved change/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Save Changes'))
    await waitFor(() => expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument())

    // A save can add or remove table names, so the cached inventory is now
    // provably out of date — the next picker must ask again.
    await openRegistryPicker()
    await waitFor(() => expect(registryFetches).toBe(2))
  })

  it('a second save after the first successful create PUTs (never POSTs again) with the freshly-created baseModified', async () => {
    let capturedPost: unknown = null
    let postCallCount = 0
    let capturedPut: { baseModified?: string; content?: unknown } | null = null
    server.use(
      http.post('/api/recipes/CDM/m_NEW_ONE/_ETL_m_NEW_ONE.json', async ({ request }) => {
        postCallCount += 1
        capturedPost = await request.json()
        return HttpResponse.json({
          path: 'CDM/m_NEW_ONE/_ETL_m_NEW_ONE.json',
          fileName: '_ETL_m_NEW_ONE.json',
          sizeBytes: 80,
          modifiedAt: '2026-08-01T00:00:00Z',
          content: capturedPost,
        }, { status: 201 })
      }),
      http.get('/api/recipes/CDM/m_NEW_ONE/_ETL_m_NEW_ONE.json', () => HttpResponse.json({
        path: 'CDM/m_NEW_ONE/_ETL_m_NEW_ONE.json',
        fileName: '_ETL_m_NEW_ONE.json',
        sizeBytes: 80,
        modifiedAt: '2026-08-01T00:00:00Z',
        content: capturedPost ?? { steps: [], table: { targetTableNames: [], sourceTableNames: [] } },
      })),
      http.put('/api/recipes/CDM/m_NEW_ONE/_ETL_m_NEW_ONE.json', async ({ request }) => {
        capturedPut = await request.json() as { baseModified?: string; content?: unknown }
        return HttpResponse.json({
          path: 'CDM/m_NEW_ONE/_ETL_m_NEW_ONE.json',
          fileName: '_ETL_m_NEW_ONE.json',
          sizeBytes: 120,
          modifiedAt: '2026-08-01T00:05:00Z',
          content: capturedPut.content,
        })
      }),
      http.get('/api/ddl/CDM/m_NEW_ONE', () => HttpResponse.json({})),
      http.get('/api/layouts/CDM/m_NEW_ONE/_ETL_m_NEW_ONE.json', () => HttpResponse.json({ version: 1, nodes: {} })),
    )

    renderModifier()
    fireEvent.click(await screen.findByText('+ New recipe'))
    fireEvent.click(await screen.findByRole('button', { name: 'CDM' }))
    fireEvent.change(screen.getByLabelText(/mapping name/i), { target: { value: 'm_NEW_ONE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await screen.findByRole('heading', { name: '_ETL_m_NEW_ONE.json' })

    fireEvent.click(screen.getByText('source table'))
    await screen.findByText('Add source table')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'NEWSRC' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Insert' })).not.toBeDisabled(), { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))
    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Save Changes'))
    await waitFor(() => expect(capturedPost).not.toBeNull())
    await waitFor(() => expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument())
    expect(postCallCount).toBe(1)

    // The recipe is real now — an ordinary open recipe. A second edit + Save
    // must PUT, carrying the `modifiedAt` the create response (re-fetched via
    // the GET that re-enabled once `authoring` flipped off) actually returned
    // — never POST again.
    fireEvent.click(screen.getByText('source table'))
    await screen.findByText('Add source table')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'NEWSRC2' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Insert' })).not.toBeDisabled(), { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))
    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Save Changes'))

    await waitFor(() => expect(capturedPut).not.toBeNull())
    expect(capturedPut!.baseModified).toBe('2026-08-01T00:00:00Z')
    expect(postCallCount).toBe(1)
    await waitFor(() => expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument())
  })

  it('a 409 from a colliding name surfaces as a visible error, not a silent failure', async () => {
    server.use(
      http.post('/api/recipes/CDM/m_FIX/_ETL_m_FIX.json', () =>
        HttpResponse.json({ title: 'Conflict', detail: 'Recipe already exists at CDM/m_FIX/_ETL_m_FIX.json' }, { status: 409 })),
    )

    renderModifier()
    fireEvent.click(await screen.findByText('+ New recipe'))
    fireEvent.click(await screen.findByRole('button', { name: 'CDM' }))
    // Deliberately collides with the recipe the shared fixtures already serve
    // at CDM/m_FIX/_ETL_m_FIX.json — Create never pre-checks (no recipe
    // fetch), so the collision is only discovered on Save.
    fireEvent.change(screen.getByLabelText(/mapping name/i), { target: { value: 'm_FIX' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await screen.findByRole('heading', { name: '_ETL_m_FIX.json' })

    fireEvent.click(screen.getByText('source table'))
    await screen.findByText('Add source table')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'NEWSRC' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Insert' })).not.toBeDisabled(), { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))
    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Save Changes'))

    const detail = await screen.findByText('Recipe already exists at CDM/m_FIX/_ETL_m_FIX.json')
    expect(detail).toHaveStyle({ color: 'var(--red)' })
    // Not a silent failure: the edit is still unsaved, still on screen.
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
  })
})
