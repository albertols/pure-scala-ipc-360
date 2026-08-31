import { describe, expect, it, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { delay, http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { ClusterPane, visibleRange, ROW_H } from './ClusterPane'
import {
  resetOperationalView,
  setOperationalView,
  useOperationalView,
} from '../../state/operationalView'
import { renderHook } from '@testing-library/react'

const MANY = Array.from({ length: 1000 }, (_, i) => ({
  name: `cl-${String(i).padStart(4, '0')}`,
  recipeCount: 3,
  dateIdx: [0, 1],
  rows: 6,
  ok: 5,
  ko: 1,
  lastDate: '2026-07-29',
  lastStatus: 'SUCCESS',
}))

const server = setupServer(
  http.get('*/api/operational/clusters/:name', ({ params }) =>
    HttpResponse.json({
      name: params.name,
      dates: ['2026-07-28', '2026-07-29'],
      recipes: [
        {
          recipeFilename: 'r1.json',
          layer: 'STG',
          dateIdx: [0, 1],
          rows: 2,
          ok: 2,
          ko: 0,
          lastDate: '2026-07-29',
          lastStatus: 'SUCCESS',
        },
        {
          recipeFilename: 'r2.json',
          layer: 'ODS',
          dateIdx: [1],
          rows: 1,
          ok: 0,
          ko: 1,
          lastDate: '2026-07-29',
          lastStatus: 'FAILED',
        },
      ],
    }),
  ),
  http.get('*/api/operational/clusters', () =>
    HttpResponse.json({
      mode: 'mock',
      dates: ['2026-07-28', '2026-07-29'],
      totals: { clusters: MANY.length, recipes: 3000, dates: 2, rows: 6000 },
      clusters: MANY,
    }),
  ),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  cleanup()
})
afterAll(() => server.close())
beforeEach(() => {
  localStorage.clear()
  resetOperationalView()
})

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('visibleRange', () => {
  it('windows around the scroll position with an overscan', () => {
    // viewport 300 / rowH 30 = 10 visible rows, plus OVERSCAN 5 on each side.
    expect(visibleRange(0, 300, 1000, ROW_H)).toEqual({ start: 0, end: 15 })
    expect(visibleRange(3000, 300, 1000, ROW_H)).toEqual({ start: 95, end: 115 })
  })

  it('clamps at both ends', () => {
    expect(visibleRange(-50, 300, 1000, ROW_H).start).toBe(0)
    expect(visibleRange(1e9, 300, 1000, ROW_H).end).toBe(1000)
    expect(visibleRange(0, 300, 3, ROW_H)).toEqual({ start: 0, end: 3 })
  })
})

// SF2: `useClusterDetail`'s `error` and `isLoading` were discarded — the drawer rendered
// `(detail?.recipes ?? [])`, so a 500 or a dropped connection showed a header and nothing,
// reading as "this cluster is empty".
describe('ClusterPane — expanding a cluster that does not resolve', () => {
  it('says the detail failed instead of showing an empty drawer', async () => {
    server.use(
      http.get('*/api/operational/clusters/:name', () => new HttpResponse(null, { status: 500 })),
    )
    render(<ClusterPane />, { wrapper })
    await screen.findByLabelText('cl-0000')

    fireEvent.click(screen.getByLabelText('Expand cl-0000'))

    expect(await screen.findByTestId('cluster-detail-error')).toBeTruthy()
  })

  it('says it is still loading rather than showing an empty drawer', async () => {
    server.use(
      http.get('*/api/operational/clusters/:name', async () => {
        await delay(400)
        return HttpResponse.json({ name: 'cl-0000', dates: [], recipes: [] })
      }),
    )
    render(<ClusterPane />, { wrapper })
    await screen.findByLabelText('cl-0000')

    fireEvent.click(screen.getByLabelText('Expand cl-0000'))

    expect(await screen.findByTestId('cluster-detail-loading')).toBeTruthy()
  })

  it('says a resolved-but-empty cluster is empty, distinctly from both', async () => {
    server.use(
      http.get('*/api/operational/clusters/:name', () =>
        HttpResponse.json({ name: 'cl-0000', dates: [], recipes: [] }),
      ),
    )
    render(<ClusterPane />, { wrapper })
    await screen.findByLabelText('cl-0000')

    fireEvent.click(screen.getByLabelText('Expand cl-0000'))

    expect(await screen.findByTestId('cluster-detail-empty')).toBeTruthy()
    expect(screen.queryByTestId('cluster-detail-error')).toBeNull()
  })
})

describe('ClusterPane', () => {
  it('renders a bounded number of rows over a thousand clusters', async () => {
    render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')

    expect(screen.getAllByRole('checkbox', { name: /^cl-/ }).length).toBeLessThan(60)
    expect(screen.queryByText('cl-0999')).not.toBeInTheDocument()
  })

  it('shows the totals so the scale is visible before anything is selected', async () => {
    render(<ClusterPane />, { wrapper })
    expect(await screen.findByText(/1,000 clusters/)).toBeInTheDocument()
    expect(screen.getByText(/3,000 recipes/)).toBeInTheDocument()
  })

  it('filters by a case-insensitive substring of the cluster name', async () => {
    render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')

    fireEvent.change(screen.getByPlaceholderText(/Search clusters/), {
      target: { value: 'CL-0042' },
    })

    expect(await screen.findByText('cl-0042')).toBeInTheDocument()
    expect(screen.queryByText('cl-0000')).not.toBeInTheDocument()
  })

  it('checking a cluster writes it to the shared view state', async () => {
    const view = renderHook(() => useOperationalView())
    render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')

    fireEvent.click(screen.getByRole('checkbox', { name: 'cl-0003' }))

    await waitFor(() => expect(view.result.current.selectedClusters).toEqual(['cl-0003']))
  })

  it('supports several selected clusters and unchecking one', async () => {
    const view = renderHook(() => useOperationalView())
    render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')

    fireEvent.click(screen.getByRole('checkbox', { name: 'cl-0001' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'cl-0002' }))
    await waitFor(() => expect(view.result.current.selectedClusters).toHaveLength(2))

    fireEvent.click(screen.getByRole('checkbox', { name: 'cl-0001' }))
    await waitFor(() => expect(view.result.current.selectedClusters).toEqual(['cl-0002']))
  })

  it('expanding a cluster lazily loads its recipes and dates', async () => {
    render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')

    fireEvent.click(screen.getByRole('button', { name: 'Expand cl-0005' }))

    expect(await screen.findByRole('checkbox', { name: 'r1.json' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'r2.json' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '2026-07-28' })).toBeInTheDocument()
  })

  it('fetches no detail until a row is expanded', async () => {
    const detailCalls: string[] = []
    server.use(
      http.get('*/api/operational/clusters/:name', ({ params }) => {
        detailCalls.push(String(params.name))
        return HttpResponse.json({ name: params.name, dates: [], recipes: [] })
      }),
    )

    render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')

    expect(detailCalls).toEqual([])
  })

  it('unchecking a recipe records it as deselected', async () => {
    const view = renderHook(() => useOperationalView())
    render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')
    fireEvent.click(screen.getByRole('button', { name: 'Expand cl-0005' }))
    await screen.findByRole('checkbox', { name: 'r2.json' })

    fireEvent.click(screen.getByRole('checkbox', { name: 'r2.json' }))

    await waitFor(() => expect(view.result.current.deselectedRecipes).toEqual(['r2.json']))
  })

  it('collapses to a strip and restores', async () => {
    render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')

    fireEvent.click(screen.getByRole('button', { name: /Collapse cluster pane/ }))
    expect(screen.queryByPlaceholderText(/Search clusters/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Expand cluster pane/ }))
    expect(await screen.findByPlaceholderText(/Search clusters/)).toBeInTheDocument()
  })

  it('reads its width from the persisted view state', async () => {
    setOperationalView({ paneWidth: 320 })
    render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')

    expect(screen.getByTestId('cluster-pane').style.width).toBe('320px')
  })

  it('does not go blank when the search narrows the list after a deep scroll', async () => {
    render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')

    // Deep scroll into the full 1000-cluster list — near row 990.
    fireEvent.scroll(screen.getByTestId('cluster-scroll'), { target: { scrollTop: 29700 } })

    // Narrow to a term with plenty of matches (cl-0000..cl-0099, 100 of them).
    // The stale scrollTop now points past the FILTERED list's own height —
    // `visibleRange` must not be left computing a window against the old count.
    fireEvent.change(screen.getByPlaceholderText(/Search clusters/), { target: { value: 'cl-00' } })

    expect(await screen.findByText('cl-0005')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox', { name: /^cl-/ }).length).toBeGreaterThan(0)
  })

  it('detaches its window mousemove/mouseup listeners on unmount mid-drag', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')

    fireEvent.mouseDown(screen.getByTestId('cluster-pane-resize-handle'))
    unmount()

    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function))

    removeSpy.mockRestore()
  })

  it('toggling a date checkbox updates selectedDates, and toggling it again clears the filter', async () => {
    const view = renderHook(() => useOperationalView())
    render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')
    fireEvent.click(screen.getByRole('button', { name: 'Expand cl-0005' }))
    await screen.findByRole('checkbox', { name: '2026-07-28' })

    fireEvent.click(screen.getByRole('checkbox', { name: '2026-07-28' }))
    await waitFor(() => expect(view.result.current.selectedDates).toEqual(['2026-07-29']))

    fireEvent.click(screen.getByRole('checkbox', { name: '2026-07-28' }))
    await waitFor(() => expect(view.result.current.selectedDates).toEqual([]))
  })
})
