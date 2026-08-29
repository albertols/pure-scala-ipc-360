// ─── semanticColors ─────────────────────────────────────────────────────────
//
// The ONLY place in the frontend that maps a layer, a kind, or a status to a colour.
//
// Before this module, `OperationalCard.tsx` coloured the LAYER chip by KIND — so `CDM` rendered
// blue on a table and amber on a recipe, and neither colour meant "CDM". Three orthogonal facts
// (what a node IS, which tier it lives in, how its last run went) competed for one visual budget
// and came out mutually indistinguishable. They now get three disjoint palettes, and Tab 3's
// filter chips read the same maps, so the control you filter with is the legend.
//
// Hex values are duplicated from `index.css`'s custom properties deliberately: these are consumed
// in inline `style` objects and by unit tests, neither of which can resolve a `var()`. `index.css`
// is the source of truth for the DESIGN; this file is the source of truth for the VALUE. Change
// both together.
//
// Scoped to Tab 3 (ADR-0017) — an explicit, user-requested amendment to ADR-0005's visual
// contract. Tabs 1, 2 and 4 have no consumer of this module.

export type CardKind = 'table' | 'recipe'

/**
 * Medallion tiers: raw / refined / curated, plus export, plus a deliberately colourless fallback.
 *
 * Keys mirror `LAYER_RANK` in `api/relationshipsAdapter.ts` — a layer that can reach a card must
 * have an entry here, which `semanticColors.test.ts` asserts against that enumeration rather than
 * against a second hand-written list.
 */
export const LAYER_COLOR: Record<string, string> = {
  STG: '#b0764a', ODS: '#b0764a',                    // bronze   — raw landing
  DWH: '#9aa6b8', ETL: '#9aa6b8',                    // silver   — refined
  CDM: '#d4a537', QDM: '#d4a537', RDM: '#d4a537',    // gold     — curated
  OUTPUT: '#cfd8e6',                                 // platinum — export, past gold
  UNKNOWN: '#4a5570',                                // unresolved, and must look it
}

export function layerColor(layer: string): string {
  return LAYER_COLOR[layer] ?? LAYER_COLOR.UNKNOWN!
}

export interface KindPalette {
  accent: string
  /**
   * The card body. OPAQUE, not an alpha wash: cards sit on the dot-grid canvas, and a
   * translucent body lets the grid show through the card — which reads as a rendering fault
   * rather than a tint. These are the accent pre-blended at 10% over `--surface` (#131621),
   * so they stay subtle while remaining solid.
   */
  body: string
  border: string
  /** Which edge carries the status bar, so kind survives being read in monochrome. */
  statusEdge: 'top' | 'left'
}

/** GCP product colours: a table is a BigQuery table, a recipe is a Dataproc/Spark job. */
export const KIND_PALETTE: Record<CardKind, KindPalette> = {
  table:  { accent: '#4f9cf9', body: '#192337', border: 'rgba(79,156,249,0.28)', statusEdge: 'top' },
  recipe: { accent: '#fb923c', body: '#2a2224', border: 'rgba(251,146,60,0.28)', statusEdge: 'left' },
}

export function kindPalette(kind: CardKind): KindPalette {
  return KIND_PALETTE[kind]
}

export const STATUS_COLOR: Record<string, string> = {
  OK: '#34d399', KO: '#f87171', RUNNING: '#fbbf24', PENDING: '#4a5570',
}

export const STATUS_BG: Record<string, string> = {
  OK: 'rgba(52,211,153,0.08)', KO: 'rgba(248,113,113,0.08)',
  RUNNING: 'rgba(251,191,36,0.08)', PENDING: 'rgba(74,85,112,0.08)',
}

export function statusColor(status: string): string {
  return STATUS_COLOR[status] ?? STATUS_COLOR.PENDING!
}

export function statusBg(status: string): string {
  return STATUS_BG[status] ?? STATUS_BG.PENDING!
}

/** The shared depth treatment — the "shadowy, subtle" card body. */
export const CARD_SHADOW = '0 2px 10px rgba(0,0,0,0.35)'

/** Width of the status bar on whichever edge `KindPalette.statusEdge` names. */
export const STATUS_EDGE_PX = 3
