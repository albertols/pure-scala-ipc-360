import type { CardDensity, OperationalCard, StatusType } from '../types'
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

/**
 * The layer sequence, and the ONE ordering of it.
 *
 * Read in two places — `layoutCards`'s column assignment and the `graph.layers` list that feeds
 * Tab 3's filter chips — so this constant is what keeps the canvas and the toolbar telling the
 * same story. Giving one dimension two orderings depending on where you look is the class of
 * problem ADR-0017 exists to remove.
 *
 * `ETL` sits third, between `ODS` and `DWH`: it is a refined-tier layer (ADR-0017 pairs it with
 * `DWH` as silver), not a post-QDM one. It ranked 7th until sub-project 12, which put the chips
 * and the canvas columns in the operator's actual pipeline order.
 */
export const LAYER_RANK: Record<string, number> = {
  STG: 0,
  ODS: 1,
  ETL: 2,
  DWH: 3,
  CDM: 4,
  RDM: 5,
  QDM: 6,
  OUTPUT: 7,
  UNKNOWN: 8,
}

// Layout constants (adapter-local; mirrors canvasLayout.ts's 40px margin idiom,
// wider pitch to fit the operational card's larger footprint).
//
// Task 15 introduced a per-density pitch so that collapsing genuinely re-packs the layout rather
// than shrinking boxes at the same pitch. Sub-project 12 fixes what that table got WRONG: it was
// hand-maintained, and its `detailed` row pitch (190) was smaller than the card it was spacing
// really is (~280), so every detailed card overlapped the one below it by ~90px on a real corpus.
// The pitch is now DERIVED from a declared footprint, which makes that arithmetic impossible to
// get wrong again.

/**
 * The card's real on-screen box, per density.
 *
 * `detailed`'s 280 is the height of the TALLEST detailed card — a recipe with a stats grid and
 * both GCP links (`OperationalCard.tsx`). It is deliberately NOT asserted in vitest: jsdom has no
 * layout engine and reports every height as 0, so a unit test claiming to verify it would be
 * measuring nothing. It is verified in the browser acceptance walk instead, and the invariant
 * test guards only what is actually checkable — that the pitch clears whatever this says.
 */
export const DENSITY_FOOTPRINT: Record<CardDensity, { width: number; height: number }> = {
  detailed: { width: 260, height: 280 },
  compact: { width: 240, height: 56 },
  minimal: { width: 210, height: 26 },
}

/** Empty space BETWEEN footprints — the room the edges are drawn in, so arrows stay readable. */
export const DENSITY_GUTTER: Record<CardDensity, { col: number; row: number }> = {
  detailed: { col: 80, row: 50 },
  compact: { col: 60, row: 40 },
  minimal: { col: 40, row: 20 },
}

/** The floor the invariant test enforces, independent of the gutters chosen above. */
export const MIN_GUTTER = 16

/**
 * DERIVED, never hand-maintained: `pitch = footprint + gutter`.
 *
 * Keeps its name and its `{ col, row, width, height }` shape so `fitToViewport` and `layoutCards`
 * read unchanged — the fix is that the numbers are now computed from the box they space.
 */
export const DENSITY_PITCH: Record<
  CardDensity,
  { col: number; row: number; width: number; height: number }
> = Object.fromEntries(
  (Object.keys(DENSITY_FOOTPRINT) as CardDensity[]).map(d => [
    d,
    {
      col: DENSITY_FOOTPRINT[d].width + DENSITY_GUTTER[d].col,
      row: DENSITY_FOOTPRINT[d].height + DENSITY_GUTTER[d].row,
      width: DENSITY_FOOTPRINT[d].width,
      height: DENSITY_FOOTPRINT[d].height,
    },
  ]),
) as Record<CardDensity, { col: number; row: number; width: number; height: number }>

const X0 = 40,
  Y0 = 40

/**
 * Fits every card into `viewport`, never magnifying past 1 and never shrinking
 * below 0.3. An empty graph has nothing to fit, so it returns the neutral
 * default view rather than dividing by zero (which would yield `Infinity`/`NaN`).
 */
export function fitToViewport(
  cards: OperationalCard[],
  viewport: { width: number; height: number },
  density: CardDensity,
): { zoom: number; pan: { x: number; y: number } } {
  if (cards.length === 0) return { zoom: 1, pan: { x: X0, y: Y0 } }
  const { width, height } = DENSITY_PITCH[density]
  const maxX = Math.max(...cards.map(c => (c.x ?? 0) + width))
  const maxY = Math.max(...cards.map(c => (c.y ?? 0) + height))
  const zoom = Math.max(
    0.3,
    Math.min(1, Math.min(viewport.width / (maxX + X0), viewport.height / (maxY + Y0))),
  )
  return { zoom, pan: { x: X0, y: Y0 } }
}

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
function governingEntry(
  entry: RecipeSummaryDto | undefined,
  selectedDate: string | null,
): HistoryEntryDto | undefined {
  if (!entry || selectedDate === null) return undefined
  return (entry.history ?? []).find(h => h.date === selectedDate)
}

/** A recipe's status at `selectedDate`: exact-date history match; `latestStatus` when no date is selected; else PENDING. */
function recipeStatus(
  entry: RecipeSummaryDto | undefined,
  selectedDate: string | null,
): StatusType {
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
function layoutCards(
  cards: OperationalCard[],
  edges: OperationalEdge[],
  density: CardDensity,
): void {
  if (cards.length === 0) return
  const { col: colPitch, row: rowPitch } = DENSITY_PITCH[density]

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
    const ys = (preds.get(c.id) ?? [])
      .map(p => yById.get(p))
      .filter((y): y is number => y !== undefined)
    if (ys.length === 0) return 0
    return ys.reduce((a, b) => a + b, 0) / ys.length
  }

  for (const col of [...columns.keys()].sort((a, b) => a - b)) {
    const arr = columns.get(col)!
    arr.sort((a, b) => avgPredY(a) - avgPredY(b) || a.name.localeCompare(b.name))
    arr.forEach((c, i) => {
      c.x = X0 + col * colPitch
      c.y = Y0 + i * rowPitch
      yById.set(c.id, c.y)
    })
  }
}

export function toOperationalGraph(
  graph: RelationshipGraph,
  summary: OperationalSummary | undefined,
  selectedDate: string | null,
  density: CardDensity = 'detailed',
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
      // Scoped requests only; absent (=> false) on the unscoped path.
      neighbor: node.neighbor === true,
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
    } else {
      const writerIds = writersByTable.get(card.id) ?? []
      const writerStatuses = writerIds.map(rid =>
        recipeStatus(byFilename.get(cardsById.get(rid)?.name ?? ''), selectedDate),
      )
      card.status = writerStatuses.includes('KO')
        ? 'KO'
        : writerStatuses.includes('OK')
          ? 'OK'
          : 'PENDING'

      const firstWriterId = firstWriterByTable.get(card.id)
      const firstWriterEntry = firstWriterId
        ? byFilename.get(cardsById.get(firstWriterId)?.name ?? '')
        : undefined
      card.history = toHistory(firstWriterEntry)
      card.stats = toStats(firstWriterEntry)
      card.lastRun = toLastRun(firstWriterEntry, selectedDate)
      // jobId: recipes only (rule 5) — left undefined for tables.
    }
  }

  layoutCards(orderedCards, edges, density)

  // `meta.layers` is derived from the CORE entries of a scoped request
  // (RelationshipService.java:135), so a 1-hop neighbour whose layer sits outside the selection
  // is simply missing from it — verified live: scoping cluster-wf-cas-load-4001 returns
  // ["ODS","STG"] while its two neighbour recipes are DWH and RDM. Feeding the chips straight
  // from `meta.layers` would leave those cards with no chip that can reach them (and, once Tab 3
  // gets bands, bandless). So: meta order first, untouched, then every OTHER layer actually
  // present on the returned cards appended in band order. Subsumes the old UNKNOWN special case,
  // which was the same bug seen from one angle only.
  // Two guarantees, and they are separate:
  //
  // COMPLETENESS — every layer that can reach a card must have a chip. `meta.layers` is derived
  // from the CORE entries of a scoped request (RelationshipService.java:135), so a 1-hop
  // neighbour whose layer sits outside the selection is simply missing from it; feeding the chips
  // straight from `meta.layers` would leave those cards with no chip that can reach them. Hence
  // the union with the layers actually present on the returned cards.
  //
  // ORDER — the union is then sorted by LAYER_RANK, whole. It used to be "meta order first, then
  // extras sorted", which quietly made `meta`'s arrival order the chip order: reordering
  // LAYER_RANK moved the canvas columns and left the toolbar alone, giving one dimension two
  // orderings — the exact thing ADR-0017 exists to prevent. Caught in a browser walk, not by a
  // unit test, because the fixture had a single layer.
  const layers = [...new Set([...(graph.meta?.layers ?? []), ...orderedCards.map(c => c.layer)])]
  layers.sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b))

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
  let ok = 0,
    ko = 0
  for (const row of rows) {
    if (row.recipeFilename) recipeNames.add(row.recipeFilename)
    // Through STATUS_MAP, never raw 'SUCCESS'/'FAILED' literals: the map at the top of this file
    // IS the b15-status rule, and a second spelling of it 250 lines down is a rule that can drift
    // from itself.
    const status = mapStatus(row.status)
    if (status === 'OK') ok++
    else if (status === 'KO') ko++
  }

  const tableIds = new Set<string>()
  for (const name of recipeNames) {
    const recipeId = recipeIdByName.get(name)
    if (!recipeId) continue
    for (const e of edges) if (e.kind === 'writes' && e.fromId === recipeId) tableIds.add(e.toId)
  }

  return { rows: rows.length, recipes: recipeNames.size, tables: tableIds.size, ok, ko }
}
