import { describe, expect, it } from 'vitest'
import {
  DENSITY_FOOTPRINT, DENSITY_GUTTER, DENSITY_PITCH, MIN_GUTTER, LAYER_RANK,
  fitToViewport, toOperationalGraph, summarizeSnapshot,
} from './relationshipsAdapter'
import type { RelationshipGraph, OperationalSummary, B15Row } from './queries'

// Mini fixture: 2 STG head tables + a lookup table into r3; recipes r3/r4 both
// write T_ODS (fan-in); r5 reads T_ODS + T_REFS and writes T_FACT (diamond
// converge). Edge list also carries one duplicate (t_stg1 -> r3, doubled) and
// one dangling edge (from a node id absent from `nodes`) to exercise dedup and
// endpoint-validity dropping in the same fixture.
const graph: RelationshipGraph = {
  nodes: [
    { id: 't_stg1', kind: 'table', name: 'stg_dwhes.STG_ORDERS', layer: 'STG' },
    { id: 't_stg2', kind: 'table', name: 'stg_dwhes.STG_CUSTOMERS', layer: 'STG' },
    { id: 't_lkp', kind: 'table', name: 'stg_dwhes.LKP_REGION', layer: 'STG' },
    { id: 'r3', kind: 'recipe', name: '_ETL_m_CAS_ODS_R3.json', layer: 'ODS' },
    { id: 'r4', kind: 'recipe', name: '_ETL_m_CAS_ODS_R4.json', layer: 'ODS' },
    { id: 't_ods', kind: 'table', name: 'ods_dwhes.T_ODS', layer: 'ODS' },
    { id: 't_refs', kind: 'table', name: 'ods_dwhes.T_REFS', layer: 'ODS' },
    { id: 'r5', kind: 'recipe', name: '_ETL_m_CAS_DWH_R5.json', layer: 'DWH' },
    { id: 't_fact', kind: 'table', name: 'dwh_dwhes.T_FACT', layer: 'DWH' },
  ],
  edges: [
    { from: 't_stg1', to: 'r3', kind: 'source' },
    { from: 't_stg1', to: 'r3', kind: 'source' }, // duplicate — must collapse
    { from: 't_lkp', to: 'r3', kind: 'lookup' },
    { from: 'r3', to: 't_ods', kind: 'writes' },
    { from: 't_stg2', to: 'r4', kind: 'source' },
    { from: 'r4', to: 't_ods', kind: 'writes' }, // fan-in
    { from: 't_ods', to: 'r5', kind: 'source' },
    { from: 't_refs', to: 'r5', kind: 'source' }, // diamond converge
    { from: 'r5', to: 't_fact', kind: 'writes' },
    { from: 'ghost', to: 'r3', kind: 'source' }, // dangling — endpoint doesn't exist
  ],
  meta: { entryCount: 9, skippedRows: 0, layers: ['STG', 'ODS', 'DWH'] },
}

const summary: OperationalSummary = {
  dates: ['2026-07-27', '2026-07-28', '2026-07-29'],
  recipes: [
    {
      recipeFilename: '_ETL_m_CAS_ODS_R3.json',
      layer: 'ODS',
      latestDate: '2026-07-29',
      latestStatus: 'SUCCESS',
      okCount: 3,
      koCount: 0,
      history: [
        { date: '2026-07-27', status: 'SUCCESS', durationMin: 2.4 },
        { date: '2026-07-28', status: 'SUCCESS', durationMin: 2.5 },
        { date: '2026-07-29', status: 'SUCCESS', durationMin: 2.6 },
      ],
      avgDurationMin: 2.575,
      p50DurationMin: 2.4917,
      p95DurationMin: 3.0083,
      lastJobId: 'application_r3_0029',
      lastClusterName: 'cluster-r3',
    },
    {
      recipeFilename: '_ETL_m_CAS_ODS_R4.json',
      layer: 'ODS',
      latestDate: '2026-07-29',
      latestStatus: 'FAILED',
      okCount: 2,
      koCount: 1,
      history: [
        { date: '2026-07-27', status: 'SUCCESS', durationMin: 1.9 },
        { date: '2026-07-28', status: 'SUCCESS', durationMin: 2.0 },
        { date: '2026-07-29', status: 'FAILED', durationMin: 0.4 },
      ],
      avgDurationMin: 1.43,
      p50DurationMin: 1.9,
      p95DurationMin: 2.0,
      lastJobId: 'application_r4_0029',
      lastClusterName: 'cluster-r4',
    },
    {
      recipeFilename: '_ETL_m_CAS_DWH_R5.json',
      layer: 'DWH',
      latestDate: '2026-07-29',
      latestStatus: 'SUCCESS',
      okCount: 2,
      koCount: 0,
      history: [
        { date: '2026-07-27', status: 'SUCCESS', durationMin: 3.0 },
        { date: '2026-07-28', status: '' },
        { date: '2026-07-29', status: 'SUCCESS', durationMin: 3.2 },
      ],
      avgDurationMin: 3.1,
      p50DurationMin: 3.0,
      p95DurationMin: 3.2,
      lastJobId: 'application_r5_0029',
      lastClusterName: 'cluster-r5',
    },
  ],
}

describe('toOperationalGraph — cards, status, edges, layout', () => {
  const view = toOperationalGraph(graph, summary, '2026-07-29')
  const byId = new Map(view.cards.map(c => [c.id, c]))

  it('(a) fan-in table is KO when one of its writer recipes is KO at the selected date', () => {
    expect(byId.get('r3')!.status).toBe('OK')
    expect(byId.get('r4')!.status).toBe('KO')
    expect(byId.get('t_ods')!.status).toBe('KO')
  })

  it('(b) recipe is PENDING when the selected date is absent from its history', () => {
    const pendingView = toOperationalGraph(graph, summary, '2026-07-30')
    const r5 = pendingView.cards.find(c => c.id === 'r5')!
    expect(r5.status).toBe('PENDING')
  })

  it('(c) lays out STG->ODS->DWH strictly left-to-right on the detailed column pitch', () => {
    // Reads the pitch rather than restating it: a hardcoded copy of this number is the exact
    // species of duplicate whose drift from the real card size caused the overlap defect.
    for (const c of view.cards) expect((c.x! - 40) % DENSITY_PITCH.detailed.col).toBe(0)
    const chain = ['t_stg1', 'r3', 't_ods', 'r5', 't_fact'].map(id => byId.get(id)!)
    for (let i = 1; i < chain.length; i++) expect(chain[i]!.x!).toBeGreaterThan(chain[i - 1]!.x!)
  })

  it('(d) p99 mirrors p95 and durations round to whole seconds', () => {
    const r3 = byId.get('r3')!
    expect(r3.stats.avg_time_s).toBe(155)
    expect(r3.stats.p50).toBe(150)
    expect(r3.stats.p95).toBe(180)
    expect(r3.stats.p99).toBe(r3.stats.p95)
    expect(r3.stats.avg_count).toBe(0)
  })

  it('(e) dedupes edges, drops dangling endpoints, keeps relations symmetric', () => {
    expect(view.edges).toHaveLength(8)
    for (const card of view.cards) {
      for (const relId of card.relations) {
        const rel = byId.get(relId)
        expect(rel).toBeDefined()
        expect(rel!.relations).toContain(card.id)
      }
    }
    expect(byId.get('r3')!.relations).toEqual(['t_lkp', 't_ods', 't_stg1'])
  })

  it('table history mirrors its first writer (edge order) and only recipes carry jobId', () => {
    expect(byId.get('t_ods')!.history).toEqual(byId.get('r3')!.history)
    expect(byId.get('r3')!.jobId).toBe('application_r3_0029')
    expect(byId.get('t_ods')!.jobId).toBeUndefined()
  })

  it('layers pass through graph.meta.layers', () => {
    expect(view.layers).toEqual(['STG', 'ODS', 'DWH'])
  })
})

describe('toOperationalGraph — casuistics', () => {
  it('(f) summary undefined => every card PENDING, no throw', () => {
    let view
    expect(() => { view = toOperationalGraph(graph, undefined, '2026-07-29') }).not.toThrow()
    expect(view!.cards.length).toBeGreaterThan(0)
    for (const c of view!.cards) expect(c.status).toBe('PENDING')
  })

  it('node missing layer falls back to UNKNOWN and view.layers appends it once', () => {
    const graphWithUnknown: RelationshipGraph = {
      nodes: [...graph.nodes!, { id: 'orphan', kind: 'table', name: 'misc.ORPHAN' }],
      edges: graph.edges,
      meta: graph.meta,
    }
    const v = toOperationalGraph(graphWithUnknown, summary, '2026-07-29')
    const orphan = v.cards.find(c => c.id === 'orphan')!
    expect(orphan.layer).toBe('UNKNOWN')
    expect(orphan.status).toBe('PENDING')
    expect(v.layers).toEqual(['STG', 'ODS', 'DWH', 'UNKNOWN'])
  })

  // `meta.layers` is derived from the CORE entries of a scoped request
  // (RelationshipService.java:135), so a 1-hop neighbour whose layer sits outside the
  // selection is missing from it. Verified live: scoping cluster-wf-cas-load-4001 returns
  // layers ["ODS","STG"] while its two neighbour recipes are DWH and RDM. Without this union
  // those cards render with no Layer chip that can reach them.
  it('unions layers present on neighbour cards that meta.layers omits, in band order', () => {
    const scoped: RelationshipGraph = {
      nodes: [
        ...graph.nodes!,
        { id: 'n_rdm', kind: 'recipe', name: '_ETL_neighbour_rdm.json', layer: 'RDM', neighbor: true },
        { id: 'n_qdm', kind: 'recipe', name: '_ETL_neighbour_qdm.json', layer: 'QDM', neighbor: true },
      ],
      edges: [...graph.edges!, { from: 't_fact', to: 'n_rdm', kind: 'source' }],
      // CORE-only, exactly as the backend serves it for a scoped request.
      meta: { entryCount: 9, skippedRows: 0, layers: ['STG', 'ODS', 'DWH'], scopedClusters: ['cl-x'], neighborCount: 2 },
    }
    const v = toOperationalGraph(scoped, summary, '2026-07-29')

    // meta order first (untouched), then the extras appended in LAYER_RANK order.
    expect(v.layers).toEqual(['STG', 'ODS', 'DWH', 'RDM', 'QDM'])
    expect(v.cards.find(c => c.id === 'n_rdm')!.neighbor).toBe(true)
    expect(v.cards.find(c => c.id === 'r3')!.neighbor).toBe(false)
  })

  it('selectedDate === null uses latestStatus', () => {
    const v = toOperationalGraph(graph, summary, null)
    expect(v.cards.find(c => c.id === 'r3')!.status).toBe('OK')
    expect(v.cards.find(c => c.id === 'r4')!.status).toBe('KO')
  })
})

// ─── summarizeSnapshot (Task 16) ───────────────────────────────────────────
//
// Client-side b15-row-count/distinct-recipes/distinct-tables/OK-KO derivation
// for Tab 3's floating bottom-left chip, over the SAME cards/edges the graph
// view already computed — no new endpoint. Reuses the `graph`/`view` fixtures
// above: r3 and r4 both write t_ods (fan-in), so two rows naming two
// DIFFERENT recipes that write the SAME table must count that table once.
describe('summarizeSnapshot', () => {
  const view = toOperationalGraph(graph, summary, '2026-07-29')

  it('counts rows, dedupes recipes/tables across a fan-in write, and splits OK/KO by row status', () => {
    const rows: B15Row[] = [
      { recipeFilename: '_ETL_m_CAS_ODS_R3.json', status: 'SUCCESS' },
      { recipeFilename: '_ETL_m_CAS_ODS_R4.json', status: 'FAILED' },
      // A second run of r3 the same "day" — proves row COUNT isn't collapsed
      // to distinct-recipe count.
      { recipeFilename: '_ETL_m_CAS_ODS_R3.json', status: 'SUCCESS' },
    ]
    const s = summarizeSnapshot(rows, view.cards, view.edges)
    expect(s).toEqual({ rows: 3, recipes: 2, tables: 1, ok: 2, ko: 1 })
  })

  it('a row for a recipe absent from the graph counts toward rows/recipes but contributes no table, and never throws', () => {
    const rows: B15Row[] = [{ recipeFilename: '_ETL_m_GHOST.json', status: 'SUCCESS' }]
    expect(() => summarizeSnapshot(rows, view.cards, view.edges)).not.toThrow()
    expect(summarizeSnapshot(rows, view.cards, view.edges)).toEqual({ rows: 1, recipes: 1, tables: 0, ok: 1, ko: 0 })
  })

  it('empty rows -> all zero', () => {
    expect(summarizeSnapshot([], view.cards, view.edges)).toEqual({ rows: 0, recipes: 0, tables: 0, ok: 0, ko: 0 })
  })

  it('an unrecognized/empty status counts toward neither OK nor KO', () => {
    const rows: B15Row[] = [{ recipeFilename: '_ETL_m_CAS_DWH_R5.json', status: '' }]
    const s = summarizeSnapshot(rows, view.cards, view.edges)
    expect(s.ok).toBe(0)
    expect(s.ko).toBe(0)
    expect(s.rows).toBe(1)
  })
})

// Shared by both `describe` blocks below (`fitToViewport`'s fixtures reuse a
// couple of its cards as x/y overrides rather than building a third graph).
const detailedView = toOperationalGraph(graph, undefined, null, 'detailed')

describe('density layout', () => {
  it('packs tighter at each density', () => {
    const detailed = toOperationalGraph(graph, undefined, null, 'detailed')
    const compact = toOperationalGraph(graph, undefined, null, 'compact')
    const minimal = toOperationalGraph(graph, undefined, null, 'minimal')

    const span = (v: typeof detailed) => Math.max(...v.cards.map(c => (c.y ?? 0)))
    expect(span(compact)).toBeLessThan(span(detailed))
    expect(span(minimal)).toBeLessThan(span(compact))
  })

  it('keeps column order identical across densities', () => {
    const names = (d: 'detailed' | 'minimal') =>
      toOperationalGraph(graph, undefined, null, d).cards
        .slice().sort((a, b) => (a.x ?? 0) - (b.x ?? 0) || (a.y ?? 0) - (b.y ?? 0)).map(c => c.name)
    expect(names('minimal')).toEqual(names('detailed'))
  })

  it('pitches are strictly decreasing', () => {
    expect(DENSITY_PITCH.compact.row).toBeLessThan(DENSITY_PITCH.detailed.row)
    expect(DENSITY_PITCH.minimal.row).toBeLessThan(DENSITY_PITCH.compact.row)
  })
})

describe('fitToViewport', () => {
  it('scales the whole graph into the viewport and clamps at 1', () => {
    // Deviation 1 (see task-15-report.md): the brief's literal x:4000/y:2000 offset is, by
    // itself, already below the 0.3 floor against a 1000x600 viewport (1000/4040 ≈ 0.247 even
    // at zero card size) — no choice of DENSITY_PITCH width/height can lift it above 0.3, so the
    // fixture as written contradicts its own `toBeGreaterThan(0.3)` assertion. Narrowed the
    // offset to a spread that genuinely needs shrinking but doesn't hit the floor, which is what
    // this test (as titled) is for; the floor itself is covered by the "enormous graph" test below.
    const wide = [{ ...detailedView.cards[0]!, x: 0, y: 0 }, { ...detailedView.cards[0]!, id: 'z', x: 1200, y: 700 }]
    const fit = fitToViewport(wide, { width: 1000, height: 600 }, 'detailed')

    expect(fit.zoom).toBeGreaterThan(0.3)
    expect(fit.zoom).toBeLessThan(1)
  })

  it('never magnifies a small graph beyond 1', () => {
    const fit = fitToViewport([{ ...detailedView.cards[0]!, x: 0, y: 0 }], { width: 1000, height: 600 }, 'detailed')
    expect(fit.zoom).toBe(1)
  })

  it('clamps at the 0.3 floor for an enormous graph', () => {
    const huge = [{ ...detailedView.cards[0]!, x: 0, y: 0 }, { ...detailedView.cards[0]!, id: 'z', x: 90_000, y: 60_000 }]
    expect(fitToViewport(huge, { width: 800, height: 500 }, 'detailed').zoom).toBe(0.3)
  })

  it('returns a neutral view for an empty graph', () => {
    expect(fitToViewport([], { width: 800, height: 500 }, 'detailed')).toEqual({ zoom: 1, pan: { x: 40, y: 40 } })
  })
})

// Item 9: `summarizeSnapshot` compared `row.status` against raw 'SUCCESS'/'FAILED' literals 250
// lines below the STATUS_MAP that owns the canonical mapping in this same file. Two spellings of
// one rule drift; the map is the rule.
describe('summarizeSnapshot uses the file\'s own status map', () => {
  it('counts OK/KO through the same mapping every other reader uses', () => {
    const rows = [
      { recipeFilename: 'a.json', status: 'SUCCESS' },
      { recipeFilename: 'b.json', status: 'FAILED' },
      { recipeFilename: 'c.json', status: '' },
      { recipeFilename: 'd.json', status: 'WHATEVER' },
    ]
    const out = summarizeSnapshot(rows, [], [])
    expect(out.rows).toBe(4)
    expect(out.ok).toBe(1)
    expect(out.ko).toBe(1)
  })

  it('never counts a status the map does not classify', () => {
    expect(summarizeSnapshot([{ recipeFilename: 'a.json', status: 'PENDING' }], [], []))
      .toMatchObject({ ok: 0, ko: 0, rows: 1 })
  })
})


// ─── density geometry (sub-project 12, defect 1) ────────────────────────────
//
// The shipped table declared `detailed: { row: 190, height: 150 }` for a card that renders ~280px
// tall, and ETLOperational positioned compact/minimal cards at `width: 'auto'`. Cards overlapped
// both ways on the real corpus. Pitch is now DERIVED from a footprint, so the arithmetic cannot
// drift again.

const DENSITIES = ['detailed', 'compact', 'minimal'] as const

describe('density geometry', () => {
  it.each(DENSITIES)('pitch clears the footprint by at least MIN_GUTTER at %s', d => {
    expect(DENSITY_PITCH[d].col).toBeGreaterThanOrEqual(DENSITY_FOOTPRINT[d].width + MIN_GUTTER)
    expect(DENSITY_PITCH[d].row).toBeGreaterThanOrEqual(DENSITY_FOOTPRINT[d].height + MIN_GUTTER)
  })

  it.each(DENSITIES)('pitch is exactly footprint + gutter at %s', d => {
    expect(DENSITY_PITCH[d].col).toBe(DENSITY_FOOTPRINT[d].width + DENSITY_GUTTER[d].col)
    expect(DENSITY_PITCH[d].row).toBe(DENSITY_FOOTPRINT[d].height + DENSITY_GUTTER[d].row)
  })

  it.each(DENSITIES)('still exposes width/height for the existing readers at %s', d => {
    expect(DENSITY_PITCH[d].width).toBe(DENSITY_FOOTPRINT[d].width)
    expect(DENSITY_PITCH[d].height).toBe(DENSITY_FOOTPRINT[d].height)
  })
})

describe('layoutCards leaves no card overlapping another', () => {
  // Fan-in: two recipes writing one table. Forces two cards into the same column, which is
  // exactly where the row pitch has to hold.
  const fanIn = {
    nodes: [
      { id: 's1', kind: 'table', name: 'STG.SRC_ONE', layer: 'STG' },
      { id: 's2', kind: 'table', name: 'STG.SRC_TWO', layer: 'STG' },
      { id: 'r1', kind: 'recipe', name: '_ETL_m_ONE.json', layer: 'DWH' },
      { id: 'r2', kind: 'recipe', name: '_ETL_m_TWO.json', layer: 'DWH' },
      { id: 't1', kind: 'table', name: 'DWH.TARGET', layer: 'DWH' },
    ],
    edges: [
      { from: 's1', to: 'r1', kind: 'source' },
      { from: 's2', to: 'r2', kind: 'source' },
      { from: 'r1', to: 't1', kind: 'writes' },
      { from: 'r2', to: 't1', kind: 'writes' },
    ],
    meta: { layers: ['STG', 'DWH'] },
  }

  it.each(DENSITIES)('no two footprint rectangles intersect at %s', d => {
    const { cards } = toOperationalGraph(fanIn as never, undefined, null, d)
    const { width, height } = DENSITY_FOOTPRINT[d]
    expect(cards.length).toBeGreaterThan(1)
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i]!, b = cards[j]!
        const overlaps =
          (a.x ?? 0) < (b.x ?? 0) + width && (b.x ?? 0) < (a.x ?? 0) + width &&
          (a.y ?? 0) < (b.y ?? 0) + height && (b.y ?? 0) < (a.y ?? 0) + height
        expect(overlaps, `${a.name} overlaps ${b.name} at ${d}`).toBe(false)
      }
    }
  })
})

// ─── layer order (sub-project 12, defect 10) ────────────────────────────────

describe('layer order', () => {
  it('runs STG, ODS, ETL, DWH, CDM, RDM, QDM, then OUTPUT and UNKNOWN', () => {
    const order = Object.entries(LAYER_RANK).sort((a, b) => a[1] - b[1]).map(([k]) => k)
    expect(order).toEqual(['STG', 'ODS', 'ETL', 'DWH', 'CDM', 'RDM', 'QDM', 'OUTPUT', 'UNKNOWN'])
  })

  it('puts the ETL column strictly left of the DWH one on the canvas', () => {
    // LAYER_RANK drives BOTH the filter chips and the canvas columns, so the reorder has to be
    // visible in the layout too — one dimension, one ordering.
    const g = {
      nodes: [
        { id: 'e', kind: 'table', name: 'ETL.T', layer: 'ETL' },
        { id: 'd', kind: 'table', name: 'DWH.T', layer: 'DWH' },
        { id: 'o', kind: 'table', name: 'ODS.T', layer: 'ODS' },
      ],
      edges: [],
      meta: { layers: ['ODS', 'ETL', 'DWH'] },
    }
    const { cards } = toOperationalGraph(g as never, undefined, null, 'compact')
    const x = (id: string) => cards.find(c => c.id === id)!.x!
    expect(x('o')).toBeLessThan(x('e'))
    expect(x('e')).toBeLessThan(x('d'))
  })
})

describe('graph.layers — the list the filter chips render', () => {
  const multiLayer = (metaLayers: string[]) => ({
    nodes: [
      { id: 'q', kind: 'table', name: 'QDM.T', layer: 'QDM' },
      { id: 'e', kind: 'table', name: 'ETL.T', layer: 'ETL' },
      { id: 's', kind: 'table', name: 'STG.T', layer: 'STG' },
      { id: 'd', kind: 'table', name: 'DWH.T', layer: 'DWH' },
      { id: 'o', kind: 'table', name: 'ODS.T', layer: 'ODS' },
      { id: 'c', kind: 'table', name: 'CDM.T', layer: 'CDM' },
      { id: 'r', kind: 'table', name: 'RDM.T', layer: 'RDM' },
    ],
    edges: [],
    meta: { layers: metaLayers },
  })

  it('is rank-ordered regardless of the order meta happened to arrive in', () => {
    // The bug this covers: `layers` used to be "meta order first, extras appended", which made
    // the backend's arrival order the CHIP order — so reordering LAYER_RANK moved the canvas
    // columns and left the toolbar alone. One dimension, one ordering.
    const scrambled = toOperationalGraph(
      multiLayer(['CDM', 'DWH', 'ETL', 'ODS', 'RDM', 'QDM', 'STG']) as never, undefined, null)
    expect(scrambled.layers).toEqual(['STG', 'ODS', 'ETL', 'DWH', 'CDM', 'RDM', 'QDM'])
  })

  it('still includes a layer present only on a card, never dropping a chip', () => {
    // Completeness is the OTHER guarantee: a 1-hop neighbour's layer is absent from meta.layers
    // on a scoped request, and its cards would otherwise have no chip that can reach them.
    const partial = toOperationalGraph(multiLayer(['STG', 'ODS']) as never, undefined, null)
    expect(partial.layers).toEqual(['STG', 'ODS', 'ETL', 'DWH', 'CDM', 'RDM', 'QDM'])
  })

  it('never repeats a layer that is in both meta and the cards', () => {
    const dup = toOperationalGraph(multiLayer(['STG', 'STG', 'DWH']) as never, undefined, null)
    expect(new Set(dup.layers).size).toBe(dup.layers.length)
  })
})
