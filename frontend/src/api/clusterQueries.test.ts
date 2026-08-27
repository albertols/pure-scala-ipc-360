import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { chunk, useRuns, useClusterIndex, useScopedRelationships, MAX_RECIPES_PER_REQUEST } from './clusterQueries'

const seenRecipeCounts: number[] = []
const seenRelationshipUrls: string[] = []

const server = setupServer(
  http.get('*/api/operational/clusters', () => HttpResponse.json({
    mode: 'mock',
    dates: ['2026-07-28', '2026-07-29'],
    totals: { clusters: 2, recipes: 3, dates: 2, rows: 5 },
    clusters: [
      { name: 'cl-a', recipeCount: 2, dateIdx: [0, 1], rows: 4, ok: 3, ko: 1,
        lastDate: '2026-07-29', lastStatus: 'SUCCESS' },
      { name: 'cl-b', recipeCount: 1, dateIdx: [1], rows: 1, ok: 1, ko: 0,
        lastDate: '2026-07-29', lastStatus: 'SUCCESS' },
    ],
  })),
  http.get('*/api/operational/runs', ({ request }) => {
    const recipes = new URL(request.url).searchParams.getAll('recipe')
    seenRecipeCounts.push(recipes.length)
    return HttpResponse.json({
      limit: 10,
      byRecipe: Object.fromEntries(recipes.map(r => [r, [
        { date: '2026-07-29', clusterName: 'cl-a', jobId: `job-${r}`,
          appStartIso: '2026-07-29T04:52:00.000Z', durationMin: 1.5, status: 'SUCCESS', message: '' },
      ]])),
    })
  }),
  http.get('*/api/relationships', ({ request }) => {
    seenRelationshipUrls.push(request.url)
    return HttpResponse.json({ nodes: [], edges: [], meta: {} })
  }),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => { server.resetHandlers(); seenRecipeCounts.length = 0; seenRelationshipUrls.length = 0 })
afterAll(() => server.close())

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('chunk', () => {
  it('splits into bounded groups and never drops an item', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 2)).toEqual([])
    expect(chunk([1], 5)).toEqual([[1]])
  })
})

describe('useClusterIndex', () => {
  it('loads the index', async () => {
    const { result } = renderHook(() => useClusterIndex(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data!.totals!.clusters).toBe(2)
    expect(result.current.data!.clusters).toHaveLength(2)
  })
})

describe('useRuns', () => {
  it('returns runs keyed by recipe', async () => {
    const { result } = renderHook(() => useRuns(['r1.json', 'r2.json']), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.byRecipe['r1.json'][0].jobId).toBe('job-r1.json')
    expect(result.current.byRecipe['r2.json']).toHaveLength(1)
  })

  // The endpoint 400s above 200. A DAG with more recipes than that must still work.
  it('chunks a recipe list larger than the endpoint bound', async () => {
    const many = Array.from({ length: MAX_RECIPES_PER_REQUEST + 1 }, (_, i) => `r${i}.json`)
    const { result } = renderHook(() => useRuns(many), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(seenRecipeCounts).toEqual([MAX_RECIPES_PER_REQUEST, 1])
    expect(Object.keys(result.current.byRecipe)).toHaveLength(MAX_RECIPES_PER_REQUEST + 1)
  })

  it('sends exactly one request at the bound', async () => {
    const exact = Array.from({ length: MAX_RECIPES_PER_REQUEST }, (_, i) => `r${i}.json`)
    const { result } = renderHook(() => useRuns(exact), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(seenRecipeCounts).toEqual([MAX_RECIPES_PER_REQUEST])
  })

  it('fetches nothing for an empty recipe list', async () => {
    const { result } = renderHook(() => useRuns([]), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(seenRecipeCounts).toEqual([])
    expect(result.current.byRecipe).toEqual({})
  })

  it('reports isError when one chunk fails, without losing the surviving chunk\'s data', async () => {
    server.use(
      http.get('*/api/operational/runs', ({ request }) => {
        const recipes = new URL(request.url).searchParams.getAll('recipe')
        seenRecipeCounts.push(recipes.length)
        // The chunker always sends the leftover remainder (size 1 here) as its own
        // request — fail exactly that one, so the other 200 recipes must survive.
        if (recipes.length === 1) return new HttpResponse(null, { status: 500 })
        return HttpResponse.json({
          limit: 10,
          byRecipe: Object.fromEntries(recipes.map(r => [r, [
            { date: '2026-07-29', clusterName: 'cl-a', jobId: `job-${r}`,
              appStartIso: '2026-07-29T04:52:00.000Z', durationMin: 1.5, status: 'SUCCESS', message: '' },
          ]])),
        })
      }),
    )

    const many = Array.from({ length: MAX_RECIPES_PER_REQUEST + 1 }, (_, i) => `r${i}.json`)
    const { result } = renderHook(() => useRuns(many), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isError).toBe(true)
    // The 200-recipe chunk succeeded and must still be present — partial data,
    // not silently dropped alongside the failed chunk.
    expect(Object.keys(result.current.byRecipe)).toHaveLength(MAX_RECIPES_PER_REQUEST)
    expect(result.current.byRecipe['r0.json']).toHaveLength(1)
  })
})

describe('useScopedRelationships', () => {
  it('fetches nothing for an empty cluster list', async () => {
    const { result } = renderHook(() => useScopedRelationships([]), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(seenRelationshipUrls).toEqual([])
  })

  it('sends one clusters= entry per element, never a bare clusters=', async () => {
    const { result } = renderHook(() => useScopedRelationships(['cl-a', 'cl-b']), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(seenRelationshipUrls).toHaveLength(1)
    const url = new URL(seenRelationshipUrls[0])
    expect(url.searchParams.getAll('clusters')).toEqual(['cl-a', 'cl-b'])
    expect(url.search).toBe('?clusters=cl-a&clusters=cl-b')
  })

  it('shares one cache entry regardless of input order', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const sharedWrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children)

    const { result: r1 } = renderHook(() => useScopedRelationships(['cl-b', 'cl-a']), { wrapper: sharedWrapper })
    await waitFor(() => expect(r1.current.data).toBeDefined())

    const { result: r2 } = renderHook(() => useScopedRelationships(['cl-a', 'cl-b']), { wrapper: sharedWrapper })
    await waitFor(() => expect(r2.current.data).toBeDefined())

    // Same cache entry: the second render's data came from cache, not a second request.
    expect(seenRelationshipUrls).toHaveLength(1)
  })
})
