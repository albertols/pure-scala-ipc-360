# Tab 3 Operational Clarity — design

**Date:** 2026-08-29
**Sub-project:** 12
**Status:** approved
**Supersedes nothing.** Amends `docs/adr/0005-figma-visual-contract.md` for Tab 3 only
(§4), extends `docs/adr/0013-data-root-diagnostics.md` (§7) and
`docs/adr/0014-b15-cluster-index.md` (§8).

---

## 1. Why

Tab 3 (ETL Operational) was rebuilt at scale in sub-project 10
(`2026-08-27-operational-scale-design.md`). Driving it against a **real** IPC export —
~6 700 recipes, ~11 600 b15 rows, 219 recipes in a single cluster — surfaced eight
defects that the committed synthetic corpus is too small, too uniform, and too
short-named to expose. Six are presentation bugs, one is a **silent data-correctness
bug**, and one is a missing capability.

The unifying theme: every one of them is a place where the tab shows the operator
something that is *not what the data says*. Overlapping cards hide edges; `FAILURE`
runs render as "never ran"; a table you can name cannot be found. Hence "operational
clarity".

Ground truth for every claim below is cited as `file:line` against the tree at
`55cce19`.

### 1.1 The eight defects

| # | Symptom | Root cause | Severity |
|---|---|---|---|
| 1 | Cards overlap at all three densities | pitch < real footprint; `width: 'auto'` | high |
| 2 | Snapshot chip sits on top of cards | chip not tied to pane state | low |
| 3 | TIME VIEW bar is permanent, eats canvas | no collapse affordance | medium |
| 4 | Tables/recipes/layers/status share colours | palette conflates kind and layer | medium |
| 5 | Selection banner tall, stats illegible | padding + `--text-dim` | low |
| 6 | Navigating "Related" loses your place | no history, no overview | high |
| 7 | `FAILURE` runs render as PENDING | status vocabulary is a closed literal set | **critical** |
| 8 | Cannot find a table/recipe without a cluster | Tab 3 never receives the global query | high |

---

## 2. Non-goals

- **No change to the b15 CSV, the L2L control schema, or any corpus file.** The
  `m_CAS_*` family is manifest-generated and frozen (root `CLAUDE.md`, "Corpus
  caveats"); §7 is proven with a **test-only fixture**, never by editing mock data.
  No committed mock floor moves in this sub-project.
- **No parser change.** Nothing here touches `parser/`.
- **No restyle outside Tab 3.** §4 introduces a shared token file, but only Tab 3's
  operational cards, toolbar and selection strip consume it. Tabs 1/2/4 are untouched.
- **No new persisted server state.** §8's search endpoint is read-only and derives
  everything from indexes that already exist.
- **Not a general graph explorer.** §6's overlay shows one node's direct
  neighbourhood. Multi-hop expansion is out of scope.
- **No auth, no write path, no mutation of run history.**

---

## 3. Layout: footprint-driven pitch (defect 1)

### 3.1 Ground truth

`frontend/src/api/relationshipsAdapter.ts:32-36` declares one table that is used for
two different purposes and is wrong for both:

```ts
export const DENSITY_PITCH: Record<CardDensity, { col; row; width; height }> = {
  detailed: { col: 320, row: 190, width: 252, height: 150 },
  compact:  { col: 230, row: 80,  width: 200, height: 56 },
  minimal:  { col: 200, row: 36,  width: 180, height: 26 },
}
```

Two independent failures follow.

**3.1.1 Vertical overlap (`detailed`).** `row: 190` and `height: 150` are both smaller
than what a detailed `OperationalCard` actually renders. Reading
`frontend/src/components/shared/OperationalCard.tsx:127-266`, a *recipe* card stacks:
`12px` top padding, header row (~40), `marginBottom: 10`, last-run line (~14 + 8),
history block (label 9 + 4 + bars 14 + margin 10), the five-cell stats grid
(`:213-247`, ~62 + margin 10), the GCP link row (`:251-264`, ~22), `12px` bottom
padding — **≈ 280px**. With a 190px row pitch, every card overlaps the one below by
~90px. This is image 13.

**3.1.2 Horizontal overlap (`compact`, `minimal`).**
`frontend/src/components/tab3/ETLOperational.tsx:282` positions the card with:

```ts
width: density === 'detailed' ? 252 : 'auto',
```

`'auto'` inside an absolutely-positioned wrapper sizes to content. Compact and minimal
cards therefore render as wide as their longest name — on the real corpus,
`_ETL_m_DWH_F_CONTR_LTV_RC_D.json` and `DWH.DWH_F_CONTR_LTV_RC_D` are far past the
200/180 the table assumes and past the 230/200 column pitch. This is images 14 and 15.

The synthetic corpus never showed either bug because its names are short and its
graphs are small enough that `fitToViewport` shrinks everything below the point where
a reader notices.

### 3.2 Design

**One table declares the footprint; the pitch is derived from it.** A pitch can never
again be smaller than the box it is spacing, because it is computed from it.

```ts
export const DENSITY_FOOTPRINT: Record<CardDensity, { width: number; height: number }> = {
  detailed: { width: 260, height: 280 },
  compact:  { width: 240, height: 56 },
  minimal:  { width: 210, height: 26 },
}

/** Empty space BETWEEN footprints — the room the edges are drawn in. */
export const DENSITY_GUTTER: Record<CardDensity, { col: number; row: number }> = {
  detailed: { col: 80, row: 50 },
  compact:  { col: 60, row: 40 },
  minimal:  { col: 40, row: 20 },
}

export const DENSITY_PITCH = /* derived */   // detailed 340×330, compact 300×96, minimal 250×46
```

`DENSITY_PITCH` keeps its name and its `{ col, row, width, height }` shape so the two
existing readers (`relationshipsAdapter.ts:51`, `:136`) need no signature change.

**Three call sites stop disagreeing with the table:**

| Site | Today | After |
|---|---|---|
| `ETLOperational.tsx:282` | `density === 'detailed' ? 252 : 'auto'` | `DENSITY_FOOTPRINT[density].width` |
| `ETLOperational.tsx:151-152` | `+ 280` / `+ 220` hardcoded | footprint width/height |
| `relationshipsAdapter.ts:51` | `DENSITY_PITCH[density]` | unchanged (now correct) |

`OperationalCard`'s own `minWidth` values (240 / 200 / 160 at `:139`, `:90`, `:61`) all
fit inside the declared widths, and every name already ellipsis-clamps, so no card is
clipped by the change.

### 3.3 Why not measured heights

A measured-height layout (pack each column to its own contents) was considered and
rejected for this sub-project: it makes the canvas denser but requires a measurement
pass the adapter cannot do — the adapter is pure and runs before render, and jsdom has
no layout engine to measure in under test. Uniform pitch is honest, testable, and the
canvas is pannable. Revisit only if the taller canvas proves unusable in practice.

### 3.4 What is tested, and what is not

- **Unit-testable (vitest):** the *invariant* — for every density,
  `pitch.col ≥ footprint.width + MIN_GUTTER` and `pitch.row ≥ footprint.height +
  MIN_GUTTER`. This is the regression gate: it fails on any future edit that
  reintroduces a pitch smaller than its box.
- **Unit-testable:** no two cards produced by `layoutCards` have overlapping
  footprint rectangles, for a fixture graph at each density.
- **NOT unit-testable:** whether `280` is genuinely the tallest a detailed card
  renders. jsdom reports every height as 0. This is verified in §10's browser walk and
  nowhere else — the spec states it as an assumption, not a proven fact.

---

## 4. Semantic colour system (defect 4)

### 4.1 Ground truth

`OperationalCard.tsx:104` and `:158` colour the **layer** chip by **kind**:

```ts
background: card.kind === 'table' ? 'rgba(79,156,249,0.15)' : 'rgba(251,191,36,0.15)',
color:      card.kind === 'table' ? '#4f9cf9' : '#fbbf24',
```

So `CDM` renders blue on a table and amber on a recipe — the same layer, two colours,
neither of which means "CDM". Status is a third axis competing for the same visual
budget. The result (images 13-15, 20) is that kind, layer and status are mutually
indistinguishable at a glance.

### 4.2 Design

A new module, `frontend/src/theme/semanticColors.ts`, becomes **the only file in the
frontend that maps a layer, kind, or status to a colour**. Hex values live once, as
CSS custom properties in `frontend/src/index.css`; the module reads them by name.

**Kind — where the data lives (GCP product colours):**

| Kind | Product | Accent | Card treatment |
|---|---|---|---|
| `table` | BigQuery | `--bq-blue` `#4f9cf9` | blue body tint + shadow; **status on the TOP edge** |
| `recipe` | Dataproc/Spark | `--spark-orange` `#fb923c` | orange body tint + shadow; **status on the LEFT edge** |

Body tint is `rgba(accent, 0.07)` composited over `--surface`, border
`rgba(accent, 0.28)`, plus `box-shadow: 0 2px 10px rgba(0,0,0,0.35)` for the "shadowy,
subtle" depth requested. The status edge is a 3px solid bar in the status colour —
left for recipes, top for tables — so kind is readable from the *geometry* of the
status bar even in monochrome.

**Layer — medallion tiers, deliberately disjoint from the kind palette:**

| Layers | Tier | Token | Hex |
|---|---|---|---|
| `STG`, `ODS` | raw / bronze | `--layer-bronze` | `#b0764a` |
| `DWH`, `ETL` | refined / silver | `--layer-silver` | `#9aa6b8` |
| `CDM`, `QDM`, `RDM` | curated / gold | `--layer-gold` | `#d4a537` |
| `OUTPUT` | export / platinum | `--layer-platinum` | `#cfd8e6` |
| `UNKNOWN` | unresolved | `--layer-unknown` | `#4a5570` |

`UNKNOWN` stays deliberately colourless: an unresolved layer must *look* unresolved,
not like a fourth tier. `UNKNOWN` is not a corpus value — it is
`OperationalService`'s fallback when L2L cannot resolve a recipe's layer, so its
appearance is diagnostic information.

**Status — unchanged from today**, now sourced from the same module:
`OK #34d399`, `KO #f87171`, `PENDING #4a5570`, `RUNNING #fbbf24`.

### 4.3 The toolbar is the legend

Rather than adding a legend block, the toolbar's existing `FilterChips`
(`ETLOperational.tsx:1006`) adopt the palette: Layer chips tint bronze / silver /
gold / platinum, Kind chips tint blue / orange, Status chips keep their colours (they
already accept a `colors` prop, `:778`). The control you use to filter by a dimension
is the thing that teaches you that dimension's colour. No new UI surface, no legend
that can drift from the cards it describes.

### 4.4 Relationship to ADR-0005

ADR-0005 makes the Figma look sacred and forbids restyling "without an explicit ask".
This section **is** that explicit ask, recorded in ADR-0017, and is scoped to Tab 3's
operational cards, toolbar chips and selection strip. Tabs 1, 2 and 4 render
unchanged; `semanticColors.ts` is additive and has no other consumers.

---

## 5. Chrome: pane-aware summary, collapsible time view, tighter strip (defects 2, 3, 5)

### 5.1 Snapshot chip follows the pane (defect 2)

`ETLOperational.tsx:319-327` floats the `CorpusSummary` chip bottom-left over the
canvas, unconditionally. Collapsing the cluster pane is the operator's "give me
maximum canvas" gesture, so the chip must honour it too.

`RelationshipGraph` gains an explicit `summaryVisible: boolean` prop, passed as
`!view.paneCollapsed`. An explicit prop rather than reading the store inside
`RelationshipGraph`, because that component is already `memo`'d over its props and a
store read would bypass the memo boundary.

### 5.2 TIME VIEW collapse (defect 3)

`ETLOperational.tsx:836-847` renders the `TimePicker` + `AvailabilityCalendar` row in
a bordered wrapper that is always present, consuming ~46px of vertical space
permanently.

- New **persisted** view key `timeViewCollapsed: boolean`, default `false`, joining
  `PERSISTED_KEYS` in `state/operationalView.ts:25` with a `VALIDATORS` entry. The
  validator is not optional: `operationalView.ts:36-44` documents that a corrupt
  persisted value white-screened the tab once already.
- Collapsed: the wrapper *and its border* are not rendered — the full bar is freed.
- Collapsed: a chip appears in the toolbar reading `⏱ <selectedDate> · <hour>h ▾`,
  built from `view.selectedDate` and `timeMeta`. Clicking it expands. The active
  snapshot is never invisible.
- Expanded: an `✕` control at the right end of the bar collapses it.

### 5.3 Selection strip (defect 5)

`components/tab3/SelectionStrip.tsx:46` and `:59`:

| Property | Today | After |
|---|---|---|
| padding | `6px 10px` | `4px 10px` |
| background | `--surface-2` | `--bg` (darker strip) |
| stats colour | `--text-dim` `#4a5570` | `--text-muted` `#7b88aa` |

Net effect: a shorter bar whose numbers separate from the cluster chips beside them.

---

## 6. Related navigation (defect 6)

### 6.1 Ground truth

`ETLOperational.tsx:904-912` renders each related node as a compact card whose click
handler is `setOperationalView({ selectedNode: rid })`. That is a **destructive** hop:
the previous selection is gone, with no record of it and no way back. Following a
lineage three nodes deep and then wanting the node you started from means finding it
on the canvas again by eye. On a 219-recipe cluster that is not realistic.

### 6.2 Three additive pieces

**6.2.1 Back / forward history.** Session-lived (never persisted — a selection must not
outlive a reload, matching the existing `PERSISTED_KEYS` policy):

```ts
interface NodeVisit { nodeId: string; zoom: number; pan: { x: number; y: number } }
nodeHistory: NodeVisit[]      // capped at 25, oldest dropped
historyIndex: number          // -1 when empty
```

- A selection change that is **not** itself a back/forward step truncates any forward
  entries and pushes a new visit, capturing the canvas view at the moment you leave.
- `◀` / `▶` render immediately left of `Related (n)`, disabled at the ends, with
  `aria-label`s naming the target node.
- Stepping back restores **both** the node and the `zoom`/`pan` you left it at, so the
  canvas looks the way you remember it — not merely auto-panned to reveal the node.
- The cap of 25 matches Tab 2's undo stack, so the app has one answer to "how far back
  does history go".

**6.2.2 "Show All Related" overlay.** A new `components/tab3/RelatedOverlay.tsx`,
following the existing `PreviewOverlay.tsx` pattern (backdrop, `Esc` to close, focus
trap): the focused node centred, every entry of `card.relations` around it, edges
drawn with their kind, each neighbour clickable to re-centre the overlay.

**6.2.3 Real new browser tab.** The "Show All Related" affordance is an **anchor**:

```tsx
<a href={`?related=${encodeURIComponent(nodeId)}&clusters=${clusters.join(',')}`}
   onClick={e => { if (isPlainLeftClick(e)) { e.preventDefault(); openOverlay() } }}>
```

Left-click opens the in-app overlay; ⌘/Ctrl-click, middle-click, and
right-click → "Open link in new tab" all fall through to the browser's own
new-tab handling, because the element is a real link with a real `href`. No
`window.open`, no synthetic mouse-button handling — the platform already implements
every one of those gestures correctly.

`App.tsx` reads `?related=` the way it already reads `?focus=` (`App.tsx:175`,
`readFocusRecipe`) and renders the same `RelatedOverlay` content standalone, without
the `TopBar`, exactly as focus mode does. **The overlay component is shared** — the
in-app window and the standalone tab cannot drift.

### 6.3 Canvas synchronisation

While the overlay is open, the main canvas selection **stays in sync with the
overlay's current focus**. Re-centring the overlay on a neighbour re-selects that node
behind it, so the cards and arrows underneath always represent where you have
navigated, and closing the overlay leaves you at the node you navigated to rather than
snapping back. Every overlay hop is pushed onto the §6.2.1 history, so `◀` unwinds
overlay navigation and canvas navigation through the same stack.

---

## 7. b15 status vocabulary (defect 7) — **critical**

### 7.1 Ground truth

The status token is read raw from the CSV at
`backend/.../service/B15Reader.java:141` (`cell(row, "status")`) and compared against
closed literal sets in three places:

- `service/ClusterIndexService.java:53-54` — `OK = "SUCCESS"`, `KO = "FAILED"`
- `api/ClusterController.java:85-86` — `"SUCCESS".equals(...)` / `"FAILED".equals(...)`
- `service/OperationalService.java:134-135` — same pair

and once more in the frontend, `api/relationshipsAdapter.ts:60`:

```ts
const STATUS_MAP: Record<string, StatusType> = { SUCCESS: 'OK', FAILED: 'KO', '': 'PENDING' }
```

A real export writes `FAILURE`. It matches **none** of the four, so:

- `ClusterIndexService` counts it as neither `ok` nor `ko`,
- `mapStatus` falls through its `??` to `'PENDING'`.

A failed run is therefore rendered as **"never ran"** — the single most misleading
state this tab can display, and the direct cause of the `70 OK · 39 PENDING · 0 KO`
readout in image 18 on data that contains real failures.

This is structurally identical to the ADR-0013 anchor-table trap: an anonymized sample
vocabulary hardcoded as though it were IPC law, failing **silently** on real data.

### 7.2 Design

**One normalizer, applied at the read boundary.** A new
`backend/.../service/support/B15Status.java` canonicalises the token inside
`B15Reader.parse` (`:138-142`), before any `B15RowDto` exists. Every downstream
consumer keeps comparing exactly two literals and needs **no change**:

```
CSV "FAILURE" ─► B15Status.canonical ─► "FAILED" ─► ClusterIndexService
                                                 ─► ClusterController
                                                 ─► OperationalService
                                                 ─► RelationshipService
                                                 ─► wire ─► frontend STATUS_MAP
```

Canonical outputs are exactly today's vocabulary — `SUCCESS`, `FAILED`, `""` — so the
wire shape, the OpenAPI schema and the frontend contract are unchanged. This is a
deliberate choice over introducing an `OK`/`KO` enum on the wire: it keeps the blast
radius at one file and cannot move any existing test's expectations.

**Matching** is case-insensitive and trimmed.

**Defaults:**

| Canonical | Accepted |
|---|---|
| `SUCCESS` | `SUCCESS`, `SUCCEEDED`, `OK`, `COMPLETED`, `DONE` |
| `FAILED` | `FAILURE`, `FAILED`, `ERROR`, `KILLED`, `ABORTED`, `CANCELLED` |

`CANCELLED`/`KILLED` default to `FAILED` because for an operator they are emphatically
not successes, and the failure mode this defect is about is a non-success rendering as
PENDING. Sites that disagree can move them — that is what §7.3 is for.

### 7.3 Configuration

Following the `LayerToLayer` precedent exactly (`config/Etl360Properties.java:62-78`):
a nested `B15` record with `DEFAULTS`, a `withDefaults()` for partial binding, and a
convenience constructor at the previous arity so existing call sites keep compiling.

- Spring: `etl360.b15.status-ok`, `etl360.b15.status-ko`
- `config.json`: `b15StatusOk`, `b15StatusKo`, mapped through `scripts/dev.sh` per
  ADR-0009
- Documented in `HOW_TO_RUN_ON_YOUR_DATA.md`, whose derivation table gains `B15Reader`

### 7.4 Unrecognized values are reported, never swallowed

A non-empty token matching neither list canonicalises to `""` (PENDING) — but it is
**counted**, and `GET /api/diagnostics` reports it:

```json
"b15": { "unrecognizedStatuses": [ { "value": "SKIPPED", "count": 3 } ] }
```

ADR-0013 exists so an empty Tab 3 names its own cause. This extends the same principle
one level down: a **PENDING card** now names its own cause too.

### 7.5 Proving it without touching the corpus

The committed `m_CAS_*` b15 rows are manifest-generated and frozen; hand-editing one is
forbidden by root `CLAUDE.md`. §7 is therefore proven with a **test-only CSV fixture**
under `backend/src/test/resources/` containing `FAILURE`, `SUCCEEDED` and an
unrecognized token. **No committed mock floor moves** — `make validate-loop`'s
`21 clusters · 30 recipes · 14 dates · 417 rows` and the readiness floors are all
unchanged by this sub-project, which is itself an assertion worth making.

---

## 8. Operational search (defect 8)

### 8.1 Ground truth

`App.tsx:269` renders `<ETLOperational />` — no `searchQuery` prop, while Tabs 1 and 2
receive one (`:259`, `:264`). Tab 3's own toolbar search (`:763`) filters cards that
are **already loaded**, which requires a cluster to be selected first. So on a real
export there is no way to answer "which cluster runs `DWH.DWH_F_CONTR_LTV_RC_D`?"
without guessing a cluster and looking.

Recipe names are in the b15 index; **table** names exist only in the L2L relationships
graph, which ADR-0014 deliberately never fetches unscoped. So a client-side search
cannot see tables at all — the join has to happen server-side.

### 8.2 Endpoint

```
GET /api/operational/search?q=<term>&limit=<n>
```

- Case-insensitive substring over b15 recipe names (`ClusterIndexService`) **and**
  table node names (`RelationshipService`).
- Each hit carries the clusters that reach it: a recipe contributes the clusters it
  ran in; a table contributes the clusters of every recipe that reads or writes it.
- Bounds: `q` shorter than 2 chars → empty result (not an error); `limit` default 50,
  max 200; an explicit `truncated` flag when hits were dropped. Bounded by
  construction, so this endpoint cannot become the scale problem ADR-0014 solved.
- Response:

```json
{ "hits": [ { "kind": "table", "name": "DWH.DWH_F_CONTR_LTV_RC_D",
              "layer": "DWH", "clusters": ["cluster-wf-cro-rc-load-main"] } ],
  "truncated": false }
```

This performs the recipe ↔ table ↔ cluster join that ADR-0014 deliberately kept off
the client, so it is recorded as **ADR-0019**.

### 8.3 Frontend

- `App.tsx:269` passes `searchQuery={activeTab === 'operational' ? searchQuery : ''}`,
  matching the guard Tabs 1 and 2 already use.
- A non-empty global query renders a results panel over the tab: hits grouped by kind,
  each row naming its clusters. Clicking a hit selects its clusters and, once the
  scoped graph resolves, selects that node.
- The panel works **from any state**, including the "no cluster selected" state at
  `:628-655` — which is the whole point.

### 8.4 Two searches, two jobs

Both inputs stay, with labels that state their scope:

| Input | Scope | Placeholder |
|---|---|---|
| Top bar (`App.tsx:66`) | the whole b15 history + graph | `Search files, mappings…` |
| Tab 3 toolbar (`:763`) | the cards currently on the canvas | `Filter this canvas…` |

Only the Tab 3 placeholder changes, from `Search tables / recipes…` — a promise it
cannot keep, since it can only see what is loaded.

---

## 9. Testing

| Concern | Gate |
|---|---|
| pitch ≥ footprint invariant, per density | vitest, `relationshipsAdapter.test.ts` |
| no two cards' rectangles overlap | vitest, fixture graph × 3 densities |
| `semanticColors` total over layers/kinds/statuses | vitest |
| summary chip hidden iff pane collapsed | vitest, `ETLOperational.test.tsx` |
| time-view collapse + chip label + persistence | vitest, `operationalView.test.ts` |
| corrupt `timeViewCollapsed` cannot white-screen | vitest |
| back/forward restores node **and** view; 25 cap | vitest |
| overlay opens on plain click; ⌘/middle click does not `preventDefault` | vitest |
| `?related=` renders standalone | vitest, `App.test.tsx` |
| `B15Status` canonicalisation incl. `FAILURE` | JUnit, fixture CSV |
| unrecognized tokens surface in `/api/diagnostics` | JUnit contract test |
| `etl360.b15.status-*` override binds | JUnit |
| search: recipe hits, table hits, bounds, `truncated` | JUnit contract test |
| committed mock floors **unchanged** | `make validate-loop` |
| search endpoint on committed mock | `make validate-loop` curl + floor |

Plus `make test`, `make check` (`tsc --noEmit`), and the §10 walk.

---

## 10. Acceptance criteria

Verified in a **real Chrome session** driven through the browser extension against
`make dev`, because §3.4, §4 and §6 are visual claims that no unit test can settle.
Each criterion is PASS/FAIL with a screenshot.

1. At `detailed`, `compact` and `minimal`, **no card overlaps another**, and edges are
   visible between columns. (defect 1 — the images 13/14/15 case)
2. Long real-corpus names do not widen a compact/minimal card past its column.
3. Collapsing the cluster pane hides the bottom-left snapshot chip; expanding restores
   it. (defect 2)
4. Hiding TIME VIEW frees the entire bar; the toolbar chip names the active date;
   clicking it restores the bar; the state survives a reload. (defect 3)
5. Tables read blue with a top status edge; recipes read orange with a left status
   edge; layer chips show bronze/silver/gold/platinum; toolbar chips match. (defect 4)
6. The selection strip is shorter than before and its stats are legible. (defect 5)
7. `Related` shows `◀ ▶`; hopping three deep and pressing `◀` three times returns
   through the exact nodes and canvas views. (defect 6)
8. "Show All Related" opens the overlay on left-click and a real new browser tab on
   ⌘/middle-click, both rendering the same neighbourhood. (defect 6)
9. A b15 row with `status=FAILURE` renders **KO**, not PENDING, on the card, in the
   history strip, and in the OK/KO counts. (defect 7)
10. `/api/diagnostics` reports an unrecognized status token. (defect 7)
11. Typing a table name in the **top bar** while on ETL Operational, with no cluster
    selected, lists it and navigates to it. (defect 8)
12. `make test`, `make check`, `make validate-loop` all pass, with **no committed mock
    floor changed**.

---

## 11. Artifacts

| Artifact | Path |
|---|---|
| This spec | `docs/superpowers/specs/2026-08-29-operational-clarity-design.md` |
| Plan | `docs/superpowers/plans/2026-08-29-operational-clarity.md` |
| ADR — semantic colour system | `docs/adr/0017-semantic-colour-system.md` |
| ADR — b15 status vocabulary | `docs/adr/0018-b15-status-vocabulary.md` |
| ADR — operational search index | `docs/adr/0019-operational-search.md` |

Branch `feat/etl360-operational-clarity`.

---

## 12. Deviations

**D1 — §7.5's fixture is a `@TempDir`, not a committed test resource.** The plan called for
`backend/src/test/resources/mock-status-dialect/…csv`. `B15ReaderTest` already writes its CSVs
inline into a JUnit `@TempDir`, so `B15ReaderStatusDialectTest` follows that idiom instead of
introducing a second one. The substance of §7.5 is unchanged and strengthened: no file is
committed at all, so there is nothing a future corpus walk could pick up by accident.

**D2 — `B15Reader` gained an `Etl360Properties` constructor parameter.** §7.2 did not say how the
reader would reach the configured vocabulary. It takes it the way `LayerToLayerService` already
does (`LayerToLayerService.java:24`), which cost a one-line edit at seven test construction
sites and keeps one precedent in the codebase rather than two.
