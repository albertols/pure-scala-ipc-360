// scripts/viewer_sweep.mts — run: node --experimental-strip-types scripts/viewer_sweep.mts
//
// Walks the live /api/tree, fetches /api/mappings/model/<mappingPath> for every xml
// mapping, and runs each through the adapter's toCanvas() the same way the frontend
// does. Fails (exit 1) if any mapping can't render: empty canvas, a dangling edge, or
// a node with no finite layout coordinates. This is the "does every real mapping
// actually draw" gate — see docs/superpowers/plans/2026-07-30-ipc-etl-viewer.md Task 7.
import { toCanvas } from '../frontend/src/api/mappingAdapter.ts'

const BASE = process.env.ETL360_API ?? 'http://localhost:8080'
type Tree = { kind?: string; mappingPath?: string; children?: Tree[] }
const paths: string[] = []
const walk = (n: Tree) => { if (n.kind === 'xml' && n.mappingPath) paths.push(n.mappingPath); (n.children ?? []).forEach(walk) }
walk(await (await fetch(`${BASE}/api/tree`)).json() as Tree)
if (paths.length < 81) { console.error(`viewer_sweep: only ${paths.length} mappings in tree (expected >= 81)`); process.exit(1) }
let failed = 0
for (const p of paths.sort()) {
  try {
    const res = await fetch(`${BASE}/api/mappings/model/${p}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const model = await res.json()
    const g = toCanvas(model, p)
    if (!g.nodes.length) throw new Error('empty canvas')
    const ids = new Set(g.nodes.map(n => n.id))
    if (ids.size !== g.nodes.length) throw new Error('duplicate node ids')
    for (const c of g.connections) if (!ids.has(c.fromNode) || !ids.has(c.toNode)) throw new Error(`dangling edge ${c.fromNode}->${c.toNode}`)
    for (const n of g.nodes) if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) throw new Error(`no layout for ${n.name}`)
  } catch (e) { failed++; console.error(`viewer_sweep FAIL ${p}: ${(e as Error).message}`) }
}
console.log(`viewer_sweep: ${paths.length - failed}/${paths.length} mappings render`)
process.exit(failed ? 1 : 0)
