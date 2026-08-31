import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { apiGet, ApiError } from './client'

const server = setupServer(
  http.get('/api/health', () => HttpResponse.json({ status: 'UP' })),
  http.get('/api/recipes/missing.json', () =>
    HttpResponse.json(
      { title: 'Not found', status: 404, detail: 'No recipe at missing.json' },
      { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
    ),
  ),
)
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('apiGet', () => {
  it('returns parsed JSON', async () => {
    await expect(apiGet<{ status: string }>('/health')).resolves.toEqual({ status: 'UP' })
  })

  it('throws ApiError with problem+json fields', async () => {
    const err = await apiGet<never>('/recipes/missing.json').catch((e): ApiError => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(404)
    expect(err.title).toBe('Not found')
    expect(err.detail).toContain('missing.json')
  })
})
