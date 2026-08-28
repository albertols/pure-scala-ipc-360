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
}

const STORAGE_KEY = 'etl360.tab3.view'

/** Durable preferences. Everything else is session-lived: a selection should not outlive a reload. */
export const PERSISTED_KEYS = ['density', 'paneWidth', 'paneCollapsed'] as const

const DEFAULTS: OperationalViewState = {
  selectedClusters: [], expandedCluster: null, deselectedRecipes: [], selectedDates: [],
  density: 'detailed', zoom: 0.85, pan: { x: 40, y: 40 },
  selectedNode: null, selectedDate: null, selectedRunDate: null,
  paneWidth: 260, paneCollapsed: false,
}

function hydrate(): OperationalViewState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const stored = JSON.parse(raw) as Partial<OperationalViewState>
    const picked: Partial<OperationalViewState> = {}
    for (const key of PERSISTED_KEYS) {
      if (stored[key] !== undefined) (picked as Record<string, unknown>)[key] = stored[key]
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
