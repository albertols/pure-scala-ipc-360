import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
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
