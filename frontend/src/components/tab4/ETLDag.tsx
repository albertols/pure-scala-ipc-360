import { useState, useRef, useCallback, useMemo } from 'react'
import type { DagCluster, DagRun, DagTask } from '../../types'
import type { ApiError } from '../../api/client'
import type { B15RowT } from '../../api/dagAdapter'
import { useRelationships, useAppConfig, useOperationalDates, useOperational } from '../../api/queries'
import { useRuns } from '../../api/clusterQueries'
import { toDagClusters, clusterRuns, overlayRun, toOperationalCard } from '../../api/dagAdapter'
import { buildLoggingUrl, buildDataprocClusterUrl } from '../../api/gcpLinks'
import { pickDefaultRun } from '../shared/RunPicker'
import { TimePicker, type TimeSelection } from '../shared/TimePicker'
import { GCPIcon } from '../shared/GCPIcon'
import { InfoTooltip } from '../shared/InfoTooltip'
import { OperationalCard } from '../shared/OperationalCard'
import { CorpusSummary } from '../shared/CorpusSummary'
import { LoadingState } from '../shared/Spinner'

const STATUS_COLOR: Record<string, string> = {
  success: '#34d399',
  failed: '#f87171',
  running: '#fbbf24',
  skipped: '#4a5570',
}

const TASK_W = 180
const TASK_H = 62

// ─── DAG Explorer sidebar ─────────────────────────────────────────────────────

function DagExplorer({
  clusters,
  selectedDag,
  selectedTask,
  onSelectDag,
  onSelectTask,
  runCount,
}: {
  clusters: DagCluster[]
  selectedDag: string | null
  selectedTask: string | null
  onSelectDag: (id: string) => void
  onSelectTask: (dagId: string, taskId: string) => void
  /** Task 16: served snapshot date count — the DagExplorer footer's "K runs"
   * (spec §7.1's Tab 4 row). Not derived from `clusters` itself: a cluster's
   * own run history (`clusterRuns`) is per-DAG and only computed once a DAG
   * is selected, while the footer is always visible. */
  runCount: number
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toggle = (id: string) => setExpanded(e => ({ ...e, [id]: !e[id] }))

  function TaskRow({ task, dagId, depth = 0 }: { task: DagTask; dagId: string; depth?: number }) {
    const color = STATUS_COLOR[task.last_status] ?? '#4a5570'
    const isSel = selectedTask === task.task_id && selectedDag === dagId
    const hasSubDag = Boolean(task.sub_dag)
    const subKey = `${dagId}:${task.task_id}`
    const subExpanded = expanded[subKey]

    return (
      <>
        <div
          onClick={() => onSelectTask(dagId, task.task_id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: `5px 10px 5px ${10 + depth * 14}px`,
            cursor: 'pointer', borderRadius: 3,
            background: isSel ? 'var(--surface-3)' : 'transparent',
            color: isSel ? '#e2e8f8' : '#7b88aa',
          }}
          className="tree-item"
        >
          {hasSubDag && (
            <span onClick={e => { e.stopPropagation(); toggle(subKey) }} style={{ cursor: 'pointer', flexShrink: 0 }}>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <path d={subExpanded ? 'M1 2.5l3.5 4 3.5-4' : 'M2.5 1l4 3.5-4 3.5'} stroke="#4a5570" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
          )}
          {!hasSubDag && <span style={{ width: 9 }} />}
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0,
            boxShadow: task.last_status === 'running' ? `0 0 5px ${color}` : 'none' }} />
          <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {task.task_id}
          </span>
          {task.duration_s > 0 && (
            <span style={{ fontSize: 9, color: '#3a4560', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>
              {task.duration_s}s
            </span>
          )}
        </div>
        {hasSubDag && subExpanded && task.sub_dag?.tasks.map(st => (
          <TaskRow key={st.task_id} task={st} dagId={dagId} depth={depth + 1} />
        ))}
      </>
    )
  }

  return (
    <div style={{
      width: 248, flexShrink: 0,
      background: 'var(--surface)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 6, alignItems: 'center' }}>
        <GCPIcon service="airflow" size={14} />
        <span style={{ fontSize: 10, fontWeight: 600, color: '#4a5570', textTransform: 'uppercase', letterSpacing: '0.08em' }}>DAG Explorer</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '6px 4px' }}>
        {clusters.map(dag => {
          const color = STATUS_COLOR[dag.status]
          const isSelDag = selectedDag === dag.dag_id
          const dagExpanded = expanded[dag.dag_id] !== false
          return (
            <div key={dag.dag_id}>
              <div
                onClick={() => { onSelectDag(dag.dag_id); toggle(dag.dag_id) }}
                className="tree-item"
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '7px 10px', cursor: 'pointer', borderRadius: 4,
                  background: isSelDag ? 'var(--surface-2)' : 'transparent',
                  borderLeft: isSelDag ? `2px solid ${color}` : '2px solid transparent',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d={dagExpanded ? 'M1 3l4 4 4-4' : 'M3 1l4 4-4 4'} stroke="#4a5570" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: isSelDag ? '#e2e8f8' : '#9aaac8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {dag.dag_id}
                  </div>
                  <div style={{ fontSize: 9, color: '#3a4560', fontFamily: 'JetBrains Mono, monospace' }}>{dag.schedule}</div>
                </div>
              </div>
              {dagExpanded && dag.tasks.map(t => (
                <TaskRow key={t.task_id} task={t} dagId={dag.dag_id} />
              ))}
            </div>
          )
        })}
      </div>
      {/* Task 16: view-aware corpus summary, DagExplorer footer (spec §7.1's
          Tab 4 row) — N clusters · M tasks · K runs. */}
      <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '8px 12px' }}>
        <CorpusSummary items={[
          { label: 'clusters', value: clusters.length },
          { label: 'tasks', value: clusters.reduce((n, c) => n + c.tasks.length, 0) },
          { label: 'runs', value: runCount },
        ]} />
      </div>
    </div>
  )
}

// ─── DAG Canvas ───────────────────────────────────────────────────────────────

function TaskNode({
  task, selected, onClick,
}: {
  task: DagTask; selected: boolean; onClick: () => void
}) {
  const color = STATUS_COLOR[task.last_status] ?? '#4a5570'
  const isSubDag = Boolean(task.sub_dag)

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      <rect x={task.x ?? 0} y={task.y ?? 0} width={TASK_W} height={TASK_H} rx={6}
        fill="rgba(0,0,0,0.4)" transform="translate(2,3)" />
      <rect x={task.x ?? 0} y={task.y ?? 0} width={TASK_W} height={TASK_H} rx={6}
        fill="var(--surface-2)"
        stroke={selected ? color : '#2a3050'}
        strokeWidth={selected ? 2 : 1}
      />
      <rect x={task.x ?? 0} y={task.y ?? 0} width={5} height={TASK_H} rx={3}
        fill={color} />
      <text x={(task.x ?? 0) + 14} y={(task.y ?? 0) + 18} fill="#e2e8f8"
        style={{ fontFamily: 'Inter, sans-serif', fontSize: 10.5, fontWeight: 700 }}>
        <title>{task.task_id}</title>
        {task.task_id.length > 20 ? task.task_id.slice(0, 19) + '…' : task.task_id}
      </text>
      <text x={(task.x ?? 0) + 14} y={(task.y ?? 0) + 31} fill="#4a5570"
        style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9 }}>
        {task.recipe_id.length > 22 ? task.recipe_id.slice(0, 21) + '…' : task.recipe_id}
      </text>
      <text x={(task.x ?? 0) + 14} y={(task.y ?? 0) + 46} fill="#3a4560"
        style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9 }}>
        {task.last_status}{task.duration_s > 0 ? ` · ${task.duration_s}s` : ''}
      </text>
      {isSubDag && (
        <>
          <rect x={(task.x ?? 0) + TASK_W - 26} y={(task.y ?? 0) + 8} width={18} height={14} rx={3}
            fill="rgba(79,156,249,0.15)" stroke="rgba(79,156,249,0.3)" strokeWidth={1} />
          <text x={(task.x ?? 0) + TASK_W - 17} y={(task.y ?? 0) + 18} textAnchor="middle" fill="#4f9cf9"
            style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, fontWeight: 700 }}>SD</text>
        </>
      )}
    </g>
  )
}

function DagCanvas({
  dag,
  selectedTask,
  onSelectTask,
}: {
  dag: DagCluster | null
  selectedTask: string | null
  onSelectTask: (id: string) => void
}) {
  const [pan, setPan] = useState({ x: 40, y: 40 })
  const [zoom, setZoom] = useState(1)
  const dragging = useRef(false)
  const lastPan = useRef({ x: 0, y: 0 })

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.max(0.3, Math.min(2.5, z - e.deltaY * 0.001)))
  }, [])
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest('g[style*="pointer"]')) return
    dragging.current = true
    lastPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }, [pan])
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    setPan({ x: e.clientX - lastPan.current.x, y: e.clientY - lastPan.current.y })
  }, [])
  const onMouseUp = useCallback(() => { dragging.current = false }, [])

  if (!dag) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5570', flexDirection: 'column', gap: 8 }}>
        <GCPIcon service="airflow" size={36} />
        <span style={{ fontSize: 12 }}>Select a DAG from the explorer</span>
      </div>
    )
  }

  const allTasks = dag.tasks
  const canvasW = Math.max(...allTasks.map(t => (t.x ?? 0) + TASK_W), 500) + 80
  const canvasH = Math.max(...allTasks.map(t => (t.y ?? 0) + TASK_H), 300) + 80
  const taskMap = Object.fromEntries(allTasks.map(t => [t.task_id, t]))

  const edges: { x1: number; y1: number; x2: number; y2: number; hi: boolean }[] = []
  allTasks.forEach(t => {
    t.depends_on.forEach(depId => {
      const dep = taskMap[depId]
      if (!dep) return
      const hi = selectedTask === t.task_id || selectedTask === depId
      edges.push({
        x1: (dep.x ?? 0) + TASK_W,
        y1: (dep.y ?? 0) + TASK_H / 2,
        x2: t.x ?? 0,
        y2: (t.y ?? 0) + TASK_H / 2,
        hi,
      })
    })
  })

  return (
    <div
      style={{ flex: 1, background: 'var(--bg)', position: 'relative', overflow: 'hidden', cursor: 'grab' }}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs>
          <pattern id="ddot" x={pan.x % 22} y={pan.y % 22} width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="11" cy="11" r="0.7" fill="rgba(42,48,80,0.8)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ddot)" />
      </svg>

      <svg
        width={canvasW * zoom} height={canvasH * zoom}
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        style={{ transform: `translate(${pan.x}px,${pan.y}px)`, position: 'absolute', overflow: 'visible' }}
      >
        <defs>
          <marker id="da" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
            <path d="M0 1 L6 3.5 L0 6 Z" fill="#2a3050" />
          </marker>
          <marker id="da-hi" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
            <path d="M0 1 L6 3.5 L0 6 Z" fill="#4f9cf9" />
          </marker>
        </defs>

        {edges.map((e, i) => {
          const dx = Math.abs(e.x2 - e.x1) * 0.45
          return (
            <path key={i}
              d={`M ${e.x1} ${e.y1} C ${e.x1 + dx} ${e.y1} ${e.x2 - dx} ${e.y2} ${e.x2} ${e.y2}`}
              fill="none" stroke={e.hi ? '#4f9cf9' : '#2a3050'} strokeWidth={e.hi ? 1.8 : 1.2}
              markerEnd={e.hi ? 'url(#da-hi)' : 'url(#da)'}
            />
          )
        })}

        {allTasks.map(t => (
          <TaskNode key={t.task_id} task={t}
            selected={selectedTask === t.task_id}
            onClick={() => onSelectTask(t.task_id)}
          />
        ))}
      </svg>

      {/* zoom */}
      <div style={{ position: 'absolute', bottom: 14, right: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[{ i: '+', f: () => setZoom(z => Math.min(2.5, z + 0.2)) }, { i: '−', f: () => setZoom(z => Math.max(0.3, z - 0.2)) }, { i: '⊡', f: () => { setZoom(1); setPan({ x: 40, y: 40 }) } }].map(({ i, f }) => (
          <button key={i} onClick={f} style={{
            width: 27, height: 27, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 5, color: '#7b88aa', cursor: 'pointer', fontSize: i === '⊡' ? 11 : 15,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace',
          }}>{i}</button>
        ))}
      </div>
      <div style={{
        position: 'absolute', bottom: 14, left: 14,
        padding: '2px 7px', background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 4, fontSize: 10, color: '#4a5570', fontFamily: 'JetBrains Mono, monospace',
      }}>{Math.round(zoom * 100)}%</div>
    </div>
  )
}

// ─── Replay Panel ─────────────────────────────────────────────────────────────

function ReplayModal({ dagId, taskId, onClose, onConfirm }: {
  dagId: string; taskId: string; onClose: () => void; onConfirm: () => void
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '24px 28px', width: 380,
        boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <GCPIcon service="pubsub" size={20} />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f8' }}>Confirm Replay</span>
        </div>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#7b88aa', lineHeight: 1.6 }}>
          This will publish a replay message to the GCP Pub/Sub topic <code style={{ color: '#4f9cf9', fontSize: 11 }}>etl-replay-trigger</code>.
        </p>
        <div style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '10px 12px', marginBottom: 16, fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
        }}>
          <div style={{ color: '#4a5570', marginBottom: 4 }}>Payload preview:</div>
          <pre style={{ margin: 0, color: '#c8d3e8', lineHeight: 1.6 }}>{JSON.stringify({ dag_id: dagId, task_id: taskId, replay_from: taskId, triggered_by: 'etl360-ui', ts: new Date().toISOString() }, null, 2)}</pre>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{
            padding: '6px 16px', borderRadius: 5, background: 'transparent',
            border: '1px solid var(--border)', color: '#7b88aa', cursor: 'pointer', fontSize: 12,
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            padding: '6px 16px', borderRadius: 5,
            background: 'rgba(234,67,53,0.15)', border: '1px solid rgba(234,67,53,0.4)',
            color: '#ea4335', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <GCPIcon service="pubsub" size={13} />
            Publish Replay
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Run History ──────────────────────────────────────────────────────────────

function RunHistory({ runs, selectedDate, onSelectRun, loading }: {
  runs: DagRun[]; selectedDate: string; onSelectRun: (date: string) => void; loading?: boolean
}) {
  const color: Record<string, string> = { success: '#34d399', failed: '#f87171', running: '#fbbf24', skipped: '#4a5570' }

  return (
    <div>
      <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
        Run History <InfoTooltip text="Last executions of this DAG. Click any run to view details." placement="right" />
        {loading && <span style={{ color: 'var(--text-muted)' }}>(loading…)</span>}
      </div>
      <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
        {runs.map(r => (
          <div key={r.run_id} title={`${r.run_id} — ${r.status} (${r.duration_s}s)`}
            onClick={() => onSelectRun(r.run_id)}
            style={{
              width: 18, height: 28, borderRadius: 3, background: color[r.status] ?? '#4a5570',
              cursor: 'pointer', opacity: 0.85,
              outline: r.run_id === selectedDate ? '1px solid #4f9cf9' : 'none',
            }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[...runs].reverse().map(r => (
          <div key={r.run_id}
            onClick={() => onSelectRun(r.run_id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 8px', background: 'var(--surface-2)', borderRadius: 4,
              fontSize: 10, cursor: 'pointer',
              border: r.run_id === selectedDate ? '1px solid #4f9cf9' : '1px solid transparent',
            }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: color[r.status], flexShrink: 0 }} />
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#7b88aa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.run_id}</span>
            <span style={{ color: '#4a5570', fontFamily: 'JetBrains Mono, monospace' }}>{r.duration_s}s</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ETLDag() {
  const [selectedDagId, setSelectedDagId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [replayModal, setReplayModal] = useState<{ dagId: string; taskId: string } | null>(null)
  const [replaySuccess, setReplaySuccess] = useState<string | null>(null)
  const [timeVal, setTimeVal] = useState<TimeSelection>({
    date: new Date().toISOString().slice(0, 10),
    hour: new Date().getUTCHours(),
    precision: 'hour',
    isNow: true,
  })

  const rel = useRelationships()
  const relError = rel.error as ApiError | null
  const clusters = useMemo(() => (rel.data ? toDagClusters(rel.data) : []), [rel.data])

  const dag = clusters.find(d => d.dag_id === selectedDagId) ?? null

  const datesQ = useOperationalDates()
  const dates = useMemo(() => [...(datesQ.data?.dates ?? [])].sort(), [datesQ.data])
  const latest = dates.at(-1) ?? ''
  const selectedDate = timeVal.isNow ? latest : timeVal.date   // "Now" = latest available snapshot

  const snapshot = useOperational(selectedDate)                       // one date, every recipe
  const rowsForDate = (snapshot.data?.rows ?? []) as B15RowT[]
  const taskIds = useMemo(() => dag?.tasks.map(t => t.task_id) ?? [], [dag])
  const { byRecipe, isLoading: runsLoading, isError: runsError } = useRuns(taskIds, 10)   // selected DAG only
  const [selectedRunDate, setSelectedRunDate] = useState<string | null>(null)

  const litDag = useMemo(() => dag ? overlayRun(dag, rowsForDate) : null,
    [dag, rowsForDate])
  const litClusters = useMemo(() => clusters.map(c => overlayRun(c, rowsForDate)),
    [clusters, rowsForDate])
  const selectedTask = litDag?.tasks.find(t => t.task_id === selectedTaskId) ?? null

  const config = useAppConfig().data
  const selRow = rowsForDate.find(r => r.recipeFilename === selectedTask?.task_id)
  const selectedTaskRuns = byRecipe[selectedTask?.task_id ?? ''] ?? []
  const selectedRun = pickDefaultRun(selectedTaskRuns, selectedRunDate ?? selectedDate)
  const card = selectedTask ? toOperationalCard(selectedTask, selectedTaskRuns, selectedDate) : null

  // MOCK ONLY (by design — spec §2 non-goals): "Replay" publishes nothing. No Pub/Sub,
  // no backend call; the toast below is the entire effect. Kept so the prototype
  // interaction survives the real-data rewiring. Ledger: frontend/AGENTS.md.
  const handleConfirmReplay = () => {
    setReplayModal(null)
    setReplaySuccess(`Replay published for ${replayModal?.taskId} → etl-replay-trigger`)
    setTimeout(() => setReplaySuccess(null), 4000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* toolbar */}
      <div style={{
        padding: '8px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <GCPIcon service="airflow" size={16} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f8' }}>DAG Orchestration</span>
        </div>
        <div style={{ height: 20, width: 1, background: 'var(--border)' }} />
        <TimePicker value={timeVal} onChange={setTimeVal} />
        <div style={{ flex: 1 }} />

        {replaySuccess && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', background: 'rgba(52,211,153,0.1)',
            border: '1px solid rgba(52,211,153,0.3)', borderRadius: 5,
            fontSize: 11, color: '#34d399',
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {replaySuccess}
          </div>
        )}
      </div>

      {/* body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {rel.isLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LoadingState label="Loading workflows…" />
        </div>
      ) : relError ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4, color: 'var(--red)', fontSize: 12 }}>
          <div>{relError.title}</div>
          {relError.detail && <div>{relError.detail}</div>}
        </div>
      ) : clusters.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5570', flexDirection: 'column', gap: 8 }}>
          <GCPIcon service="airflow" size={36} />
          <span style={{ fontSize: 12 }}>No workflows in the relationships graph</span>
        </div>
      ) : (
        <>
        <DagExplorer
          clusters={litClusters}
          selectedDag={selectedDagId}
          selectedTask={selectedTaskId}
          onSelectDag={id => { setSelectedDagId(id); setSelectedTaskId(null); setSelectedRunDate(null) }}
          onSelectTask={(dagId, taskId) => { setSelectedDagId(dagId); setSelectedTaskId(taskId); setSelectedRunDate(null) }}
          runCount={dates.length}
        />

        <DagCanvas
          dag={litDag}
          selectedTask={selectedTaskId}
          onSelectTask={id => { setSelectedTaskId(id === selectedTaskId ? null : id); setSelectedRunDate(null) }}
        />

        {/* task detail panel */}
        {selectedTask && (
          <div style={{
            width: 300, flexShrink: 0,
            background: 'var(--surface)', borderLeft: '1px solid var(--border)',
            overflow: 'auto', padding: '16px',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: STATUS_COLOR[selectedTask.last_status] ?? '#4a5570' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedTask.task_id}
              </span>
              <button onClick={() => setSelectedTaskId(null)}
                style={{ background: 'none', border: 'none', color: '#4a5570', cursor: 'pointer' }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2 2l9 9M11 2L2 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* task meta */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {([
                ['Recipe', selectedTask.recipe_id],
                ['Status', selectedTask.last_status],
                ['Duration', selectedTask.duration_s > 0 ? `${selectedTask.duration_s}s` : '—'],
                ['Depends on', selectedTask.depends_on.join(', ') || 'none'],
                ...(selRow?.message ? [['Message', selRow.message || '—']] : []),
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 8 }}>
                  <span style={{ fontSize: 10, color: '#4a5570', width: 68, flexShrink: 0 }}>{k}</span>
                  <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#c8d3e8', wordBreak: 'break-all' }}>{v}</span>
                </div>
              ))}
            </div>

            {/* GCP links — cluster/job id anchored to the run selected in the picker
                below, falling back to the raw selected-date row when no run is picked. */}
            {(selectedRun || selRow) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a
                  href={buildDataprocClusterUrl(config,
                    { clusterName: selectedRun?.clusterName ?? selRow?.clusterName ?? '' })}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 10, color: '#4f9cf9', textDecoration: 'none',
                    background: 'rgba(79,156,249,0.1)', padding: '2px 7px',
                    borderRadius: 4, border: '1px solid rgba(79,156,249,0.25)',
                  }}
                >
                  <GCPIcon service="dataproc" size={11} />
                  cluster ↗
                </a>
                <a
                  href={buildLoggingUrl(config, {
                    jobId: selectedRun?.jobId ?? selRow?.jobId ?? '',
                    cursorTimestamp: selectedRun?.appStartIso ?? '',
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 10, color: '#4f9cf9', textDecoration: 'none',
                    background: 'rgba(79,156,249,0.1)', padding: '2px 7px',
                    borderRadius: 4, border: '1px solid rgba(79,156,249,0.25)',
                  }}
                >
                  <GCPIcon service="logging" size={11} />
                  logs ↗
                </a>
              </div>
            )}

            {/* replay controls */}
            {selectedDagId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 10, color: '#4a5570', display: 'flex', alignItems: 'center', gap: 4 }}>
                  Replay Controls
                  <InfoTooltip text="Publishes a Pub/Sub message to the etl-replay-trigger topic. The Airflow DAG listener will re-queue the selected branch." placement="right" />
                </div>
                <button
                  onClick={() => setReplayModal({ dagId: selectedDagId, taskId: selectedTask.task_id })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 14px', borderRadius: 6,
                    background: 'rgba(234,67,53,0.1)', border: '1px solid rgba(234,67,53,0.35)',
                    color: '#f87171', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  }}
                >
                  <GCPIcon service="pubsub" size={14} />
                  Replay from this task ▶
                </button>
                <button
                  onClick={() => setReplayModal({ dagId: selectedDagId, taskId: selectedTask.task_id + '-branch' })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 14px', borderRadius: 6,
                    background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)',
                    color: '#fbbf24', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  }}
                >
                  <GCPIcon service="pubsub" size={14} />
                  Replay full branch ▶
                </button>
              </div>
            )}

            {/* operational card */}
            {card && (
              <div>
                <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 8 }}>Operational State</div>
                <OperationalCard
                  card={card}
                  config={config}
                  runs={selectedTaskRuns}
                  selectedRunDate={selectedRunDate ?? selectedDate}
                  onSelectRun={r => setSelectedRunDate(r.date ?? null)}
                />
              </div>
            )}

            {/* sub-dag */}
            {selectedTask.sub_dag && (
              <div>
                <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 6 }}>Sub-DAG: {selectedTask.sub_dag.dag_id}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {selectedTask.sub_dag.tasks.map(st => (
                    <div key={st.task_id} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 8px', background: 'var(--surface-2)',
                      borderRadius: 4, fontSize: 10,
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[st.last_status] }} />
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#7b88aa' }}>{st.task_id}</span>
                      <span style={{ marginLeft: 'auto', color: '#3a4560', fontFamily: 'JetBrains Mono, monospace' }}>{st.duration_s}s</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* run history */}
            {selectedDagId && (
              runsError ? (
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  Run history failed to load.
                </div>
              ) : (
                <RunHistory
                  runs={dag ? clusterRuns(dag, dates, byRecipe) : []}
                  selectedDate={selectedDate}
                  onSelectRun={d => setTimeVal(v => ({ ...v, date: d, isNow: false }))}
                  loading={runsLoading}
                />
              )
            )}
          </div>
        )}
      </>
      )}
      </div>

      {replayModal && (
        <ReplayModal
          dagId={replayModal.dagId}
          taskId={replayModal.taskId}
          onClose={() => setReplayModal(null)}
          onConfirm={handleConfirmReplay}
        />
      )}
    </div>
  )
}
