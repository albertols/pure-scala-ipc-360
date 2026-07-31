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

describe('recipeToCanvas — edges, formulas, layout', () => {
  it('derives field edges from dot-refs, case-insensitive from-node resolution, deduped', () => {
    const g = recipeToCanvas(bizlink as RecipeJson, BIZ_PATH)
    const ids = new Set(g.nodes.map(n => n.id))
    for (const c of g.connections) { expect(ids).toContain(c.fromNode); expect(ids).toContain(c.toNode) }
    expect(g.connections).toContainEqual(
      { fromNode: 'SQ_ff_BIZLINK', fromPort: 'GREENBLUFF', toNode: 'BIZLINK', toPort: 'GREENBLUFF' })
    expect(g.connections.some(c => c.fromNode === 'ff_BIZLINK' && c.toNode === 'SQ_ff_BIZLINK')).toBe(true) // FF_ -> ff_
    const keys = g.connections.map(c => `${c.fromNode}|${c.fromPort}|${c.toNode}|${c.toPort}`)
    expect(new Set(keys).size).toBe(keys.length)                       // deduped
    const linked = g.nodes.flatMap(n => n.ports).filter(p => p.linked)
    expect(linked.length).toBeGreaterThan(0)
  })
  it('nested parameter walk yields edges from deep {source} refs (SYN lookup tree)', () => {
    const g = recipeToCanvas(syn as RecipeJson, 'ODS/m_SYN_ODS_ORDERS/_ETL_m_SYN_ODS_ORDERS.json')
    expect(g.connections).toContainEqual(
      { fromNode: 'STG_L_SYN_ORDERS', fromPort: 'CURRENCY_CODE', toNode: 'ODS_SYN_ORDERS', toPort: 'AMOUNT' })
    expect(g.connections).toHaveLength(4)  // ORDER_ID, CUSTOMER_ID, AMOUNT, CURRENCY_CODE->AMOUNT
  })
  it('field-less source entry gets a single node-center edge (empty port names)', () => {
    const r: RecipeJson = { steps: [
      { target: { name: 'T', type: 'table', fields: [{ name: 'A', dataType: 'String', transformation: { value: '1' } }] },
        sources: [{ name: 'S', type: 'table' }] }],
      table: { targetTableNames: ['T'], sourceTableNames: ['S'] } }
    const g = recipeToCanvas(r, 'L/x/_ETL_x.json')
    expect(g.connections).toEqual([{ fromNode: 'S', fromPort: '', toNode: 'T', toPort: '' }])
  })
  it('unresolvable ref tables are dropped silently, never dangling', () => {
    const r: RecipeJson = { steps: [
      { target: { name: 'T', type: 'table', fields: [{ name: 'A', dataType: 'String', transformation: { source: 'GHOST.A' } }] },
        sources: [] }], table: { targetTableNames: ['T'], sourceTableNames: [] } }
    expect(recipeToCanvas(r, 'x').connections).toEqual([])
  })
  it('ƒ rule + renderFormula: call trees render deterministically; plain source/value set no expression', () => {
    const g = recipeToCanvas(bizlink as RecipeJson, BIZ_PATH)
    const tgt = g.nodes.find(n => n.id === 'BIZLINK')!
    expect(tgt.ports.find(p => p.name === 'ID_OAKBLUFF')!.expression).toBe(
      "EXP_TO_DECIMAL(EXP_TO_CHAR(EXP_ADD_TO_DATE(EXP_TO_DATE(SQ_ff_BIZLINK.FCH_DATAENTRY, 'YYYYMMDD'), 'MM', -1), 'ROWANFIELD'))")
    expect(tgt.ports.find(p => p.name === 'GREENBLUFF')!.expression).toBeUndefined()
    const s = recipeToCanvas(syn as RecipeJson, 'ODS/m_SYN_ODS_ORDERS/_ETL_m_SYN_ODS_ORDERS.json')
    // NOTE deviation from brief's literal string: the SYN fixture's "Undefined" node
    // (parser sentinel for an unclassified function — see RecipeConstants.Undefined)
    // genuinely carries TWO parameters (EXP_ARITHMETIC(...) and {value:"2"}) — verified
    // independently via jq/python against __fixtures__/recipe_m_SYN_ODS_ORDERS.json:57.
    // renderFormula's documented rule ("NAME(p1, p2, …) recursively", repeated verbatim
    // in spec §8 and plan Task 11) renders ALL parameters uniformly with no NAME-based
    // special case, so the second parameter (", 2") is included here. See
    // task-5-report.md "NEEDS_CONTEXT" section for the full excerpt + rationale; flagged
    // for confirmation since Task 11's backend FormulaRenderer must byte-match this.
    expect(s.nodes.find(n => n.id === 'ODS_SYN_ORDERS')!.ports.find(p => p.name === 'AMOUNT')!.expression).toBe(
      'Undefined(EXP_ARITHMETIC(STG_L_SYN_ORDERS.AMOUNT, *, LKP_SYN_CURRENCY(STG_L_SYN_ORDERS.CURRENCY_CODE)), 2)')
  })
  it('layout: shared canvasLayout — finite coords, sources col 0, target rightmost', () => {
    const g = recipeToCanvas(bizlink as RecipeJson, BIZ_PATH)
    for (const n of g.nodes) { expect(Number.isFinite(n.x)).toBe(true); expect(Number.isFinite(n.y)).toBe(true) }
    const byId = new Map(g.nodes.map(n => [n.id, n]))
    expect(byId.get('ff_BIZLINK')!.x).toBe(40)
    expect(byId.get('BIZLINK')!.x).toBe(Math.max(...g.nodes.map(n => n.x)))
  })
})
