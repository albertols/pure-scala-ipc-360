import type { components } from './types.gen'
import type { DagCluster, DagRun, DagStatus, DagTask, OperationalCard, StatusType } from '../types'

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

export const DEFAULT_DATAPROC_JOB_URL = 'https://console.cloud.google.com/dataproc/jobs/{jobId}?project={project}&region={region}'
export const DEFAULT_DATAPROC_CLUSTER_URL = 'https://console.cloud.google.com/dataproc/clusters/{clusterName}?project={project}&region={region}'
export const DEFAULT_LOGGING_URL = 'https://console.cloud.google.com/logs/query;query=resource.labels.job_id%3D%22{jobId}%22?project={project}'
// ^ byte-mirrors backend application.yml gcp templates (the served AppConfigDto normally supplies them)

export function parseDurationSec(v: string | undefined): number {
  const m = /^(\d+)m\s+(\d+)sec$/.exec((v ?? '').trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

export function statusFromB15(status: string | undefined): DagStatus {
  const s = (status ?? '').trim().toUpperCase()
  return s === 'SUCCESS' ? 'success' : s === 'FAILED' ? 'failed' : s === 'RUNNING' ? 'running' : 'skipped'
}

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

export function clusterRuns(cluster: DagCluster, dates: string[],
    rowsByDate: Record<string, B15RowT[] | undefined>): DagRun[] {
  return [...dates].sort().map(date => {
    const lit = overlayRun(cluster, rowsByDate[date])
    return { run_id: date, dag_id: cluster.dag_id, status: lit.status,
             started_at: lit.last_run, duration_s: lit.tasks.reduce((s, t) => s + t.duration_s, 0) }
  })
}

const STATUS_UP: Record<DagStatus, StatusType> = { success: 'OK', failed: 'KO', running: 'RUNNING', skipped: 'PENDING' }

export function toOperationalCard(task: DagTask, dates: string[],
    rowsByDate: Record<string, B15RowT[] | undefined>, selectedDate: string): OperationalCard {
  const sorted = [...dates].sort()
  const rowFor = (d: string) => (rowsByDate[d] ?? []).find(r => r.recipeFilename === task.task_id)
  const history: StatusType[] = sorted.map(d => { const r = rowFor(d); return r ? STATUS_UP[statusFromB15(r.status)] : 'PENDING' })
  const durs = sorted.map(d => parseDurationSec(rowFor(d)?.avgJobDurationInMinsSec)).filter(n => n > 0).sort((a, b) => a - b)
  const pct = (p: number) => durs.length ? durs[Math.min(durs.length - 1, Math.max(0, Math.ceil((p / 100) * durs.length) - 1))] : 0
  const sel = rowFor(selectedDate)
  const lastIso = sorted.flatMap(d => { const r = rowFor(d); return r?.appStartIso ? [r.appStartIso] : [] }).at(-1)
  return {
    id: task.task_id, kind: 'recipe', name: task.task_id,
    layer: task.recipe_id.includes('/') ? task.recipe_id.slice(0, task.recipe_id.indexOf('/')) : '—',
    status: sel ? STATUS_UP[statusFromB15(sel.status)] : 'PENDING',
    lastRun: lastIso ?? new Date(0).toISOString(),
    history,
    stats: { avg_time_s: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0,
             p50: pct(50), p95: pct(95), p99: pct(99), avg_count: 0 },  // no row counts in b15 -> stats grid hides when 0-avg
    jobId: sel?.jobId || undefined, appId: sel?.jobId || undefined,     // b15 job_id IS the YARN application id
    relations: task.depends_on,
  }
}

export function fillGcpUrl(template: string | undefined, fallback: string, vars: Record<string, string>): string {
  return (template || fallback).replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(vars[k] ?? ''))
}
