import type { components } from './types.gen'
import type { DagCluster, DagStatus, DagTask } from '../types'

export type RelationshipsT = components['schemas']['RelationshipsDto']
export type RelNodeT = components['schemas']['NodeDto']

export const UNGROUPED = 'UNGROUPED'
const X0 = 60, Y0 = 80, COL_PITCH = 220, ROW_PITCH = 120

const push = <K,>(m: Map<K, string[]>, k: K, v: string) => { const a = m.get(k); a ? a.push(v) : m.set(k, [v]) }

export function toDagClusters(rel: RelationshipsT): DagCluster[] {
  const nodes = rel.nodes ?? []
  const recipes = nodes.filter(n => n.kind === 'recipe')
  const nameById = new Map(recipes.map(r => [r.id ?? '', r.name ?? '']))

  const writersByTable = new Map<string, string[]>()   // table id -> writer recipe ids
  const readsByRecipe = new Map<string, string[]>()    // recipe id -> read table ids (source|lookup)
  for (const e of rel.edges ?? []) {
    if (!e.from || !e.to) continue
    if (e.kind === 'writes') push(writersByTable, e.to, e.from)
    else if (e.kind === 'source' || e.kind === 'lookup') push(readsByRecipe, e.to, e.from)
  }
  const dependsOn = (r: RelNodeT): string[] => {
    const ups = new Set<string>()
    for (const t of readsByRecipe.get(r.id ?? '') ?? [])
      for (const w of writersByTable.get(t) ?? [])
        if (w !== r.id) { const n = nameById.get(w); if (n) ups.add(n) }
    return [...ups].sort()
  }

  const byWorkflow = new Map<string, RelNodeT[]>()
  for (const r of recipes) {
    const wf = r.workflow?.trim() || UNGROUPED
    const a = byWorkflow.get(wf); a ? a.push(r) : byWorkflow.set(wf, [r])
  }

  return [...byWorkflow.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([wf, members]) => {
    const tasks: DagTask[] = members.map(r => ({
      task_id: r.name ?? '', recipe_id: r.mappingPath ?? '',
      depends_on: dependsOn(r),
      last_status: 'skipped' as DagStatus,  // no run selected -> no-data (grey per ETLDag STATUS_COLOR)
      duration_s: 0, x: 0, y: 0,
    }))
    layoutTasks(tasks, members)
    return { dag_id: wf, schedule: `${tasks.length} recipe${tasks.length === 1 ? '' : 's'}`,
             last_run: '', status: 'skipped' as DagStatus, tasks }
  })
}

/** col = max(executionOrder rank, 1 + col(intra-cluster dep)); cycle back-edges ignored. */
function layoutTasks(tasks: DagTask[], members: RelNodeT[]) {
  const orderOf = new Map(tasks.map((t, i) => [t.task_id, members[i].executionOrder ?? 0]))
  const ranks = [...new Set([...orderOf.values()])].sort((a, b) => a - b)
  const rankOf = (id: string) => ranks.indexOf(orderOf.get(id) ?? 0)
  const inCluster = new Map(tasks.map(t => [t.task_id, t]))
  const col = new Map<string, number>()
  const colOf = (t: DagTask, seen: Set<string>): number => {
    const hit = col.get(t.task_id)
    if (hit !== undefined) return hit
    if (seen.has(t.task_id)) return rankOf(t.task_id)          // cycle guard: back-edge treated absent
    seen.add(t.task_id)
    let c = rankOf(t.task_id)
    for (const dep of t.depends_on) {
      const d = inCluster.get(dep)
      if (d) c = Math.max(c, colOf(d, seen) + 1)
    }
    col.set(t.task_id, c)
    return c
  }
  for (const t of tasks) colOf(t, new Set())
  const rowsUsed = new Map<number, number>()
  const stacked = [...tasks].sort((a, b) =>
    (orderOf.get(a.task_id)! - orderOf.get(b.task_id)!) || a.task_id.localeCompare(b.task_id))
  for (const t of stacked) {
    const c = col.get(t.task_id)!
    const r = rowsUsed.get(c) ?? 0
    rowsUsed.set(c, r + 1)
    t.x = X0 + c * COL_PITCH
    t.y = Y0 + r * ROW_PITCH
  }
}
