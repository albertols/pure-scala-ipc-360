import { describe, expect, it } from 'vitest'
import { toCanvas } from './mappingAdapter'
import diamond from './__fixtures__/model_m_SYN_DWH_ORDERS_FACT.json'
import lookup from './__fixtures__/model_m_SYN_ODS_ORDERS.json'
import bridge from './__fixtures__/model_m_SYN_ETL_ORDERS_BRIDGE.json'
import type { MappingModel } from './queries'

describe('toCanvas — nodes, kinds, ports', () => {
  it('maps instances to typed nodes with source/target/transformation kinds', () => {
    const g = toCanvas(diamond as MappingModel, 'DWH/m_SYN_DWH_ORDERS_FACT')
    const kinds = new Map(g.nodes.map(n => [n.name, n.type]))
    expect(kinds.get('ODS_SYN_ORDERS')).toBe('source')
    expect(kinds.get('ODS_SYN_CUSTOMERS')).toBe('source')
    expect(kinds.get('DWH_SYN_ORDERS_FACT')).toBe('target')
    expect(g.nodes.some(n => n.type === 'expression')).toBe(true)
    expect(g.renderedMapping).toBe('m_SYN_DWH_ORDERS_FACT')
  })

  it('maps Lookup Procedure to lookup kind and ports carry direction from portType', () => {
    const g = toCanvas(lookup as MappingModel, 'ODS/m_SYN_ODS_ORDERS')
    const lkp = g.nodes.find(n => n.type === 'lookup')
    expect(lkp).toBeDefined()
    const exp = g.nodes.find(n => n.type === 'expression')!
    const dirs = new Set(exp.ports.map(p => p.direction))
    expect([...dirs].every(d => ['IN', 'OUT', 'IN/OUT'].includes(d))).toBe(true)
  })

  it('ƒ rule: expression set only when non-blank and differs from port name', () => {
    const g = toCanvas(lookup as MappingModel, 'ODS/m_SYN_ODS_ORDERS')
    const withExpr = g.nodes.flatMap(n => n.ports).filter(p => p.expression)
    expect(withExpr.length).toBeGreaterThan(0)
    for (const p of withExpr) expect(p.expression).not.toBe(p.name)
  })

  it('connectors become connections keyed by instance names; linked flags set', () => {
    const g = toCanvas(diamond as MappingModel, 'DWH/m_SYN_DWH_ORDERS_FACT')
    expect(g.connections.length).toBeGreaterThan(0)
    const ids = new Set(g.nodes.map(n => n.id))
    for (const c of g.connections) { expect(ids).toContain(c.fromNode); expect(ids).toContain(c.toNode) }
    const linked = g.nodes.flatMap(n => n.ports).filter(p => p.linked)
    expect(linked.length).toBeGreaterThan(0)
  })

  it('unknown transformation types fall back to a 3-letter label, never throw', () => {
    const weird = structuredClone(diamond) as MappingModel
    const t = weird.repository!.folder!.mappings![0].transformations![0]
    t.typ = 'Update Strategy'
    const g = toCanvas(weird, 'DWH/m_SYN_DWH_ORDERS_FACT')
    const n = g.nodes.find(x => x.name === t.name)!
    expect(n.label).toBe('UPD')
  })

  it('dual-target mapping renders both targets', () => {
    const g = toCanvas(bridge as MappingModel, 'ETL/m_SYN_ETL_ORDERS_BRIDGE')
    expect(g.nodes.filter(n => n.type === 'target').map(n => n.name).sort())
      .toEqual(['ETL_SYN_ORDERS_AUDIT', 'ETL_SYN_ORDERS_BRIDGE'])
  })
})
