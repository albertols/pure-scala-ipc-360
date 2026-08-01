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
}

// Task 16: static corpus counts for the Explorer footer's corpus summary.
const SUMMARY = { xmlCount: 81, recipeCount: 86, ddlCount: 212, dirCount: 119, layers: ['CDM', 'DWH', 'ETL', 'ODS', 'OUTPUT', 'QDM', 'RDM', 'STG'] }

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

describe('ETLModifier — palette, click-wire, delete (Task 9)', () => {
  it('palette: clicking "target table" adds a NEW_TABLE_1 node and dirties the SaveBar', async () => {
    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('T', { selector: 'text' })

    fireEvent.click(screen.getByText('target table'))

    expect(await screen.findByText('NEW_TABLE_1', { selector: 'text' })).toBeInTheDocument()
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

  it('palette-add a node, give it a field via "+ field", then click-wire into its new port writes the dot-ref', async () => {
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

    // Palette-add a fresh target table node: inert (fields: [], no ports) until
    // it gains a field.
    fireEvent.click(screen.getByText('target table'))
    const newNode = await screen.findByText('NEW_TABLE_1', { selector: 'text' })

    // Select it and use the "+ field" affordance to give it its first field.
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
    fireEvent.click(screen.getByText('A'))
    expect(await screen.findByText('wire: S.A → click an IN port')).toBeInTheDocument()
    fireEvent.click(screen.getByText('X', { selector: 'text' }))

    fireEvent.click(screen.getByText('{ raw JSON }'))
    expect(await screen.findByText(/"source": "S\.A"/)).toBeInTheDocument()
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
