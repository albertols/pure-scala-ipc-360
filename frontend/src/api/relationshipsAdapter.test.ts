import { describe, expect, it } from 'vitest'
import { toOperationalGraph, summarizeSnapshot } from './relationshipsAdapter'
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

  it('(c) lays out STG->ODS->DWH strictly left-to-right on the 320px column pitch', () => {
    for (const c of view.cards) expect((c.x! - 40) % 320).toBe(0)
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

  it('table history mirrors its first writer (edge order) and only recipes carry jobId/appId', () => {
    expect(byId.get('t_ods')!.history).toEqual(byId.get('r3')!.history)
    expect(byId.get('r3')!.jobId).toBe('application_r3_0029')
    expect(byId.get('r3')!.appId).toBe('application_r3_0029')
    expect(byId.get('t_ods')!.jobId).toBeUndefined()
    expect(byId.get('t_ods')!.appId).toBeUndefined()
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
