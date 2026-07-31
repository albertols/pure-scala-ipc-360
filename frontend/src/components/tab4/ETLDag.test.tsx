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

describe('ETLDag — real run selector, per-date coloring, GCP links, replay-mock', () => {
  it('(a) "Now" resolves to the latest snapshot (2026-07-29): A failed with a red accent, B skipped', async () => {
    const { container } = renderDag()

    fireEvent.click(await screen.findByText('wf_FIX_ODS'))

    expect(await screen.findByText(/^failed/)).toBeInTheDocument()
    expect(screen.getByText('skipped')).toBeInTheDocument()
    expect(container.querySelector('rect[fill="#f87171"]')).not.toBeNull()
  })

  it('(b) run history renders 2 rows; clicking 2026-07-28 flips A back to success', async () => {
    const { container } = renderDag()

    fireEvent.click(await screen.findByText('wf_FIX_ODS'))
    // Select task B (not A) so the panel's own Status meta row can't collide
    // with A's "failed"/"success" text on the canvas below.
    fireEvent.click(await screen.findByText('_ETL_m_FIX_ODS_B.json', { selector: 'span' }))

    expect(await screen.findByText(/^failed/)).toBeInTheDocument()
    expect(container.querySelector('rect[fill="#f87171"]')).not.toBeNull()

    const rows = screen.getAllByText(/^2026-07-2[89]$/)
    expect(rows).toHaveLength(2)

    fireEvent.click(screen.getByText('2026-07-28'))

    expect(await screen.findByText(/^success/)).toBeInTheDocument()
    expect(container.querySelector('rect[fill="#34d399"]')).not.toBeNull()
  })

  it('(c) task A panel: Message row + GCP template links with the mock-project fallback', async () => {
    renderDag()

    fireEvent.click(await screen.findByText('wf_FIX_ODS'))
    fireEvent.click(await screen.findByText('_ETL_m_FIX_ODS_A.json', { selector: 'span' }))

    expect(await screen.findByText('Stage failure (synthetic)')).toBeInTheDocument()

    const clusterLink = (await screen.findByText(/cluster ↗/)) as HTMLAnchorElement
    expect(clusterLink.getAttribute('href')).toContain('project=mock-project')
    expect(clusterLink.getAttribute('href')).toContain('cluster-wf-fix-00-1234')

    const logsLink = screen.getByText(/logs ↗/) as HTMLAnchorElement
    expect(logsLink.getAttribute('href')).toContain('application_1774840360_11000')
  })

  it('(d) the synthesized Operational State card renders the KO badge and 2 history cells', async () => {
    renderDag()

    fireEvent.click(await screen.findByText('wf_FIX_ODS'))
    fireEvent.click(await screen.findByText('_ETL_m_FIX_ODS_A.json', { selector: 'span' }))

    expect(await screen.findByText('Operational State')).toBeInTheDocument()
    expect(screen.getByText('KO')).toBeInTheDocument()
    expect(screen.getAllByTitle(/^Run \d+:/)).toHaveLength(2)
  })

  it('(e) replay stays mock: confirming shows the success toast', async () => {
    renderDag()

    fireEvent.click(await screen.findByText('wf_FIX_ODS'))
    fireEvent.click(await screen.findByText('_ETL_m_FIX_ODS_A.json', { selector: 'span' }))

    fireEvent.click(await screen.findByText('Replay from this task ▶'))
    fireEvent.click(await screen.findByText('Publish Replay'))

    expect(await screen.findByText(/Replay published for/)).toBeInTheDocument()
  })
})
