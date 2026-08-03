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
  /** True when the most recent `POST /api/recipes/validate` rejected (500,
   * timeout, backend down) rather than settling. `checks`/`errors`/`warnings`
   * are NOT to be trusted while this is true — they reflect either the empty
   * state or a stale prior success, never the current draft.
   *
   * EVERY caller must render a neutral "unavailable" state and must not fall
   * through to an `errors.length`-driven green/amber/red — a failed check is
   * not the same as a clean one. There are exactly TWO consumers today, and
   * both shipped this exact fallthrough before it was caught; a THIRD must
   * branch on `failed` FIRST, before `isValidating` and before the counts:
   *   - `ConformanceChip.tsx` — the toolbar chip + drawer (BLOCKER 2, first
   *     review round: rendered green on a failed validate).
   *   - `NodeConfigDialog.tsx` — the pre-add dialog's preview banner
   *     (BLOCKING 2, final whole-branch review: printed a green
   *     "0 errors · 0 warnings" beside an already-disabled Insert, because
   *     this javadoc enumerated only the chip).
   * `NodeConfigDialog`'s `canInsert` also consults `failed` directly — a
   * failed check never counts as a passed one for gating either. */
  failed: boolean
}

const EMPTY_STATE: ValidationState = { checks: [], errors: [], warnings: [], isValidating: false, failed: false }

/** Mirrors `ETLModifier.tsx`'s `reportLayoutSaveError` idiom: log-and-swallow,
 * since a validate failure must not throw into the render tree — the caller
 * degrades to a neutral chip instead. */
function reportValidationError(e: unknown): void {
  // eslint-disable-next-line no-console
  console.error('[ipcRules] validate request failed', e)
}

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
    // Optimistically clear a prior failure too: a fresh request is in flight
    // and may well succeed, so the last thing we KNOW (a failure) shouldn't
    // keep painting the chip neutral while we wait — it flips back to
    // `failed: true` below only if this attempt also rejects.
    setState(s => ({ ...s, isValidating: true, failed: false }))

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
            failed: false,
          })
        })
        .catch(e => {
          if (cancelled) return
          reportValidationError(e)
          // Drop any stale checks/errors/warnings from a prior success too —
          // a failed request contributes nothing, so nothing it can't vouch
          // for should linger in state for `failed` to accidentally unmask.
          setState({ checks: [], errors: [], warnings: [], isValidating: false, failed: true })
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

// ─── Fan-in verdicts (final whole-branch review, BLOCKING 3) ────────────────
//
// The one PowerCenter constraint the pairwise `connections.mayFeed` adjacency
// cannot express: a downstream input group takes either any number of passive
// inputs, or exactly one active input and nothing else alongside it. It lives
// in `IpcConnections.fanInVerdict` (backend) and is asked over
// `POST /api/ipc/fan-in` — deliberately NOT mirrored here, for the same reason
// this file's header ruling refuses a local TypeScript copy of the rule
// catalogue: one rule, one implementation. A client-side reimplementation
// would also have left `fanInVerdict` exactly as the review found it —
// computed, contract-tested, and called by nothing.

/** `"block"` asserts the link IS illegal and is the only value a caller may
 * refuse a connection on. `"warn"` means "cannot be determined" (a participant
 * whose `active` classification is null — `table`, `java`, `joinerInput`, or an
 * unknown kind) and must be surfaced WITHOUT blocking: refusing a link we
 * cannot prove illegal is worse than permitting one we cannot prove legal. */
export type FanInVerdict = 'ok' | 'warn' | 'block'

export interface FanInPairing {
  /** The caller's own correlation id, echoed back verbatim — the two pickers'
   * candidate names can collide, so the caller namespaces them. */
  key: string
  /** The group the candidate would JOIN, never including the candidate itself. */
  existingSourceKinds: string[]
  candidateKind: string
}

/** Mirrors `reportValidationError`: log-and-swallow. A fan-in outage degrades
 * to "no verdicts", i.e. nothing is constrained — never to a blocked picker. */
function reportFanInError(e: unknown): void {
  // eslint-disable-next-line no-console
  console.error('[ipcRules] fan-in request failed', e)
}

/**
 * Batched `POST /api/ipc/fan-in` for a whole picker at once — one request per
 * dialog state, not per candidate button. Batched because each candidate
 * carries its OWN existing input group (a "feeds" candidate's group is the
 * downstream step's `sources[]`, which differs per candidate), so a single
 * (group, candidate) question cannot answer a picker.
 *
 * Not debounced, unlike `useValidation`: `pairings` changes on discrete
 * selection toggles, never per keystroke.
 *
 * The effect is keyed on the SERIALIZED pairings, not the array identity — a
 * caller building the list inline would otherwise re-fire on every render.
 * Same self-containment discipline as `useValidation`: the request lives
 * entirely inside this hook's own effect and touches no state outside it.
 */
export function useFanIn(pairings: FanInPairing[]): Record<string, FanInVerdict> {
  const [verdicts, setVerdicts] = useState<Record<string, FanInVerdict>>({})
  const payload = JSON.stringify(pairings)

  useEffect(() => {
    const asked = JSON.parse(payload) as FanInPairing[]
    if (asked.length === 0) {
      setVerdicts({})
      return
    }
    let cancelled = false
    apiSend<{ verdicts?: Record<string, string> }>('POST', '/ipc/fan-in', { pairings: asked })
      .then(result => {
        if (cancelled) return
        setVerdicts((result.verdicts ?? {}) as Record<string, FanInVerdict>)
      })
      .catch(e => {
        if (cancelled) return
        reportFanInError(e)
        // Drop any stale verdicts from a prior success: a failed request
        // vouches for nothing, and an unanswered candidate is never blocked.
        setVerdicts({})
      })
    return () => { cancelled = true }
  }, [payload])

  return verdicts
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
