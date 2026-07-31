import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { REL } from '../../api/dagAdapter.test'
import { ETLDag } from './ETLDag'

// No RTL auto-cleanup in this project's setup — explicit cleanup between
// renders across the tests below (model: DetailPanel.test.tsx:8).
afterEach(() => cleanup())

// Task-2 ROWS shapes, inlined (b15 rows for the two REL fixture dates).
const ROWS_28 = [{
  clusterName: 'cluster-wf-fix-00-1234', recipeFilename: '_ETL_m_FIX_ODS_A.json',
  jobId: 'application_1774840360_11000', appStartIso: '2026-07-28T04:00:00.000Z',
  avgJobDurationInMinsSec: '10m 00sec', status: 'SUCCESS', message: '',
}]
const ROWS_29 = [{
  clusterName: 'cluster-wf-fix-00-1234', recipeFilename: '_ETL_m_FIX_ODS_A.json',
  jobId: 'application_1774840360_11000', appStartIso: '2026-07-29T04:12:00.000Z',
  avgJobDurationInMinsSec: '5m 30sec', status: 'FAILED', message: 'Stage failure (synthetic)',
}]

const server = setupServer(
  http.get('/api/relationships', () => HttpResponse.json(REL)),
  // Forward-compat handlers (Task 4 adds the real reads) — present now so MSW
  // doesn't warn about unhandled requests once the run selector lands.
  http.get('/api/operational/dates', () => HttpResponse.json({ dates: ['2026-07-28', '2026-07-29'], mode: 'mock' })),
  http.get('/api/operational/2026-07-28', () => HttpResponse.json({ date: '2026-07-28', rows: ROWS_28 })),
  http.get('/api/operational/2026-07-29', () => HttpResponse.json({ date: '2026-07-29', rows: ROWS_29 })),
  http.get('/api/config', () => HttpResponse.json({})),
)
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderDag() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ETLDag />
    </QueryClientProvider>,
  )
}

describe('ETLDag — real clusters/canvas', () => {
  it('explorer lists real workflows, UNGROUPED absent', async () => {
    renderDag()

    expect(await screen.findByText('wf_FIX_ODS')).toBeInTheDocument()
    expect(screen.getByText('wf_FIX_STG')).toBeInTheDocument()
    expect(screen.queryByText('UNGROUPED')).not.toBeInTheDocument()
  })

  it('clicking a workflow renders both its task nodes on the canvas', async () => {
    renderDag()

    const wf = await screen.findByText('wf_FIX_ODS')
    fireEvent.click(wf)

    // { selector: 'text' } excludes TaskNode's nested <title> (a11y tooltip),
    // which independently matches the same string under RTL's own-text-node rule.
    // Both fixture recipe filenames are 21 chars, over TaskNode's 20-char cutoff
    // (`task.task_id.slice(0, 19) + '…'`), so the rendered <text> label truncates —
    // the <title> alone carries the untruncated id.
    expect(await screen.findByText('_ETL_m_FIX_ODS_A.js…', { selector: 'text' })).toBeInTheDocument()
    expect(screen.getByText('_ETL_m_FIX_ODS_B.js…', { selector: 'text' })).toBeInTheDocument()
  })

  it('renders the red error block on a relationships fetch failure', async () => {
    server.use(
      http.get('/api/relationships', () =>
        HttpResponse.json(
          { title: 'Internal Server Error', detail: 'boom' },
          { status: 500, headers: { 'Content-Type': 'application/problem+json' } },
        )),
    )

    renderDag()

    expect(await screen.findByText('Internal Server Error')).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
  })

  it('renders the empty hint when the relationships graph has no recipes', async () => {
    server.use(
      http.get('/api/relationships', () =>
        HttpResponse.json({ nodes: [], edges: [], meta: { entryCount: 0, skippedRows: 0, layers: [] } })),
    )

    renderDag()

    expect(await screen.findByText('No workflows in the relationships graph')).toBeInTheDocument()
  })
})
