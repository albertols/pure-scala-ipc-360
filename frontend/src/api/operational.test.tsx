import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import React from 'react'
import { useOperationalDates, useOperational, useOperationalSummary } from './queries'

const server = setupServer(
  http.get('/api/operational/dates', () =>
    HttpResponse.json({
      dates: ['2026-07-29'],
      mode: 'mock',
    }),
  ),
  http.get('/api/operational/2026-07-29', () =>
    HttpResponse.json({
      date: '2026-07-29',
      rows: [
        {
          clusterName: 'cluster-wf-syn-orders-01',
          recipeFilename: '_ETL_m_SYN_ODS_ORDERS.json',
          jobId: 'application_1774840000001_0001',
          appStartIso: '2026-07-29T04:12:22.644Z',
          avgJobDurationInMinsSec: '14m 05sec',
          status: 'SUCCESS',
          message: '',
        },
      ],
    }),
  ),
  http.get('/api/operational/summary', ({ request }) => {
    seenSummaryUrls.push(request.url)
    return HttpResponse.json({
      dates: ['2026-07-29'],
      recipes: [
        {
          recipeFilename: '_ETL_m_SYN_ODS_ORDERS.json',
          layer: 'ODS',
          latestDate: '2026-07-29',
          latestStatus: 'SUCCESS',
          okCount: 1,
          koCount: 0,
          history: [{ date: '2026-07-29', status: 'SUCCESS', durationMin: 14.083333333333334 }],
          avgDurationMin: 14.083333333333334,
          p50DurationMin: 14.083333333333334,
          p95DurationMin: 14.083333333333334,
          lastJobId: 'application_1774840000001_0001',
          lastClusterName: 'cluster-wf-syn-orders-01',
        },
      ],
    })
  }),
)
const seenSummaryUrls: string[] = []
beforeAll(() => server.listen())
afterEach(() => {
  server.resetHandlers()
  seenSummaryUrls.length = 0
})
afterAll(() => server.close())

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

describe('operational hooks', () => {
  it('resolves dates then the snapshot for the first date, with the row recipeFilename', async () => {
    const dates = renderHook(() => useOperationalDates(), { wrapper })
    await waitFor(() => expect(dates.result.current.isSuccess).toBe(true))
    expect(dates.result.current.data?.dates).toEqual(['2026-07-29'])

    const firstDate = dates.result.current.data!.dates![0]!
    const snapshot = renderHook(() => useOperational(firstDate), { wrapper })
    await waitFor(() => expect(snapshot.result.current.isSuccess).toBe(true))
    expect(snapshot.result.current.data?.rows?.[0]?.recipeFilename).toBe(
      '_ETL_m_SYN_ODS_ORDERS.json',
    )
  })

  it('resolves the operational summary with per-recipe aggregates', async () => {
    const summary = renderHook(() => useOperationalSummary(), { wrapper })
    await waitFor(() => expect(summary.result.current.isSuccess).toBe(true))
    expect(summary.result.current.data?.dates).toEqual(['2026-07-29'])
    const recipe = summary.result.current.data?.recipes?.[0]
    expect(recipe?.recipeFilename).toBe('_ETL_m_SYN_ODS_ORDERS.json')
    expect(recipe?.layer).toBe('ODS')
    expect(recipe?.okCount).toBe(1)
    expect(recipe?.koCount).toBe(0)
    expect(recipe?.history).toHaveLength(1)
  })

  // Blocker 3: `/api/operational/summary` was the last unbounded payload on Tab 3's
  // selected path — gated on WHETHER a selection exists, never on WHICH, so the first
  // cluster click aggregated every recipe x every date (38 904 B on the 30-recipe mock,
  // against the entire unscoped graph's 20 984 B; tens of MB at the ~7 000-recipe target).
  it('sends no clusters= at all when unscoped, so the response stays byte-identical', async () => {
    const summary = renderHook(() => useOperationalSummary(), { wrapper })
    await waitFor(() => expect(summary.result.current.isSuccess).toBe(true))

    expect(seenSummaryUrls).toHaveLength(1)
    expect(new URL(seenSummaryUrls[0]!).search).toBe('')
  })

  it('scopes the summary to the selected clusters, one clusters= entry each', async () => {
    const summary = renderHook(() => useOperationalSummary(true, ['cl-b', 'cl-a']), { wrapper })
    await waitFor(() => expect(summary.result.current.isSuccess).toBe(true))

    expect(seenSummaryUrls).toHaveLength(1)
    // Sorted, like useScopedRelationships: two renders of the same selection in a
    // different order must share one cache entry rather than refetching.
    expect(new URL(seenSummaryUrls[0]!).search).toBe('?clusters=cl-a&clusters=cl-b')
  })

  it('fetches nothing while disabled, however many clusters are named', async () => {
    const summary = renderHook(() => useOperationalSummary(false, ['cl-a']), { wrapper })
    await waitFor(() => expect(summary.result.current.isLoading).toBe(false))

    expect(seenSummaryUrls).toEqual([])
  })
})
