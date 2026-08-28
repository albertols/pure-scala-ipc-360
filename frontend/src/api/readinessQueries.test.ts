import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { QueryObserverOptions } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { useReadiness } from './readinessQueries'
import { STALE_MS } from './queries'

const READY = {
  status: 'ok',
  corpus: { xml: 81, recipes: 86, ddl: 212, dirs: 119, layers: ['CDM', 'DWH'] },
  operational: { clusters: 21, recipes: 30, days: 14, rows: 417, mode: 'mock' },
  dags: { workflows: 23 },
  roots: [{ name: 'corpus', resolved: '/mock/xmltobq', tier: 'real', status: 'ok' }],
  progress: { tasksDone: 596, tasksTotal: 601, adrs: 16 },
}

const server = setupServer(
  http.get('*/api/readiness', () => HttpResponse.json(READY)),
)
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('useReadiness', () => {
  it('loads the aggregate in one request', async () => {
    const { result } = renderHook(() => useReadiness(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.data!.corpus!.xml).toBe(81)
    expect(result.current.data!.dags!.workflows).toBe(23)
    expect(result.current.data!.progress!.tasksDone).toBe(596)
  })

  it('surfaces an error rather than resolving to empty data', async () => {
    server.use(http.get('*/api/readiness', () => new HttpResponse(null, { status: 500 })))

    const { result } = renderHook(() => useReadiness(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })

  it('tolerates a payload with no progress (a deployment without docs/)', async () => {
    server.use(http.get('*/api/readiness', () => HttpResponse.json({ ...READY, progress: undefined })))

    const { result } = renderHook(() => useReadiness(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data!.progress).toBeUndefined()
    expect(result.current.data!.corpus!.xml).toBe(81)
  })

  /**
   * Readiness folds in live per-root health (ReadinessService calls diagnostics.report() fresh
   * per request) — it is not a boot-time snapshot, so it must revalidate on the same window as
   * useDiagnostics() (STALE_MS), not sit on Infinity.
   *
   * Asserted against the QueryClient's own cached query, reached through the public
   * `getQueryCache().find()` API, rather than through real elapsed-time/refetch behaviour, which
   * would make this test slow (STALE_MS is 30s) and timer-fragile for no extra safety. `Query`'s
   * public `options` field is typed as the narrower `QueryOptions` (query-core's own type does
   * not surface `staleTime` there — that lives on `QueryObserverOptions`), but the object
   * `QueryCache.build()` assigns to it IS the full defaulted observer options (see
   * `queryCache.js`'s `build()`: `options: client.defaultQueryOptions(options)`), so the value is
   * genuinely present at runtime; the cast below only widens the type, it does not fabricate data.
   */
  it('revalidates on the shared STALE_MS window rather than a boot-time Infinity snapshot', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const isolatedWrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children)

    const { result } = renderHook(() => useReadiness(), { wrapper: isolatedWrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())

    const query = qc.getQueryCache().find({ queryKey: ['readiness'] })
    const staleTime = (query?.options as QueryObserverOptions | undefined)?.staleTime
    expect(staleTime).toBe(STALE_MS)
    expect(staleTime).not.toBe(Infinity)
  })
})
