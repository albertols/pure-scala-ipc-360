import type { RelationshipsT } from '../dagAdapter'

// Mini RelationshipsDto: two workflows + cross-workflow table dependency
// (STG writes FIX_STG_A, ODS reads it) + lookup-mediated dep + intra-cluster chain.
//
// Extracted (Task 11, Ruling 15) out of `dagAdapter.test.ts` so it can be shared with
// `ETLDag.test.tsx` without importing a `.test.ts` module — that import re-registered
// every one of `dagAdapter.test.ts`'s cases inside `ETLDag.test.tsx` (14 double-counted
// tests, git-blamed to 2026-07-31).
export const REL: RelationshipsT = {
  nodes: [
    {
      id: 'recipe:_ETL_m_FIX_STG_A.json',
      kind: 'recipe',
      name: '_ETL_m_FIX_STG_A.json',
      layer: 'STG',
      mappingPath: 'STG/m_FIX_STG_A',
      hasRecipe: true,
      workflow: 'wf_FIX_STG',
      executionOrder: 1,
    },
    {
      id: 'recipe:_ETL_m_FIX_STG_B.json',
      kind: 'recipe',
      name: '_ETL_m_FIX_STG_B.json',
      layer: 'STG',
      mappingPath: 'STG/m_FIX_STG_B',
      hasRecipe: true,
      workflow: 'wf_FIX_STG',
      executionOrder: 1,
    },
    {
      id: 'table:FIX_STG_A',
      kind: 'table',
      name: 'FIX_STG_A',
      layer: 'STG',
      writeMode: 'TRUNCATE_INSERT',
      partitionType: 'DAILY',
    },
    { id: 'table:FIX_STG_B', kind: 'table', name: 'FIX_STG_B', layer: 'STG' },
    { id: 'table:FIX_LKP', kind: 'table', name: 'FIX_LKP', layer: 'STG' },
    {
      id: 'recipe:_ETL_m_FIX_ODS_A.json',
      kind: 'recipe',
      name: '_ETL_m_FIX_ODS_A.json',
      layer: 'ODS',
      mappingPath: 'ODS/m_FIX_ODS_A',
      hasRecipe: true,
      workflow: 'wf_FIX_ODS',
      executionOrder: 2,
    },
    {
      id: 'table:FIX_ODS_A',
      kind: 'table',
      name: 'FIX_ODS_A',
      layer: 'ODS',
      writeMode: 'APPEND',
      partitionType: 'DAILY',
    },
    {
      id: 'recipe:_ETL_m_FIX_ODS_B.json',
      kind: 'recipe',
      name: '_ETL_m_FIX_ODS_B.json',
      layer: 'ODS',
      mappingPath: 'ODS/m_FIX_ODS_B',
      hasRecipe: true,
      workflow: 'wf_FIX_ODS',
      executionOrder: 3,
    },
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
