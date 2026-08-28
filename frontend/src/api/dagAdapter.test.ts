import { describe, expect, it } from 'vitest'
import { toDagClusters, UNGROUPED, type RelationshipsT, statusFromRun } from './dagAdapter'
import { clusterRuns, overlayRun, parseDurationSec, statusFromB15, toOperationalCard,
  type B15RowT } from './dagAdapter'
import type { RunT } from './clusterQueries'
import { REL } from './__fixtures__/relationships'

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
})

const runsFor = (recipe: string, spec: [string, string][]): RunT[] =>
  spec.map(([date, status]) => ({
    date, clusterName: 'cl-a', jobId: `job-${recipe}-${date}`,
    appStartIso: `${date}T04:00:00.000Z`, durationMin: 2, status, message: '',
  })).reverse()   // newest-first, as served

describe('clusterRuns', () => {
  it('reports one run per date, failing when any task failed that day', () => {
    const cluster = { dag_id: 'wf', schedule: '', last_run: '', status: 'skipped' as const,
      tasks: [
        { task_id: 'a.json', recipe_id: 'ODS/x', depends_on: [], last_status: 'skipped' as const, duration_s: 0, x: 0, y: 0 },
        { task_id: 'b.json', recipe_id: 'ODS/y', depends_on: [], last_status: 'skipped' as const, duration_s: 0, x: 0, y: 0 },
      ] }
    const byRecipe = {
      'a.json': runsFor('a', [['2026-07-28', 'SUCCESS'], ['2026-07-29', 'SUCCESS']]),
      'b.json': runsFor('b', [['2026-07-28', 'FAILED'], ['2026-07-29', 'SUCCESS']]),
    }

    const runs = clusterRuns(cluster, ['2026-07-28', '2026-07-29'], byRecipe)

    expect(runs.map(r => r.run_id)).toEqual(['2026-07-28', '2026-07-29'])
    expect(runs[0].status).toBe('failed')
    expect(runs[1].status).toBe('success')
  })

  it('marks a date with no runs as skipped', () => {
    const cluster = { dag_id: 'wf', schedule: '', last_run: '', status: 'skipped' as const,
      tasks: [{ task_id: 'a.json', recipe_id: 'ODS/x', depends_on: [], last_status: 'skipped' as const, duration_s: 0, x: 0, y: 0 }] }

    const runs = clusterRuns(cluster, ['2026-07-27', '2026-07-28'],
      { 'a.json': runsFor('a', [['2026-07-28', 'SUCCESS']]) })

    expect(runs[0].status).toBe('skipped')
    expect(runs[1].status).toBe('success')
  })
})

describe('toOperationalCard', () => {
  const task = { task_id: 'a.json', recipe_id: 'ODS/m_x', depends_on: ['b.json'],
    last_status: 'success' as const, duration_s: 0, x: 0, y: 0 }

  it('builds history and stats from the served runs', () => {
    const card = toOperationalCard(task,
      runsFor('a', [['2026-07-28', 'FAILED'], ['2026-07-29', 'SUCCESS']]), '2026-07-29')

    expect(card.history).toEqual(['KO', 'OK'])          // oldest-first, as the strip renders
    expect(card.status).toBe('OK')
    expect(card.layer).toBe('ODS')
    expect(card.stats.avg_time_s).toBe(120)
    expect(card.jobId).toBe('job-a-2026-07-29')
    expect(card.relations).toEqual(['b.json'])
  })

  it('takes its status from the SELECTED date, not the newest run', () => {
    const card = toOperationalCard(task,
      runsFor('a', [['2026-07-28', 'FAILED'], ['2026-07-29', 'SUCCESS']]), '2026-07-28')

    expect(card.status).toBe('KO')
    expect(card.jobId).toBe('job-a-2026-07-28')
  })

  it('is PENDING with no runs at all', () => {
    const card = toOperationalCard(task, [], '2026-07-29')
    expect(card.status).toBe('PENDING')
    expect(card.history).toEqual([])
  })

  // appId is gone from the type; it never held anything job_id did not.
  it('exposes no appId', () => {
    expect('appId' in toOperationalCard(task, [], '2026-07-29')).toBe(false)
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

// Item 4: `statusFromB15` trims and upper-cases; `statusFromRun` did an exact-match lookup on
// RUN_STATUS. The SAME b15 status cell reaches the SAME Tab 4 panel by both routes — the canvas
// node via `overlayRun` (snapshot rows) and the run strip via `clusterRuns` (RunDto rows) — so a
// cell spelled " success" coloured the node green and the strip grey, for one value.
describe('statusFromB15 / statusFromRun are one function', () => {
  const CASES = [' success', 'Success', 'SUCCESS ', 'failed', ' RUNNING', '', undefined, 'nonsense']

  it('agrees on every spelling, whitespace and casing included', () => {
    for (const raw of CASES) {
      expect(statusFromRun(raw)).toBe(statusFromB15(raw))
    }
  })

  it('normalises rather than falling through to skipped', () => {
    expect(statusFromRun(' success')).toBe('success')
    expect(statusFromRun('Failed ')).toBe('failed')
    expect(statusFromRun('nonsense')).toBe('skipped')
  })
})
