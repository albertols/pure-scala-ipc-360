import type { LineageNodeT, LineageT } from '../../api/clusterQueries'

// ─── lineageLayout ──────────────────────────────────────────────────────────
//
// A banded, layered DAG layout for the lineage flow — Sugiyama's three steps, with tier bands
// added as a hard constraint on the second.
//
// §13's first version put nodes in hop columns and stacked each column by average-predecessor-y.
// Profiling the real corpus showed that is not enough: 50 of 81 lineages contain an edge spanning
// more than one column (drawn as one curve, it passes BEHIND every card in between and vanishes
// exactly where it matters), and 46 have a column mixing medallion tiers, so a column reads as an
// arbitrary pile with no vertical anchor between columns.
//
// Measured on the six widest lineages, counting long-edge segments: barycentre ordering WITHIN
// tier bands yields 6 crossings against 17 unbanded. Banding was expected to cost crossings — it
// is a constraint — and does the opposite, because tier correlates with flow direction and so
// acts as a good prior. (A first measurement that ignored long-edge segments suggested the
// reverse, and was wrong for precisely the reason dummy routing exists.)
//
// Pure and deterministic: every geometric claim here is unit-tested, and the drag feature layers
// offsets on top at RENDER time so this function stays the single source of the default.

export const LINEAGE_FOOTPRINT = { width: 220, height: 56 }
/** A routed long edge reserves a slot; a thin one, so lanes cost little vertical space. */
export const DUMMY_HEIGHT = 14

const COL_GAP = 96
const ROW_GAP = 18
const BAND_GAP = 26
const ORIGIN = { x: 20, y: 16 }
const DEFAULT_SWEEPS = 8

export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'unresolved'

/** Layer → medallion tier. Mirrors ADR-0017's palette groupings exactly; a band IS a tier. */
export const TIER_OF: Record<string, number> = {
  STG: 0, ODS: 0,
  DWH: 1, ETL: 1,
  CDM: 2, RDM: 2, QDM: 2,
  OUTPUT: 3,
  UNKNOWN: 4,
}

const TIER_NAME: Tier[] = ['bronze', 'silver', 'gold', 'platinum', 'unresolved']
const TIER_LABEL = ['STG · ODS', 'DWH · ETL', 'CDM · RDM · QDM', 'OUTPUT', 'UNRESOLVED']

export function bandOf(layer: string): number {
  return TIER_OF[layer] ?? TIER_OF.UNKNOWN!
}

export interface PlacedNode {
  id: string
  x: number
  y: number
  band: number
  isDummy: boolean
  /** Absent on dummies. */
  node?: LineageNodeT
}

export interface RoutedEdge {
  from: string
  to: string
  kind: LineageT['edges'][number]['kind']
  /** Source anchor, one point per intervening column, target anchor. */
  points: { x: number; y: number }[]
}

export interface Band {
  tier: Tier
  label: string
  y: number
  height: number
}

export interface LineageLayout {
  nodes: PlacedNode[]
  edges: RoutedEdge[]
  bands: Band[]
  width: number
  height: number
}

interface Cell {
  id: string
  col: number
  band: number
  isDummy: boolean
  sortName: string
  node?: LineageNodeT
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

export function layoutLineage(
  nodes: LineageNodeT[],
  edges: LineageT['edges'],
  opts: { sweeps?: number } = {},
): LineageLayout {
  if (nodes.length === 0) return { nodes: [], edges: [], bands: [], width: 0, height: 0 }

  const sweeps = opts.sweeps ?? DEFAULT_SWEEPS

  // ── 1. Columns by signed hop ──────────────────────────────────────────────
  const hops = [...new Set(nodes.map(n => n.hop))].sort((a, b) => a - b)
  const colOfHop = new Map(hops.map((h, i) => [h, i]))
  const colOf = new Map(nodes.map(n => [n.id, colOfHop.get(n.hop)!]))
  const bandById = new Map(nodes.map(n => [n.id, bandOf(n.layer)]))

  const cells: Cell[] = nodes.map(n => ({
    id: n.id, col: colOf.get(n.id)!, band: bandById.get(n.id)!,
    isDummy: false, sortName: n.name, node: n,
  }))

  // ── 2. Dummy chains for every edge spanning more than one column ──────────
  // Only edges whose endpoints are both present are routed; the endpoint check also drops the
  // self-loop a cyclic graph can produce, which would otherwise create a zero-length chain.
  const chains = new Map<string, string[]>()   // edge key -> [from, ...dummies, to]
  edges.forEach((edge, i) => {
    const a = colOf.get(edge.from), b = colOf.get(edge.to)
    if (a === undefined || b === undefined) return
    const key = `${edge.from}|${edge.to}|${edge.kind}|${i}`
    if (Math.abs(b - a) <= 1) { chains.set(key, [edge.from, edge.to]); return }

    const step = b > a ? 1 : -1
    const span = Math.abs(b - a)
    const ba = bandById.get(edge.from)!, bb = bandById.get(edge.to)!
    const chain: string[] = [edge.from]
    for (let k = 1, c = a + step; c !== b; k++, c += step) {
      const id = `__lin${i}_${c}`
      cells.push({
        id, col: c,
        // Interpolated so a long edge travels in a straight-ish lane rather than jinking
        // across bands at its first hop.
        band: Math.round(ba + (bb - ba) * (k / span)),
        isDummy: true, sortName: id,
      })
      chain.push(id)
    }
    chain.push(edge.to)
    chains.set(key, chain)
  })

  // ── 3. Barycentre ordering, constrained to the band ───────────────────────
  const succ = new Map<string, string[]>()
  const pred = new Map<string, string[]>()
  for (const chain of chains.values()) {
    for (let i = 0; i + 1 < chain.length; i++) {
      const u = chain[i]!, v = chain[i + 1]!
      if (!succ.has(u)) succ.set(u, [])
      if (!pred.has(v)) pred.set(v, [])
      succ.get(u)!.push(v)
      pred.get(v)!.push(u)
    }
  }

  const columns: Cell[][] = hops.map(() => [])
  for (const c of cells) columns[c.col]!.push(c)
  for (const col of columns) col.sort((a, b) => a.band - b.band || a.sortName.localeCompare(b.sortName))

  const slot = new Map<string, number>()
  const reindex = (col: Cell[]) => col.forEach((c, i) => slot.set(c.id, i))
  columns.forEach(reindex)

  for (let s = 0; s < sweeps; s++) {
    const forward = s % 2 === 0
    const order = forward
      ? columns.map((_, i) => i).slice(1)
      : columns.map((_, i) => i).slice(0, -1).reverse()
    const neighbours = forward ? pred : succ
    for (const ci of order) {
      const col = columns[ci]!
      const bary = new Map<string, number>()
      for (const c of col) {
        const ns = (neighbours.get(c.id) ?? []).map(id => slot.get(id)).filter((v): v is number => v !== undefined)
        bary.set(c.id, ns.length ? median(ns) : slot.get(c.id)!)
      }
      // `band` first, always: ordering optimises WITHIN a tier and can never move a node out
      // of one. `sortName` last keeps the result deterministic when barycentres tie.
      col.sort((a, b) => a.band - b.band || bary.get(a.id)! - bary.get(b.id)! || a.sortName.localeCompare(b.sortName))
      reindex(col)
    }
  }

  // ── 4. Coordinates: bands stacked, slots packed within a band ─────────────
  const presentBands = [...new Set(cells.map(c => c.band))].sort((a, b) => a - b)
  const heightOf = (c: Cell) => c.isDummy ? DUMMY_HEIGHT : LINEAGE_FOOTPRINT.height

  // A band is as tall as the fullest column within it, so the same tier occupies the same
  // vertical range in EVERY column — which is what makes the banding readable at all.
  const bandHeight = new Map<number, number>()
  for (const b of presentBands) {
    let tallest = 0
    for (const col of columns) {
      const inBand = col.filter(c => c.band === b)
      const h = inBand.reduce((sum, c) => sum + heightOf(c), 0) + Math.max(0, inBand.length - 1) * ROW_GAP
      tallest = Math.max(tallest, h)
    }
    bandHeight.set(b, tallest)
  }

  const bandTop = new Map<number, number>()
  let y = ORIGIN.y
  for (const b of presentBands) {
    bandTop.set(b, y)
    y += bandHeight.get(b)! + BAND_GAP
  }
  const totalHeight = y - BAND_GAP + ORIGIN.y

  const placed: PlacedNode[] = []
  const posById = new Map<string, PlacedNode>()
  columns.forEach((col, ci) => {
    const x = ORIGIN.x + ci * (LINEAGE_FOOTPRINT.width + COL_GAP)
    let cursor = new Map<number, number>()
    for (const c of col) {
      const top = cursor.get(c.band) ?? bandTop.get(c.band)!
      // Dummies ride the vertical centre of their slot so a routed edge stays level.
      const p: PlacedNode = {
        id: c.id,
        x: c.isDummy ? x + LINEAGE_FOOTPRINT.width / 2 : x,
        y: top,
        band: c.band,
        isDummy: c.isDummy,
        node: c.node,
      }
      placed.push(p)
      posById.set(c.id, p)
      cursor.set(c.band, top + heightOf(c) + ROW_GAP)
    }
  })

  // ── 5. Edge polylines from the chains ─────────────────────────────────────
  const anchor = (id: string, side: 'out' | 'in') => {
    const p = posById.get(id)!
    if (p.isDummy) return { x: p.x, y: p.y + DUMMY_HEIGHT / 2 }
    return {
      x: side === 'out' ? p.x + LINEAGE_FOOTPRINT.width : p.x,
      y: p.y + LINEAGE_FOOTPRINT.height / 2,
    }
  }

  const routed: RoutedEdge[] = []
  edges.forEach((edge, i) => {
    const key = `${edge.from}|${edge.to}|${edge.kind}|${i}`
    const chain = chains.get(key)
    if (!chain) return
    const points = chain.map((id, idx) =>
      anchor(id, idx === 0 ? 'out' : idx === chain.length - 1 ? 'in' : 'out'))
    routed.push({ from: edge.from, to: edge.to, kind: edge.kind, points })
  })

  const width = ORIGIN.x + columns.length * (LINEAGE_FOOTPRINT.width + COL_GAP) - COL_GAP + ORIGIN.x

  const bands: Band[] = presentBands.map(b => ({
    tier: TIER_NAME[b] ?? 'unresolved',
    label: TIER_LABEL[b] ?? 'UNRESOLVED',
    y: bandTop.get(b)!,
    height: bandHeight.get(b)!,
  }))

  return { nodes: placed, edges: routed, bands, width, height: totalHeight }
}

/**
 * Edge crossings between adjacent columns, over the ROUTED edges — so a long edge's segments
 * each count, which is the whole reason the layout routes them. Exported for tests: this is the
 * number that justifies the banding decision, so it has to be measurable.
 */
export function countCrossings(layout: LineageLayout): number {
  const byId = new Map(layout.nodes.map(p => [p.id, p]))
  const segments: { x1: number; y1: number; x2: number; y2: number }[] = []
  for (const e of layout.edges) {
    for (let i = 0; i + 1 < e.points.length; i++) {
      const a = e.points[i]!, b = e.points[i + 1]!
      segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
    }
  }
  void byId
  let crossings = 0
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i]!, b = segments[j]!
      // Same column gap, and their endpoints are ordered oppositely => they cross.
      if (a.x1 !== b.x1 || a.x2 !== b.x2) continue
      if ((a.y1 - b.y1) * (a.y2 - b.y2) < 0) crossings++
    }
  }
  return crossings
}
