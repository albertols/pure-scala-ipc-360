# ADR-0011: Canvas layout sidecar

**Status:** Accepted

## Context

`IpcCanvas` (Tab 2) needed draggable nodes whose positions survive a reload, ideally
shared across whoever opens the recipe next — not just the browser that dragged them.
The parser never emits `x`/`y` (`AbstractTarget`/`AbstractSource` carry no coordinate
fields), and CLAUDE.md hard rule 3 requires recipe/DDL generation to stay byte-identical
so `make regen-corpus` diffs cleanly.

## Decision

Positions persist to a sibling file, `<mappingDir>/_layout_<mapping>.json`, shape
`{ version: 1, nodes: { "<nodeId>": { "dx": number, "dy": number } } }`, via
`GET`/`PUT /api/layouts/{*path}` (`LayoutService`, atomic temp-file + `ATOMIC_MOVE`
write, mirroring `RecipeService.writeAtomic`). Embedding coordinates in the recipe
itself was never an option — the parser would need to start emitting fields it never
has, breaking byte-identity on every regeneration, for a purely display-side concern.

Node offsets are stored as **`dx`/`dy` deltas from the computed auto-layout**, not
absolute `x`/`y` coordinates. `layoutNodes` (`canvasLayout.ts:64`) stays the authoritative
structural layout — band membership, ordering — and a saved offset is a nudge layered on
top. This means adding a step to a recipe re-layouts cleanly around the structural change
while a user's manual tweaks on unrelated nodes survive; absolute coordinates would have
frozen the whole canvas the moment any node moved, including nodes nobody touched.

The sidecar is **excluded from every corpus walk**, mirroring `HistorySidecar`'s
`_history/` contract exactly: `CorpusService`'s tree walk skips any `_layout_`-prefixed
`.json` leaf, `RecipeService.ddls` already skips every `_`-prefixed name, and
`allRecipePaths()`'s `_ETL_*` match is unaffected — all three asserted by test, not
assumed, because a fourth undocumented walk site (`CorpusService.xmlNode`'s inline
listing) turned out to exist when Task 9's reviewer went looking. A missing sidecar is a
normal state, not an error: `GET` returns `{version:1,nodes:{}}`, never 404.

A **committed sidecar** was chosen over `localStorage`: this repo's whole premise is a
browsable, shareable corpus (CLAUDE.md's "commit everything, resumable" practice) — a
position saved by one operator should be visible to the next one who opens the recipe,
survive a fresh clone, and be diffable in review, none of which `localStorage` offers.
The cost — every drag is a network write — is acceptable at this corpus's scale and
matches the existing recipe-save idiom (`PUT /api/recipes`) the app already pays for.

## Consequences

- Dragging a node is a real write; a recipe with a saved layout has one extra file next
  to it, committable and reviewable like any other corpus artifact.
- `⌗ auto-layout` is a real, cheap operation: clear the sidecar, `layoutNodes` recomputes
  from the recipe alone — no coordinate migration needed.
- Every future corpus walk site (tree, DDL discovery, contract tests) must remember the
  `_layout_` exclusion; the shared `LayoutSidecar` predicate is the single place that
  changes if the naming convention ever does.

## Alternatives considered

- **Coordinates inside the recipe JSON** — rejected; breaks parser byte-identity
  (CLAUDE.md hard rule 3) for a display-only concern.
- **`localStorage`** — rejected; not shared across operators or machines, not
  git-diffable, lost on a browser data clear.
- **Absolute `x`/`y` in the sidecar** — rejected; would freeze the whole canvas on any
  structural change instead of letting `layoutNodes` re-derive around it.

---
*MADR-lite: keep each ADR ≤ 30 lines. One decision per file. Number sequentially;
never renumber or delete a filed ADR — mark it Superseded instead.*
