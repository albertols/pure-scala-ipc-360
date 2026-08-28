import type { components } from './types.gen'
import type { DagCluster, DagRun, DagStatus, DagTask, OperationalCard, StatusType } from '../types'
import type { RunT } from './clusterQueries'

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

export type B15RowT = components['schemas']['B15RowDto']

export function parseDurationSec(v: string | undefined): number {
  const m = /^(\d+)m\s+(\d+)sec$/.exec((v ?? '').trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

/**
 * The one b15 status -> DAG status mapping. ONE, deliberately: the same status cell reaches the
 * same Tab 4 panel by two routes — the canvas node through `overlayRun` (snapshot rows) and the
 * run strip through `clusterRuns` (RunDto rows) — and while these were two functions, one of
 * which trimmed and upper-cased and one of which did an exact-match lookup, a cell spelled
 * " success" painted the node green and the strip grey for a single value.
 */
export function statusFromB15(status: string | undefined): DagStatus {
  const s = (status ?? '').trim().toUpperCase()
  return s === 'SUCCESS' ? 'success' : s === 'FAILED' ? 'failed' : s === 'RUNNING' ? 'running' : 'skipped'
}

/** Alias for the RunDto route. Same input vocabulary, so necessarily the same function. */
export const statusFromRun = statusFromB15

export function overlayRun(cluster: DagCluster, rows: B15RowT[] | undefined): DagCluster {
  const byRecipe = new Map((rows ?? []).map(r => [r.recipeFilename ?? '', r]))
  const tasks = cluster.tasks.map(t => {
    const row = byRecipe.get(t.task_id)
    return { ...t,
      last_status: row ? statusFromB15(row.status) : ('skipped' as DagStatus),
      duration_s: row ? parseDurationSec(row.avgJobDurationInMinsSec) : 0 }
  })
  const set = new Set(tasks.map(t => t.last_status))
  const status: DagStatus = set.has('failed') ? 'failed'
    : set.has('success') || set.has('running') ? 'success' : 'skipped'
  const ids = new Set(cluster.tasks.map(t => t.task_id))
  const last_run = (rows ?? []).filter(r => ids.has(r.recipeFilename ?? ''))
    .map(r => r.appStartIso ?? '').sort().at(-1) ?? ''
  return { ...cluster, tasks, status, last_run }
}

/** One DagRun per date: failed if any task failed that day, success if any ran, else skipped. */
export function clusterRuns(cluster: DagCluster, dates: string[],
    byRecipe: Record<string, RunT[]>): DagRun[] {
  return [...dates].sort().map(date => {
    const onDate = cluster.tasks
      .map(t => (byRecipe[t.task_id] ?? []).find(r => r.date === date))
      .filter((r): r is RunT => !!r)
    const statuses = new Set(onDate.map(r => statusFromRun(r.status)))
    const status: DagStatus = statuses.has('failed') ? 'failed'
      : statuses.has('success') || statuses.has('running') ? 'success' : 'skipped'
    return {
      run_id: date, dag_id: cluster.dag_id, status,
      started_at: onDate.map(r => r.appStartIso ?? '').sort().at(-1) ?? '',
      duration_s: onDate.reduce((s, r) => s + Math.round((r.durationMin ?? 0) * 60), 0),
    }
  })
}

const STATUS_UP: Record<DagStatus, StatusType> = { success: 'OK', failed: 'KO', running: 'RUNNING', skipped: 'PENDING' }

/** An OperationalCard for one DAG task, from that recipe's run history (newest-first as served). */
export function toOperationalCard(task: DagTask, runs: RunT[], selectedDate: string): OperationalCard {
  const oldestFirst = [...runs].reverse()
  const history: StatusType[] = oldestFirst.map(r => STATUS_UP[statusFromRun(r.status)])
  const durations = oldestFirst
    .map(r => Math.round((r.durationMin ?? 0) * 60)).filter(n => n > 0).sort((a, b) => a - b)
  const pct = (p: number) => durations.length
    ? durations[Math.min(durations.length - 1, Math.max(0, Math.ceil((p / 100) * durations.length) - 1))]
    : 0
  const selected = runs.find(r => r.date === selectedDate)

  return {
    id: task.task_id, kind: 'recipe', name: task.task_id,
    layer: task.recipe_id.includes('/') ? task.recipe_id.slice(0, task.recipe_id.indexOf('/')) : '—',
    status: selected ? STATUS_UP[statusFromRun(selected.status)] : 'PENDING',
    lastRun: oldestFirst.at(-1)?.appStartIso || new Date(0).toISOString(),
    history,
    stats: {
      avg_time_s: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      p50: pct(50), p95: pct(95), p99: pct(99),
      avg_count: 0,   // b15 carries no row counts
    },
    jobId: selected?.jobId || undefined,
    relations: task.depends_on,
  }
}
