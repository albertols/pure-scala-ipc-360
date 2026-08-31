import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useOperationalView,
  setOperationalView,
  resetOperationalView,
  PERSISTED_KEYS,
  visitNode,
  stepHistory,
  HISTORY_CAP,
} from './operationalView'

beforeEach(() => {
  localStorage.clear()
  resetOperationalView()
})
afterEach(() => {
  localStorage.clear()
})

describe('operationalView', () => {
  it('starts with an empty selection and detailed density', () => {
    const { result } = renderHook(() => useOperationalView())
    expect(result.current.selectedClusters).toEqual([])
    expect(result.current.density).toBe('detailed')
    expect(result.current.selectedNode).toBeNull()
  })

  it('patches only the given keys', () => {
    const { result } = renderHook(() => useOperationalView())
    act(() => setOperationalView({ selectedClusters: ['cl-a'] }))

    expect(result.current.selectedClusters).toEqual(['cl-a'])
    expect(result.current.density).toBe('detailed')
  })

  it('notifies every subscriber', () => {
    const a = renderHook(() => useOperationalView())
    const b = renderHook(() => useOperationalView())
    act(() => setOperationalView({ zoom: 0.5 }))

    expect(a.result.current.zoom).toBe(0.5)
    expect(b.result.current.zoom).toBe(0.5)
  })

  // The point of the store: unmounting Tab 3 must not lose the view.
  it('survives an unmount and remount', () => {
    const first = renderHook(() => useOperationalView())
    act(() =>
      setOperationalView({ selectedClusters: ['cl-a'], zoom: 1.4, selectedNode: 'recipe:x' }),
    )
    first.unmount()

    const second = renderHook(() => useOperationalView())
    expect(second.result.current.selectedClusters).toEqual(['cl-a'])
    expect(second.result.current.zoom).toBe(1.4)
    expect(second.result.current.selectedNode).toBe('recipe:x')
  })

  it('persists only the durable preference keys', () => {
    renderHook(() => useOperationalView())
    act(() =>
      setOperationalView({ density: 'minimal', paneWidth: 320, selectedClusters: ['cl-a'] }),
    )

    const stored = JSON.parse(localStorage.getItem('etl360.tab3.view') ?? '{}')
    expect(Object.keys(stored).sort()).toEqual([...PERSISTED_KEYS].sort())
    expect(stored.density).toBe('minimal')
    expect(stored.selectedClusters).toBeUndefined()
  })

  it('rehydrates persisted preferences on first read', () => {
    localStorage.setItem(
      'etl360.tab3.view',
      JSON.stringify({ density: 'compact', paneWidth: 300, paneCollapsed: true }),
    )
    resetOperationalView()

    const { result } = renderHook(() => useOperationalView())
    expect(result.current.density).toBe('compact')
    expect(result.current.paneWidth).toBe(300)
    expect(result.current.paneCollapsed).toBe(true)
  })

  it('ignores corrupt persisted state rather than throwing', () => {
    localStorage.setItem('etl360.tab3.view', 'not json')
    resetOperationalView()

    expect(renderHook(() => useOperationalView()).result.current.density).toBe('detailed')
  })

  // Item 2: `hydrate()` copied `stored[key]` on an `!== undefined` check alone. `density` is
  // persisted and reaches `DENSITY_PITCH[density]` at `relationshipsAdapter.ts:51,138`, both of
  // which DESTRUCTURE the result — so a bogus persisted value is a TypeError on every render,
  // i.e. Tab 3 white-screens on load with no in-app recovery. `useResizableLayout.ts:26-46`
  // already validates its own persisted blob per key for exactly this reason.
  it('rejects a persisted density outside the known levels', () => {
    localStorage.setItem('etl360.tab3.view', JSON.stringify({ density: 'gigantic' }))
    resetOperationalView()

    expect(renderHook(() => useOperationalView()).result.current.density).toBe('detailed')
  })

  it('rejects a persisted density of the wrong type entirely', () => {
    localStorage.setItem('etl360.tab3.view', JSON.stringify({ density: 42, paneCollapsed: 'yes' }))
    resetOperationalView()

    const { result } = renderHook(() => useOperationalView())
    expect(result.current.density).toBe('detailed')
    expect(result.current.paneCollapsed).toBe(false)
  })

  it("clamps a persisted paneWidth to the pane's own drag bounds", () => {
    localStorage.setItem('etl360.tab3.view', JSON.stringify({ paneWidth: 9000 }))
    resetOperationalView()
    expect(renderHook(() => useOperationalView()).result.current.paneWidth).toBe(420)

    localStorage.setItem('etl360.tab3.view', JSON.stringify({ paneWidth: 1 }))
    resetOperationalView()
    expect(renderHook(() => useOperationalView()).result.current.paneWidth).toBe(200)

    localStorage.setItem('etl360.tab3.view', JSON.stringify({ paneWidth: Number.NaN }))
    resetOperationalView()
    expect(renderHook(() => useOperationalView()).result.current.paneWidth).toBe(260)
  })

  // Private-mode Safari throws from the localStorage ACCESSOR itself, not just from setItem —
  // untested until now, and this store reads storage at module load.
  it('survives a localStorage accessor that throws, in both directions', () => {
    const getItem = Storage.prototype.getItem
    const setItem = Storage.prototype.setItem
    Storage.prototype.getItem = () => {
      throw new DOMException('denied', 'SecurityError')
    }
    Storage.prototype.setItem = () => {
      throw new DOMException('denied', 'SecurityError')
    }
    try {
      expect(() => resetOperationalView()).not.toThrow()
      expect(renderHook(() => useOperationalView()).result.current.density).toBe('detailed')
      expect(() => setOperationalView({ density: 'compact' })).not.toThrow()
    } finally {
      Storage.prototype.getItem = getItem
      Storage.prototype.setItem = setItem
    }
  })
})

// ─── timeViewCollapsed (sub-project 12, defect 3) ───────────────────────────

describe('timeViewCollapsed', () => {
  it('defaults to visible', () => {
    expect(renderHook(() => useOperationalView()).result.current.timeViewCollapsed).toBe(false)
  })

  it('persists, so hiding the bar survives a reload', () => {
    act(() => setOperationalView({ timeViewCollapsed: true }))
    expect(JSON.parse(localStorage.getItem('etl360.tab3.view')!).timeViewCollapsed).toBe(true)
    expect(PERSISTED_KEYS).toContain('timeViewCollapsed')
  })

  it('rehydrates a stored value', () => {
    localStorage.setItem('etl360.tab3.view', JSON.stringify({ timeViewCollapsed: true }))
    resetOperationalView()
    expect(renderHook(() => useOperationalView()).result.current.timeViewCollapsed).toBe(true)
  })

  it('ignores a wrongly-typed persisted value instead of trusting it', () => {
    // Same hazard `density` documents: a bad persisted value reaches every render, and because
    // it lives in localStorage it would do so again on every reload with no in-app way out.
    localStorage.setItem('etl360.tab3.view', JSON.stringify({ timeViewCollapsed: 'yes' }))
    resetOperationalView()
    expect(renderHook(() => useOperationalView()).result.current.timeViewCollapsed).toBe(false)
  })
})

// ─── node navigation history (sub-project 12, defect 6) ─────────────────────

describe('node history', () => {
  const visit = (nodeId: string, x: number) => ({ nodeId, zoom: 1, pan: { x, y: 0 } })
  const state = () => renderHook(() => useOperationalView()).result.current

  it('selects the node it records', () => {
    act(() => visitNode(visit('a', 10)))
    expect(state().selectedNode).toBe('a')
    expect(state().historyIndex).toBe(0)
  })

  it('steps back through the node AND the canvas view it was left at', () => {
    // Restoring only the selection would auto-pan somewhere subtly different from where the
    // operator left off, which is most of what "losing your place" actually is.
    act(() => {
      visitNode(visit('a', 10))
      visitNode(visit('b', 20))
      visitNode(visit('c', 30))
    })
    act(() => stepHistory(-1))
    expect(state().selectedNode).toBe('b')
    expect(state().pan).toEqual({ x: 20, y: 0 })

    act(() => stepHistory(1))
    expect(state().selectedNode).toBe('c')
    expect(state().pan).toEqual({ x: 30, y: 0 })
  })

  it('forks the history when a new hop starts from the middle of the stack', () => {
    act(() => {
      visitNode(visit('a', 10))
      visitNode(visit('b', 20))
    })
    act(() => stepHistory(-1))
    act(() => visitNode(visit('z', 90)))

    expect(state().nodeHistory.map(v => v.nodeId)).toEqual(['a', 'z'])
    act(() => stepHistory(1))
    expect(state().selectedNode).toBe('z') // nothing forward of z
  })

  it('caps the stack, dropping the oldest', () => {
    act(() => {
      for (let i = 0; i < HISTORY_CAP + 5; i++) visitNode(visit(`n${i}`, i))
    })
    expect(state().nodeHistory).toHaveLength(HISTORY_CAP)
    expect(state().nodeHistory[0]!.nodeId).toBe('n5')
    expect(state().historyIndex).toBe(HISTORY_CAP - 1)
  })

  it('is a no-op at either end', () => {
    act(() => visitNode(visit('a', 10)))
    act(() => {
      stepHistory(-1)
      stepHistory(-1)
    })
    expect(state().selectedNode).toBe('a')
    act(() => stepHistory(1))
    expect(state().selectedNode).toBe('a')
  })

  it('is never persisted — a selection must not outlive a reload', () => {
    act(() => visitNode(visit('a', 10)))
    // visitNode touches no persisted key, so on its own it must not even write the blob.
    expect(localStorage.getItem('etl360.tab3.view')).toBeNull()

    // And when an unrelated persisted key DOES trigger a write, the trail must stay out of it.
    act(() => setOperationalView({ density: 'compact' }))
    const stored = JSON.parse(localStorage.getItem('etl360.tab3.view')!)
    expect(stored.nodeHistory).toBeUndefined()
    expect(stored.historyIndex).toBeUndefined()
    expect(PERSISTED_KEYS).not.toContain('nodeHistory')
  })
})
