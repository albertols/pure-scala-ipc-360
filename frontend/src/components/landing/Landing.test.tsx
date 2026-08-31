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
  ...READY,
  status: 'degraded',
  roots: [
    { name: 'composer', tier: 'absent', status: 'ko', hint: 'set composerRoot in config.json' },
  ],
}
// The real backend vocabulary (`DiagnosticsService`, ADR-0013) is `"ok"`/`"ko"` — it has never
// emitted the literal string `"degraded"`. `DEGRADED` above exercises the mapping with a value it
// does NOT actually produce; this fixture exercises the value it does.
const KO = {
  ...READY,
  status: 'ko',
  roots: [
    { name: 'dwhControl', tier: 'absent', status: 'ko', hint: 'set ETL360_DWH_CONTROL_ROOT' },
    { name: 'composer', tier: 'absent', status: 'ko', hint: 'set ETL360_MOCK_ROOT' },
  ],
}

const server = setupServer(
  http.get('*/api/readiness', () => HttpResponse.json(READY)),
  http.get('*/api/config', () =>
    HttpResponse.json({ gcpProjectId: 'example-project', region: 'eu' }),
  ),
)
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => {
  server.resetHandlers()
  cleanup()
})
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
    await waitFor(() =>
      expect(screen.getByTestId('mascot-scene')).toHaveAttribute('data-mood', 'ok'),
    )
  })

  it('shows the pruning mascot and names the failing root when degraded', async () => {
    server.use(http.get('*/api/readiness', () => HttpResponse.json(DEGRADED)))

    render(<Landing onEnter={() => {}} />, { wrapper })

    await waitFor(() =>
      expect(screen.getByTestId('mascot-scene')).toHaveAttribute('data-mood', 'degraded'),
    )
    // Scoped to the mascot's own callout: `EnvironmentPanel` (composed lower on the same page,
    // spec §6.4) surfaces the identical `hint` string for its own audience — by design, not a
    // collision to hide — so an unscoped `getByText` here would be ambiguous between the two.
    expect(
      within(screen.getByTestId('mascot-scene')).getByText(/set composerRoot in config.json/),
    ).toBeInTheDocument()
  })

  // Regression for the acceptance-walk defect: the backend never actually sends "degraded" — it
  // sends "ko" (see DiagnosticsService). A mapping that only recognised the literal string
  // "degraded" let a real "ko" fall through to the relaxed mood. Asserting on the mascot's own
  // degraded markers (twigs present, bubbles absent — MascotScene's overlay switch), not just the
  // data-mood attribute, so a future refactor of that attribute alone can't paper over the same bug.
  it('shows the pruning mascot when the backend reports "ko" (not just the string "degraded")', async () => {
    server.use(http.get('*/api/readiness', () => HttpResponse.json(KO)))

    render(<Landing onEnter={() => {}} />, { wrapper })

    const mascot = await screen.findByTestId('mascot-scene')
    await waitFor(() => expect(mascot).toHaveAttribute('data-mood', 'degraded'))
    expect(within(mascot).getByTestId('overlay-twigs')).toBeInTheDocument()
    expect(within(mascot).queryByTestId('overlay-bubbles')).not.toBeInTheDocument()
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

  // Fix round 1, Finding 2 (spec §6.4): the `/api/config` handler above was carried from the
  // brief's template but never actually exercised by production code until now — `Landing`
  // fetches it (via the existing `useAppConfig()`, not a second hook) and threads it into
  // `EnvironmentPanel`.
  it('shows the GCP project and region from /api/config in the environment panel', async () => {
    render(<Landing onEnter={() => {}} />, { wrapper })

    expect(await screen.findByText(/example-project/)).toBeInTheDocument()
    expect(screen.getByText(/eu/)).toBeInTheDocument()
  })
})
