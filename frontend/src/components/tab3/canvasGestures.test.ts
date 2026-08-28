import { describe, expect, it } from 'vitest'
import { applyWheel, wheelActs, type CanvasView } from './canvasGestures'

const VIEW: CanvasView = { zoom: 1, pan: { x: 100, y: 50 } }
const input = (over: Partial<Parameters<typeof applyWheel>[1]> = {}) => ({
  deltaX: 0, deltaY: 0, metaKey: false, ctrlKey: false, shiftKey: false,
  cursor: { x: 400, y: 300 }, ...over,
})

describe('applyWheel', () => {
  it('cmd+wheel zooms in on scroll up and out on scroll down', () => {
    expect(applyWheel(VIEW, input({ metaKey: true, deltaY: -100 })).zoom).toBeGreaterThan(1)
    expect(applyWheel(VIEW, input({ metaKey: true, deltaY: 100 })).zoom).toBeLessThan(1)
  })

  it('ctrl+wheel zooms too — that is what a trackpad pinch sends', () => {
    expect(applyWheel(VIEW, input({ ctrlKey: true, deltaY: -100 })).zoom).toBeGreaterThan(1)
  })

  // The point of cursor-anchored zoom: the graph point under the pointer must not move.
  it('keeps the point under the cursor fixed while zooming', () => {
    const before = VIEW
    const after = applyWheel(before, input({ metaKey: true, deltaY: -120 }))

    const graphXBefore = (400 - before.pan.x) / before.zoom
    const graphXAfter = (400 - after.pan.x) / after.zoom
    expect(graphXAfter).toBeCloseTo(graphXBefore, 6)

    const graphYBefore = (300 - before.pan.y) / before.zoom
    const graphYAfter = (300 - after.pan.y) / after.zoom
    expect(graphYAfter).toBeCloseTo(graphYBefore, 6)
  })

  it('clamps zoom to [0.2, 2]', () => {
    let view = VIEW
    for (let i = 0; i < 200; i++) view = applyWheel(view, input({ metaKey: true, deltaY: -300 }))
    expect(view.zoom).toBe(2)

    view = VIEW
    for (let i = 0; i < 200; i++) view = applyWheel(view, input({ metaKey: true, deltaY: 300 }))
    expect(view.zoom).toBe(0.2)
  })

  it('shift+wheel pans horizontally and leaves zoom and y alone', () => {
    const after = applyWheel(VIEW, input({ shiftKey: true, deltaY: 120 }))
    expect(after.pan.x).toBe(VIEW.pan.x - 120)
    expect(after.pan.y).toBe(VIEW.pan.y)
    expect(after.zoom).toBe(1)
  })

  it('a plain wheel pans vertically', () => {
    const after = applyWheel(VIEW, input({ deltaY: 120 }))
    expect(after.pan.y).toBe(VIEW.pan.y - 120)
    expect(after.pan.x).toBe(VIEW.pan.x)
    expect(after.zoom).toBe(1)
  })

  it('honours a horizontal wheel with no modifier', () => {
    expect(applyWheel(VIEW, input({ deltaX: 60 })).pan.x).toBe(VIEW.pan.x - 60)
  })
})

describe('wheelActs', () => {
  it('is true for every gesture the canvas handles, so preventDefault is never gratuitous', () => {
    expect(wheelActs(input({ metaKey: true, deltaY: -1 }))).toBe(true)
    expect(wheelActs(input({ shiftKey: true, deltaY: 1 }))).toBe(true)
    expect(wheelActs(input({ deltaY: 1 }))).toBe(true)
    expect(wheelActs(input())).toBe(false)          // no delta at all
  })
})
