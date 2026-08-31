import type { Connection, ETLNode } from '../types'

// Layout constants (adapter-local; values mirror NodeBox geometry — header 44,
// port row 22, +10 pad; column pitch mirrors the mock's 230).
export const X0 = 40,
  Y0 = 160,
  COL_PITCH = 230,
  V_GAP = 40
export const HEADER_H = 44,
  PORT_H = 22,
  PAD = 10
export const nodeHeight = (n: { ports: unknown[] }) => HEADER_H + n.ports.length * PORT_H + PAD

/** Unique-edge predecessor sets, keyed by node id (dedupes multi-field connectors). */
function buildPredecessors(nodes: ETLNode[], connections: Connection[]): Map<string, Set<string>> {
  const preds = new Map<string, Set<string>>()
  for (const n of nodes) preds.set(n.id, new Set())
  for (const c of connections) {
    if (c.fromNode === c.toNode) continue
    const set = preds.get(c.toNode)
    if (set) set.add(c.fromNode)
  }
  return preds
}

/**
 * Longest-path layering: layer 0 for nodes with no incoming connections or
 * kind 'source'; else 1 + max(layer(pred)). Memoized DFS with an in-progress
 * set — a back-edge into an in-progress (ancestor) node is a cycle, and is
 * treated as absent (skipped) rather than recursed into, so cycles can't hang.
 */
function computeLayers(nodes: ETLNode[], preds: Map<string, Set<string>>): Map<string, number> {
  const nodeById = new Map(nodes.map(n => [n.id, n]))
  const memo = new Map<string, number>()
  const inProgress = new Set<string>()

  function layer(id: string): number {
    const memoized = memo.get(id)
    if (memoized !== undefined) return memoized
    const node = nodeById.get(id)
    const predIds = preds.get(id) ?? new Set<string>()
    if (!node || node.type === 'source' || predIds.size === 0) {
      memo.set(id, 0)
      return 0
    }
    inProgress.add(id)
    let maxPredLayer = -1
    for (const p of predIds) {
      if (inProgress.has(p)) continue // back-edge (cycle): treat as absent
      maxPredLayer = Math.max(maxPredLayer, layer(p))
    }
    inProgress.delete(id)
    const result = maxPredLayer + 1 // all-preds-were-back-edges (-1) collapses to 0
    memo.set(id, result)
    return result
  }

  for (const n of nodes) layer(n.id)
  return memo
}

/**
 * Assigns final x/y (mutating nodes in place). Targets clamp to the max layer
 * (all targets share the final column). Within a column, nodes are ordered by
 * (average predecessor y, then name) and stacked top-down from Y0 using each
 * node's real height, so columns are processed left-to-right — predecessor
 * y's are always resolved before they're needed.
 */
export function layoutNodes(nodes: ETLNode[], connections: Connection[]): void {
  if (nodes.length === 0) return
  const preds = buildPredecessors(nodes, connections)
  const rawLayers = computeLayers(nodes, preds)
  const maxLayer = Math.max(...nodes.map(n => rawLayers.get(n.id) ?? 0))

  const columns = new Map<number, ETLNode[]>()
  for (const n of nodes) {
    const l = n.type === 'target' ? maxLayer : (rawLayers.get(n.id) ?? 0)
    const arr = columns.get(l) ?? []
    arr.push(n)
    columns.set(l, arr)
  }

  const yById = new Map<string, number>()
  const avgPredY = (n: ETLNode): number => {
    const ys = [...(preds.get(n.id) ?? [])]
      .map(p => yById.get(p))
      .filter((y): y is number => y !== undefined)
    if (ys.length === 0) return 0
    return ys.reduce((a, b) => a + b, 0) / ys.length
  }

  for (const l of [...columns.keys()].sort((a, b) => a - b)) {
    const col = columns.get(l)!
    col.sort((a, b) => avgPredY(a) - avgPredY(b) || a.name.localeCompare(b.name))
    let y = Y0
    for (const n of col) {
      n.x = X0 + l * COL_PITCH
      n.y = y
      yById.set(n.id, y)
      y += nodeHeight(n) + V_GAP
    }
  }
}
