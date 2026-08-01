import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import App from './App'

// Task 15: focus mode — a deep link (`?focus=<recipePath>`) that renders one
// recipe's editor full-viewport with no TopBar/tab strip and no Explorer, so
// two recipes can sit side by side in separate browser tabs.

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

const RECIPE = {
  path: 'CDM/m_FIX/_ETL_m_FIX.json',
  fileName: '_ETL_m_FIX.json',
  sizeBytes: 321,
  modifiedAt: '2026-07-31T00:00:00Z',
  content: {
    steps: [{ target: { name: 'T', type: 'table', fields: [] }, sources: [] }],
    table: { targetTableNames: ['T'], sourceTableNames: [] },
  },
}

const server = setupServer(
  http.get('/api/tree', () => HttpResponse.json(TREE)),
  http.get('/api/recipes/CDM/m_FIX/_ETL_m_FIX.json', () => HttpResponse.json(RECIPE)),
  http.get('/api/ddl/CDM/m_FIX', () => HttpResponse.json({})),
  http.get('/api/expressions', () => HttpResponse.json([])),
  http.get('/api/ipc/rules', () => HttpResponse.json({ rules: [], typeAliases: {}, keyAliases: {}, keySchema: {} })),
  http.get('/api/layouts/CDM/m_FIX/_ETL_m_FIX.json', () => HttpResponse.json({ version: 1, nodes: {} })),
  http.post('/api/recipes/validate', () => HttpResponse.json({ valid: true, errors: [] })),
)
beforeAll(() => server.listen())
afterEach(() => {
  server.resetHandlers()
  cleanup()
  // Reset the query string so a later test in this file (or, if vitest ever
  // shares jsdom globals across files, a later file) doesn't inherit focus
  // mode from a prior test.
  window.history.replaceState({}, '', '/')
})
afterAll(() => server.close())

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  )
}

describe('App — focus mode (Task 15)', () => {
  it('?focus=<recipePath> renders only that recipe, full-viewport: no tab bar, no Explorer', async () => {
    window.history.replaceState({}, '', '/?focus=' + encodeURIComponent('CDM/m_FIX/_ETL_m_FIX.json'))
    renderApp()

    // Recipe header renders the file name (as the <h2> title — the canvas
    // also renders it a second time, as each node's file-origin subtitle
    // (NodeBox.tsx's `node.file`), so this asserts the heading specifically
    // rather than counting every occurrence).
    expect(await screen.findByRole('heading', { name: '_ETL_m_FIX.json' })).toBeInTheDocument()

    // No tab bar — none of the four tab labels render.
    expect(screen.queryByText('IPC ETL Viewer')).not.toBeInTheDocument()
    expect(screen.queryByText('ETL Modifier')).not.toBeInTheDocument()
    expect(screen.queryByText('ETL Operational')).not.toBeInTheDocument()
    expect(screen.queryByText('ETL DAG')).not.toBeInTheDocument()

    // No Explorer — Sidebar's own "Explorer" header label is absent entirely.
    expect(screen.queryByText('Explorer')).not.toBeInTheDocument()
  })

  it('a ?focus= value that does not resolve to a real recipe degrades to the existing recipe-fetch error state, not a blank screen', async () => {
    server.use(http.get('/api/recipes/CDM/m_FIX/_ETL_MISSING.json', () =>
      HttpResponse.json({ title: 'Not found', detail: 'No such recipe.' }, { status: 404 })))
    window.history.replaceState({}, '', '/?focus=' + encodeURIComponent('CDM/m_FIX/_ETL_MISSING.json'))

    renderApp()

    expect(await screen.findByText('Not found')).toBeInTheDocument()
    expect(screen.getByText('No such recipe.')).toBeInTheDocument()
    // Still no tab bar / Explorer even in the error path.
    expect(screen.queryByText('IPC ETL Viewer')).not.toBeInTheDocument()
    expect(screen.queryByText('Explorer')).not.toBeInTheDocument()
  })

  it('no query param renders the normal four-tab shell', async () => {
    renderApp()

    expect(await screen.findByText('IPC ETL Viewer')).toBeInTheDocument()
    expect(screen.getByText('ETL Modifier')).toBeInTheDocument()
    expect(screen.getByText('ETL Operational')).toBeInTheDocument()
    expect(screen.getByText('ETL DAG')).toBeInTheDocument()
  })
})
