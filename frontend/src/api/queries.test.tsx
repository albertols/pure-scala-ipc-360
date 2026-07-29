import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import React from 'react'
import { useTree } from './queries'

const server = setupServer(
  http.get('/api/tree', () => HttpResponse.json({
    name: 'xmltobq', path: '', kind: 'dir', layer: 'root',
    children: [{ name: 'CDM', path: 'CDM', kind: 'dir', layer: 'CDM', children: [] }],
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

describe('useTree', () => {
  it('loads the tree', async () => {
    const { result } = renderHook(() => useTree(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.children?.[0]?.layer).toBe('CDM')
  })
})
