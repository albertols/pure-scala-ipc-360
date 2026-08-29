# ADR-0017: Tab 3 semantic colour system

**Status:** Accepted

## Context

Tab 3 encodes three orthogonal facts about a node — what it IS (table/recipe), which
tier it lives in (layer), and how its last run went (status) — and they were
competing for one visual budget. Worse, `OperationalCard.tsx` coloured the **layer**
chip by **kind**, so `CDM` rendered blue on a table and amber on a recipe: the same
layer, two colours, neither of which meant "CDM". Driving the tab against a real
export made the three mutually indistinguishable at a glance.

## Decision

Three disjoint palettes, defined in exactly one file — `frontend/src/theme/semanticColors.ts`:

- **Kind** = GCP product: table → BigQuery blue `#4f9cf9`, recipe → Spark orange
  `#fb923c`. Kind also chooses the **edge** the status bar sits on (table = top,
  recipe = left), so kind survives being read in monochrome.
- **Layer** = medallion tier: `STG`/`ODS` bronze, `DWH`/`ETL` silver,
  `CDM`/`QDM`/`RDM` gold, `OUTPUT` platinum, `UNKNOWN` deliberately colourless —
  it is a resolution *failure* and must not look like a fifth tier.
- **Status** unchanged (`OK` green, `KO` red, `PENDING` grey, `RUNNING` amber).

Tab 3's toolbar filter chips read the same maps, so **the toolbar is the legend**: no
separate legend block exists that could drift from the cards it describes.

This is a scoped, explicitly-requested amendment to ADR-0005's Figma visual contract.

## Consequences

- Kind, layer and status are separable at a glance, at all three densities.
- Hex values live twice on purpose — as CSS custom properties in `index.css` (the
  design) and as literals in `semanticColors.ts` (the value inline styles and unit
  tests can actually read). They must be changed together; nothing else may hardcode one.
- `OperationalCard` is shared with Tab 4's detail panel, so that one card picks up the
  palette too. Accepted: it is the same object, and two colour systems for it would be
  worse than one. Tab 4's canvas, clusters and run history are untouched.
- Card bodies are OPAQUE pre-blended hexes, not alpha washes — cards sit on the
  dot-grid canvas, and a translucent body lets the grid show through the card.

## Alternatives considered

- **Keep one palette, separate by shape only** — the shapes are already spoken for by
  density; nothing left to encode three facts with.
- **A dedicated legend panel** — a second surface stating the same mapping, free to
  drift from the cards, and costing canvas space the operator wants back.
- **Gate the palette behind a prop so Tab 4 keeps the old look** — a branch whose only
  effect is to make the same object look different in two places.
