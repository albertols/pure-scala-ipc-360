import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { RegistrySearch } from './RegistrySearch'
import type { Registry } from '../../api/registryQueries'

afterEach(() => cleanup())

const REGISTRY: Registry = {
  sourceTables: [
    { name: 'STG_L_ORDERS', columns: [], usedByRecipes: ['STG/m_A/_ETL_m_A.json'] },
    { name: 'STG_L_REFS', columns: [], usedByRecipes: ['STG/m_B/_ETL_m_B.json'] },
  ],
  targetTables: [
    { name: 'DWH_ORDERS_FACT', columns: [], usedByRecipes: ['DWH/m_C/_ETL_m_C.json'] },
  ],
  ddlTables: [
    {
      name: 'DWH_ORDERS_FACT',
      columns: ['ORDER_ID', 'AMOUNT'],
      usedByRecipes: ['DWH/m_C/_ETL_m_C.json'],
      variants: [{
        columns: [{ name: 'ORDER_ID', type: 'STRING' }, { name: 'AMOUNT', type: 'NUMERIC' }],
        mappingDirs: ['DWH/m_C'],
      }],
    },
    // Task 16: a DIVERGENT name — two real files, 2 and 1 columns, whose UNION
    // (3) matches neither. `columns` is that union.
    {
      name: 'ODS_REFS',
      columns: ['REF_ID', 'REF_CODE', 'REF_NOTE'],
      usedByRecipes: ['ODS/m_D/_ETL_m_D.json', 'ODS/m_E/_ETL_m_E.json'],
      variants: [
        {
          columns: [{ name: 'REF_ID', type: 'STRING' }, { name: 'REF_CODE', type: 'STRING' }],
          mappingDirs: ['ODS/m_D'],
        },
        { columns: [{ name: 'REF_NOTE', type: 'STRING' }], mappingDirs: ['ODS/m_E'] },
      ],
    },
  ],
  layers: ['STG', 'ODS', 'DWH'],
}

let responseBody: Registry = REGISTRY
const server = setupServer(
  http.get('/api/registry', () => HttpResponse.json(responseBody)),
)
beforeAll(() => server.listen())
afterEach(() => {
  server.resetHandlers()
  responseBody = REGISTRY
})
afterAll(() => server.close())

function renderSearch(overrides: Partial<React.ComponentProps<typeof RegistrySearch>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onPick = overrides.onPick ?? vi.fn()
  const utils = render(
    <QueryClientProvider client={client}>
      <RegistrySearch kind={overrides.kind ?? 'ddl'} onPick={onPick} />
    </QueryClientProvider>,
  )
  return { ...utils, onPick }
}

describe('RegistrySearch (Task 13)', () => {
  it('filters the list by table name', async () => {
    renderSearch({ kind: 'ddl' })

    await waitFor(() => expect(screen.getByText('DWH_ORDERS_FACT')).toBeInTheDocument())
    expect(screen.getByText('ODS_REFS')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: 'orders' } })

    expect(screen.getByText('DWH_ORDERS_FACT')).toBeInTheDocument()
    expect(screen.queryByText('ODS_REFS')).not.toBeInTheDocument()
  })

  it('filters the list by a column name, so searching a column finds its table', async () => {
    renderSearch({ kind: 'ddl' })

    await waitFor(() => expect(screen.getByText('ODS_REFS')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: 'REF_CODE' } })

    expect(screen.getByText('ODS_REFS')).toBeInTheDocument()
    expect(screen.queryByText('DWH_ORDERS_FACT')).not.toBeInTheDocument()
  })

  it('scopes to the requested kind — source, target, and ddl tables never mix', async () => {
    renderSearch({ kind: 'source' })

    await waitFor(() => expect(screen.getByText('STG_L_ORDERS')).toBeInTheDocument())
    expect(screen.getByText('STG_L_REFS')).toBeInTheDocument()
    // DWH_ORDERS_FACT exists in targetTables/ddlTables but not sourceTables.
    expect(screen.queryByText('DWH_ORDERS_FACT')).not.toBeInTheDocument()
  })

  it('picking a row calls onPick with that table', async () => {
    const { onPick } = renderSearch({ kind: 'ddl' })

    await waitFor(() => expect(screen.getByText('ODS_REFS')).toBeInTheDocument())
    fireEvent.click(screen.getByText('ODS_REFS'))

    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ODS_REFS', columns: ['REF_ID', 'REF_CODE', 'REF_NOTE'] }),
    )
  })

  it('an empty result renders an explicit empty state, not a blank panel', async () => {
    renderSearch({ kind: 'ddl' })

    await waitFor(() => expect(screen.getByText('ODS_REFS')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: 'NO_SUCH_TABLE_XYZ' } })

    expect(screen.queryByText('ODS_REFS')).not.toBeInTheDocument()
    expect(screen.getByText(/no tables match/i)).toBeInTheDocument()
  })

  it('caps the rendered list and states truthfully how many are shown, reusing ExpressionDock\'s RENDER_CAP', async () => {
    responseBody = {
      sourceTables: [],
      targetTables: [],
      ddlTables: Array.from({ length: 200 }, (_, i) => ({
        name: `TBL_${String(i).padStart(3, '0')}`, columns: [], usedByRecipes: [],
      })),
      layers: [],
    }
    renderSearch({ kind: 'ddl' })

    await waitFor(() => expect(screen.getByText('TBL_000')).toBeInTheDocument())

    expect(screen.getAllByText(/^TBL_\d{3}$/)).toHaveLength(150)
    expect(screen.getByText(/showing 150 of 200/i)).toBeInTheDocument()
  })

  // Task 16: `columns` is a union across every DDL file sharing a name, so its
  // COUNT is a fabrication for the 11 corpus names whose files disagree (116
  // where the real files hold 110 and 99). A row must never present that number
  // as the table's column count.
  it('a divergent name reports its definitions\' own counts, never the unioned total', async () => {
    renderSearch({ kind: 'ddl' })

    await waitFor(() => expect(screen.getByText('ODS_REFS')).toBeInTheDocument())

    // Canonical name: one definition, its own count, no extra ceremony.
    expect(screen.getByText('2 cols')).toBeInTheDocument()
    // Divergent name: the union is 3 and must not be shown as a count.
    expect(screen.queryByText('3 cols')).not.toBeInTheDocument()
    expect(screen.getByText(/2 defs · 2\/1 cols/)).toBeInTheDocument()
  })

  it('shows no footer when nothing is hidden', async () => {
    renderSearch({ kind: 'source' })

    await waitFor(() => expect(screen.getByText('STG_L_ORDERS')).toBeInTheDocument())
    expect(screen.queryByText(/showing/i)).not.toBeInTheDocument()
  })
})
