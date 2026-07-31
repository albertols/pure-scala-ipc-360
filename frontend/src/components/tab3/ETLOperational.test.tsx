import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { ETLOperational } from './ETLOperational'
import type { RelationshipGraph } from '../../api/queries'
import type { components } from '../../api/types.gen'

type OperationalSummaryDto = components['schemas']['OperationalSummaryDto']

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

const server = setupServer(
  http.get('/api/relationships', () => HttpResponse.json(GRAPH)),
  http.get('/api/operational/summary', () => HttpResponse.json(SUMMARY)),
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
    renderTab()

    // Real data reaches the canvas (not the OPERATIONAL_CARDS mock).
    expect(await screen.findByText('_ETL_m_CAS_T.json')).toBeInTheDocument()

    // Status badge for the selected (latest) date: OK.
    expect(screen.getAllByText('OK').length).toBeGreaterThan(0)

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

    // Clear selection closes the detail panel.
    fireEvent.click(screen.getByText('Clear selection'))
    expect(screen.queryByText('Related (2)')).not.toBeInTheDocument()
  })
})
