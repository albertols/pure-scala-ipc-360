// scripts/recipe_sweep.mts — run: node --experimental-strip-types scripts/recipe_sweep.mts
//
// Walks the live /api/tree for every recipe JSON (_ETL_<mapping>.json), fetches it via
// /api/recipes, and runs each through the adapter's recipeToCanvas() the same way the
// frontend Modifier tab does. Fails (exit 1) if any recipe can't render: empty canvas, a
// dangling edge, duplicate node ids, or a node with no finite layout coordinates. Also
// POSTs the raw recipe content to /api/recipes/validate and fails if the backend flags it
// invalid, OR if any returned checks[].ruleId is absent from the GET /api/ipc/rules
// catalogue — a check id that isn't in the catalogue means the catalogue and the rule
// engine have drifted apart (docs/superpowers/specs/2026-08-01-etl-modifier-redesign-design.md
// §9's contract test (b) covers this for the backend in isolation; this sweep re-proves it
// against the live wire response every recipe actually receives). Warning-severity checks
// never fail the sweep (spec §5.5 — `valid` stays `errors.isEmpty()`) but are tallied and
// printed so a severity regression (a rule quietly downgraded, or a new one shipping as
// warning) is visible in the gate output without blocking it. This is the "does every real
// recipe actually draw AND validate clean" gate — mirrors scripts/viewer_sweep.mts (see
// docs/superpowers/plans/2026-07-30-ipc-etl-viewer.md Task 7) for the Modifier corpus, per
// docs/superpowers/plans/2026-07-31-etl-modifier.md Task 12 and extended by
// docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md Task 18.
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

type IpcRuleMeta = { id: string }
type IpcRulesDto = { rules: IpcRuleMeta[]; typeAliases?: Record<string, string> }
const catalog = await (await fetch(`${BASE}/api/ipc/rules`)).json() as IpcRulesDto
const knownRuleIds = new Set(catalog.rules.map(r => r.id))
if (!knownRuleIds.size) { console.error('recipe_sweep: GET /api/ipc/rules returned no rules'); process.exit(1) }
// Task 19: fetched once, passed to every recipeToCanvas() call below — same catalogue
// the frontend's ETLModifier threads from useIpcRules(), so the sweep exercises the
// canvas exactly as a real session would (anonymizer tokens resolved, not fallback boxes).
const typeAliases = catalog.typeAliases ?? {}

// Task 6: recipeToCanvas() now noded every `union`/`joiner` sources[] entry, not just
// `table`-typed ones (frontend/src/api/recipeAdapter.ts). Re-verified against the live
// corpus here rather than trusted from the adapter's own unit tests alone.
type RecipeSourceLike = { name?: string; type?: string }
type RecipeStepLike = { sources?: RecipeSourceLike[] }
type RecipeLike = { steps?: RecipeStepLike[] }

let failed = 0
let warningChecks = 0
for (const p of paths.sort()) {
  try {
    const res = await fetch(`${BASE}/api/recipes/${p}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const dto = await res.json() as { content: unknown }
    const g = recipeToCanvas(dto.content as never, p, typeAliases)
    if (!g.nodes.length) throw new Error('empty canvas')
    const ids = new Set(g.nodes.map(n => n.id))
    if (ids.size !== g.nodes.length) throw new Error('duplicate node ids')
    for (const step of (dto.content as RecipeLike).steps ?? []) {
      for (const source of step.sources ?? []) {
        const canonical = typeAliases[source.type ?? ''] ?? source.type
        if (canonical !== 'union' && canonical !== 'joiner') continue
        if (!source.name || !ids.has(source.name)) throw new Error(`${canonical} source '${source.name}' has no canvas node`)
      }
    }
    for (const c of g.connections) if (!ids.has(c.fromNode) || !ids.has(c.toNode)) throw new Error(`dangling edge ${c.fromNode}->${c.toNode}`)
    for (const n of g.nodes) if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) throw new Error(`no layout for ${n.name}`)
    const vRes = await fetch(`${BASE}/api/recipes/validate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dto.content),
    })
    if (!vRes.ok) throw new Error(`validate HTTP ${vRes.status}`)
    const v = await vRes.json() as {
      valid: boolean
      errors: { path: string; message: string }[]
      checks: { ruleId: string; severity: string; status: string; path: string }[]
    }
    if (!v.valid) throw new Error(`invalid: ${v.errors.map(e => `${e.path}: ${e.message}`).join('; ')}`)
    for (const c of v.checks ?? []) {
      if (!knownRuleIds.has(c.ruleId)) throw new Error(`unknown ruleId ${c.ruleId} @ ${c.path} not in GET /api/ipc/rules`)
      if (c.severity === 'warning' && c.status === 'fail') warningChecks++
    }
  } catch (e) { failed++; console.error(`recipe_sweep FAIL ${p}: ${(e as Error).message}`) }
}
console.log(`recipe_sweep: ${paths.length - failed}/${paths.length} recipes render+validate (${warningChecks} warning-severity checks)`)
process.exit(failed ? 1 : 0)
