// scripts/relationships_sweep.mts — run: node --experimental-strip-types scripts/relationships_sweep.mts
// Asserts every spec §7 casuistic against the live /api/relationships + /api/operational/summary.
import { toOperationalGraph } from '../frontend/src/api/relationshipsAdapter.ts'

const BASE = process.env.ETL360_API ?? 'http://localhost:8080'
const fetchJson = async (p: string) => {
  const r = await fetch(`${BASE}${p}`)
  if (!r.ok) { console.error(`relationships_sweep: ${p} HTTP ${r.status}`); process.exit(1) }
  return r.json()
}
type Edge = { from: string; to: string; kind: string }
type Node = { id: string; kind: string; name: string }
const g = await fetchJson('/api/relationships') as { nodes: Node[]; edges: Edge[] }
const summary = await fetchJson('/api/operational/summary') as
  { dates: string[]; recipes: { recipeFilename: string; latestStatus: string; history: { date: string; status: string }[] }[] }

const fails: string[] = []
const check = (name: string, ok: boolean) => { if (!ok) fails.push(name); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`) }

const ids = new Set(g.nodes.map(n => n.id))
check('no duplicate node ids', ids.size === g.nodes.length)
check('no dangling edges', g.edges.every(e => ids.has(e.from) && ids.has(e.to)))

const writersOf = (t: string) => g.edges.filter(e => e.kind === 'writes' && e.to === t).map(e => e.from)
const writesOf = (r: string) => g.edges.filter(e => e.kind === 'writes' && e.from === r).map(e => e.to)
check('fan-in: CAS_ODS_EVENTS has >=2 writer recipes', writersOf('table:CAS_ODS_EVENTS').length >= 2)
check('1->N: SPLIT recipe has >=2 write targets', writesOf('recipe:_ETL_m_CAS_ETL_EVENTS_SPLIT.json').length >= 2)
check('source-only table: CAS_STG_UNREFERENCED has no writer',
  ids.has('table:CAS_STG_UNREFERENCED') && writersOf('table:CAS_STG_UNREFERENCED').length === 0)
check('consumer-less recipe: CAS_DWH_ORPHAN_METRICS table feeds nothing',
  g.edges.every(e => !(e.from === 'table:CAS_DWH_ORPHAN_METRICS' && (e.kind === 'source' || e.kind === 'lookup'))))
check('lookup edge into ODS EVENTS recipe', g.edges.some(e =>
  e.from === 'table:CAS_LKP_STATUS' && e.to === 'recipe:_ETL_m_CAS_ODS_EVENTS.json' && e.kind === 'lookup'))

const adj = new Map<string, string[]>()
for (const e of g.edges) { const a = adj.get(e.from) ?? []; a.push(e.to); adj.set(e.from, a) }
const bfsPath = (from: string, to: string, banned: Set<string>): string[] | null => {
  const prev = new Map<string, string>(); const q = [from]; const seen = new Set([from])
  while (q.length) {
    const cur = q.shift()!
    if (cur === to) { const p = [to]; while (p[0] !== from) p.unshift(prev.get(p[0])!); return p }
    for (const nx of adj.get(cur) ?? []) if (!seen.has(nx) && (!banned.has(nx) || nx === to)) { seen.add(nx); prev.set(nx, cur); q.push(nx) }
  }
  return null
}
const chain = bfsPath('table:CAS_STG_L_EVENTS', 'table:CAS_OUT_EVENTS_FEED', new Set())
check('>=6-hop STG->OUTPUT path', !!chain && chain.length - 1 >= 6)

const dest = 'recipe:_ETL_m_CAS_DWH_EVENTS_FACT.json'
const pathA = bfsPath('table:CAS_STG_L_EVENTS', dest, new Set())
const bannedMid = new Set((pathA ?? []).slice(1, -1))
const pathB = bfsPath('table:CAS_STG_L_REFS', dest, bannedMid)
check('diamond: two disjoint paths converge on DWH_EVENTS_FACT', !!pathA && !!pathB)

const bySummary = new Map(summary.recipes.map(r => [r.recipeFilename, r]))
const fact = bySummary.get('_ETL_m_CAS_DWH_EVENTS_FACT.json')
const anchor = summary.dates.at(-1)
check('KO on anchor date for DWH_EVENTS_FACT', anchor === '2026-07-29'
  && fact?.history.find(h => h.date === anchor)?.status === 'FAILED')
const casRecipes = g.nodes.filter(n => n.kind === 'recipe' && n.name.startsWith('_ETL_m_CAS_'))
check('12 CAS recipes in graph', casRecipes.length === 12)
check('every CAS recipe has 14 history entries',
  casRecipes.every(n => bySummary.get(n.name)?.history.length === 14))

const view = toOperationalGraph(g as never, summary as never, anchor ?? null)
check('adapter: finite layout + no dangling view edges',
  view.cards.every(c => Number.isFinite(c.x) && Number.isFinite(c.y))
  && view.edges.every(e => view.cards.some(c => c.id === e.fromId) && view.cards.some(c => c.id === e.toId)))

console.log(`relationships_sweep: ${fails.length === 0 ? 'PASS' : `FAIL (${fails.length})`}`)
process.exit(fails.length ? 1 : 0)
