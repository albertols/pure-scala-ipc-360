import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import React from 'react'
import { useOperationalDates, useOperational, useOperationalSummary } from './queries'

const server = setupServer(
  http.get('/api/operational/dates', () => HttpResponse.json({
    dates: ['2026-07-29'], mode: 'mock',
  })),
  http.get('/api/operational/2026-07-29', () => HttpResponse.json({
    date: '2026-07-29',
    rows: [{
      clusterName: 'cluster-wf-syn-orders-01',
      recipeFilename: '_ETL_m_SYN_ODS_ORDERS.json',
      jobId: 'application_1774840000001_0001',
      appStartIso: '2026-07-29T04:12:22.644Z',
      avgJobDurationInMinsSec: '14m 05sec',
      status: 'SUCCESS',
      message: '',
    }],
  })),
  http.get('/api/operational/summary', () => HttpResponse.json({
    dates: ['2026-07-29'],
    recipes: [{
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
    }],
  })),
)
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
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
    expect(snapshot.result.current.data?.rows?.[0]?.recipeFilename).toBe('_ETL_m_SYN_ODS_ORDERS.json')
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
})
