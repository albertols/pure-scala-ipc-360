import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { LineageFlow, layoutLineage, LINEAGE_FOOTPRINT } from './LineageFlow'
import type { LineageNodeT, LineageT } from '../../api/clusterQueries'

// A 5-node chain with the seed in the middle: two hops upstream, two downstream.
const NODES: LineageNodeT[] = [
  { id: 't_src', kind: 'table', name: 'STG.SRC', layer: 'STG', hop: -2, clusters: [] },
  { id: 'r_up', kind: 'recipe', name: '_ETL_up.json', layer: 'ODS', hop: -1, clusters: ['cl-a'] },
  { id: 'seed', kind: 'table', name: 'ODS.MIDDLE', layer: 'ODS', hop: 0, clusters: [] },
  { id: 'r_down', kind: 'recipe', name: '_ETL_down.json', layer: 'DWH', hop: 1, clusters: ['cl-a'] },
  { id: 't_out', kind: 'table', name: 'DWH.OUT', layer: 'DWH', hop: 2, clusters: [] },
]
const EDGES: LineageT['edges'] = [
  { from: 't_src', to: 'r_up', kind: 'source' },
  { from: 'r_up', to: 'seed', kind: 'writes' },
  { from: 'seed', to: 'r_down', kind: 'source' },
  { from: 'r_down', to: 't_out', kind: 'writes' },
]
const LINEAGE: LineageT = { seed: 'seed', nodes: NODES, edges: EDGES, truncated: false, totalReachable: 5 }

const server = setupServer(
  http.get('/api/operational/lineage', ({ request }) => {
    const url = new URL(request.url)
    if (url.searchParams.get('node') === 'empty') {
      return HttpResponse.json({ seed: 'empty', nodes: [], edges: [], truncated: false, totalReachable: 0 })
    }
    if (url.searchParams.get('node') === 'big') {
      return HttpResponse.json({ ...LINEAGE, seed: 'big', truncated: true, totalReachable: 312 })
    }
    return HttpResponse.json(LINEAGE)
  }),
  http.get('/api/config', () => HttpResponse.json({})),
)
beforeAll(() => server.listen())
afterEach(() => { server.resetHandlers(); cleanup() })
afterAll(() => server.close())

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

describe('layoutLineage', () => {
  it('orders columns by hop, left to right', () => {
    const placed = layoutLineage(NODES, EDGES)
    const xById = new Map(placed.map(p => [p.id, p.x]))
    expect(xById.get('t_src')!).toBeLessThan(xById.get('r_up')!)
    expect(xById.get('r_up')!).toBeLessThan(xById.get('seed')!)
    expect(xById.get('seed')!).toBeLessThan(xById.get('r_down')!)
    expect(xById.get('r_down')!).toBeLessThan(xById.get('t_out')!)
  })

  it('gives every node with the same hop the same column', () => {
    const twins: LineageNodeT[] = [
      ...NODES,
      { id: 'r_up2', kind: 'recipe', name: '_ETL_up2.json', layer: 'ODS', hop: -1, clusters: [] },
    ]
    const placed = layoutLineage(twins, EDGES)
    const byId = new Map(placed.map(p => [p.id, p]))
    expect(byId.get('r_up')!.x).toBe(byId.get('r_up2')!.x)
    expect(byId.get('r_up')!.y).not.toBe(byId.get('r_up2')!.y)
  })

  it('never overlaps two nodes', () => {
    const placed = layoutLineage(NODES, EDGES)
    const { width, height } = LINEAGE_FOOTPRINT
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!, b = placed[j]!
        const overlaps = a.x < b.x + width && b.x < a.x + width
          && a.y < b.y + height && b.y < a.y + height
        expect(overlaps, `${a.name} overlaps ${b.name}`).toBe(false)
      }
    }
  })

  it('handles a lineage with no edges at all', () => {
    // A node nothing touches is a real, and diagnostically interesting, case.
    const placed = layoutLineage([NODES[2]!], [])
    expect(placed).toHaveLength(1)
    expect(placed[0]!.x).toBeGreaterThanOrEqual(0)
  })

  it('is stable — the same input lays out identically twice', () => {
    expect(layoutLineage(NODES, EDGES)).toEqual(layoutLineage(NODES, EDGES))
  })
})

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
    expect(await screen.findByTestId('lineage-summary'))
      .toHaveTextContent(/2 upstream .* 2 downstream/)
  })

  it('states what it is not showing when the budget was spent', async () => {
    render(<LineageFlow nodeId="big" />, { wrapper })
    expect(await screen.findByTestId('lineage-truncation')).toHaveTextContent(/5 of 312/)
  })

  it('says nothing about truncation when nothing was truncated', async () => {
    render(<LineageFlow nodeId="seed" />, { wrapper })
    await screen.findByText('ODS.MIDDLE')
    expect(screen.queryByTestId('lineage-truncation')).not.toBeInTheDocument()
  })

  it('re-seeds on a node click', async () => {
    const picked: string[] = []
    render(<LineageFlow nodeId="seed" onFocus={id => picked.push(id)} />, { wrapper })
    fireEvent.click(await screen.findByText('DWH.OUT'))
    await waitFor(() => expect(picked).toContain('t_out'))
  })

  it('draws an edge for every pair it placed', async () => {
    const { container } = render(<LineageFlow nodeId="seed" />, { wrapper })
    await screen.findByText('ODS.MIDDLE')
    expect(container.querySelectorAll('[data-lineage-edge]').length).toBe(EDGES.length)
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
