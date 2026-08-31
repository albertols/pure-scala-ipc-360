import { describe, expect, it } from 'vitest'
import {
  layoutLineage,
  countCrossings,
  TIER_OF,
  LINEAGE_FOOTPRINT,
  DUMMY_HEIGHT,
} from './lineageLayout'
import type { LineageNodeT, LineageT } from '../../api/clusterQueries'

const n = (
  id: string,
  hop: number,
  layer: string,
  kind: 'table' | 'recipe' = 'table',
): LineageNodeT => ({ id, kind, name: id, layer, hop, clusters: [] })

const e = (from: string, to: string, kind: LineageT['edges'][number]['kind'] = 'writes') => ({
  from,
  to,
  kind,
})

describe('tier bands', () => {
  it('groups the layers into the medallion tiers the palette uses', () => {
    expect(TIER_OF.STG).toBe(TIER_OF.ODS)
    expect(TIER_OF.DWH).toBe(TIER_OF.ETL)
    expect(TIER_OF.CDM).toBe(TIER_OF.RDM)
    expect(TIER_OF.CDM).toBe(TIER_OF.QDM)
    expect(
      new Set([TIER_OF.STG, TIER_OF.DWH, TIER_OF.CDM, TIER_OF.OUTPUT, TIER_OF.UNKNOWN]).size,
    ).toBe(5)
  })

  it('keeps bronze above silver above gold, in every column', () => {
    // The whole point of banding: a vertical position means the same thing wherever you look.
    const out = layoutLineage(
      [
        n('s1', 0, 'STG'),
        n('d1', 0, 'DWH'),
        n('c1', 0, 'CDM'),
        n('s2', 1, 'ODS'),
        n('d2', 1, 'ETL'),
        n('c2', 1, 'QDM'),
      ],
      [e('s1', 's2'), e('d1', 'd2'), e('c1', 'c2')],
    )
    const y = (id: string) => out.nodes.find(p => p.id === id)!.y
    expect(y('s1')).toBeLessThan(y('d1'))
    expect(y('d1')).toBeLessThan(y('c1'))
    expect(y('s2')).toBeLessThan(y('d2'))
    expect(y('d2')).toBeLessThan(y('c2'))
    // and the same tier occupies the same band in both columns
    expect(out.nodes.find(p => p.id === 's1')!.band).toBe(out.nodes.find(p => p.id === 's2')!.band)
  })

  it('emits a rail per tier actually present, and none for absent tiers', () => {
    const out = layoutLineage([n('a', 0, 'STG'), n('b', 1, 'CDM')], [e('a', 'b')])
    expect(out.bands.map(b => b.tier)).toEqual(['bronze', 'gold'])
    expect(out.bands.every(b => b.height > 0)).toBe(true)
  })
})

describe('long-edge routing', () => {
  it('splits a multi-column edge into one dummy per intervening column', () => {
    // 50 of 81 real lineages have one of these; drawn as a single curve they pass behind cards.
    // Columns are the DISTINCT hops present, not the raw hop numbers — a hop with no node in it
    // is not a column, so `a`(0) -> `z`(3) below spans two columns, not three.
    const out = layoutLineage(
      [n('a', 0, 'STG'), n('m', 1, 'ODS'), n('p', 2, 'DWH'), n('z', 3, 'CDM')],
      [e('a', 'm'), e('a', 'z')],
    )
    const long = out.edges.find(r => r.from === 'a' && r.to === 'z')!
    expect(long.points).toHaveLength(4) // start + dummies in columns 1 and 2 + end
    const short = out.edges.find(r => r.from === 'a' && r.to === 'm')!
    expect(short.points).toHaveLength(2)
  })

  it('treats a gap in the hop numbering as one column, not several', () => {
    const out = layoutLineage([n('a', 0, 'STG'), n('m', 1, 'ODS'), n('z', 9, 'CDM')], [e('a', 'z')])
    expect(out.edges[0]!.points).toHaveLength(3) // exactly one intervening column
  })

  it('routes a long edge through slots that no card occupies', () => {
    const out = layoutLineage(
      [n('a', 0, 'STG'), n('m', 1, 'ODS'), n('z', 2, 'CDM')],
      [e('a', 'm'), e('a', 'z'), e('m', 'z')],
    )
    const long = out.edges.find(r => r.from === 'a' && r.to === 'z')!
    const mid = long.points[1]!
    const m = out.nodes.find(p => p.id === 'm')!
    const insideCard =
      mid.x >= m.x &&
      mid.x <= m.x + LINEAGE_FOOTPRINT.width &&
      mid.y >= m.y &&
      mid.y <= m.y + LINEAGE_FOOTPRINT.height
    expect(insideCard).toBe(false)
  })

  it('gives dummy lanes a thin row so they cost little height', () => {
    expect(DUMMY_HEIGHT).toBeLessThan(LINEAGE_FOOTPRINT.height / 3)
  })

  it('handles a backward edge without looping forever', () => {
    // The L2L graph is not guaranteed acyclic.
    const out = layoutLineage([n('a', 0, 'STG'), n('b', 1, 'ODS')], [e('a', 'b'), e('b', 'a')])
    expect(out.nodes).toHaveLength(2)
    expect(out.edges).toHaveLength(2)
  })
})

describe('crossing reduction', () => {
  // A deliberately-crossed bipartite fixture: name order puts every edge across every other.
  const crossed = () => {
    const nodes = [
      n('a1', 0, 'STG'),
      n('a2', 0, 'STG'),
      n('a3', 0, 'STG'),
      n('b1', 1, 'STG'),
      n('b2', 1, 'STG'),
      n('b3', 1, 'STG'),
    ]
    const edges = [e('a1', 'b3'), e('a2', 'b2'), e('a3', 'b1')]
    return { nodes, edges }
  }

  it('beats name-only ordering on a fixture built to cross', () => {
    const { nodes, edges } = crossed()
    const optimised = countCrossings(layoutLineage(nodes, edges))
    const naive = countCrossings(layoutLineage(nodes, edges, { sweeps: 0 }))
    expect(optimised).toBeLessThan(naive)
    expect(optimised).toBe(0)
  })

  it('never moves a node out of its band to win a crossing', () => {
    // Banding is a hard constraint; ordering optimises WITHIN it.
    const out = layoutLineage(
      [n('g', 0, 'CDM'), n('b', 0, 'STG'), n('g2', 1, 'CDM'), n('b2', 1, 'STG')],
      [e('g', 'b2'), e('b', 'g2')],
    )
    const band = (id: string) => out.nodes.find(p => p.id === id)!.band
    expect(band('g')).toBe(band('g2'))
    expect(band('b')).toBe(band('b2'))
    expect(band('b')).toBeLessThan(band('g'))
  })
})

describe('geometry', () => {
  const wide = () => {
    const nodes: LineageNodeT[] = []
    const edges: LineageT['edges'] = []
    const layers = ['STG', 'ODS', 'DWH', 'ETL', 'CDM', 'RDM']
    for (let c = 0; c < 6; c++) {
      for (let r = 0; r < 4; r++) {
        nodes.push(n(`n${c}_${r}`, c - 2, layers[(c + r) % layers.length]!))
        if (c > 0) edges.push(e(`n${c - 1}_${r}`, `n${c}_${r}`))
      }
    }
    return { nodes, edges }
  }

  it('never overlaps two placed boxes', () => {
    const { nodes, edges } = wide()
    const out = layoutLineage(nodes, edges)
    const real = out.nodes.filter(p => !p.isDummy)
    for (let i = 0; i < real.length; i++) {
      for (let j = i + 1; j < real.length; j++) {
        const a = real[i]!,
          b = real[j]!
        const hit =
          a.x < b.x + LINEAGE_FOOTPRINT.width &&
          b.x < a.x + LINEAGE_FOOTPRINT.width &&
          a.y < b.y + LINEAGE_FOOTPRINT.height &&
          b.y < a.y + LINEAGE_FOOTPRINT.height
        expect(hit, `${a.id} overlaps ${b.id}`).toBe(false)
      }
    }
  })

  it('reports an extent that contains every node', () => {
    const { nodes, edges } = wide()
    const out = layoutLineage(nodes, edges)
    for (const p of out.nodes) {
      expect(p.x + LINEAGE_FOOTPRINT.width).toBeLessThanOrEqual(out.width)
      expect(p.y).toBeLessThanOrEqual(out.height)
    }
  })

  it('is deterministic', () => {
    const { nodes, edges } = wide()
    expect(layoutLineage(nodes, edges)).toEqual(layoutLineage(nodes, edges))
  })

  it('handles one node, and none', () => {
    expect(layoutLineage([n('solo', 0, 'STG')], []).nodes).toHaveLength(1)
    const empty = layoutLineage([], [])
    expect(empty.nodes).toHaveLength(0)
    expect(empty.bands).toHaveLength(0)
  })
})
