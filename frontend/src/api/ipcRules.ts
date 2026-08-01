// ─── Conformance chip data layer (Task 13) ─────────────────────────────────
//
// Ruled deviation from spec §6.5 (human ruling, pre-flight scan 2026-08-01):
// the spec's local TypeScript mirror of the `IPC-STR-*` rules is dropped —
// nine rules maintained twice across two languages, for a localhost latency
// saving of single-digit ms. This file's `useValidation` is the ONLY source
// of conformance state; it runs the full backend catalogue via the debounced
// `POST /api/recipes/validate` and nothing here re-implements a rule.

import { useEffect, useRef, useState } from 'react'
import { apiSend } from './client'
import type { IpcCheck, RecipeValidation, RecipeValidationError } from './queries'
import type { RecipeJson } from './recipeAdapter'
import type { CanvasGraph } from './mappingAdapter'

/** Debounce interval between a draft edit settling and the validate POST
 * firing — same idiom as ETLModifier's layout-save debounce (Task 10): a
 * private timer ref, cleared on both dep-change and unmount, so a keystroke
 * mid-debounce never fires two overlapping requests. */
export const VALIDATE_DEBOUNCE_MS = 400

export interface ValidationState {
  checks: IpcCheck[]
  errors: RecipeValidationError[]
  warnings: RecipeValidationError[]
  isValidating: boolean
}

const EMPTY_STATE: ValidationState = { checks: [], errors: [], warnings: [], isValidating: false }

/**
 * Debounced `POST /api/recipes/validate` against the current draft. This is
 * the sole source of conformance state for the chip/drawer/node dots — no
 * local rule mirror (see the file-header ruling above).
 *
 * Correctness (Task 10 shipped a data-loss bug in this exact area — an
 * unrelated query's data folded into a shared effect's dependency array wiped
 * unsaved edits): this hook's timer lives entirely inside ITS OWN effect,
 * keyed only on `draft`, and touches no state outside this hook. The timer is
 * cleared both when `draft` changes again before it fires AND on unmount
 * (the same cleanup function handles both, as React always runs it before the
 * next effect and once more on unmount).
 */
export function useValidation(draft: RecipeJson | null): ValidationState {
  const [state, setState] = useState<ValidationState>(EMPTY_STATE)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }

    if (!draft) {
      setState(EMPTY_STATE)
      return
    }

    let cancelled = false
    setState(s => ({ ...s, isValidating: true }))

    timer.current = setTimeout(() => {
      timer.current = null
      apiSend<RecipeValidation>('POST', '/recipes/validate', draft)
        .then(result => {
          if (cancelled) return
          setState({
            checks: result.checks ?? [],
            errors: result.errors ?? [],
            warnings: result.warnings ?? [],
            isValidating: false,
          })
        })
        .catch(() => {
          if (cancelled) return
          setState(s => ({ ...s, isValidating: false }))
        })
    }, VALIDATE_DEBOUNCE_MS)

    return () => {
      cancelled = true
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
    }
  }, [draft])

  return state
}

/**
 * `$.steps[N]…` -> the Nth canvas node's id. `recipeToCanvas` (recipeAdapter.ts)
 * pushes exactly one node per step target, in step order, before appending any
 * source-table nodes afterward — so the Nth entry of `graph.nodes` is the node
 * for `draft.steps[N]` as long as that step has a resolvable target (the
 * common case; a step missing a name/duplicate id is itself a separate rule
 * violation with its own path). Any other path shape (`$.table…`), an
 * out-of-range index, or a missing graph resolves to `undefined` rather than
 * a wrong or crashing lookup.
 */
export function nodeIdFromPath(path: string | undefined, graph: CanvasGraph | null): string | undefined {
  if (!path || !graph) return undefined
  const match = /^\$\.steps\[(\d+)\]/.exec(path)
  if (!match) return undefined
  return graph.nodes[Number(match[1])]?.id
}

/**
 * Per-node conformance status for `IpcCanvas`'s `nodeStatus` prop (Task 8's
 * contract). Only FAILING checks contribute — a node with no failing check
 * gets no entry at all (IpcCanvas omits its dot entirely rather than drawing
 * an 'ok' dot on every node). When a node has both an error- and a
 * warning-severity failure, error wins regardless of check order.
 */
export function nodeStatusFrom(checks: IpcCheck[], graph: CanvasGraph | null): Record<string, 'ok' | 'warn' | 'error'> {
  const result: Record<string, 'ok' | 'warn' | 'error'> = {}
  for (const check of checks) {
    if (check.status !== 'fail') continue
    const nodeId = nodeIdFromPath(check.path, graph)
    if (!nodeId) continue
    if (result[nodeId] === 'error') continue
    result[nodeId] = check.severity === 'error' ? 'error' : 'warn'
  }
  return result
}
