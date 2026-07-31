import { describe, expect, it } from 'vitest'
import { toDagClusters, UNGROUPED, type RelationshipsT } from './dagAdapter'

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
