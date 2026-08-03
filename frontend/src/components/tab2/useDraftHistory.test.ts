import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDraftHistory, HISTORY_CAP } from './useDraftHistory'
import type { RecipeJson } from '../../api/recipeAdapter'

/** A minimal, distinguishable draft snapshot — the field name is all these tests
 * check, mirroring how ETLModifier's real drafts differ only in their edited field. */
function recipe(n: number): RecipeJson {
  return { steps: [{ target: { name: `T${n}`, type: 'table', fields: [] } }], table: {} }
}

describe('useDraftHistory', () => {
  it('starts with nothing to undo or redo', () => {
    const { result } = renderHook(() => useDraftHistory())
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
    expect(result.current.undo(recipe(0))).toBeNull()
    expect(result.current.redo(recipe(0))).toBeNull()
  })

  it('push then undo returns the prior draft', () => {
    const { result } = renderHook(() => useDraftHistory())
    act(() => result.current.push(recipe(1)))
    expect(result.current.canUndo).toBe(true)

    let popped: RecipeJson | null = null
    act(() => { popped = result.current.undo(recipe(2)) })

    expect(popped).toEqual(recipe(1))
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(true)
  })

  it('undoes five consecutive edits in reverse order', () => {
    const { result } = renderHook(() => useDraftHistory())
    // Simulates applyEdit's usage: push the PRE-edit draft before each of five
    // edits, ending on recipe(6) as the "current" in-progress draft.
    for (let i = 1; i <= 5; i++) {
      act(() => result.current.push(recipe(i)))
    }

    let current = recipe(6)
    const popped: (RecipeJson | null)[] = []
    for (let i = 0; i < 5; i++) {
      act(() => {
        const p = result.current.undo(current)
        popped.push(p)
        if (p) current = p
      })
    }

    expect(popped).toEqual([recipe(5), recipe(4), recipe(3), recipe(2), recipe(1)])
    expect(result.current.canUndo).toBe(false)
  })

  it('redo returns forward after an undo', () => {
    const { result } = renderHook(() => useDraftHistory())
    act(() => result.current.push(recipe(1)))

    let current = recipe(2)
    act(() => { current = result.current.undo(current)! })
    expect(current).toEqual(recipe(1))

    let redone: RecipeJson | null = null
    act(() => { redone = result.current.redo(current) })

    expect(redone).toEqual(recipe(2))
    expect(result.current.canRedo).toBe(false)
    expect(result.current.canUndo).toBe(true)
  })

  it('pushing after an undo truncates the redo branch', () => {
    const { result } = renderHook(() => useDraftHistory())
    act(() => result.current.push(recipe(1)))

    let current = recipe(2)
    act(() => { current = result.current.undo(current)! })
    expect(result.current.canRedo).toBe(true)

    act(() => result.current.push(current))

    expect(result.current.canRedo).toBe(false)
    expect(result.current.redo(current)).toBeNull()
  })

  it('caps the stack at HISTORY_CAP, dropping the OLDEST entry rather than refusing new pushes', () => {
    const { result } = renderHook(() => useDraftHistory())
    for (let i = 1; i <= HISTORY_CAP + 5; i++) {
      act(() => result.current.push(recipe(i)))
    }

    let current = recipe(HISTORY_CAP + 6)
    const popped: (RecipeJson | null)[] = []
    for (let i = 0; i < HISTORY_CAP; i++) {
      act(() => {
        const p = result.current.undo(current)
        popped.push(p)
        if (p) current = p
      })
    }

    // All HISTORY_CAP undos must succeed (a refuse-new-pushes implementation would
    // ALSO satisfy this — the discriminating assertion is which entries survived).
    expect(popped.every(p => p !== null)).toBe(true)
    // The oldest 5 pushes (recipe(1)..recipe(5)) were dropped to make room — the
    // deepest surviving entry is recipe(6), not recipe(1).
    expect(popped[popped.length - 1]).toEqual(recipe(6))
    expect(result.current.canUndo).toBe(false)
    expect(result.current.undo(current)).toBeNull()
  })

  it('reset clears both directions', () => {
    const { result } = renderHook(() => useDraftHistory())
    act(() => result.current.push(recipe(1)))
    let current = recipe(2)
    act(() => { current = result.current.undo(current)! })
    expect(result.current.canRedo).toBe(true)

    act(() => result.current.reset())

    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
    expect(result.current.undo(recipe(3))).toBeNull()
    expect(result.current.redo(recipe(3))).toBeNull()
  })
})
