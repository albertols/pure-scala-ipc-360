import { describe, expect, it } from 'vitest'
import { recipeToCanvas } from './recipeAdapter'
import type { RecipeJson } from './recipeAdapter'
import bizlink from './__fixtures__/recipe_m_DM_INFOHUB_BIZLINK.json'
import syn from './__fixtures__/recipe_m_SYN_ODS_ORDERS.json'
const BIZ_PATH = 'CDM/m_DM_INFOHUB_BIZLINK/_ETL_m_DM_INFOHUB_BIZLINK.json'

describe('recipeToCanvas — nodes, kinds, ports', () => {
  it('derives target / intermediate / source nodes from the BIZLINK recipe', () => {
    const g = recipeToCanvas(bizlink as RecipeJson, BIZ_PATH)
    const byId = new Map(g.nodes.map(n => [n.id, n]))
    expect(byId.get('BIZLINK')!.type).toBe('target')          // table-typed AND in targetTableNames
    expect(byId.get('SQ_ff_BIZLINK')!.type).toBe('expression') // corrupted type "BERYLFALLS" -> unknown rule
    expect(byId.get('SQ_ff_BIZLINK')!.label).toBe('BER')
    expect(byId.get('ff_BIZLINK')!.type).toBe('source')        // sources[] entry of type table
    expect(g.nodes).toHaveLength(3)
  })
  it('ports: 61 IN on target, 60 IN/OUT on intermediate, OUT union-of-refs on source', () => {
    const g = recipeToCanvas(bizlink as RecipeJson, BIZ_PATH)
    const byId = new Map(g.nodes.map(n => [n.id, n]))
    expect(byId.get('BIZLINK')!.ports).toHaveLength(61)
    expect(byId.get('BIZLINK')!.ports.every(p => p.direction === 'IN')).toBe(true)
    expect(byId.get('SQ_ff_BIZLINK')!.ports).toHaveLength(60)
    expect(byId.get('SQ_ff_BIZLINK')!.ports.every(p => p.direction === 'IN/OUT')).toBe(true)
    const src = byId.get('ff_BIZLINK')!
    expect(src.ports.length).toBeGreaterThan(0)               // derived from FF_BIZLINK.* refs (case-insensitive)
    expect(src.ports.every(p => p.direction === 'OUT')).toBe(true)
  })
  it('tolerates the pre-repair weststone key (defensive)', () => {
    const damaged = JSON.parse(JSON.stringify(bizlink).replaceAll('"fields":', '"weststone":')) as RecipeJson
    const g = recipeToCanvas(damaged, BIZ_PATH)
    expect(g.nodes.find(n => n.id === 'BIZLINK')!.ports).toHaveLength(61)
  })
  it('kind map + fixed labels for union/normalizer/java/storedProcedure/intermediate-table', () => {
    const mk = (type: string): RecipeJson => ({
      steps: [{ target: { name: 'X', type, fields: [] }, sources: [] },
              { target: { name: 'T', type: 'table', fields: [] }, sources: [] }],
      table: { targetTableNames: ['T'], sourceTableNames: [] },
    })
    for (const [type, label] of [['unionInput','UNI'],['normalizer','NRM'],['java','JAV'],['storedProcedure','STO'],['table','TBL']] as const) {
      const n = recipeToCanvas(mk(type), 'L/x/_ETL_x.json').nodes.find(x => x.id === 'X')!
      expect([n.type, n.label]).toEqual(['expression', label])   // 'X' table-typed but NOT in targetTableNames -> intermediate TBL
    }
    const sq = recipeToCanvas(mk('sourceQualifier'), 'L/x/_ETL_x.json').nodes.find(x => x.id === 'X')!
    expect(sq.type).toBe('sq')
  })
  it('SYN recipe: clean 2-node shape; empty/garbage input never throws', () => {
    const g = recipeToCanvas(syn as RecipeJson, 'ODS/m_SYN_ODS_ORDERS/_ETL_m_SYN_ODS_ORDERS.json')
    expect(g.nodes.map(n => n.id).sort()).toEqual(['ODS_SYN_ORDERS', 'STG_L_SYN_ORDERS'])
    expect(recipeToCanvas({} as RecipeJson, 'x').nodes).toEqual([])
    expect(recipeToCanvas({ steps: [{}] } as RecipeJson, 'x').nodes).toEqual([])
  })
})
