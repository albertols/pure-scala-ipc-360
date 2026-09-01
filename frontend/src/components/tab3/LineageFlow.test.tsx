import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { LineageFlow, RAIL_W } from './LineageFlow'
import { layoutLineage, LINEAGE_FOOTPRINT } from './lineageLayout'
import { buildBigQueryUrl } from '../../api/gcpLinks'
import type { LineageNodeT, LineageT } from '../../api/clusterQueries'
import type { AppConfig } from '../../api/queries'

// A 5-node chain with the seed in the middle: two hops upstream, two downstream.
const NODES: LineageNodeT[] = [
  { id: 't_src', kind: 'table', name: 'STG.SRC', layer: 'STG', hop: -2, clusters: [] },
  { id: 'r_up', kind: 'recipe', name: '_ETL_up.json', layer: 'ODS', hop: -1, clusters: ['cl-a'] },
  { id: 'seed', kind: 'table', name: 'ODS.MIDDLE', layer: 'ODS', hop: 0, clusters: [] },
  {
    id: 'r_down',
    kind: 'recipe',
    name: '_ETL_down.json',
    layer: 'DWH',
    hop: 1,
    clusters: ['cl-a'],
  },
  { id: 't_out', kind: 'table', name: 'DWH.OUT', layer: 'DWH', hop: 2, clusters: [] },
  // Sibling branch: a descendant of the seed's ANCESTOR, so it is in the lineage but not on
  // any path through the seed — exactly what tracing should dim.
  {
    id: 'r_side',
    kind: 'recipe',
    name: '_ETL_side.json',
    layer: 'CDM',
    hop: -1,
    clusters: ['cl-a'],
  },
  { id: 't_side', kind: 'table', name: 'CDM.SIDE', layer: 'CDM', hop: 0, clusters: [] },
]
const EDGES: LineageT['edges'] = [
  { from: 't_src', to: 'r_up', kind: 'source' },
  { from: 'r_up', to: 'seed', kind: 'writes' },
  { from: 'seed', to: 'r_down', kind: 'source' },
  { from: 'r_down', to: 't_out', kind: 'writes' },
  // spans three columns — the case that used to be drawn behind the cards in between
  { from: 't_src', to: 'r_down', kind: 'lookup' },
  { from: 't_src', to: 'r_side', kind: 'source' },
  { from: 'r_side', to: 't_side', kind: 'writes' },
]
// A recipe in ANOTHER cluster that reads t_out — the boundary. Kept out of NODES so the
// existing fixtures and their tests are untouched.
const GATEWAY: LineageNodeT = {
  id: 'r_far',
  kind: 'recipe',
  name: '_ETL_far.json',
  layer: 'CDM',
  hop: 3,
  clusters: ['cl-far'],
  gateway: true,
}
const GATEWAY_EDGE = { from: 't_out', to: 'r_far', kind: 'source' as const }

const LINEAGE: LineageT = {
  seed: 'seed',
  nodes: [...NODES, GATEWAY],
  edges: [...EDGES, GATEWAY_EDGE],
  truncated: false,
  totalReachable: 8,
  activeCluster: 'cl-a',
  clusterOptions: [
    { name: 'cl-a', recipes: 3 },
    { name: 'cl-far', recipes: 1 },
  ],
}

// One recipe in the fixture (`r_up`, kind 'recipe') carries a served run, so the dock's
// run-anchored links have something real to anchor on — the rest of the fixture's nodes are
// tables, which legitimately have no runs (Tab 3's own panel behaves the same way).
const RUNS_BY_RECIPE = {
  '_ETL_up.json': [
    {
      date: '2026-08-30',
      clusterName: 'cl-a',
      jobId: 'job-777',
      appStartIso: '2026-08-30T04:00:00Z',
    },
  ],
}

const server = setupServer(
  http.get('/api/operational/lineage', ({ request }) => {
    const url = new URL(request.url)
    if (url.searchParams.get('node') === 'empty') {
      return HttpResponse.json({
        seed: 'empty',
        nodes: [],
        edges: [],
        truncated: false,
        totalReachable: 0,
        activeCluster: null,
        clusterOptions: [],
      })
    }
    if (url.searchParams.get('node') === 'big') {
      return HttpResponse.json({ ...LINEAGE, seed: 'big', truncated: true, totalReachable: 312 })
    }
    return HttpResponse.json(LINEAGE)
  }),
  http.get('/api/config', () => HttpResponse.json({})),
  http.get('/api/operational/runs', () =>
    HttpResponse.json({ limit: 10, byRecipe: RUNS_BY_RECIPE }),
  ),
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

describe('LineageFlow', () => {
  it('renders the whole chain, not just the direct neighbours', async () => {
    // The point of the change: a one-hop list made you reassemble the chain in your head.
    render(<LineageFlow nodeId="seed" />, { wrapper })
    expect(await screen.findByText('STG.SRC')).toBeInTheDocument()
    expect(screen.getByText('DWH.OUT')).toBeInTheDocument()
    expect(screen.getByText('ODS.MIDDLE')).toBeInTheDocument()
  })

  it('marks the seed so you never lose which node you are looking from', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    await screen.findByText('ODS.MIDDLE')
    expect(screen.getByTestId('lineage-seed')).toHaveTextContent('ODS.MIDDLE')
  })

  it('counts upstream and downstream separately in the header', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    // 3 downstream, not 2: the cl-far gateway (hop 3) is a drawn downstream node.
    expect(await screen.findByTestId('lineage-summary')).toHaveTextContent(
      /3 upstream .* 3 downstream/,
    )
  })

  it('states what it is not showing when the budget was spent', async () => {
    render(<LineageFlow nodeId="big" />, { wrapper })
    // 8, not 7: data.nodes.length includes the gateway.
    expect(await screen.findByTestId('lineage-truncation')).toHaveTextContent(/8 of 312/)
  })

  it('says nothing about truncation when nothing was truncated', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    await screen.findByText('ODS.MIDDLE')
    expect(screen.queryByTestId('lineage-truncation')).not.toBeInTheDocument()
  })

  it('reports a single click as a selection', async () => {
    const picked: string[] = []
    render(<LineageFlow nodeId="seed" onSelect={id => picked.push(id)} />, { wrapper })
    fireEvent.click(await screen.findByText('DWH.OUT'))
    await waitFor(() => expect(picked).toContain('t_out'))
  })

  it('draws an edge for every pair it placed', async () => {
    const { container } = render(<LineageFlow nodeId="seed" />, { wrapper })
    await screen.findByText('ODS.MIDDLE')
    // + the gateway edge, which must be drawn (a floating stub would be a silent boundary).
    expect(container.querySelectorAll('[data-lineage-edge]').length).toBe(EDGES.length + 1)
  })

  it('is honest about an empty lineage rather than rendering a blank panel', async () => {
    render(<LineageFlow nodeId="empty" />, { wrapper })
    expect(await screen.findByTestId('lineage-empty')).toBeInTheDocument()
  })
})

describe('LineageFlow — opening position', () => {
  it('scrolls the seed into view instead of opening on the furthest ancestor', async () => {
    // A wide lineage lays out from hop -N, so the natural scroll position shows a column the
    // operator did not ask about, with the node they clicked off-screen to the right.
    const { container } = render(<LineageFlow nodeId="seed" />, { wrapper })
    await screen.findByTestId('lineage-seed')
    const scroller = container.querySelector<HTMLElement>('[data-testid="lineage-scroll"]')!
    // jsdom reports clientWidth 0, so the computed target collapses to the seed's own x; the
    // assertion that matters is that it moved OFF the far-left origin toward the seed.
    const seedX = parseFloat((screen.getByTestId('lineage-seed') as HTMLElement).style.left)
    expect(scroller.scrollLeft).toBeGreaterThan(0)
    expect(scroller.scrollLeft).toBeLessThanOrEqual(seedX + LINEAGE_FOOTPRINT.width)
  })
})

// ─── banded layout, tracing, chrome and manual arrangement (spec §15) ───────

describe('LineageFlow — bands', () => {
  it('labels a rail per tier so a vertical position means something', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    await screen.findByText('ODS.MIDDLE')
    const rails = [...document.querySelectorAll('[data-testid="lineage-band"]')]
    expect(rails.length).toBeGreaterThanOrEqual(2)
    // Labels are painted in a separate pass ABOVE the cards — a sticky label travels over
    // whatever card is beneath it once the flow is scrolled.
    const labels = [...document.querySelectorAll('[data-testid="lineage-band-label"]')]
    expect(labels).toHaveLength(rails.length)
    expect(labels.map(l => l.textContent).join(' ')).toMatch(/STG . ODS/)
  })
})

describe('LineageFlow — routed edges', () => {
  it('routes a multi-column edge through waypoints instead of one curve behind the cards', async () => {
    const { container } = render(<LineageFlow nodeId="seed" />, { wrapper })
    await screen.findByText('ODS.MIDDLE')
    const long = container.querySelector('[data-lineage-edge="lookup"]')!
    // A single cubic has one C; a routed polyline has a segment per column gap.
    expect((long.getAttribute('d')!.match(/C/g) ?? []).length).toBeGreaterThan(1)
  })
})

describe('LineageFlow — tracing', () => {
  it('highlights the whole path through a node and dims the rest on hover', async () => {
    const { container } = render(<LineageFlow nodeId="seed" />, { wrapper })
    await screen.findByText('ODS.MIDDLE')
    fireEvent.mouseEnter(screen.getByTestId('lineage-seed'))

    const traced = container.querySelectorAll('[data-traced="true"]')
    const dimmed = container.querySelectorAll('[data-dimmed="true"]')
    // seed + its ancestors + its descendants, and nothing else
    expect(traced.length).toBeGreaterThanOrEqual(3)
    expect(dimmed.length).toBeGreaterThan(0)

    fireEvent.mouseLeave(screen.getByTestId('lineage-seed'))
    expect(container.querySelectorAll('[data-dimmed="true"]').length).toBe(0)
  })
})

describe('LineageFlow — chrome', () => {
  it('lists the clusters the lineage touches, with a count each', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    expect(await screen.findByTestId('lineage-clusters')).toHaveTextContent('cl-a')
    // three recipes in the fixture carry cl-a
    expect(screen.getByTestId('lineage-clusters')).toHaveTextContent('cl-a3')
  })

  it('renders the same filter bar the main toolbar uses', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    await screen.findByText('ODS.MIDDLE')
    expect(document.querySelector('[data-testid="lineage-layer-filter"]')).toBeInTheDocument()
    expect(document.querySelector('[data-testid="lineage-status-filter"]')).toBeInTheDocument()
  })

  it('DIMS on filter rather than removing, so the paths stay intact', async () => {
    // Deleting nodes from a lineage severs the very paths that make it a lineage.
    const { container } = render(<LineageFlow nodeId="seed" />, { wrapper })
    await screen.findByText('ODS.MIDDLE')
    const before = container.querySelectorAll('[data-lineage-card]').length

    fireEvent.click(
      [...document.querySelectorAll('[data-testid="lineage-layer-filter"] button')].find(
        b => b.textContent === 'DWH',
      )!,
    )

    expect(container.querySelectorAll('[data-lineage-card]').length).toBe(before)
    expect(container.querySelectorAll('[data-dimmed="true"]').length).toBeGreaterThan(0)
    expect(screen.getByTestId('lineage-filter-note')).toHaveTextContent(/dimmed/)
  })
})

describe('LineageFlow — details and re-seeding', () => {
  it('opens a Details dock on a single click, like the main view', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    fireEvent.click(await screen.findByText('DWH.OUT'))
    expect(await screen.findByTestId('lineage-details')).toHaveTextContent('DWH.OUT')
  })

  it('re-seeds on a double click, not on a single one', async () => {
    const reseeded: string[] = []
    render(<LineageFlow nodeId="seed" onReseed={id => reseeded.push(id)} />, { wrapper })
    const target = await screen.findByText('DWH.OUT')
    fireEvent.click(target)
    expect(reseeded).toHaveLength(0)
    fireEvent.doubleClick(target)
    expect(reseeded).toEqual(['t_out'])
  })

  it('offers an explicit centre control in the dock, for discoverability', async () => {
    const reseeded: string[] = []
    render(<LineageFlow nodeId="seed" onReseed={id => reseeded.push(id)} />, { wrapper })
    fireEvent.click(await screen.findByText('DWH.OUT'))
    fireEvent.click(await screen.findByRole('button', { name: /center lineage here/i }))
    expect(reseeded).toEqual(['t_out'])
  })
})

describe('LineageFlow — manual arrangement', () => {
  const posOf = (id: string) => {
    const el = [...document.querySelectorAll<HTMLElement>('[data-lineage-card]')].find(
      e => e.getAttribute('data-lineage-card') === id,
    )!
    return { left: el.style.left, top: el.style.top }
  }

  it('offers no reset until something has actually been moved', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    await screen.findByText('ODS.MIDDLE')
    expect(screen.queryByRole('button', { name: /reset layout/i })).not.toBeInTheDocument()
  })

  it('moves only the dragged node, and resets to the computed default exactly', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    await screen.findByText('ODS.MIDDLE')
    const before = { seed: posOf('seed'), other: posOf('t_out') }

    const card = [...document.querySelectorAll<HTMLElement>('[data-lineage-card]')].find(
      e => e.getAttribute('data-lineage-card') === 'seed',
    )!
    fireEvent.pointerDown(card, { clientX: 0, clientY: 0, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 40, clientY: 25, pointerId: 1 })
    fireEvent.pointerUp(window, { pointerId: 1 })

    expect(posOf('seed')).not.toEqual(before.seed)
    expect(posOf('t_out')).toEqual(before.other)

    fireEvent.click(screen.getByRole('button', { name: /reset layout/i }))
    expect(posOf('seed')).toEqual(before.seed)

    // and the restored coordinates are the layout function's, not a remembered snapshot
    const computed = layoutLineage(NODES, EDGES).nodes.find(p => p.id === 'seed')!
    expect(posOf('seed')).toEqual({ left: `${computed.x + RAIL_W}px`, top: `${computed.y}px` })
  })
})

describe('dragging keeps the arrows attached', () => {
  it('moves an edge endpoint with the card it is anchored to', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    const seed = await screen.findByTestId('lineage-seed')

    const edgeD = () =>
      Array.from(document.querySelectorAll('path[data-lineage-edge]')).map(p => p.getAttribute('d'))
    const before = edgeD()

    fireEvent.pointerDown(seed, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(window, { clientX: 190, clientY: 160 })
    fireEvent.pointerUp(window)

    await waitFor(() => expect(edgeD()).not.toEqual(before))

    // Precise claim, not merely "something changed": the outgoing edge starts at the card's
    // new right-edge anchor.
    const base = layoutLineage(NODES, EDGES)
    const p = base.nodes.find(x => x.id === 'seed')!
    const x = p.x + 90 + RAIL_W + LINEAGE_FOOTPRINT.width
    const y = p.y + 60 + LINEAGE_FOOTPRINT.height / 2
    expect(edgeD().some(d => d?.startsWith(`M${x} ${y}`))).toBe(true)
  })
})

describe('LineageFlow — the trace survives reaching for the dock', () => {
  it('pins the trace to the selected node, not just the hovered one', async () => {
    // Hover alone drops the highlight the moment the pointer moves toward the Details dock —
    // which is precisely when the operator wanted to keep looking at it.
    const { container } = render(<LineageFlow nodeId="seed" />, { wrapper })
    fireEvent.click(await screen.findByText('DWH.OUT'))
    expect(container.querySelectorAll('[data-traced="true"]').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('[data-dimmed="true"]').length).toBeGreaterThan(0)
  })

  it('lets a hover preview override the pinned selection, then fall back to it', async () => {
    const { container } = render(<LineageFlow nodeId="seed" />, { wrapper })
    fireEvent.click(await screen.findByText('DWH.OUT'))
    const pinned = container.querySelectorAll('[data-traced="true"]').length

    fireEvent.mouseEnter(screen.getByTestId('lineage-seed'))
    fireEvent.mouseLeave(screen.getByTestId('lineage-seed'))
    expect(container.querySelectorAll('[data-traced="true"]').length).toBe(pinned)
  })
})

describe('the lineage dock is the full Details panel', () => {
  it('shows Preview and the GCP links for a selected node', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    fireEvent.click(await screen.findByTestId('lineage-seed'))

    const dock = await screen.findByTestId('lineage-details')
    expect(within(dock).getByText('Open preview')).toBeInTheDocument()
    expect(within(dock).getByText('Open in BigQuery')).toBeInTheDocument()
    expect(within(dock).getByText('Monitoring Dashboard')).toBeInTheDocument()
    expect(within(dock).getByText('Cloud Logging')).toBeInTheDocument()
  })

  it('keeps the hop line and the centre control', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    fireEvent.click(await screen.findByTestId('lineage-seed'))
    const dock = await screen.findByTestId('lineage-details')
    expect(within(dock).getByText(/hop 0 \(seed\)/)).toBeInTheDocument()
    expect(within(dock).getByLabelText('Center lineage here')).toBeInTheDocument()
  })

  it('does NOT duplicate the flow as a Related list', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    fireEvent.click(await screen.findByTestId('lineage-seed'))
    const dock = await screen.findByTestId('lineage-details')
    expect(within(dock).queryByText(/^Related/)).toBeNull()
  })

  // The Task 8 review's point: `NodeDetails`'s own tests assert the GCP links by their TEXT
  // only — a fake `previewTarget`/no `config` at all. This is the one place a REAL host
  // (`RelatedOverlay`, via `extras.config`) actually supplies a config and a selected node, so
  // it is the only place ADR-0015's anchoring — the link's `href` actually being what
  // `gcpLinks.ts`'s builder produces for that config — is exercised at all.
  it('anchors a GCP link on the config the host supplies, not a placeholder', async () => {
    const config = { bigQueryUrl: 'https://example.com/bq?project={project}' } as AppConfig
    render(<LineageFlow nodeId="seed" extras={{ edges: [], nodeById: new Map(), config }} />, {
      wrapper,
    })
    fireEvent.click(await screen.findByTestId('lineage-seed'))
    const dock = await screen.findByTestId('lineage-details')
    const link = within(dock).getByText('Open in BigQuery').closest('a')!
    expect(link.getAttribute('href')).toBe(buildBigQueryUrl(config))
  })

  // Fix round 1: the brief's original JSX passed neither `runs` nor `fallbackClusterName`, so
  // Cloud Logging/Monitoring always anchored on an empty job id/cluster name — a link that looks
  // live and goes nowhere. The BigQuery test above proves `config` is threaded; only a
  // run-anchored link proves the dock's OWN run history (`useRuns`, fetched at the top level) is
  // actually reaching `NodeDetails`.
  it("anchors the Cloud Logging link on the selected recipe's served run, not an empty job id", async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    fireEvent.click(await screen.findByText('_ETL_up.json'))
    const dock = await screen.findByTestId('lineage-details')
    const link = await within(dock).findByText('Cloud Logging')
    await waitFor(() =>
      expect(link.closest('a')!.getAttribute('href')).toContain(encodeURIComponent('job-777')),
    )
  })
})

describe('cluster scope', () => {
  it('draws an out-of-cluster recipe as a stub, not a full card', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    const stub = await screen.findByTestId('lineage-gateway')
    // The stub names the recipe AND the cluster the chain continues into — that is what stops
    // the flow looking complete where it is not.
    expect(stub).toHaveTextContent('_ETL_far.json')
    expect(stub).toHaveTextContent('cl-far')
    // It is a stub: no OperationalCard status pill inside it.
    expect(within(stub).queryByText('PENDING')).toBeNull()
  })

  it('still counts the stub as a node', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    const summary = await screen.findByTestId('lineage-summary')
    expect(summary).toHaveTextContent(`${NODES.length + 1} nodes`)
  })
})

describe('the cluster switcher', () => {
  it('lists the seed clusters with the active one first and marked', async () => {
    render(<LineageFlow nodeId="seed" cluster="cl-a" />, { wrapper })
    const strip = await screen.findByTestId('lineage-clusters')
    const chips = within(strip).getAllByTestId('lineage-cluster-chip')
    expect(chips[0]).toHaveTextContent('cl-a')
    expect(chips[0]).toHaveAttribute('data-active', 'true')
  })

  it('reports a switch to the host', async () => {
    const picked: string[] = []
    render(<LineageFlow nodeId="seed" cluster="cl-a" onClusterChange={c => picked.push(c)} />, {
      wrapper,
    })
    const strip = await screen.findByTestId('lineage-clusters')
    fireEvent.click(within(strip).getAllByTestId('lineage-cluster-chip')[1]!)
    expect(picked).toEqual(['cl-far'])
  })

  it('clicking a gateway switches to its cluster and re-seeds on it', async () => {
    const picked: string[] = []
    const seeded: string[] = []
    render(
      <LineageFlow
        nodeId="seed"
        cluster="cl-a"
        onClusterChange={c => picked.push(c)}
        onReseed={id => seeded.push(id)}
      />,
      { wrapper },
    )
    fireEvent.click(await screen.findByTestId('lineage-gateway'))
    expect(picked).toEqual(['cl-far'])
    expect(seeded).toEqual(['r_far'])
  })

  it('says which cluster it is loading while the switch is in flight', async () => {
    // A cluster switch is not a filter — it is a different graph. A spinner over stale nodes
    // would imply otherwise.
    const { rerender } = render(<LineageFlow nodeId="seed" cluster="cl-a" />, { wrapper })
    await screen.findByTestId('lineage-seed')
    rerender(<LineageFlow nodeId="seed" cluster="cl-far" />)
    expect(await screen.findByTestId('lineage-switching')).toHaveTextContent(
      'Loading from cluster: cl-far',
    )
  })
})
