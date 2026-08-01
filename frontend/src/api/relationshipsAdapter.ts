import type { OperationalCard, StatusType } from '../types'
import type { RelationshipGraph, OperationalSummary, B15Row } from './queries'
import type { components } from './types.gen'

type NodeDto = components['schemas']['NodeDto']
type EdgeDto = components['schemas']['EdgeDto']
type RecipeSummaryDto = components['schemas']['RecipeSummaryDto']
type HistoryEntryDto = components['schemas']['HistoryEntryDto']

export interface OperationalEdge {
  fromId: string
  toId: string
  kind: 'source' | 'lookup' | 'writes'
}

export interface OperationalGraphView {
  cards: OperationalCard[]
  edges: OperationalEdge[]
  layers: string[]
}

export const LAYER_RANK: Record<string, number> = {
  STG: 0, ODS: 1, DWH: 2, CDM: 3, RDM: 4, QDM: 5, ETL: 6, OUTPUT: 7, UNKNOWN: 8,
}

// Layout constants (adapter-local; mirrors canvasLayout.ts's 40px margin idiom,
// wider pitch to fit the operational card's larger footprint).
const X0 = 40, Y0 = 40, COL_PITCH = 320, ROW_PITCH = 190

const EPOCH_ISO = '1970-01-01T00:00:00Z'

const STATUS_MAP: Record<string, StatusType> = { SUCCESS: 'OK', FAILED: 'KO', '': 'PENDING' }

function mapStatus(raw: string | undefined): StatusType {
  if (raw === undefined) return 'PENDING'
  return STATUS_MAP[raw] ?? 'PENDING'
}

function isEdgeKind(k: string | undefined): k is 'source' | 'lookup' | 'writes' {
  return k === 'source' || k === 'lookup' || k === 'writes'
}

/** The history entry governing state at `selectedDate` — exact-date match only, no carry-forward. */
function governingEntry(entry: RecipeSummaryDto | undefined, selectedDate: string | null): HistoryEntryDto | undefined {
  if (!entry || selectedDate === null) return undefined
  return (entry.history ?? []).find(h => h.date === selectedDate)
}

/** A recipe's status at `selectedDate`: exact-date history match; `latestStatus` when no date is selected; else PENDING. */
function recipeStatus(entry: RecipeSummaryDto | undefined, selectedDate: string | null): StatusType {
  if (!entry) return 'PENDING'
  if (selectedDate === null) return mapStatus(entry.latestStatus)
  const gov = governingEntry(entry, selectedDate)
  if (!gov) return 'PENDING'
  return mapStatus(gov.status)
}

function toHistory(entry: RecipeSummaryDto | undefined): StatusType[] {
  return (entry?.history ?? []).map(h => mapStatus(h.status))
}

function toLastRun(entry: RecipeSummaryDto | undefined, selectedDate: string | null): string {
  if (!entry) return EPOCH_ISO
  const gov = governingEntry(entry, selectedDate)
  if (gov?.date) return `${gov.date}T00:00:00Z`
  if (entry.latestDate) return `${entry.latestDate}T00:00:00Z`
  return EPOCH_ISO
}

/**
 * p99 === p95 is not a shortcut, it's the math: nearest-rank percentile rank
 * is `ceil(pct/100 * n)`; for the 14-day history window that's `ceil(0.95*14)
 * = ceil(13.3) = 14` and `ceil(0.99*14) = ceil(13.86) = 14` — the SAME rank
 * (the last element), so p95 and p99 are identical by construction. There is
 * no p99DurationMin field on the wire (RecipeSummaryDto has no such field) —
 * this isn't a gap, it's the backend not computing a number that would always
 * equal p95 at n=14.
 */
function toStats(entry: RecipeSummaryDto | undefined): OperationalCard['stats'] {
  const avg = entry?.avgDurationMin
  const p50v = entry?.p50DurationMin
  const p95v = entry?.p95DurationMin
  const avg_time_s = avg != null ? Math.round(avg * 60) : 0
  const p50 = p50v != null ? Math.round(p50v * 60) : 0
  const p95 = p95v != null ? Math.round(p95v * 60) : 0
  return { avg_time_s, p50, p95, p99: p95, avg_count: 0 }
}

function rankOf(layer: string): number {
  return LAYER_RANK[layer] ?? LAYER_RANK.UNKNOWN!
}

/**
 * Layer-ordered layout, local to this adapter — NOT `canvasLayout.ts`.
 *
 * `canvasLayout.ts` (Tab 1 viewer) is CONNECTION-driven: a node's column is
 * the longest path from a source, computed purely from the connection graph.
 * Tab 3's columns are LAYER-driven: a node's column comes from its declared
 * `layer` metadata (STG < ODS < ... < OUTPUT) regardless of how many hops it
 * is from a source — two disconnected nodes in the same declared layer land
 * in the same column. These are different orderings; reusing `layoutNodes`
 * would silently swap layer-order for connection-order. Only the STACKING
 * discipline is mirrored here: process columns left-to-right, order within a
 * column by (average predecessor y, then name), stack top-down.
 */
function layoutCards(cards: OperationalCard[], edges: OperationalEdge[]): void {
  if (cards.length === 0) return

  const writesTargets = new Set(edges.filter(e => e.kind === 'writes').map(e => e.toId))
  const colOf = (card: OperationalCard): number => {
    const rank = rankOf(card.layer)
    if (card.kind === 'recipe') return 2 * rank + 1
    return writesTargets.has(card.id) ? 2 * rank + 2 : 2 * rank
  }

  const preds = new Map<string, string[]>()
  for (const c of cards) preds.set(c.id, [])
  for (const e of edges) preds.get(e.toId)?.push(e.fromId)

  const columns = new Map<number, OperationalCard[]>()
  for (const c of cards) {
    const col = colOf(c)
    const arr = columns.get(col) ?? []
    arr.push(c)
    columns.set(col, arr)
  }

  const yById = new Map<string, number>()
  const avgPredY = (c: OperationalCard): number => {
    const ys = (preds.get(c.id) ?? []).map(p => yById.get(p)).filter((y): y is number => y !== undefined)
    if (ys.length === 0) return 0
    return ys.reduce((a, b) => a + b, 0) / ys.length
  }

  for (const col of [...columns.keys()].sort((a, b) => a - b)) {
    const arr = columns.get(col)!
    arr.sort((a, b) => avgPredY(a) - avgPredY(b) || a.name.localeCompare(b.name))
    arr.forEach((c, i) => {
      c.x = X0 + col * COL_PITCH
      c.y = Y0 + i * ROW_PITCH
      yById.set(c.id, c.y)
    })
  }
}

export function toOperationalGraph(
  graph: RelationshipGraph,
  summary: OperationalSummary | undefined,
  selectedDate: string | null,
): OperationalGraphView {
  const rawNodes: NodeDto[] = graph.nodes ?? []
  const rawEdges: EdgeDto[] = graph.edges ?? []

  const byFilename = new Map<string, RecipeSummaryDto>()
  for (const r of summary?.recipes ?? []) {
    if (r.recipeFilename) byFilename.set(r.recipeFilename, r)
  }

  // Cards first (rule 1) — every node with an id gets a card, in graph order.
  const cardsById = new Map<string, OperationalCard>()
  const orderedCards: OperationalCard[] = []
  for (const node of rawNodes) {
    if (!node.id) continue
    const kind: 'table' | 'recipe' = node.kind === 'recipe' ? 'recipe' : 'table'
    const layer = node.layer && node.layer.length > 0 ? node.layer : 'UNKNOWN'
    const card: OperationalCard = {
      id: node.id,
      kind,
      name: node.name ?? '',
      layer,
      status: 'PENDING',
      lastRun: EPOCH_ISO,
      history: [],
      stats: { avg_time_s: 0, p50: 0, p95: 0, p99: 0, avg_count: 0 },
      relations: [],
    }
    cardsById.set(node.id, card)
    orderedCards.push(card)
  }

  // Edges (rule 6): valid endpoints only, deduped by from|to|kind.
  const edgeKeySeen = new Set<string>()
  const edges: OperationalEdge[] = []
  for (const e of rawEdges) {
    if (!e.from || !e.to) continue
    if (!cardsById.has(e.from) || !cardsById.has(e.to)) continue
    if (!isEdgeKind(e.kind)) continue
    const key = `${e.from}|${e.to}|${e.kind}`
    if (edgeKeySeen.has(key)) continue
    edgeKeySeen.add(key)
    edges.push({ fromId: e.from, toId: e.to, kind: e.kind })
  }

  // relations: sorted unique neighbor ids, both directions.
  const neighbors = new Map<string, Set<string>>()
  for (const id of cardsById.keys()) neighbors.set(id, new Set())
  for (const e of edges) {
    neighbors.get(e.fromId)?.add(e.toId)
    neighbors.get(e.toId)?.add(e.fromId)
  }
  for (const card of orderedCards) card.relations = [...(neighbors.get(card.id) ?? [])].sort()

  // Writer bookkeeping for table state/history (rules 2/3): first writer (edge
  // order) feeds history/stats/lastRun; ALL writers feed the aggregate status.
  const firstWriterByTable = new Map<string, string>()
  const writersByTable = new Map<string, string[]>()
  for (const e of edges) {
    if (e.kind !== 'writes') continue
    if (!firstWriterByTable.has(e.toId)) firstWriterByTable.set(e.toId, e.fromId)
    const arr = writersByTable.get(e.toId) ?? []
    arr.push(e.fromId)
    writersByTable.set(e.toId, arr)
  }

  for (const card of orderedCards) {
    if (card.kind === 'recipe') {
      const entry = byFilename.get(card.name)
      card.status = recipeStatus(entry, selectedDate)
      card.history = toHistory(entry)
      card.stats = toStats(entry)
      card.lastRun = toLastRun(entry, selectedDate)
      card.jobId = entry?.lastJobId
      card.appId = entry?.lastJobId
    } else {
      const writerIds = writersByTable.get(card.id) ?? []
      const writerStatuses = writerIds.map(rid => recipeStatus(byFilename.get(cardsById.get(rid)?.name ?? ''), selectedDate))
      card.status = writerStatuses.includes('KO') ? 'KO' : writerStatuses.includes('OK') ? 'OK' : 'PENDING'

      const firstWriterId = firstWriterByTable.get(card.id)
      const firstWriterEntry = firstWriterId ? byFilename.get(cardsById.get(firstWriterId)?.name ?? '') : undefined
      card.history = toHistory(firstWriterEntry)
      card.stats = toStats(firstWriterEntry)
      card.lastRun = toLastRun(firstWriterEntry, selectedDate)
      // jobId/appId: recipes only (rule 5) — left undefined for tables.
    }
  }

  layoutCards(orderedCards, edges)

  const metaLayers = graph.meta?.layers ?? []
  const layers = [...metaLayers]
  if (orderedCards.some(c => c.layer === 'UNKNOWN') && !layers.includes('UNKNOWN')) layers.push('UNKNOWN')

  return { cards: orderedCards, edges, layers }
}

// ─── summarizeSnapshot (Task 16) ───────────────────────────────────────────
//
// Tab 3's floating bottom-left chip: b15 row count, distinct recipes, distinct
// tables, and the OK/KO split for `useOperational(selectedDate)`'s ALREADY-
// LOADED snapshot — client-derived over the SAME cards/edges `toOperationalGraph`
// produced, no new endpoint. "Distinct tables" is recipe -> `writes` edge ->
// table, so two rows for two DIFFERENT recipes that fan into the SAME table
// (spec's fan-in casuistic) count that table once; a row naming a recipe
// absent from the graph (unrecognized/stale b15 entry) still counts toward
// rows/recipes, just contributes no table.
export interface OperationalSnapshotSummary {
  rows: number
  recipes: number
  tables: number
  ok: number
  ko: number
}

export function summarizeSnapshot(
  rows: B15Row[],
  cards: OperationalCard[],
  edges: OperationalEdge[],
): OperationalSnapshotSummary {
  const recipeIdByName = new Map(cards.filter(c => c.kind === 'recipe').map(c => [c.name, c.id]))

  const recipeNames = new Set<string>()
  let ok = 0, ko = 0
  for (const row of rows) {
    if (row.recipeFilename) recipeNames.add(row.recipeFilename)
    if (row.status === 'SUCCESS') ok++
    else if (row.status === 'FAILED') ko++
  }

  const tableIds = new Set<string>()
  for (const name of recipeNames) {
    const recipeId = recipeIdByName.get(name)
    if (!recipeId) continue
    for (const e of edges) if (e.kind === 'writes' && e.fromId === recipeId) tableIds.add(e.toId)
  }

  return { rows: rows.length, recipes: recipeNames.size, tables: tableIds.size, ok, ko }
}
