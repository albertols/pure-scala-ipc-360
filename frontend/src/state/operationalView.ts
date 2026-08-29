import { useSyncExternalStore } from 'react'
import type { CardDensity } from '../types'

export interface OperationalViewState {
  selectedClusters: string[]
  expandedCluster: string | null
  /** Recipes explicitly UNCHECKED inside an expanded cluster. Empty means "all of them". */
  deselectedRecipes: string[]
  /** Dates explicitly checked in the pane. Empty means "no date filter". */
  selectedDates: string[]
  density: CardDensity
  zoom: number
  pan: { x: number; y: number }
  selectedNode: string | null
  selectedDate: string | null
  selectedRunDate: string | null
  paneWidth: number
  paneCollapsed: boolean
  /** Hides the TIME VIEW bar entirely, freeing its ~46px for the canvas. */
  timeViewCollapsed: boolean
  /** Where the operator has been, newest last. See `visitNode`. */
  nodeHistory: NodeVisit[]
  /** Cursor into `nodeHistory`; -1 when empty. */
  historyIndex: number
}

/**
 * One stop on the navigation trail: the node, and the canvas view it was seen at.
 *
 * The view matters as much as the node. Following a lineage three hops deep and pressing back
 * used to be impossible at all; restoring only the SELECTION would auto-pan somewhere subtly
 * different from where the operator left off, which is most of what "losing your place" is.
 */
export interface NodeVisit {
  nodeId: string
  zoom: number
  pan: { x: number; y: number }
}

/** Matches Tab 2's undo stack, so the app has ONE answer to "how far back does history go". */
export const HISTORY_CAP = 25

const STORAGE_KEY = 'etl360.tab3.view'

/** Durable preferences. Everything else is session-lived: a selection should not outlive a reload. */
export const PERSISTED_KEYS = ['density', 'paneWidth', 'paneCollapsed', 'timeViewCollapsed'] as const

const DEFAULTS: OperationalViewState = {
  selectedClusters: [], expandedCluster: null, deselectedRecipes: [], selectedDates: [],
  density: 'detailed', zoom: 0.85, pan: { x: 40, y: 40 },
  selectedNode: null, selectedDate: null, selectedRunDate: null,
  paneWidth: 260, paneCollapsed: false, timeViewCollapsed: false,
  nodeHistory: [], historyIndex: -1,
}

const DENSITY_LEVELS: readonly CardDensity[] = ['detailed', 'compact', 'minimal']
/** Same bounds ClusterPane's resize drag clamps to — the persisted value must not outrun them. */
const MIN_PANE_W = 200
const MAX_PANE_W = 420

/**
 * Per-key validation of the persisted blob, mirroring `useResizableLayout.ts`'s `readStoredSizes`
 * and for the same reason: a stored key can carry a value of the wrong type or an out-of-range
 * one (hand-edited devtools, a schema change, an older build). `density` is the sharp case — it
 * indexes `DENSITY_PITCH` in `relationshipsAdapter.ts`, and BOTH readers destructure the result,
 * so an unknown level is a TypeError on every render: Tab 3 white-screens on load, and because
 * the bad value is in localStorage it does so again on every reload, with no in-app way out.
 */
const VALIDATORS: { [K in typeof PERSISTED_KEYS[number]]: (v: unknown) => OperationalViewState[K] | undefined } = {
  density: v => (typeof v === 'string' && (DENSITY_LEVELS as readonly string[]).includes(v))
    ? v as CardDensity : undefined,
  paneWidth: v => (typeof v === 'number' && Number.isFinite(v))
    ? Math.max(MIN_PANE_W, Math.min(MAX_PANE_W, v)) : undefined,
  paneCollapsed: v => typeof v === 'boolean' ? v : undefined,
  timeViewCollapsed: v => typeof v === 'boolean' ? v : undefined,
}

function hydrate(): OperationalViewState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const stored = JSON.parse(raw) as Record<string, unknown>
    const picked: Record<string, unknown> = {}
    for (const key of PERSISTED_KEYS) {
      const value = VALIDATORS[key](stored[key])
      if (value !== undefined) picked[key] = value
    }
    return { ...DEFAULTS, ...picked }
  } catch {
    return { ...DEFAULTS }   // corrupt or unavailable storage must never break the tab
  }
}

let state: OperationalViewState = hydrate()
const listeners = new Set<() => void>()

function persist() {
  try {
    const out: Record<string, unknown> = {}
    for (const key of PERSISTED_KEYS) out[key] = state[key]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(out))
  } catch { /* private mode / quota — the view still works, it just will not be remembered */ }
}

export function setOperationalView(patch: Partial<OperationalViewState>): void {
  state = { ...state, ...patch }
  if (PERSISTED_KEYS.some(k => k in patch)) persist()
  listeners.forEach(l => l())
}

/**
 * Record a visit and select it.
 *
 * Truncates any FORWARD entries first: a new hop taken from the middle of the stack forks the
 * history, exactly as a browser's back/forward does.
 *
 * Deliberately absent from PERSISTED_KEYS — a trail of selections must not outlive a reload,
 * the same policy `selectedClusters` follows.
 */
export function visitNode(visit: NodeVisit): void {
  const kept = state.nodeHistory.slice(0, state.historyIndex + 1)
  kept.push(visit)
  const capped = kept.slice(-HISTORY_CAP)
  setOperationalView({
    nodeHistory: capped,
    historyIndex: capped.length - 1,
    selectedNode: visit.nodeId,
  })
}

/** Step back (-1) or forward (+1), restoring the node AND the canvas view it was left at. */
export function stepHistory(delta: -1 | 1): void {
  const next = state.historyIndex + delta
  const visit = state.nodeHistory[next]
  if (!visit) return                       // no-op at either end, rather than a clamped no-change
  setOperationalView({
    historyIndex: next,
    selectedNode: visit.nodeId,
    zoom: visit.zoom,
    pan: visit.pan,
  })
}

/** Current state, outside React. For tests and for non-render callers; components use the hook. */
export function readOperationalView(): OperationalViewState {
  return state
}

/** Test-only: drop in-memory state and re-read localStorage. */
export function resetOperationalView(): void {
  state = hydrate()
  listeners.forEach(l => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useOperationalView(): OperationalViewState {
  return useSyncExternalStore(subscribe, () => state, () => state)
}
