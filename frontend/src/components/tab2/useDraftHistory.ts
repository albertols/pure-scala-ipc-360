import { useState } from 'react'
import type { RecipeJson } from '../../api/recipeAdapter'

/** Sub-project 9, Task 5: bounded undo/redo for `ETLModifier`'s draft.
 *
 * Each entry is a `structuredClone` of an ENTIRE recipe — the largest corpus
 * recipe is ~1000 lines — so an unbounded stack is a real memory cost.
 * `HISTORY_CAP` bounds it, but the cap DROPS THE OLDEST entry rather than
 * refusing new pushes: a stack that stops recording after 25 edits would be
 * worse than useless.
 */
export const HISTORY_CAP = 25

interface HistoryState {
  past: RecipeJson[]
  future: RecipeJson[]
}

const EMPTY_HISTORY: HistoryState = { past: [], future: [] }

export function useDraftHistory(): {
  /** Called with the PRE-edit draft, before the mutation is applied. Appends
   * to `past` (dropping the oldest entry beyond `HISTORY_CAP`) and clears
   * `future` — standard editor semantics: a new edit after an undo discards
   * the redo branch. */
  push: (before: RecipeJson) => void
  /** Pops the most recent `past` entry, pushes `current` onto `future`, and
   * returns the popped (now-current) draft — or `null` when there is nothing
   * to undo. */
  undo: (current: RecipeJson) => RecipeJson | null
  /** Pops the most recent `future` entry, pushes `current` back onto `past`,
   * and returns the popped draft — or `null` when there is nothing to redo. */
  redo: (current: RecipeJson) => RecipeJson | null
  canUndo: boolean
  canRedo: boolean
  /** Discards both directions — called on recipe change, discard, and a
   * successful save (never merged into the draft-reset effect itself; see
   * ETLModifier.tsx's dedicated history-reset effect). */
  reset: () => void
} {
  // A single `{past, future}` state (rather than two refs + a re-render
  // counter) — canUndo/canRedo are derived straight from it, and every
  // mutation below reads `state` from this render's closure directly (not a
  // setState updater) since push/undo/redo/reset are only ever invoked once
  // per user action (a toolbar click, or applyEdit's single call site), so
  // the component has always re-rendered with fresh `state` by the next call.
  const [state, setState] = useState<HistoryState>(EMPTY_HISTORY)

  const push = (before: RecipeJson) => {
    const nextPast = [...state.past, structuredClone(before)]
    if (nextPast.length > HISTORY_CAP) nextPast.shift()
    setState({ past: nextPast, future: [] })
  }

  const undo = (current: RecipeJson): RecipeJson | null => {
    if (state.past.length === 0) return null
    const popped = state.past[state.past.length - 1]
    setState({
      past: state.past.slice(0, -1),
      future: [...state.future, structuredClone(current)],
    })
    return popped
  }

  const redo = (current: RecipeJson): RecipeJson | null => {
    if (state.future.length === 0) return null
    const popped = state.future[state.future.length - 1]
    setState({
      past: [...state.past, structuredClone(current)],
      future: state.future.slice(0, -1),
    })
    return popped
  }

  const reset = () => setState(EMPTY_HISTORY)

  return {
    push,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    reset,
  }
}
