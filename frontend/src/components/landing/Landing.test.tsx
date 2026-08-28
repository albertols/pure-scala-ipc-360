import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { Landing } from './Landing'

const READY = {
  status: 'ok',
  corpus: { xml: 81, recipes: 86, ddl: 212, dirs: 119, layers: ['CDM'] },
  operational: { clusters: 21, recipes: 30, days: 14, rows: 417, mode: 'mock' },
  dags: { workflows: 23 },
  roots: [{ name: 'corpus', resolved: '/mock/xmltobq', tier: 'real', status: 'ok' }],
  progress: { tasksDone: 596, tasksTotal: 601, adrs: 16 },
}
const DEGRADED = {
  ...READY, status: 'degraded',
  roots: [{ name: 'composer', tier: 'absent', status: 'ko',
            hint: 'set composerRoot in config.json' }],
}

const server = setupServer(
  http.get('*/api/readiness', () => HttpResponse.json(READY)),
  http.get('*/api/config', () => HttpResponse.json({ gcpProjectId: 'example-project', region: 'eu' })),
)
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => { server.resetHandlers(); cleanup() })
afterAll(() => server.close())

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('Landing', () => {
  it('shows the stats once readiness resolves', async () => {
    render(<Landing onEnter={() => {}} />, { wrapper })
    expect(await screen.findByText('81')).toBeInTheDocument()
    expect(screen.getByText('23')).toBeInTheDocument()
  })

  it('shows the relaxed mascot when everything resolved', async () => {
    render(<Landing onEnter={() => {}} />, { wrapper })
    await waitFor(() => expect(screen.getByTestId('mascot-scene')).toHaveAttribute('data-mood', 'ok'))
  })

  it('shows the pruning mascot and names the failing root when degraded', async () => {
    server.use(http.get('*/api/readiness', () => HttpResponse.json(DEGRADED)))

    render(<Landing onEnter={() => {}} />, { wrapper })

    await waitFor(() => expect(screen.getByTestId('mascot-scene')).toHaveAttribute('data-mood', 'degraded'))
    // Scoped to the mascot's own callout: `EnvironmentPanel` (composed lower on the same page,
    // spec §6.4) surfaces the identical `hint` string for its own audience — by design, not a
    // collision to hide — so an unscoped `getByText` here would be ambiguous between the two.
    expect(within(screen.getByTestId('mascot-scene')).getByText(/set composerRoot in config.json/)).toBeInTheDocument()
  })

  it('enters on the primary button', async () => {
    const onEnter = vi.fn()
    render(<Landing onEnter={onEnter} />, { wrapper })

    fireEvent.click(await screen.findByRole('button', { name: /^enter/i }))

    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  it('enters on Escape', async () => {
    const onEnter = vi.fn()
    render(<Landing onEnter={onEnter} />, { wrapper })
    await screen.findByText('81')

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  // A readiness failure must not leave a blank hero — the page still introduces the app.
  it('still renders the page when readiness fails to load', async () => {
    server.use(http.get('*/api/readiness', () => new HttpResponse(null, { status: 500 })))

    render(<Landing onEnter={() => {}} />, { wrapper })

    expect(await screen.findByRole('button', { name: /^enter/i })).toBeInTheDocument()
    // `findByText`, not `getByText`: the button (page chrome) renders before the readiness
    // query has settled to its error state, so this note appears a tick later.
    expect(await screen.findByText(/could not read|unavailable/i)).toBeInTheDocument()
  })
})
