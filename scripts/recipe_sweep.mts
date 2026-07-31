// scripts/recipe_sweep.mts — run: node --experimental-strip-types scripts/recipe_sweep.mts
//
// Walks the live /api/tree for every recipe JSON (_ETL_<mapping>.json), fetches it via
// /api/recipes, and runs each through the adapter's recipeToCanvas() the same way the
// frontend Modifier tab does. Fails (exit 1) if any recipe can't render: empty canvas, a
// dangling edge, duplicate node ids, or a node with no finite layout coordinates. Also
// POSTs the raw recipe content to /api/recipes/validate and fails if the backend flags it
// invalid. This is the "does every real recipe actually draw AND validate clean" gate —
// mirrors scripts/viewer_sweep.mts (see docs/superpowers/plans/2026-07-30-ipc-etl-viewer.md
// Task 7) for the Modifier corpus, per
// docs/superpowers/plans/2026-07-31-etl-modifier.md Task 12.
import { recipeToCanvas } from '../frontend/src/api/recipeAdapter.ts'

const BASE = process.env.ETL360_API ?? 'http://localhost:8080'
type Tree = { kind?: string; name?: string; path?: string; children?: Tree[] }
const paths: string[] = []
const walk = (n: Tree) => {
  if (n.kind === 'json' && n.name?.startsWith('_ETL_') && n.path) paths.push(n.path)
  ;(n.children ?? []).forEach(walk)
}
walk(await (await fetch(`${BASE}/api/tree`)).json() as Tree)
if (paths.length < 86) { console.error(`recipe_sweep: only ${paths.length} recipes in tree (expected >= 86)`); process.exit(1) }
let failed = 0
for (const p of paths.sort()) {
  try {
    const res = await fetch(`${BASE}/api/recipes/${p}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const dto = await res.json() as { content: unknown }
    const g = recipeToCanvas(dto.content as never, p)
    if (!g.nodes.length) throw new Error('empty canvas')
    const ids = new Set(g.nodes.map(n => n.id))
    if (ids.size !== g.nodes.length) throw new Error('duplicate node ids')
    for (const c of g.connections) if (!ids.has(c.fromNode) || !ids.has(c.toNode)) throw new Error(`dangling edge ${c.fromNode}->${c.toNode}`)
    for (const n of g.nodes) if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) throw new Error(`no layout for ${n.name}`)
    const vRes = await fetch(`${BASE}/api/recipes/validate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dto.content),
    })
    if (!vRes.ok) throw new Error(`validate HTTP ${vRes.status}`)
    const v = await vRes.json() as { valid: boolean; errors: { path: string; message: string }[] }
    if (!v.valid) throw new Error(`invalid: ${v.errors.map(e => `${e.path}: ${e.message}`).join('; ')}`)
  } catch (e) { failed++; console.error(`recipe_sweep FAIL ${p}: ${(e as Error).message}`) }
}
console.log(`recipe_sweep: ${paths.length - failed}/${paths.length} recipes render+validate`)
process.exit(failed ? 1 : 0)
