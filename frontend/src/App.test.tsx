import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import App from './App'
// Task 12: shared relationships fixture (Tab 3 and Tab 4 both consume
// `/api/relationships` — one handler covers both once a tab is visited).
import { REL } from './api/__fixtures__/relationships'

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

// Task 12: Tab 3/Tab 4 fixtures — only reached once a test actually clicks into
// those tabs (mounting is now lazy-on-first-visit), sized minimally against the
// shared REL fixture (mirrors the ETLOperational.test.tsx / ETLDag.test.tsx idiom
// rather than inventing a new shape).
const OPERATIONAL_DATES = { dates: ['2026-07-28', '2026-07-29'], mode: 'mock' }
// Task 14: Tab 3 now opens on the cluster index alone — the graph, summary and dates are not
// requested until a cluster is selected, so this is what decides whether the tab renders at all.
const CLUSTER_INDEX = {
  mode: 'mock',
  dates: OPERATIONAL_DATES.dates,
  totals: { clusters: 1, recipes: 1, dates: 2, rows: 2 },
  clusters: [{ name: 'cl-a', recipeCount: 1, dateIdx: [0, 1], rows: 2, ok: 2, ko: 0,
    lastDate: '2026-07-29', lastStatus: 'SUCCESS' }],
}
const OPERATIONAL_SUMMARY = { dates: OPERATIONAL_DATES.dates, recipes: [] }
const APP_CONFIG = { gcpProjectId: 'mock-project' }

const server = setupServer(
  http.get('/api/tree', () => HttpResponse.json(TREE)),
  http.get('/api/summary', () => HttpResponse.json({ xmlCount: 1, recipeCount: 1, ddlCount: 0, dirCount: 1, layers: ['CDM'] })),
  http.get('/api/recipes/CDM/m_FIX/_ETL_m_FIX.json', () => HttpResponse.json(RECIPE)),
  http.get('/api/ddl/CDM/m_FIX', () => HttpResponse.json({})),
  http.get('/api/expressions', () => HttpResponse.json([])),
  http.get('/api/ipc/rules', () => HttpResponse.json({ rules: [], typeAliases: {}, keyAliases: {}, keySchema: {} })),
  http.get('/api/layouts/CDM/m_FIX/_ETL_m_FIX.json', () => HttpResponse.json({ version: 1, nodes: {} })),
  http.post('/api/recipes/validate', () => HttpResponse.json({ valid: true, errors: [] })),
  http.get('/api/relationships', () => HttpResponse.json(REL)),
  http.get('/api/operational/dates', () => HttpResponse.json(OPERATIONAL_DATES)),
  http.get('/api/operational/summary', () => HttpResponse.json(OPERATIONAL_SUMMARY)),
  http.get('/api/config', () => HttpResponse.json(APP_CONFIG)),
  http.get('/api/diagnostics', () => HttpResponse.json({ status: 'ok' })),
  // Registered BEFORE the parameterized `:date` handler below — MSW matches in
  // registration order, and `:date` would otherwise swallow "runs" as a date
  // (same hazard ETLDag.test.tsx documents).
  http.get('*/api/operational/runs', () => HttpResponse.json({ limit: 10, byRecipe: {} })),
  // Same registration-order hazard: `:date` would otherwise swallow "clusters".
  http.get('*/api/operational/clusters', () => HttpResponse.json(CLUSTER_INDEX)),
  http.get('*/api/operational/:date', ({ params }) => HttpResponse.json({ date: String(params.date), rows: [] })),
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

// Task 12: keeping a visited tab mounted (display:none) instead of unmounting it —
// this is the half of the "recompute on every return" fix that no view-state store
// can cover (scroll offsets, canvas layout work).
describe('App — visited tabs stay mounted (Task 12)', () => {
  it('keeps a visited tab mounted after switching away', async () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: /ETL Operational/ }))
    // Task 14: with nothing selected Tab 3 renders the cluster pane + prompt, not the toolbar —
    // so the prompt, not the toolbar's search box, is the marker for "Tab 3 is mounted".
    await screen.findByText(/Select a cluster/)

    fireEvent.click(screen.getByRole('button', { name: /ETL DAG/ }))

    // Still in the DOM, just not displayed — this is what makes the return instant.
    expect(screen.getByText(/Select a cluster/)).toBeInTheDocument()
  })

  it('does not mount a tab that was never visited', () => {
    renderApp()
    expect(screen.queryByText(/Select a cluster/)).not.toBeInTheDocument()
  })
})
