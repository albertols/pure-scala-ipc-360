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

  // Ruling N regression: React fires passive effects child-before-parent in one commit, and
  // TanStack Query resolves a fresh-cached queryKey SYNCHRONOUSLY in the same render (30s
  // staleTime). Re-seeding to a node visited under 30s ago replays that same-commit race: the
  // nodeId-keyed reset effect must not stomp a correct report the child already made.
  //
  // Deviations from the brief's literal repro, both forced empirically (the literal version
  // passed even against the unfixed code — see below):
  //   1. A dedicated QueryClient the test holds a direct reference to, rather than the shared
  //      `wrapper`'s inline `new QueryClient()` — RTL's `rerender` re-invokes the wrapper
  //      component's body on every call, which would silently swap in a FRESH, empty client each
  //      time and make a same-commit CACHED resolution impossible to reproduce at all.
  //   2. `queryClient.removeQueries` on ONLY the relationships-scoped cache entry for the
  //      left-rail selection before the final re-seed, keeping `clusters` itself unchanged
  //      throughout. Varying `clusters` between renders was tried first and failed for a second,
  //      independent reason: `clusters` also feeds `useLineage`'s `prefer` param, so changing it
  //      on the same render as the re-seed changes the LINEAGE queryKey too and destroys the very
  //      cache hit the race depends on. Reusing the same `clusters` value throughout means BOTH
  //      `cl-a` and `cl-selected` are already warm in the relationships cache by the final
  //      re-seed, so even the buggy fallback would be served from cache with no observable
  //      network call — `removeQueries` evicts only that one entry, forcing a genuine round trip
  //      if, and only if, `scope` actually falls back to `clusters` at that point.
  it('keeps the active scope when re-seeding back to a cached node', async () => {
    const scopedFor: string[] = []
    server.use(
      http.get('/api/relationships', ({ request }) => {
        scopedFor.push(new URL(request.url).searchParams.get('clusters') ?? '')
        return HttpResponse.json(GRAPH)
      }),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const stableWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { rerender } = render(<RelatedOverlay nodeId="seed" clusters={['cl-selected']} />, {
      wrapper: stableWrapper,
    })
    await screen.findByTestId('lineage-seed')
    await waitFor(() => expect(scopedFor).toContain('cl-a'))

    scopedFor.length = 0
    // Re-seed onto a DIFFERENT node (the lineage handler resolves it to the same 'cl-a' — it
    // does not key on `node`) — a genuinely new lineage queryKey, so LineageFlow's own
    // [active]-keyed effect correctly re-reports 'cl-a' here regardless of the bug.
    rerender(<RelatedOverlay nodeId="r_up" clusters={['cl-selected']} />)
    await screen.findByTestId('lineage-seed')

    scopedFor.length = 0
    // Evict ONLY the relationships cache entry for the raw left-rail selection — the lineage
    // cache entry for `seed` (a different queryKey namespace) stays warm, which is what lets its
    // synchronous cached resolution race the reset effect on the very next render.
    queryClient.removeQueries({ queryKey: ['relationships', 'scoped', 'cl-selected'] })
    // Back onto the ORIGINAL node — still within the 30s staleTime, so ITS lineage fetch is
    // served synchronously from cache, replaying the exact same-commit race Ruling N describes.
    rerender(<RelatedOverlay nodeId="seed" clusters={['cl-selected']} />)
    await screen.findByTestId('lineage-seed')
    // Let any fetch the reset effect's stomp might have triggered land — under the bug this is
    // a REAL network call (its response is unobservable any other way, since `scope` is internal
    // state), so a short real delay is the only way to prove it did NOT happen.
    await new Promise(resolve => setTimeout(resolve, 100))

    // Under the bug, the reset effect nulls `active` on every nodeId change; since the cached
    // resolution reports the SAME value as before ('cl-a'), LineageFlow's [active]-keyed effect
    // never re-fires to correct it, so `scope` falls back to the raw left-rail selection
    // ('cl-selected') — a fetch that would not otherwise happen (its cache entry was just
    // evicted specifically to make that observable).
    expect(scopedFor).not.toContain('cl-selected')
  })
})
