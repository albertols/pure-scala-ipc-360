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
