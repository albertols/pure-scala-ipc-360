import { describe, expect, it } from 'vitest'
import { recipeToCanvas } from './recipeAdapter'
import type { RecipeJson, RecipeSourceJson } from './recipeAdapter'
import bizlink from './__fixtures__/recipe_m_DM_INFOHUB_BIZLINK.json'
import syn from './__fixtures__/recipe_m_SYN_ODS_ORDERS.json'
const BIZ_PATH = 'CDM/m_DM_INFOHUB_BIZLINK/_ETL_m_DM_INFOHUB_BIZLINK.json'

describe('recipeToCanvas — nodes, kinds, ports', () => {
  it('derives target / intermediate / source nodes from the BIZLINK recipe', () => {
    const g = recipeToCanvas(bizlink as RecipeJson, BIZ_PATH, { BERYLFALLS: 'sourceQualifier' })
    const byId = new Map(g.nodes.map(n => [n.id, n]))
    expect(byId.get('BIZLINK')!.type).toBe('target')          // table-typed AND in targetTableNames
    expect(byId.get('SQ_ff_BIZLINK')!.type).toBe('sq')        // anonymizer token "BERYLFALLS" resolved via typeAliases -> sourceQualifier -> sq
    expect(byId.get('SQ_ff_BIZLINK')!.label).toBe('SQ')
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
  it('typeAliases (from GET /api/ipc/rules) resolve the four anonymizer tokens to their canonical kind, ' +
     'identically to the canonical type they alias', () => {
    const mk = (type: string): RecipeJson => ({
      steps: [{ target: { name: 'X', type, fields: [] }, sources: [] },
              { target: { name: 'T', type: 'table', fields: [] }, sources: [] }],
      table: { targetTableNames: ['T'], sourceTableNames: [] },
    })
    const typeAliases = {
      BERYLFALLS: 'sourceQualifier',
      EARLYGLADE: 'unionInput',
      ASHPATH2: 'joinerInput',
      CEDARWICK2: 'storedProcedure',
    }
    const cases: [string, string, string, string][] = [
      ['BERYLFALLS', 'sourceQualifier', 'sq', 'SQ'],
      ['EARLYGLADE', 'unionInput', 'expression', 'UNI'],
      ['ASHPATH2', 'joinerInput', 'joiner', 'JNR'],
      ['CEDARWICK2', 'storedProcedure', 'expression', 'STO'],
    ]
    for (const [aliasType, canonicalType, expectType, expectLabel] of cases) {
      const aliased = recipeToCanvas(mk(aliasType), 'L/x/_ETL_x.json', typeAliases).nodes.find(x => x.id === 'X')!
      const canonical = recipeToCanvas(mk(canonicalType), 'L/x/_ETL_x.json', typeAliases).nodes.find(x => x.id === 'X')!
      expect([aliased.type, aliased.label]).toEqual([expectType, expectLabel])
      expect([aliased.type, aliased.label]).toEqual([canonical.type, canonical.label]) // aliased and canonical take identical paths
    }
  })
  it('typeAliases defaults to {} — an aliased token with no aliases supplied still falls back (backward compat)', () => {
    const r: RecipeJson = {
      steps: [{ target: { name: 'X', type: 'BERYLFALLS', fields: [] }, sources: [] },
              { target: { name: 'T', type: 'table', fields: [] }, sources: [] }],
      table: { targetTableNames: ['T'], sourceTableNames: [] },
    }
    const n = recipeToCanvas(r, 'L/x/_ETL_x.json').nodes.find(x => x.id === 'X')!
    expect([n.type, n.label]).toEqual(['expression', 'BER'])
  })
  it('SYN recipe: clean 2-node shape; empty/garbage input never throws', () => {
    const g = recipeToCanvas(syn as RecipeJson, 'ODS/m_SYN_ODS_ORDERS/_ETL_m_SYN_ODS_ORDERS.json')
    expect(g.nodes.map(n => n.id).sort()).toEqual(['ODS_SYN_ORDERS', 'STG_L_SYN_ORDERS'])
    expect(recipeToCanvas({} as RecipeJson, 'x').nodes).toEqual([])
    expect(recipeToCanvas({ steps: [{}] } as RecipeJson, 'x').nodes).toEqual([])
  })

  // Task 6 — union/joiner sources become canvas nodes. Shapes below are faithful excerpts
  // of real corpus recipes (names/keys copied verbatim): the union from
  // DWH/m_DWH_E_LKP_DIR_PHONELIST/_ETL_m_DWH_E_LKP_DIR_PHONELIST.json ('Union' with
  // unionTables MAPLEROAD301MAPLEHEATH/MAPLEROAD100MAPLEHEATH), and the joiner chain from
  // DWH/m_DWH_MAPLEGROVE_ACT_CLIENTMGR_PROFILES/_ETL_m_DWH_MAPLEGROVE_ACT_CLIENTMGR_PROFILES.json
  // ('JNR_Ashshore' with joinerInput targets 'JNR_Ashshore.MASTER'/'JNR_Ashshore.DETAIL',
  // AbstractTargetFactory.scala:88 <joiner>.<MASTER|DETAIL> naming).
  const unionTypeAliases = { EARLYGLADE: 'unionInput', BERYLFALLS: 'sourceQualifier' }
  const unionRecipe: RecipeJson = {
    steps: [
      {
        target: {
          name: 'DWH_E_LKP_DIR_PHONELIST', type: 'table',
          fields: [
            { name: 'ID_LOCATION', dataType: 'BigDecimal', transformation: { source: 'Union.ID_LOCATION' } },
            { name: 'ID_MEMBER', dataType: 'BigDecimal', transformation: { source: 'Union.ID_MEMBER' } },
          ],
        },
        sources: [{
          name: 'Union', type: 'union',
          unionTables: [
            { name: 'MAPLEROAD301MAPLEHEATH', fieldMapping: [
              { origin: 'ID_LOCATION1', union: 'ID_LOCATION' },
              { origin: 'ID_MEMBER1', union: 'ID_MEMBER' },
            ] },
            { name: 'MAPLEROAD100MAPLEHEATH', fieldMapping: [
              { origin: 'ID_LOCATION2', union: 'ID_LOCATION' },
              { origin: 'ID_MEMBER2', union: 'ID_MEMBER' },
            ] },
          ],
        } as RecipeSourceJson],
      },
      { target: { name: 'MAPLEROAD301MAPLEHEATH', type: 'EARLYGLADE', fields: [] }, sources: [{ name: 'SQ_X1', type: 'BERYLFALLS' }] },
      { target: { name: 'MAPLEROAD100MAPLEHEATH', type: 'EARLYGLADE', fields: [] }, sources: [{ name: 'SQ_X2', type: 'BERYLFALLS' }] },
      { target: { name: 'SQ_X1', type: 'BERYLFALLS', fields: [] }, sources: [{ name: 'T_X1', type: 'table' }] },
      { target: { name: 'SQ_X2', type: 'BERYLFALLS', fields: [] }, sources: [{ name: 'T_X2', type: 'table' }] },
    ],
    table: { targetTableNames: ['DWH_E_LKP_DIR_PHONELIST'], sourceTableNames: ['T_X1', 'T_X2'] },
  }

  const joinerTypeAliases = { ASHPATH2: 'joinerInput', BERYLFALLS: 'sourceQualifier' }
  const joinerRecipe: RecipeJson = {
    steps: [
      {
        target: { name: 'DWH_MAPLEGROVE_ACT_CLIENTMGR_PROFILES', type: 'table', fields: [
          { name: 'ID_MEMBER', dataType: 'Long', transformation: { source: 'JNR_Ashshore.ID_MEMBER' } },
        ] },
        sources: [{
          name: 'JNR_Ashshore', type: 'joiner',
          joinerTables: ['JNR_Ashshore.MASTER', 'JNR_Ashshore.DETAIL'],
          joinerType: 'Detail Outer Join',
          joinerCondition: 'ID_MEMBER1 = ID_MEMBER',
        } as RecipeSourceJson],
      },
      { target: { name: 'JNR_Ashshore.DETAIL', type: 'ASHPATH2', fields: [] }, sources: [{ name: 'SQ_D', type: 'BERYLFALLS' }] },
      { target: { name: 'JNR_Ashshore.MASTER', type: 'ASHPATH2', fields: [] }, sources: [{ name: 'SQ_M', type: 'BERYLFALLS' }] },
      { target: { name: 'SQ_D', type: 'BERYLFALLS', fields: [] }, sources: [{ name: 'D_TBL', type: 'table' }] },
      { target: { name: 'SQ_M', type: 'BERYLFALLS', fields: [] }, sources: [{ name: 'M_TBL', type: 'table' }] },
    ],
    table: { targetTableNames: ['DWH_MAPLEGROVE_ACT_CLIENTMGR_PROFILES'], sourceTableNames: ['D_TBL', 'M_TBL'] },
  }

  it('union source becomes a canvas node: UNI label, one OUT port per distinct fieldMapping.union value', () => {
    const g = recipeToCanvas(unionRecipe, 'DWH/x/_ETL_x.json', unionTypeAliases)
    const union = g.nodes.find(n => n.id === 'Union')
    expect(union).toBeDefined()
    expect(union!.type).toBe('expression')
    expect(union!.label).toBe('UNI')
    expect(union!.ports.map(p => p.name).sort()).toEqual(['ID_LOCATION', 'ID_MEMBER'])
    expect(union!.ports.every(p => p.direction === 'OUT')).toBe(true)
  })

  it('each unionInput step gets an edge to the union node it belongs to', () => {
    const g = recipeToCanvas(unionRecipe, 'DWH/x/_ETL_x.json', unionTypeAliases)
    expect(g.connections).toContainEqual({ fromNode: 'MAPLEROAD301MAPLEHEATH', fromPort: '', toNode: 'Union', toPort: '' })
    expect(g.connections).toContainEqual({ fromNode: 'MAPLEROAD100MAPLEHEATH', fromPort: '', toNode: 'Union', toPort: '' })
    // dot-ref field edges from the union to its consuming target already fall out of the
    // existing ref mechanism now that 'Union' is a resolvable node id
    expect(g.connections).toContainEqual(
      { fromNode: 'Union', fromPort: 'ID_LOCATION', toNode: 'DWH_E_LKP_DIR_PHONELIST', toPort: 'ID_LOCATION' })
  })

  it('joiner source becomes a canvas node: type joiner, label JNR, joinerType/joinerCondition lifted to properties', () => {
    const g = recipeToCanvas(joinerRecipe, 'DWH/x/_ETL_x.json', joinerTypeAliases)
    const jnr = g.nodes.find(n => n.id === 'JNR_Ashshore')
    expect(jnr).toBeDefined()
    expect(jnr!.type).toBe('joiner')
    expect(jnr!.label).toBe('JNR')
    expect(jnr!.ports.map(p => p.name).sort()).toEqual(['JNR_Ashshore.DETAIL', 'JNR_Ashshore.MASTER'])
    expect(jnr!.ports.every(p => p.direction === 'OUT')).toBe(true)
    expect(jnr!.properties.joinerType).toBe('Detail Outer Join')
    expect(jnr!.properties.joinerCondition).toBe('ID_MEMBER1 = ID_MEMBER')
  })

  it('each joinerInput step (<joiner>.<MASTER|DETAIL>) gets an edge to the joiner named by the segment before the trailing dot', () => {
    const g = recipeToCanvas(joinerRecipe, 'DWH/x/_ETL_x.json', joinerTypeAliases)
    expect(g.connections).toContainEqual({ fromNode: 'JNR_Ashshore.DETAIL', fromPort: '', toNode: 'JNR_Ashshore', toPort: '' })
    expect(g.connections).toContainEqual({ fromNode: 'JNR_Ashshore.MASTER', fromPort: '', toNode: 'JNR_Ashshore', toPort: '' })
    expect(g.connections).toContainEqual(
      { fromNode: 'JNR_Ashshore', fromPort: 'ID_MEMBER', toNode: 'DWH_MAPLEGROVE_ACT_CLIENTMGR_PROFILES', toPort: 'ID_MEMBER' })
  })

  it('a joiner whose own name contains a dot: both joinerInput branches still resolve to the ' +
     'one owning joiner node (AbstractTargetFactory.scala:88 appends exactly one dot + a fixed ' +
     'MASTER/DETAIL suffix onto the joiner\'s own name, so recovering that name must anchor on ' +
     'the trailing suffix, not on whichever dot comes first)', () => {
    const dottedJoinerRecipe: RecipeJson = {
      steps: [
        { target: { name: 'T', type: 'table', fields: [] },
          sources: [{ name: 'A.B', type: 'joiner', joinerTables: ['A.B.MASTER', 'A.B.DETAIL'] } as RecipeSourceJson] },
        { target: { name: 'A.B.DETAIL', type: 'ASHPATH2', fields: [] }, sources: [] },
        { target: { name: 'A.B.MASTER', type: 'ASHPATH2', fields: [] }, sources: [] },
      ],
      table: { targetTableNames: ['T'], sourceTableNames: [] },
    }
    const g = recipeToCanvas(dottedJoinerRecipe, 'L/x/_ETL_x.json', joinerTypeAliases)
    expect(g.nodes.find(n => n.id === 'A.B')).toBeDefined()
    expect(g.connections).toContainEqual({ fromNode: 'A.B.DETAIL', fromPort: '', toNode: 'A.B', toPort: '' })
    expect(g.connections).toContainEqual({ fromNode: 'A.B.MASTER', fromPort: '', toNode: 'A.B', toPort: '' })
  })

  it('no duplicate node id is produced when the same union feeds two steps', () => {
    const fanOut: RecipeJson = {
      steps: [
        { target: { name: 'T1', type: 'table', fields: [{ name: 'A', dataType: 'String', transformation: { source: 'Union.A' } }] },
          sources: [{ name: 'Union', type: 'union', unionTables: [{ name: 'U1', fieldMapping: [{ origin: 'A1', union: 'A' }] }] } as RecipeSourceJson] },
        { target: { name: 'T2', type: 'table', fields: [{ name: 'A', dataType: 'String', transformation: { source: 'Union.A' } }] },
          sources: [{ name: 'Union', type: 'union', unionTables: [{ name: 'U1', fieldMapping: [{ origin: 'A1', union: 'A' }] }] } as RecipeSourceJson] },
        { target: { name: 'U1', type: 'EARLYGLADE', fields: [] }, sources: [] },
      ],
      table: { targetTableNames: ['T1', 'T2'], sourceTableNames: [] },
    }
    const g = recipeToCanvas(fanOut, 'L/x/_ETL_x.json', unionTypeAliases)
    expect(g.nodes.filter(n => n.id === 'Union')).toHaveLength(1)
    expect(g.connections).toContainEqual({ fromNode: 'Union', fromPort: 'A', toNode: 'T1', toPort: 'A' })
    expect(g.connections).toContainEqual({ fromNode: 'Union', fromPort: 'A', toNode: 'T2', toPort: 'A' })
    expect(g.connections).toContainEqual({ fromNode: 'U1', fromPort: '', toNode: 'Union', toPort: '' })
  })

  it('an aliased union/joiner source type resolves identically to the canonical one (typeAliases threaded through, not hardcoded)', () => {
    const aliases = { MY_UNION_ALIAS: 'union', MY_JOINER_ALIAS: 'joiner' }
    const mkUnion = (type: string): RecipeJson => ({
      steps: [
        { target: { name: 'T', type: 'table', fields: [{ name: 'A', dataType: 'String', transformation: { source: 'U.A' } }] },
          sources: [{ name: 'U', type, unionTables: [{ name: 'IN1', fieldMapping: [{ origin: 'A1', union: 'A' }] }] } as RecipeSourceJson] },
      ],
      table: { targetTableNames: ['T'], sourceTableNames: [] },
    })
    const aliased = recipeToCanvas(mkUnion('MY_UNION_ALIAS'), 'L/x/_ETL_x.json', aliases).nodes.find(n => n.id === 'U')!
    const canonical = recipeToCanvas(mkUnion('union'), 'L/x/_ETL_x.json', aliases).nodes.find(n => n.id === 'U')!
    expect([aliased.type, aliased.label]).toEqual(['expression', 'UNI'])
    expect([aliased.type, aliased.label]).toEqual([canonical.type, canonical.label])

    const mkJoiner = (type: string): RecipeJson => ({
      steps: [
        { target: { name: 'T', type: 'table', fields: [] },
          sources: [{ name: 'J', type, joinerTables: ['J.MASTER', 'J.DETAIL'] } as RecipeSourceJson] },
      ],
      table: { targetTableNames: ['T'], sourceTableNames: [] },
    })
    const aliasedJ = recipeToCanvas(mkJoiner('MY_JOINER_ALIAS'), 'L/x/_ETL_x.json', aliases).nodes.find(n => n.id === 'J')!
    const canonicalJ = recipeToCanvas(mkJoiner('joiner'), 'L/x/_ETL_x.json', aliases).nodes.find(n => n.id === 'J')!
    expect([aliasedJ.type, aliasedJ.label]).toEqual(['joiner', 'JNR'])
    expect([aliasedJ.type, aliasedJ.label]).toEqual([canonicalJ.type, canonicalJ.label])
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
