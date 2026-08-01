import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { ETLModifier } from './ETLModifier'

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

const TREE = {
  name: 'xmltobq', path: '', kind: 'dir', layer: 'root',
  children: [
    {
      name: 'CDM', path: 'CDM', kind: 'dir', layer: 'CDM',
      children: [
        { name: '_ETL_m_FIX.json', path: 'CDM/m_FIX/_ETL_m_FIX.json', kind: 'json' },
      ],
    },
  ],
}

const server = setupServer(
  http.get('/api/tree', () => HttpResponse.json(TREE)),
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

    // Header card: fileName as title (also still present in the tree), real
    // RecipeDto metadata (Path / Size bytes / Modified) as read-only fields.
    expect(screen.getAllByText('_ETL_m_FIX.json').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByDisplayValue('CDM/m_FIX/_ETL_m_FIX.json')).toBeInTheDocument()
    expect(screen.getByDisplayValue('321')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2026-07-31T00:00:00Z')).toBeInTheDocument()

    // Source / Target lists driven from table.sourceTableNames/targetTableNames.
    expect(screen.getAllByText('S').length).toBeGreaterThan(0)

    // Raw JSON is not shown until toggled.
    expect(screen.queryByText('S.B')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('{ raw JSON }'))
    expect(await screen.findByText(/S\.B/)).toBeInTheDocument()

    // DDL section absent for an empty /api/ddl map.
    expect(screen.queryByText('BigQuery DDL Schema')).not.toBeInTheDocument()
  })

  it('clicking a non-recipe json leaf does nothing harmful (no recipe fetch, no crash)', async () => {
    server.use(http.get('/api/tree', () => HttpResponse.json({
      name: 'xmltobq', path: '', kind: 'dir', layer: 'root',
      children: [
        {
          name: 'CDM', path: 'CDM', kind: 'dir', layer: 'CDM',
          children: [
            { name: 'BIZLINK.json', path: 'CDM/m_FIX/BIZLINK.json', kind: 'json' },
          ],
        },
      ],
    })))

    renderModifier()

    const file = await screen.findByText('BIZLINK.json')
    fireEvent.click(file)

    // Still on the empty-hint state — no recipe was activated.
    expect(await screen.findByText('Select an _ETL_*.json recipe to edit')).toBeInTheDocument()
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

    // Baseline: the header card shows the LIVE recipe's own metadata.
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

    // Review finding: the header card must follow the archive too — showing
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

    // The header card's LIVE values are back (the recipe query was invalidated
    // and refetched — the base GET handler's own values, since this MSW
    // fixture doesn't simulate the rollback mutating the live file on disk).
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

// ─── Task 11: expression registry — merged XML + recipe origins ──────────────

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
]

describe('ETLModifier — expression registry (Task 11)', () => {
  it('renders both xml- and recipe-origin entries corpus-wide, with origin badges', async () => {
    server.use(http.get('/api/expressions', () => HttpResponse.json(REGISTRY_ENTRIES)))

    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('T', { selector: 'text' })

    expect(await screen.findByText('LTRIM(COL_A)')).toBeInTheDocument()
    expect(screen.getByText('ROUND(STG_L_SYN_ORDERS.AMOUNT, 2)')).toBeInTheDocument()
    expect(screen.getByText('xml')).toBeInTheDocument()
    expect(screen.getByText('recipe')).toBeInTheDocument()
  })

  it('filter box narrows the registry by substring', async () => {
    server.use(http.get('/api/expressions', () => HttpResponse.json(REGISTRY_ENTRIES)))

    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    await screen.findByText('T', { selector: 'text' })
    await screen.findByText('LTRIM(COL_A)')

    fireEvent.change(screen.getByPlaceholderText('Filter expressions…'), { target: { value: 'AMOUNT' } })

    expect(screen.queryByText('LTRIM(COL_A)')).not.toBeInTheDocument()
    expect(screen.getByText('ROUND(STG_L_SYN_ORDERS.AMOUNT, 2)')).toBeInTheDocument()
  })

  it('Insert writes the entry formula into the focused formula textarea and dirties the SaveBar', async () => {
    server.use(http.get('/api/expressions', () => HttpResponse.json(REGISTRY_ENTRIES)))

    const formula = await loadAndSelectT()
    expect(screen.queryAllByText('Insert')).toHaveLength(0)

    fireEvent.focus(formula)
    const inserts = await screen.findAllByText('Insert')
    expect(inserts).toHaveLength(REGISTRY_ENTRIES.length)

    fireEvent.click(inserts[1]) // the recipe-origin ROUND(...) entry

    expect(await screen.findByDisplayValue('ROUND(STG_L_SYN_ORDERS.AMOUNT, 2)')).toBeInTheDocument()
    expect(await screen.findByText('1 unsaved change')).toBeInTheDocument()
  })

  it('mounts the canvas inside a flex container so EtlCanvas flex:1 resolves to a real height', async () => {
    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    const nodeText = await screen.findByText('T', { selector: 'text' })

    // Walk up from the rendered node to the fixed-height canvas host and assert every
    // ancestor between them participates in flex layout. EtlCanvas's root is `flex: 1`
    // with absolutely-positioned children, so a non-flex parent collapses it to 0px and
    // the canvas renders invisibly (the original bug: "Canvas (2 nodes)" over an empty box).
    const svg = nodeText.closest('svg')!
    const canvasRoot = svg.parentElement!            // EtlCanvas root div (flex: 1)
    const host = canvasRoot.parentElement!           // the height:420 wrapper
    expect(host.style.height).toBe('420px')
    expect(host.style.display).toBe('flex')
  })
})
