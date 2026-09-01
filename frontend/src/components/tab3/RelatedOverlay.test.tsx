import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { RelatedOverlay } from './RelatedOverlay'
import type { LineageT } from '../../api/clusterQueries'
import type { RelationshipGraph } from '../../api/queries'
import type { components } from '../../api/types.gen'

// [Ruling L, 2026-09-01: RelatedOverlay.test.tsx did not exist — created here, modelled on
// LineageFlow.test.tsx, with explicit afterEach(cleanup).]

type OperationalSummaryDto = components['schemas']['OperationalSummaryDto']

// The seed resolves to `cl-a` regardless of what the left rail asked for — the point of the
// test below is that the STATUS fetch has to follow this, not the left rail's own selection.
const LINEAGE: LineageT = {
  seed: 'seed',
  nodes: [
    { id: 'seed', kind: 'table', name: 'ODS.SEED', layer: 'ODS', hop: 0, clusters: ['cl-a'] },
  ],
  edges: [],
  truncated: false,
  totalReachable: 1,
  activeCluster: 'cl-a',
  clusterOptions: [{ name: 'cl-a', recipes: 1 }],
}

// Modeled on ETLOperational.test.tsx's own GRAPH fixture shape.
const GRAPH: RelationshipGraph = {
  nodes: [{ id: 'seed', kind: 'table', name: 'ODS.SEED', layer: 'ODS' }],
  edges: [],
  meta: { entryCount: 0, skippedRows: 0, layers: ['ODS'] },
}

const SUMMARY: OperationalSummaryDto = { dates: [], recipes: [] }

const server = setupServer(
  http.get('/api/operational/lineage', () => HttpResponse.json(LINEAGE)),
  http.get('/api/relationships', () => HttpResponse.json(GRAPH)),
  http.get('/api/operational/summary', () => HttpResponse.json(SUMMARY)),
  http.get('/api/config', () => HttpResponse.json({})),
  http.get('/api/operational/runs', () => HttpResponse.json({ limit: 10, byRecipe: {} })),
)
beforeAll(() => server.listen())
afterEach(() => {
  server.resetHandlers()
  cleanup()
})
afterAll(() => server.close())

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

describe('RelatedOverlay', () => {
  it('scopes the status graph to the ACTIVE cluster, not the left-rail selection', async () => {
    const scopedFor: string[] = []
    server.use(
      http.get('/api/relationships', ({ request }) => {
        scopedFor.push(new URL(request.url).searchParams.get('clusters') ?? '')
        return HttpResponse.json(GRAPH)
      }),
    )
    render(<RelatedOverlay nodeId="seed" clusters={['cl-selected']} />, { wrapper })
    await screen.findByTestId('lineage-seed')
    // The lineage resolved to cl-a; the status overlay must follow it, otherwise a card's OK/KO
    // describes a cluster that is not the one being drawn.
    await waitFor(() => expect(scopedFor).toContain('cl-a'))
  })
})
