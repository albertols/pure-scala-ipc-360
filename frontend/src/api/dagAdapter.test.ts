import { describe, expect, it } from 'vitest'
import { toDagClusters, UNGROUPED, type RelationshipsT } from './dagAdapter'
import { clusterRuns, fillGcpUrl, overlayRun, parseDurationSec, statusFromB15, toOperationalCard,
  DEFAULT_LOGGING_URL, type B15RowT } from './dagAdapter'

// Mini RelationshipsDto: two workflows + cross-workflow table dependency
// (STG writes FIX_STG_A, ODS reads it) + lookup-mediated dep + intra-cluster chain.
export const REL: RelationshipsT = {
  nodes: [
    { id: 'recipe:_ETL_m_FIX_STG_A.json', kind: 'recipe', name: '_ETL_m_FIX_STG_A.json', layer: 'STG', mappingPath: 'STG/m_FIX_STG_A', hasRecipe: true, workflow: 'wf_FIX_STG', executionOrder: 1 },
    { id: 'recipe:_ETL_m_FIX_STG_B.json', kind: 'recipe', name: '_ETL_m_FIX_STG_B.json', layer: 'STG', mappingPath: 'STG/m_FIX_STG_B', hasRecipe: true, workflow: 'wf_FIX_STG', executionOrder: 1 },
    { id: 'table:FIX_STG_A', kind: 'table', name: 'FIX_STG_A', layer: 'STG', writeMode: 'TRUNCATE_INSERT', partitionType: 'DAILY' },
    { id: 'table:FIX_STG_B', kind: 'table', name: 'FIX_STG_B', layer: 'STG' },
    { id: 'table:FIX_LKP', kind: 'table', name: 'FIX_LKP', layer: 'STG' },
    { id: 'recipe:_ETL_m_FIX_ODS_A.json', kind: 'recipe', name: '_ETL_m_FIX_ODS_A.json', layer: 'ODS', mappingPath: 'ODS/m_FIX_ODS_A', hasRecipe: true, workflow: 'wf_FIX_ODS', executionOrder: 2 },
    { id: 'table:FIX_ODS_A', kind: 'table', name: 'FIX_ODS_A', layer: 'ODS', writeMode: 'APPEND', partitionType: 'DAILY' },
    { id: 'recipe:_ETL_m_FIX_ODS_B.json', kind: 'recipe', name: '_ETL_m_FIX_ODS_B.json', layer: 'ODS', mappingPath: 'ODS/m_FIX_ODS_B', hasRecipe: true, workflow: 'wf_FIX_ODS', executionOrder: 3 },
    { id: 'table:FIX_ODS_B', kind: 'table', name: 'FIX_ODS_B', layer: 'ODS' },
  ],
  edges: [
    { from: 'recipe:_ETL_m_FIX_STG_A.json', to: 'table:FIX_STG_A', kind: 'writes' },
    { from: 'recipe:_ETL_m_FIX_STG_A.json', to: 'table:FIX_LKP', kind: 'writes' },
    { from: 'recipe:_ETL_m_FIX_STG_B.json', to: 'table:FIX_STG_B', kind: 'writes' },
    { from: 'table:FIX_STG_A', to: 'recipe:_ETL_m_FIX_ODS_A.json', kind: 'source' },
    { from: 'table:FIX_LKP', to: 'recipe:_ETL_m_FIX_ODS_A.json', kind: 'lookup' },
    { from: 'recipe:_ETL_m_FIX_ODS_A.json', to: 'table:FIX_ODS_A', kind: 'writes' },
    { from: 'table:FIX_ODS_A', to: 'recipe:_ETL_m_FIX_ODS_B.json', kind: 'source' },
    { from: 'recipe:_ETL_m_FIX_ODS_B.json', to: 'table:FIX_ODS_B', kind: 'writes' },
  ],
  meta: { entryCount: 4, skippedRows: 0, layers: ['ODS', 'STG'] },
}

describe('toDagClusters — grouping, edges, layout', () => {
  it('groups recipe nodes by workflow, sorted; tables never become tasks', () => {
    const clusters = toDagClusters(REL)
    expect(clusters.map(c => c.dag_id)).toEqual(['wf_FIX_ODS', 'wf_FIX_STG'])
    expect(clusters.flatMap(c => c.tasks.map(t => t.task_id)).every(id => id.endsWith('.json'))).toBe(true)
    expect(clusters.find(c => c.dag_id === 'wf_FIX_STG')!.schedule).toBe('2 recipes')
  })

  it('derives depends_on via table mediation, source AND lookup, deduped, self excluded', () => {
    const ods = toDagClusters(REL).find(c => c.dag_id === 'wf_FIX_ODS')!
    const a = ods.tasks.find(t => t.task_id === '_ETL_m_FIX_ODS_A.json')!
    const b = ods.tasks.find(t => t.task_id === '_ETL_m_FIX_ODS_B.json')!
    expect(a.depends_on).toEqual(['_ETL_m_FIX_STG_A.json'])  // source+lookup both mediate to ONE dep (cross-workflow, kept)
    expect(b.depends_on).toEqual(['_ETL_m_FIX_ODS_A.json'])  // intra-cluster chain
  })

  it('layout: executionOrder ranks columns, intra-cluster deps bump right, ties stack rows', () => {
    const clusters = toDagClusters(REL)
    const stg = clusters.find(c => c.dag_id === 'wf_FIX_STG')!
    expect(stg.tasks.map(t => [t.x, t.y])).toEqual([[60, 80], [60, 200]])  // same order 1 -> one column, stacked by name
    const ods = clusters.find(c => c.dag_id === 'wf_FIX_ODS')!
    const byId = new Map(ods.tasks.map(t => [t.task_id, t]))
    expect(byId.get('_ETL_m_FIX_ODS_A.json')!.x).toBe(60)    // order 2 = rank 0 in ITS cluster
    expect(byId.get('_ETL_m_FIX_ODS_B.json')!.x).toBe(280)   // rank 1, dep-consistent
  })

  it('no run overlay yet: tasks and clusters default to no-data (skipped/grey)', () => {
    for (const c of toDagClusters(REL)) {
      expect(c.status).toBe('skipped')
      for (const t of c.tasks) { expect(t.last_status).toBe('skipped'); expect(t.duration_s).toBe(0) }
    }
  })

  it('cycle-safe: a dependency loop does not hang', () => {
    const cyclic = structuredClone(REL) as RelationshipsT
    cyclic.edges!.push({ from: 'table:FIX_ODS_B', to: 'recipe:_ETL_m_FIX_ODS_A.json', kind: 'source' })
    const ods = toDagClusters(cyclic).find(c => c.dag_id === 'wf_FIX_ODS')!
    expect(ods.tasks).toHaveLength(2)
    for (const t of ods.tasks) expect(Number.isFinite(t.x)).toBe(true)
  })

  it('recipe nodes without a workflow fall into the UNGROUPED cluster', () => {
    const rel: RelationshipsT = {
      nodes: [{ id: 'recipe:_ETL_m_LONER.json', kind: 'recipe', name: '_ETL_m_LONER.json', layer: 'STG', mappingPath: 'STG/m_LONER', hasRecipe: true, executionOrder: 1 }],
      edges: [],
      meta: { entryCount: 1, skippedRows: 0, layers: ['STG'] },
    }
    const clusters = toDagClusters(rel)
    expect(clusters.map(c => c.dag_id)).toEqual([UNGROUPED])
  })
})

const row = (recipe: string, status: string, dur: string, extra: Partial<B15RowT> = {}): B15RowT => ({
  clusterName: 'cluster-wf-fix-00-1234', recipeFilename: recipe, jobId: 'application_1774840360_11000',
  appStartIso: '2026-07-29T04:12:00.000Z', avgJobDurationInMinsSec: dur, status, message: '', ...extra,
})
const DATES = ['2026-07-28', '2026-07-29']
const ROWS: Record<string, B15RowT[] | undefined> = {
  '2026-07-28': [row('_ETL_m_FIX_ODS_A.json', 'SUCCESS', '10m 00sec', { appStartIso: '2026-07-28T04:00:00.000Z' })],
  '2026-07-29': [row('_ETL_m_FIX_ODS_A.json', 'FAILED', '5m 30sec', { message: 'Stage failure (synthetic)' })],
}

describe('run-history aggregation', () => {
  it('parses "Xm Ysec" durations, 0 on garbage/blank', () => {
    expect(parseDurationSec('44m 37sec')).toBe(2677)
    expect(parseDurationSec('0m 45sec')).toBe(45)
    expect(parseDurationSec('')).toBe(0)
    expect(parseDurationSec(undefined)).toBe(0)
    expect(parseDurationSec('n/a')).toBe(0)
  })

  it('maps b15 status: SUCCESS/FAILED/RUNNING/blank -> success/failed/running/skipped', () => {
    expect(statusFromB15('SUCCESS')).toBe('success')
    expect(statusFromB15('FAILED')).toBe('failed')
    expect(statusFromB15('RUNNING')).toBe('running')
    expect(statusFromB15('')).toBe('skipped')     // null-status CSV rows (corpus-verified 2026_07_18)
    expect(statusFromB15(undefined)).toBe('skipped')
  })

  it('overlayRun joins by recipe_filename; missing recipe -> no-data; cluster status aggregates', () => {
    const ods = toDagClusters(REL).find(c => c.dag_id === 'wf_FIX_ODS')!
    const lit = overlayRun(ods, ROWS['2026-07-29'])
    const byId = new Map(lit.tasks.map(t => [t.task_id, t]))
    expect(byId.get('_ETL_m_FIX_ODS_A.json')!.last_status).toBe('failed')
    expect(byId.get('_ETL_m_FIX_ODS_A.json')!.duration_s).toBe(330)
    expect(byId.get('_ETL_m_FIX_ODS_B.json')!.last_status).toBe('skipped')   // no b15 row that date
    expect(lit.status).toBe('failed')
    expect(lit.last_run).toBe('2026-07-29T04:12:00.000Z')
    expect(overlayRun(ods, undefined).status).toBe('skipped')                 // date with no snapshot
  })

  it('clusterRuns: one DagRun per date ascending, run_id = date, duration = task sum', () => {
    const ods = toDagClusters(REL).find(c => c.dag_id === 'wf_FIX_ODS')!
    const runs = clusterRuns(ods, DATES, ROWS)
    expect(runs.map(r => [r.run_id, r.status, r.duration_s])).toEqual([
      ['2026-07-28', 'success', 600], ['2026-07-29', 'failed', 330],
    ])
  })

  it('toOperationalCard: history per date (PENDING when absent), nearest-rank percentiles, selected-date status', () => {
    const ods = toDagClusters(REL).find(c => c.dag_id === 'wf_FIX_ODS')!
    const a = ods.tasks.find(t => t.task_id === '_ETL_m_FIX_ODS_A.json')!
    const card = toOperationalCard(a, DATES, ROWS, '2026-07-29')
    expect(card.kind).toBe('recipe')
    expect(card.layer).toBe('ODS')                       // mappingPath dir prefix
    expect(card.history).toEqual(['OK', 'KO'])
    expect(card.status).toBe('KO')
    expect(card.stats).toEqual({ avg_time_s: 465, p50: 330, p95: 600, p99: 600, avg_count: 0 })
    expect(card.jobId).toBe('application_1774840360_11000')
    const b = ods.tasks.find(t => t.task_id === '_ETL_m_FIX_ODS_B.json')!
    expect(toOperationalCard(b, DATES, ROWS, '2026-07-29').status).toBe('PENDING')  // never ran
  })

  it('fillGcpUrl: fills {placeholders} encoded, template wins over fallback', () => {
    expect(fillGcpUrl(undefined, DEFAULT_LOGGING_URL, { jobId: 'application_1', project: 'mock-project' }))
      .toBe('https://console.cloud.google.com/logs/query;query=resource.labels.job_id%3D%22application_1%22?project=mock-project')
    expect(fillGcpUrl('https://x/{a}?p={b}', 'unused', { a: 'v 1', b: 'w' })).toBe('https://x/v%201?p=w')
  })
})

describe('flow hardening — UNGROUPED, no-data recipes, degenerate inputs', () => {
  it('nodes with workflow "" or workflow absent both land in UNGROUPED, which sorts among clusters by name like any other', () => {
    const rel = structuredClone(REL) as RelationshipsT
    rel.nodes!.push(
      { id: 'recipe:_ETL_m_FIX_EMPTYWF.json', kind: 'recipe', name: '_ETL_m_FIX_EMPTYWF.json', layer: 'STG', mappingPath: 'STG/m_FIX_EMPTYWF', hasRecipe: true, workflow: '', executionOrder: 1 },
      { id: 'recipe:_ETL_m_FIX_NOWF.json', kind: 'recipe', name: '_ETL_m_FIX_NOWF.json', layer: 'STG', mappingPath: 'STG/m_FIX_NOWF', hasRecipe: true, executionOrder: 1 },
    )
    const clusters = toDagClusters(rel)
    // 'UNGROUPED'.localeCompare('wf_FIX_ODS') sorts before the lowercase 'wf_*'
    // ids — no special-casing, it's an ordinary dag_id in the sort.
    expect(clusters.map(c => c.dag_id)).toEqual([UNGROUPED, 'wf_FIX_ODS', 'wf_FIX_STG'])
    const ungrouped = clusters.find(c => c.dag_id === UNGROUPED)!
    expect(ungrouped.tasks.map(t => t.task_id).sort()).toEqual(['_ETL_m_FIX_EMPTYWF.json', '_ETL_m_FIX_NOWF.json'])
  })

  it('a recipe with no edges at all gets depends_on: [], lays out at its order-rank column, never throws', () => {
    const rel: RelationshipsT = {
      nodes: [{ id: 'recipe:_ETL_m_SOLO.json', kind: 'recipe', name: '_ETL_m_SOLO.json', layer: 'STG', mappingPath: 'STG/m_SOLO', hasRecipe: true, workflow: 'wf_SOLO', executionOrder: 3 }],
      meta: { entryCount: 1, skippedRows: 0, layers: ['STG'] },
      // no `edges` key at all
    }
    let clusters: ReturnType<typeof toDagClusters> = []
    expect(() => { clusters = toDagClusters(rel) }).not.toThrow()
    const solo = clusters[0].tasks[0]
    expect(solo.depends_on).toEqual([])
    expect([solo.x, solo.y]).toEqual([60, 80])   // sole distinct executionOrder -> rank 0 -> first column/row
  })

  it('toDagClusters({}) with nodes/edges/meta all undefined returns []', () => {
    expect(toDagClusters({})).toEqual([])
  })
})
