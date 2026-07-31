import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { ETLOperational } from './ETLOperational'
import type { RelationshipGraph } from '../../api/queries'
import type { components } from '../../api/types.gen'

type OperationalSummaryDto = components['schemas']['OperationalSummaryDto']
type OperationalDatesDto = components['schemas']['OperationalDatesDto']
type AppConfigDto = components['schemas']['AppConfigDto']

// Mini graph: 1 STG source table -> 1 STG recipe -> 1 STG target table.
// Single shared layer keeps the layer-chip step of the flow compatible with
// the search-narrowed selection (see flow comment below).
const GRAPH: RelationshipGraph = {
  nodes: [
    { id: 't_src', kind: 'table', name: 'stg_dwhes.CAS_T_SRC', layer: 'STG' },
    { id: 'r', kind: 'recipe', name: '_ETL_m_CAS_T.json', layer: 'STG' },
    { id: 't_tgt', kind: 'table', name: 'stg_dwhes.CAS_T_TGT', layer: 'STG' },
  ],
  edges: [
    { from: 't_src', to: 'r', kind: 'source' },
    { from: 'r', to: 't_tgt', kind: 'writes' },
  ],
  meta: { entryCount: 2, skippedRows: 0, layers: ['STG'] },
}

// Recipe OK on the LATEST date (2026-07-29, the default selectedDate =
// dates.at(-1)), KO on the earlier date — proves the adapter wiring picks
// the latest date, not just "some" status.
const SUMMARY: OperationalSummaryDto = {
  dates: ['2026-07-28', '2026-07-29'],
  recipes: [
    {
      recipeFilename: '_ETL_m_CAS_T.json',
      layer: 'STG',
      latestDate: '2026-07-29',
      latestStatus: 'SUCCESS',
      okCount: 1,
      koCount: 1,
      history: [
        { date: '2026-07-28', status: 'FAILED', durationMin: 1.5 },
        { date: '2026-07-29', status: 'SUCCESS', durationMin: 1.2 },
      ],
      avgDurationMin: 1.35,
      p50DurationMin: 1.2,
      p95DurationMin: 1.5,
      lastJobId: 'application_cas_t_0029',
      lastClusterName: 'cluster-cas-t',
    },
  ],
}

const DATES: OperationalDatesDto = { dates: ['2026-07-28', '2026-07-29'], mode: 'mock' }

// 14 consecutive dates + a matching 14-entry recipe history, for the
// full-history-strip assertion (`HistoryBar` renders one cell per entry).
const DATES_14 = Array.from({ length: 14 }, (_, i) => `2026-07-${String(16 + i).padStart(2, '0')}`)

const SUMMARY_14: OperationalSummaryDto = {
  dates: DATES_14,
  recipes: [
    {
      recipeFilename: '_ETL_m_CAS_T.json',
      layer: 'STG',
      latestDate: DATES_14.at(-1),
      latestStatus: 'SUCCESS',
      okCount: 13,
      koCount: 1,
      history: DATES_14.map((date, i) => ({ date, status: i === 0 ? 'FAILED' : 'SUCCESS', durationMin: 1.2 })),
      avgDurationMin: 1.3,
      p50DurationMin: 1.2,
      p95DurationMin: 1.5,
      lastJobId: 'application_cas_t_0029',
      lastClusterName: 'cluster-cas-t',
    },
  ],
}

const CONFIG: AppConfigDto = {
  projectId: 'db-dev-example-project',
  region: 'europe-southwest1',
  dataprocJobUrl: 'https://console.cloud.google.com/dataproc/jobs/{jobId}?project={project}&region={region}',
  dataprocClusterUrl: 'https://console.cloud.google.com/dataproc/clusters/{clusterName}?project={project}&region={region}',
  loggingUrl: 'https://console.cloud.google.com/logs/query;query=resource.labels.job_id%3D%22{jobId}%22?project={project}',
  dwhControlMode: 'mock',
  composerMode: 'mock',
  corpusRoot: '/mock',
}

const server = setupServer(
  http.get('/api/relationships', () => HttpResponse.json(GRAPH)),
  http.get('/api/operational/summary', () => HttpResponse.json(SUMMARY)),
  http.get('/api/operational/dates', () => HttpResponse.json(DATES)),
  http.get('/api/config', () => HttpResponse.json(CONFIG)),
)
beforeAll(() => server.listen())
afterEach(() => {
  server.resetHandlers()
  cleanup()
})
afterAll(() => server.close())

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ETLOperational />
    </QueryClientProvider>,
  )
}

describe('ETLOperational — real graph, cards, filters, search, selection', () => {
  it('renders the real relationships graph and drives search, layer filter, selection, and clearing', async () => {
    const { container } = renderTab()

    // Real data reaches the canvas (not the OPERATIONAL_CARDS mock).
    const nameEl = await screen.findByText('_ETL_m_CAS_T.json')

    // Status badge for the selected (latest) date: OK.
    expect(screen.getAllByText('OK').length).toBeGreaterThan(0)

    // TimePicker date input is real state, initialized from
    // useOperationalDates() to the latest snapshot ("Now").
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    expect(dateInput.value).toBe('2026-07-29')

    // History strip on the recipe's canvas card: 2 real cells (fixture
    // history length). Scoped via the existing `data-card` wrapper so the
    // count isn't inflated by other cards' own history bars.
    const cardEl = nameEl.closest('[data-card]') as HTMLElement
    expect(cardEl.querySelectorAll('div[title^="Run "]')).toHaveLength(2)

    // Changing the date to the earlier snapshot flips the recipe (and its
    // written table) to KO — proves selectedDate drives the adapter.
    fireEvent.change(dateInput, { target: { value: '2026-07-28' } })
    expect((await screen.findAllByText('KO')).length).toBeGreaterThan(0)

    // Search narrows to the one card whose name contains the query — only
    // the recipe's filename carries a ".json" extension.
    const search = screen.getByPlaceholderText('Search tables / recipes…')
    fireEvent.change(search, { target: { value: '.json' } })
    expect(screen.getByText('_ETL_m_CAS_T.json')).toBeInTheDocument()
    expect(screen.queryByText('stg_dwhes.CAS_T_SRC')).not.toBeInTheDocument()
    expect(screen.queryByText('stg_dwhes.CAS_T_TGT')).not.toBeInTheDocument()

    // Layer chip is data-driven from view.layers (STG only, from meta.layers)
    // and — combined with the still-active search — the recipe stays visible.
    fireEvent.click(screen.getByRole('button', { name: 'STG' }))
    expect(screen.getByText('_ETL_m_CAS_T.json')).toBeInTheDocument()

    // Select the card -> detail panel shows both relations (source + target).
    fireEvent.click(screen.getByText('_ETL_m_CAS_T.json'))
    expect(await screen.findByText('Related (2)')).toBeInTheDocument()

    // GCP quick links are templated from the served config + fixture jobId.
    const loggingLink = screen.getByText(/Cloud Logging/).closest('a') as HTMLAnchorElement
    expect(loggingLink.href).toContain('application_cas_t_0029')
    expect(loggingLink.href).toContain('db-dev-example-project')

    // Clear selection closes the detail panel.
    fireEvent.click(screen.getByText('Clear selection'))
    expect(screen.queryByText('Related (2)')).not.toBeInTheDocument()
  })

  it('renders a 14-cell history strip for a recipe with a full 14-day history', async () => {
    server.use(
      http.get('/api/operational/summary', () => HttpResponse.json(SUMMARY_14)),
      http.get('/api/operational/dates', () => HttpResponse.json({ dates: DATES_14, mode: 'mock' })),
    )
    renderTab()

    const nameEl = await screen.findByText('_ETL_m_CAS_T.json')
    const cardEl = nameEl.closest('[data-card]') as HTMLElement
    expect(cardEl.querySelectorAll('div[title^="Run "]')).toHaveLength(14)
  })
})
