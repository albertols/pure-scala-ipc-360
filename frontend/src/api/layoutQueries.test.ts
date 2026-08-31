import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import React from 'react'
import { useLayout, putLayout } from './layoutQueries'

const server = setupServer(
  http.get('/api/layouts/CDM/m_FIX/_ETL_m_FIX.json', () =>
    HttpResponse.json({ version: 1, nodes: {} }),
  ),
)
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Plain .ts (not .tsx) file per the plan's Files list — React.createElement
// avoids JSX syntax that only .tsx sources parse.
const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children,
  )

describe('useLayout', () => {
  it('returns {version:1,nodes:{}} for a recipe with no saved layout (never a 404 to handle)', async () => {
    const { result } = renderHook(() => useLayout('CDM/m_FIX/_ETL_m_FIX.json'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ version: 1, nodes: {} })
  })
})

describe('putLayout', () => {
  it('PUTs the offsets map wrapped in {version:1, nodes} and resolves with the saved layout', async () => {
    let capturedBody: unknown = null
    server.use(
      http.put('/api/layouts/CDM/m_FIX/_ETL_m_FIX.json', async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json({ version: 1, nodes: { T: { dx: 20, dy: -10 } } })
      }),
    )

    const result = await putLayout('CDM/m_FIX/_ETL_m_FIX.json', { T: { dx: 20, dy: -10 } })

    expect(capturedBody).toEqual({ version: 1, nodes: { T: { dx: 20, dy: -10 } } })
    expect(result).toEqual({ version: 1, nodes: { T: { dx: 20, dy: -10 } } })
  })
})
