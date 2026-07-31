# ETL Modifier on Real Recipes — Implementation Plan (sub-project 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tab 2 becomes a real, editable designer over the corpus's 74 `_ETL_*.json` recipes — recipe canvas in Tab 1's visual language, palette + click-wire editing, save with sidecar history/rollback, merged XML+recipe expression registry, collapsible Explorer, and a 74/74 `recipe_sweep` gate — per spec `docs/superpowers/specs/2026-07-31-etl-modifier-design.md` (every section binding).

**Architecture:** JSON is the truth, the canvas is a projection. A pure adapter `recipeToCanvas(recipe, recipePath)` derives the EXISTING canvas types (`ETLNode`/`Port`/`Connection`, `frontend/src/types.ts:3-38`) from a recipe's implicit connectivity (dot-notation refs); layout is shared with Tab 1 via an extracted `canvasLayout.ts`; the Tab 1 `Canvas` moves to `shared/EtlCanvas.tsx` unchanged. Every edit mutates a `draft: RecipeJson` clone through pure helpers in `recipeEdits.ts`; the canvas re-derives via `useMemo`. The backend gains its first write endpoints (PUT + validate + `_history/` sidecar + rollback) behind the existing `PathResolver` sandbox.

**Tech Stack:** React 19 + existing SVG canvas, TanStack Query, vitest 4 + RTL + MSW 2, Spring Boot MockMvc, Node 22 `--experimental-strip-types` sweep.

## Global Constraints

- **Environment (every session):** frontend tooling `export PATH="$HOME/.local/toolchains/node-v22.23.2-darwin-x64/bin:$PATH"`; backend `export PATH="/usr/local/bin:$PATH"` and `export JAVA_HOME="/Applications/IntelliJ IDEA CE.app/Contents/jbr/Contents/Home"`.
- **Verification per task:** frontend `cd frontend && pnpm test && npx tsc --noEmit`; backend `mvn -q -am -pl backend test`. Both clean before every commit that touches that side.
- **Figma visual contract.** Sanctioned changes ONLY (spec §9): palette strip, history drawer, raw-JSON toggle, collapsible sidebar rail, canvas-in-Tab-2 — all composed from existing tokens (`--surface`, `--border`, `#7b88aa`, mono 10) and component idioms. Tab 1 visuals byte-identical after the canvas extraction (`git diff` scope proof in Task 13).
- **Adapter purity:** `recipeAdapter.ts`, `canvasLayout.ts`, `recipeEdits.ts` use `import type` only for types and ONLY relative runtime imports **with explicit `.ts` extensions** (`tsconfig.json` already sets `allowImportingTsExtensions: true`) so `node --experimental-strip-types` can load them for the sweep.
- **Dot-notation refs are preserved verbatim** (`"TABLE.FIELD"` strings — CLAUDE.md hard rule). Never normalize, trim, or re-case a `source` value when reading or writing.
- **RTL cleanup:** the project has NO auto-cleanup (no `globals: true`, no global `afterEach`). Every NEW test file that renders more than once adds `afterEach(() => cleanup())` — mimic `frontend/src/components/tab1/DetailPanel.test.tsx:8`.
- **Corpus floors unchanged:** 69 mappings / 74 recipes / 18 L2L.
- **Commit protocol:** tick this plan's checkboxes and include this file (`docs/superpowers/plans/2026-07-31-etl-modifier.md`) in each task's commit; stage explicit paths — NEVER `git add -A` (`scripts/dev.sh` carries an uncommitted USER edit; `first_prompt.md` and `.claude/settings.json` untracked; all stay out).
- **Branch:** `feat/etl360-modifier`.

## Progress & resume protocol

Tick checkboxes per task, commit this file with each task. Resume = `git log --oneline` + first unticked checkbox. The checkpoint note between Tasks 3 and 4 is a controller action, not a task.

---

### Task 1: Weststone corpus repair — `"weststone"` → `"fields"` in 64 recipes

**Files:**
- Modify: 64 corpus files under `parser/src/main/resources/xmltobq/**/_ETL_*.json` (mechanical key rename only)
- Modify: root `CLAUDE.md` (one caveat line under `## Corpus caveats`, ~line 90)

Ground truth (verified): 64 of 74 recipes carry the anonymizer-corrupted key; in JSON files the token appears ONLY in key position, always as `"weststone" : [` (Jackson pretty-print spacing). XML files legitimately contain `WESTSTONE` as anonymized *names* — the rename is scoped to `_ETL_*.json` strictly.

- [x] **Step 1: Pre-flight proof.**

```bash
grep -rl '"weststone"' parser/src/main/resources/xmltobq --include='_ETL_*.json' | wc -l   # expect 64
grep -rl '"weststone"' parser/src/main/resources/xmltobq --include='*.json' | grep -v '_ETL_' | wc -l  # expect 0
```

- [x] **Step 2: Mechanical rename** (key position only, whitespace-tolerant, no other bytes):

```bash
grep -rl '"weststone"' parser/src/main/resources/xmltobq --include='_ETL_*.json' \
  | xargs perl -pi -e 's/"weststone"(\s*:)/"fields"$1/g'
```

- [x] **Step 3: Grep-proof zero remaining + diff-shape proof.**

```bash
grep -rn '"weststone"' parser/src/main/resources/xmltobq --include='*.json' | wc -l        # 0
git diff --stat parser/src/main/resources/xmltobq | tail -1                                # 64 files changed
git diff -U0 parser/src/main/resources/xmltobq | grep '^[+-]' | grep -v '^[+-][+-]' \
  | grep -vE '"(weststone|fields)" :' | wc -l                                              # 0 — nothing else touched
```

- [x] **Step 4: Backend contract still green** — `mvn -q -am -pl backend test` (CorpusContractTest `everyRecipeServes` ≥74 — the DTO is a raw JsonNode passthrough, so nothing else can break; a failure here means the rename script damaged JSON).
- [x] **Step 5: CLAUDE.md caveat line** — append to `## Corpus caveats`: `- The anonymizer had also renamed the recipe structural key "fields" to "weststone" in 64 recipes; repaired 2026-07-31 (key rename only, byte-diff limited to the key token). The frontend recipe adapter still tolerates both spellings defensively.`
- [x] **Step 6: Commit**

```bash
git add parser/src/main/resources/xmltobq CLAUDE.md docs/superpowers/plans/2026-07-31-etl-modifier.md
git commit -m "fix(corpus): repair anonymizer-damaged recipe key — weststone -> fields in 64 recipes"
```

---

### Task 2: Canvas + layout extraction (pure moves, viewer byte-identical)

**Files:**
- Create: `frontend/src/components/shared/EtlCanvas.tsx` (PURE move of the `Canvas` component, `ETLViewer.tsx:26-169`)
- Create: `frontend/src/api/canvasLayout.ts` (PURE move of layout from `mappingAdapter.ts:32-36` constants + `:118-205` helpers)
- Modify: `frontend/src/components/tab1/ETLViewer.tsx` (delete local Canvas, import `EtlCanvas`)
- Modify: `frontend/src/api/mappingAdapter.ts` (delete moved code, import from `./canvasLayout.ts`)

**Interfaces** (Tasks 5/6/9 compose against these EXACT signatures):

```ts
// frontend/src/api/canvasLayout.ts — import type { Connection, ETLNode } from '../types' ONLY
export const X0 = 40, Y0 = 160, COL_PITCH = 230, V_GAP = 40
export const HEADER_H = 44, PORT_H = 22, PAD = 10
export const nodeHeight: (n: { ports: unknown[] }) => number
export function layoutNodes(nodes: ETLNode[], connections: Connection[]): void  // mutates x/y in place
// (buildPredecessors/computeLayers move too, stay module-private)

// frontend/src/components/shared/EtlCanvas.tsx — props verbatim from today's Canvas
export function EtlCanvas(props: {
  nodes: ETLNode[]; connections: Connection[]
  selectedNode: string | null; onSelectNode: (id: string) => void
  highlightIds: string[]
}): JSX.Element
```

`EtlCanvas` keeps importing `NodeBox, getNodeHeight, getPortY, buildPath, NODE_WIDTH` from `'../tab1/NodeBox'` (spec §3.2: NodeBox stays in tab1). Function body, JSX, pan/zoom/pill logic: byte-identical move — only the name (`Canvas`→`EtlCanvas`) and import paths change.

- [x] **Step 1: Move layout to `canvasLayout.ts`;** `mappingAdapter.ts` line 1 area gains `import { layoutNodes } from './canvasLayout.ts'` (`.ts` extension mandatory — strip-types constraint above).
- [x] **Step 2: Move Canvas to `EtlCanvas.tsx`;** ETLViewer renders `<EtlCanvas …/>` at the old `<Canvas …/>` call site (ETLViewer.tsx:265). No test-file edits expected: `ETLViewer.test.tsx` renders `ETLViewer`, `mappingAdapter.test.ts` imports only `toCanvas` — verify with `grep -rn "from './canvasLayout'\|Canvas" frontend/src/**/*.test.*`.
- [x] **Step 3: GREEN unchanged** — `cd frontend && pnpm test && npx tsc --noEmit` (all existing tests pass with zero test edits).
- [x] **Step 4: strip-types still loads the adapter chain** (no backend needed):

```bash
node --experimental-strip-types -e "import('./frontend/src/api/mappingAdapter.ts').then(m => console.log(typeof m.toCanvas))"   # "function"
```

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/shared/EtlCanvas.tsx frontend/src/api/canvasLayout.ts \
  frontend/src/components/tab1/ETLViewer.tsx frontend/src/api/mappingAdapter.ts \
  docs/superpowers/plans/2026-07-31-etl-modifier.md
git commit -m "refactor(canvas): shared EtlCanvas + canvasLayout extraction — viewer byte-identical"
```

---

### Task 3: Collapsible Explorer (rail + chevron, per-tab state)

**Files:**
- Modify: `frontend/src/components/shared/Sidebar.tsx` (collapse support; expanded 240 px view unchanged — `Sidebar.tsx:167` width)
- Modify: `frontend/src/components/tab1/ETLViewer.tsx`, `frontend/src/components/tab2/ETLModifier.tsx` (per-tab `useState(false)`; ETLViewer status bar `left: 240` at ETLViewer.tsx:280 becomes `left: sidebarCollapsed ? 28 : 240`)
- Test: `frontend/src/components/shared/Sidebar.test.tsx` (new)

Ground truth: the shared Sidebar is consumed ONLY by Tab 1 (`ETLViewer.tsx:237`) and Tab 2 (`ETLModifier.tsx:377`); Tab 3 has no explorer, Tab 4 has its own `DagExplorer` (`ETLDag.tsx:21`). "All tabs" = every tab that renders the shared Explorer; recorded as a spec footnote in Task 13.

**Interfaces:**

```ts
export function Sidebar(props: {
  searchQuery: string; selectedPath: string | null
  onSelectFile: (f: FSFile) => void; filesystem: FSDir
  extraContent?: React.ReactNode
  collapsed?: boolean               // default false = today's markup untouched
  onToggleCollapse?: () => void     // chevron rendered only when provided
})
```

Collapsed: outer div `width: 28` (rail), `background: 'var(--surface)'`, `borderRight: '1px solid var(--border)'`; contents = ONLY the existing 13×13 EXPLORER glyph svg (Sidebar.tsx:183-187, centered, marginTop 10) and below it a chevron `<button aria-label="Expand explorer">` (transparent bg, `color: '#7b88aa'`, the existing `path d='M3 1l4 4-4 4'` chevron). Expanded: today's header row gains one right-aligned chevron `<button aria-label="Collapse explorer">` (`d='M7 1L3 5l4 4'`), everything else pixel-stable.

- [x] **Step 1: Failing test** (`Sidebar.test.tsx` — `afterEach(() => cleanup())` per Global Constraints):

```ts
import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useState } from 'react'
import type { FSDir } from '../../types'
import { Sidebar } from './Sidebar'

afterEach(() => cleanup())
const FS: FSDir = { name: 'xmltobq', layer: 'root', children: [
  { name: 'CDM', layer: 'CDM', children: [{ name: '_ETL_m_FIX.json', path: 'CDM/m_FIX/_ETL_m_FIX.json', type: 'json' }] },
] }
function Host() {
  const [collapsed, setCollapsed] = useState(false)
  return <Sidebar searchQuery="" selectedPath={null} onSelectFile={() => {}} filesystem={FS}
    collapsed={collapsed} onToggleCollapse={() => setCollapsed(c => !c)} />
}
describe('Sidebar — collapse rail', () => {
  it('collapses to a rail and expands back', () => {
    render(<Host />)
    expect(screen.getByText('_ETL_m_FIX.json')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Collapse explorer'))
    expect(screen.queryByText('_ETL_m_FIX.json')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Expand explorer'))
    expect(screen.getByText('_ETL_m_FIX.json')).toBeInTheDocument()
  })
  it('renders no chevron when uncontrolled (back-compat)', () => {
    render(<Sidebar searchQuery="" selectedPath={null} onSelectFile={() => {}} filesystem={FS} />)
    expect(screen.queryByLabelText('Collapse explorer')).not.toBeInTheDocument()
  })
})
```

- [x] **Step 2: RED** (`pnpm test` — no chevron exists) **→ Step 3: implement** per interface; wire both tab components with `const [sidebarCollapsed, setSidebarCollapsed] = useState(false)` passing `collapsed`/`onToggleCollapse`.
- [x] **Step 4: GREEN + tsc → Step 5: Commit**

```bash
git add frontend/src/components/shared/Sidebar.tsx frontend/src/components/shared/Sidebar.test.tsx \
  frontend/src/components/tab1/ETLViewer.tsx frontend/src/components/tab2/ETLModifier.tsx \
  docs/superpowers/plans/2026-07-31-etl-modifier.md
git commit -m "feat(shell): collapsible Explorer rail in Viewer + Modifier"
```

---

> **CHECKPOINT (controller action, not a task):** after Tasks 1–3 pass review, merge `feat/etl360-modifier` → `main` (fast-forward or merge commit, tests green) so Stream B (sub-project 4) forks with the repaired corpus, shared `EtlCanvas`/`canvasLayout`, and collapsible Sidebar. Stream A continues on this same branch. Do not start Task 4 until the controller confirms the merge.

---

### Task 4: recipeAdapter core — nodes, kinds, ports

**Files:**
- Create: `frontend/src/api/__fixtures__/recipe_m_DM_INFOHUB_BIZLINK.json`, `recipe_m_SYN_ODS_ORDERS.json`
- Create: `frontend/src/api/recipeAdapter.ts`
- Test: `frontend/src/api/recipeAdapter.test.ts`

Corpus ground truth (verified, encode in tests):
- BIZLINK (`CDM/m_DM_INFOHUB_BIZLINK/_ETL_m_DM_INFOHUB_BIZLINK.json`, ~1000 lines): 2 steps — target `BIZLINK` (`type:"table"`, 61 fields, in `targetTableNames`) sourced from `SQ_ff_BIZLINK`; target `SQ_ff_BIZLINK` (**corrupted type `"BERYLFALLS"`** — the anonymizer damaged type VALUES too: corpus-wide target types include `BERYLFALLS`×86, `EARLYGLADE`×49, `ASHPATH2`×10, `CEDARWICK2`×1) with 60 fields, sourced from table `ff_BIZLINK`. Its dot-refs say `FF_BIZLINK.*` (upper) while the source node is `ff_BIZLINK` (lower) — **case-insensitive node resolution is required** (rescues exactly 2 corpus recipes).
- SYN (`ODS/m_SYN_ODS_ORDERS/_ETL_m_SYN_ODS_ORDERS.json`): 1 step, clean types, nested lookup call tree on field `AMOUNT` whose lookup `parameters` are Field-shaped (`{name, dataType, transformation}`).

**Interfaces** (Tasks 5/6/8/12 rely on these EXACT signatures):

```ts
// frontend/src/api/recipeAdapter.ts — import type { Connection, ETLNode, NodeType, Port } from '../types'
// + import type { CanvasGraph } from './mappingAdapter' + runtime import { layoutNodes } from './canvasLayout.ts'
export interface RecipeTransformationJson { source?: string; value?: string; name?: string; outputField?: string; parameters?: unknown[] }
export interface RecipeFieldJson { name?: string; dataType?: string; transformation?: RecipeTransformationJson }
export interface RecipeTargetJson { name?: string; type?: string; fields?: RecipeFieldJson[]; weststone?: RecipeFieldJson[] }
export interface RecipeSourceJson { name?: string; type?: string }
export interface RecipeStepJson { target?: RecipeTargetJson; sources?: RecipeSourceJson[] }
export interface RecipeJson { steps?: RecipeStepJson[]; table?: { targetTableNames?: string[]; sourceTableNames?: string[] } }
export function fieldsOf(t: RecipeTargetJson | undefined): RecipeFieldJson[]   // fields ?? weststone ?? []
export function recipeToCanvas(recipe: RecipeJson, recipePath: string): CanvasGraph
```

- [x] **Step 1: Capture fixtures** (corpus files ARE the payload — no backend boot; anonymized, committable):

```bash
cp parser/src/main/resources/xmltobq/CDM/m_DM_INFOHUB_BIZLINK/_ETL_m_DM_INFOHUB_BIZLINK.json frontend/src/api/__fixtures__/recipe_m_DM_INFOHUB_BIZLINK.json
cp parser/src/main/resources/xmltobq/ODS/m_SYN_ODS_ORDERS/_ETL_m_SYN_ODS_ORDERS.json frontend/src/api/__fixtures__/recipe_m_SYN_ODS_ORDERS.json
```

- [x] **Step 2: Failing test:**

```ts
import { describe, expect, it } from 'vitest'
import { recipeToCanvas } from './recipeAdapter'
import type { RecipeJson } from './recipeAdapter'
import bizlink from './__fixtures__/recipe_m_DM_INFOHUB_BIZLINK.json'
import syn from './__fixtures__/recipe_m_SYN_ODS_ORDERS.json'
const BIZ_PATH = 'CDM/m_DM_INFOHUB_BIZLINK/_ETL_m_DM_INFOHUB_BIZLINK.json'

describe('recipeToCanvas — nodes, kinds, ports', () => {
  it('derives target / intermediate / source nodes from the BIZLINK recipe', () => {
    const g = recipeToCanvas(bizlink as RecipeJson, BIZ_PATH)
    const byId = new Map(g.nodes.map(n => [n.id, n]))
    expect(byId.get('BIZLINK')!.type).toBe('target')          // table-typed AND in targetTableNames
    expect(byId.get('SQ_ff_BIZLINK')!.type).toBe('expression') // corrupted type "BERYLFALLS" -> unknown rule
    expect(byId.get('SQ_ff_BIZLINK')!.label).toBe('BER')
    expect(byId.get('ff_BIZLINK')!.type).toBe('source')        // sources[] entry of type table
    expect(g.nodes).toHaveLength(3)
  })
  it('ports: 61 IN on target, 60 IN/OUT on intermediate, OUT union-of-refs on source', () => {
    const g = recipeToCanvas(bizlink as RecipeJson, BIZ_PATH)
    const byId = new Map(g.nodes.map(n => [n.id, n]))
    expect(byId.get('BIZLINK')!.ports).toHaveLength(61)
    expect(byId.get('BIZLINK')!.ports.every(p => p.direction === 'IN')).toBe(true)
    expect(byId.get('SQ_ff_BIZLINK')!.ports).toHaveLength(60)
    expect(byId.get('SQ_ff_BIZLINK')!.ports.every(p => p.direction === 'IN/OUT')).toBe(true)
    const src = byId.get('ff_BIZLINK')!
    expect(src.ports.length).toBeGreaterThan(0)               // derived from FF_BIZLINK.* refs (case-insensitive)
    expect(src.ports.every(p => p.direction === 'OUT')).toBe(true)
  })
  it('tolerates the pre-repair weststone key (defensive)', () => {
    const damaged = JSON.parse(JSON.stringify(bizlink).replaceAll('"fields":', '"weststone":')) as RecipeJson
    const g = recipeToCanvas(damaged, BIZ_PATH)
    expect(g.nodes.find(n => n.id === 'BIZLINK')!.ports).toHaveLength(61)
  })
  it('kind map + fixed labels for union/normalizer/java/storedProcedure/intermediate-table', () => {
    const mk = (type: string): RecipeJson => ({
      steps: [{ target: { name: 'X', type, fields: [] }, sources: [] },
              { target: { name: 'T', type: 'table', fields: [] }, sources: [] }],
      table: { targetTableNames: ['T'], sourceTableNames: [] },
    })
    for (const [type, label] of [['unionInput','UNI'],['normalizer','NRM'],['java','JAV'],['storedProcedure','STO'],['table','TBL']] as const) {
      const n = recipeToCanvas(mk(type), 'L/x/_ETL_x.json').nodes.find(x => x.id === 'X')!
      expect([n.type, n.label]).toEqual(['expression', label])   // 'X' table-typed but NOT in targetTableNames -> intermediate TBL
    }
    const sq = recipeToCanvas(mk('sourceQualifier'), 'L/x/_ETL_x.json').nodes.find(x => x.id === 'X')!
    expect(sq.type).toBe('sq')
  })
  it('SYN recipe: clean 2-node shape; empty/garbage input never throws', () => {
    const g = recipeToCanvas(syn as RecipeJson, 'ODS/m_SYN_ODS_ORDERS/_ETL_m_SYN_ODS_ORDERS.json')
    expect(g.nodes.map(n => n.id).sort()).toEqual(['ODS_SYN_ORDERS', 'STG_L_SYN_ORDERS'])
    expect(recipeToCanvas({} as RecipeJson, 'x').nodes).toEqual([])
    expect(recipeToCanvas({ steps: [{}] } as RecipeJson, 'x').nodes).toEqual([])
  })
})
```

- [x] **Step 3: RED** (module missing) **→ Step 4: implement.** Rules (all reads null-safe):
  1. **Kind map** `RECIPE_KIND: Record<string, NodeType>` = `sourceQualifier→sq`, `filter→filter`, `aggregator→aggregator`, `router→router`, `joinerInput→joiner`, `joiner→joiner`. **Fixed labels** (binding spec §5 values — NOT derived): `unionInput/union→'UNI'`, `normalizer→'NRM'`, `java→'JAV'`, `storedProcedure→'STO'`, intermediate `table→'TBL'` — all `type: 'expression'`. Anything else (corrupted values like `BERYLFALLS`) → `type: 'expression'`, label = `typ.replace(/[^A-Za-z]/g,'').slice(0,3).toUpperCase()` (mirrors `mappingAdapter.ts:52-54`).
  2. **Target vs intermediate (explicit spec rule):** step target `type === 'table'` AND `name ∈ table.targetTableNames` ⇒ kind `target` (ports direction `IN`); `table`-typed but not listed ⇒ intermediate `expression`/`TBL`. All non-target steps get ports direction `IN/OUT` from `fieldsOf(target)`; `dataType` = field `dataType ?? ''`.
  3. **Nodes:** one per unique `step.target.name`; PLUS one kind-`source` node per unique `sources[].name` of `type === 'table'` **that doesn't already have a step-target node** (id = name; ids must stay unique — sweep enforces). Source OUT ports = union of `F` over every dot-ref `T.F` in the whole recipe whose `T` resolves to that node (exact, else case-insensitive — the `FF_BIZLINK`→`ff_BIZLINK` rescue). Ref collection walks every field `transformation` recursively: `{source}` collects; `{parameters}` recurses; a Field-shaped parameter (`{transformation}` present) recurses into its `.transformation` (module-private `collectRefs(recipe): {table: string, field: string, toStep: string, toField: string}[]` — Task 5 reuses it for edges).
  4. `id`/`name` = recipe names verbatim; `properties` = flat non-blank scalars of the target/source object (type, name, plus e.g. `sourceFilter`); `file` = recipePath basename; `x: 0, y: 0` (layout in Task 5); `connections: []` for now; `mappingNames: [basename]`, `renderedMapping: basename`.
- [x] **Step 5: GREEN + tsc → Step 6: Commit**

```bash
git add frontend/src/api/__fixtures__/recipe_m_DM_INFOHUB_BIZLINK.json \
  frontend/src/api/__fixtures__/recipe_m_SYN_ODS_ORDERS.json \
  frontend/src/api/recipeAdapter.ts frontend/src/api/recipeAdapter.test.ts \
  docs/superpowers/plans/2026-07-31-etl-modifier.md
git commit -m "feat(modifier): recipe->canvas adapter core — steps, kinds, ports, weststone tolerance"
```

---

### Task 5: recipeAdapter edges + ƒ formulas + layout

**Files:**
- Modify: `frontend/src/api/recipeAdapter.ts`
- Test: `frontend/src/api/recipeAdapter.test.ts` (add cases)

**Interfaces:**

```ts
export function renderFormula(t: RecipeTransformationJson | undefined): string
// {name, parameters} => NAME(p1, p2, …) recursively (Field-shaped params render their .transformation)
// {source: "T.F"} => T.F verbatim · {value: "v"} => v · undefined/empty => ''
```

- [x] **Step 1: Failing tests:**

```ts
describe('recipeToCanvas — edges, formulas, layout', () => {
  it('derives field edges from dot-refs, case-insensitive from-node resolution, deduped', () => {
    const g = recipeToCanvas(bizlink as RecipeJson, BIZ_PATH)
    const ids = new Set(g.nodes.map(n => n.id))
    for (const c of g.connections) { expect(ids).toContain(c.fromNode); expect(ids).toContain(c.toNode) }
    expect(g.connections).toContainEqual(
      { fromNode: 'SQ_ff_BIZLINK', fromPort: 'GREENBLUFF', toNode: 'BIZLINK', toPort: 'GREENBLUFF' })
    expect(g.connections.some(c => c.fromNode === 'ff_BIZLINK' && c.toNode === 'SQ_ff_BIZLINK')).toBe(true) // FF_ -> ff_
    const keys = g.connections.map(c => `${c.fromNode}|${c.fromPort}|${c.toNode}|${c.toPort}`)
    expect(new Set(keys).size).toBe(keys.length)                       // deduped
    const linked = g.nodes.flatMap(n => n.ports).filter(p => p.linked)
    expect(linked.length).toBeGreaterThan(0)
  })
  it('nested parameter walk yields edges from deep {source} refs (SYN lookup tree)', () => {
    const g = recipeToCanvas(syn as RecipeJson, 'ODS/m_SYN_ODS_ORDERS/_ETL_m_SYN_ODS_ORDERS.json')
    expect(g.connections).toContainEqual(
      { fromNode: 'STG_L_SYN_ORDERS', fromPort: 'CURRENCY_CODE', toNode: 'ODS_SYN_ORDERS', toPort: 'AMOUNT' })
    expect(g.connections).toHaveLength(4)  // ORDER_ID, CUSTOMER_ID, AMOUNT, CURRENCY_CODE->AMOUNT
  })
  it('field-less source entry gets a single node-center edge (empty port names)', () => {
    const r: RecipeJson = { steps: [
      { target: { name: 'T', type: 'table', fields: [{ name: 'A', dataType: 'String', transformation: { value: '1' } }] },
        sources: [{ name: 'S', type: 'table' }] }],
      table: { targetTableNames: ['T'], sourceTableNames: ['S'] } }
    const g = recipeToCanvas(r, 'L/x/_ETL_x.json')
    expect(g.connections).toEqual([{ fromNode: 'S', fromPort: '', toNode: 'T', toPort: '' }])
  })
  it('unresolvable ref tables are dropped silently, never dangling', () => {
    const r: RecipeJson = { steps: [
      { target: { name: 'T', type: 'table', fields: [{ name: 'A', dataType: 'String', transformation: { source: 'GHOST.A' } }] },
        sources: [] }], table: { targetTableNames: ['T'], sourceTableNames: [] } }
    expect(recipeToCanvas(r, 'x').connections).toEqual([])
  })
  it('ƒ rule + renderFormula: call trees render deterministically; plain source/value set no expression', () => {
    const g = recipeToCanvas(bizlink as RecipeJson, BIZ_PATH)
    const tgt = g.nodes.find(n => n.id === 'BIZLINK')!
    expect(tgt.ports.find(p => p.name === 'ID_OAKBLUFF')!.expression).toBe(
      "EXP_TO_DECIMAL(EXP_TO_CHAR(EXP_ADD_TO_DATE(EXP_TO_DATE(SQ_ff_BIZLINK.FCH_DATAENTRY, 'YYYYMMDD'), 'MM', -1), 'ROWANFIELD'))")
    expect(tgt.ports.find(p => p.name === 'GREENBLUFF')!.expression).toBeUndefined()
    const s = recipeToCanvas(syn as RecipeJson, 'ODS/m_SYN_ODS_ORDERS/_ETL_m_SYN_ODS_ORDERS.json')
    // Corrected during Task 5 implementation: the fixture's "Undefined" node (parser
    // sentinel for an unclassified function, RecipeConstants.Undefined) genuinely
    // carries a second parameter ({value:"2"}, recipe_m_SYN_ODS_ORDERS.json:57) — the
    // documented rule ("NAME(p1, p2, …) recursively", no name-based exception) renders
    // it too. See task-5-report.md NEEDS_CONTEXT section.
    expect(s.nodes.find(n => n.id === 'ODS_SYN_ORDERS')!.ports.find(p => p.name === 'AMOUNT')!.expression).toBe(
      'Undefined(EXP_ARITHMETIC(STG_L_SYN_ORDERS.AMOUNT, *, LKP_SYN_CURRENCY(STG_L_SYN_ORDERS.CURRENCY_CODE)), 2)')
  })
  it('layout: shared canvasLayout — finite coords, sources col 0, target rightmost', () => {
    const g = recipeToCanvas(bizlink as RecipeJson, BIZ_PATH)
    for (const n of g.nodes) { expect(Number.isFinite(n.x)).toBe(true); expect(Number.isFinite(n.y)).toBe(true) }
    const byId = new Map(g.nodes.map(n => [n.id, n]))
    expect(byId.get('ff_BIZLINK')!.x).toBe(40)
    expect(byId.get('BIZLINK')!.x).toBe(Math.max(...g.nodes.map(n => n.x)))
  })
})
```

- [x] **Step 2: RED → Step 3: implement.** Edge derivation from `collectRefs`: each ref ⇒ `{fromNode: resolve(T), fromPort: F, toNode: toStep, toPort: toField}`; `resolve` = exact node id, else lower-cased match, else DROP (corpus audit: 10 tokens across 8 recipes reference joiner/union constructs that exist only as non-table `sources[]` entries — dropped by design, recorded in Task 13 footnote). Dedupe via the `|`-joined key set. Center edges: for each step, each `sources[]` entry resolving to a node with ZERO field edges into this step ⇒ `{fromNode, fromPort: '', toNode: step.target.name, toPort: ''}` (EtlCanvas already center-anchors missing ports, ETLViewer.tsx old `:121/:123` logic now in EtlCanvas). Set `port.linked` both sides (mirror `mappingAdapter.ts:244-247`). ƒ: `port.expression = renderFormula(f.transformation)` only when the transformation has `name` (call tree). Finish with `layoutNodes(nodes, connections)` from `./canvasLayout.ts`.
- [x] **Step 4: GREEN + tsc → Step 5: Commit**

```bash
git add frontend/src/api/recipeAdapter.ts frontend/src/api/recipeAdapter.test.ts \
  docs/superpowers/plans/2026-07-31-etl-modifier.md
git commit -m "feat(modifier): recipe edges, formula rendering, shared layout"
```

---

### Task 6: Tab 2 read-only rewiring — real recipes on the shared canvas

**Files:**
- Modify: `frontend/src/api/filesystemAdapter.ts` (fix the tree-click bug: `toFile`, lines 16-23, never sets `f.recipe`)
- Modify: `frontend/src/api/filesystemAdapter.test.ts` (add case)
- Modify: `frontend/src/api/queries.ts` (`useRecipe`/`useDdl` lines 23-27 gain `enabled: !!path`, mirroring `useMappingModel`)
- Modify: `frontend/src/components/tab2/ETLModifier.tsx` (rewire; retire mock feed)
- Modify: `frontend/src/mockData.ts` (delete `ETL_RECIPES` + `DDL_SCHEMAS` exports — grep-verified: only ETLModifier.tsx imports them; update header ledger line)
- Test: `frontend/src/components/tab2/ETLModifier.test.tsx` (new, RTL+MSW)

**Interfaces:**

```ts
// filesystemAdapter.toFile addition (recipe = corpus-relative path, usable directly by useRecipe):
recipe: node.kind === 'json' && (node.name ?? '').startsWith('_ETL_') ? (node.path ?? undefined) : undefined
// ETLModifier internal state contract (Tasks 8-11 build on):
//   recipePath: string | null   — set by tree click on f.recipe
//   const rec = useRecipe(recipePath ?? '')          — RecipeFile (RecipeDto): path/fileName/sizeBytes/modifiedAt/content
//   const graph = useMemo(() => rec.data ? recipeToCanvas(rec.data.content as RecipeJson, recipePath!) : null, …)
//   const ddl = useDdl(recipeDir)                    — recipeDir = recipePath minus '/<fileName>'
```

Behavior spec (exact):
1. `handleSelectFile`: `setSelectedPath(f.path); if (f.recipe) { setRecipePath(f.recipe); setSelectedNodeId(null) }`. Delete `activeRecipeId`/`recipes`/`originalRecipes`/`updateRecipe`/`TransformCard` mock machinery (ETLModifier.tsx:326-373 state + the mock recipe-picker list in `extraContent`, lines 391-404 — the tree IS the picker now).
2. Empty/loading/error states reuse the Tab-1 idiom (empty hint SVG stays; `rec.isLoading` dim text; `rec.error` `--red` title/detail).
3. Canvas section (sanctioned): `<EtlCanvas nodes connections selectedNode onSelectNode highlightIds={[]} />` in a fixed-height container (`height: 420`, `border: '1px solid var(--border)', borderRadius: 8, position: 'relative', overflow: 'hidden'`) under a `SectionHeader icon="⇄" label={`Canvas (${g.nodes.length} nodes)`}`.
4. Header card keeps its frame; content becomes real `RecipeDto` metadata: `fileName` as title, layer chip = first path segment, and a 3-col grid of read-only `EditableField`s (Path / Size bytes / Modified — editing arrives Task 8).
5. Source/Target cards keep frames; content = `table.sourceTableNames` and `table.targetTableNames` lists (mono rows + CopyButton each).
6. Raw JSON toggle (sanctioned): header-row button `{ raw JSON }` toggling a read-only `<pre>` of `JSON.stringify(rec.data.content, null, 2)` with a CopyButton, existing panel styling.
7. DDL section: `useDdl(recipeDir)`; when the map has keys render the existing `DDLViewer` grid fed from real DDL JSON arrays (columns are `{name, type, mode, description}`-shaped BigQuery fields — adapt cell keys to what the fixture shows); when empty or error, hide the whole section.
8. All Expressions section (interim until Task 11): rows from `graph.nodes.flatMap(n => n.ports).filter(p => p.expression)`.
9. Keep `SaveBar` mounted with `changes={0}` (dead until Task 8). Delete `ETL_RECIPES`/`DDL_SCHEMAS` exports from mockData.ts; run `grep -rn "ETL_RECIPES\|DDL_SCHEMAS" frontend/src` → only mockData history remains (zero importers).

- [x] **Step 1: Failing tests.** `filesystemAdapter.test.ts`: tree json leaf `{ name: '_ETL_m_FIX.json', path: 'CDM/m_FIX/_ETL_m_FIX.json', kind: 'json' }` ⇒ `file.recipe === 'CDM/m_FIX/_ETL_m_FIX.json'`; a plain `BIZLINK.json` leaf ⇒ `recipe` undefined. `ETLModifier.test.tsx` (MSW, `afterEach(cleanup)` + server lifecycle like `ETLViewer.test.tsx:132-139`): handlers `/api/tree` (json `_ETL_m_FIX.json` leaf), `/api/recipes/CDM/m_FIX/_ETL_m_FIX.json` → `{ path, fileName: '_ETL_m_FIX.json', sizeBytes: 321, modifiedAt: '2026-07-31T00:00:00Z', content: MINI }` where MINI = the Task-5 field-less-source recipe literal plus one dot-ref field, `/api/ddl/CDM/m_FIX` → `{}`. Flow: render in QueryClientProvider → click `_ETL_m_FIX.json` → `await screen.findByText('T', { selector: 'text' })` (canvas SVG card) → toggle raw JSON → assert a verbatim dot-ref string appears → DDL section absent.
- [x] **Step 2: RED → Step 3: implement per behavior spec → Step 4: GREEN + tsc → Step 5: Commit**

```bash
git add frontend/src/api/filesystemAdapter.ts frontend/src/api/filesystemAdapter.test.ts \
  frontend/src/api/queries.ts frontend/src/components/tab2/ETLModifier.tsx \
  frontend/src/components/tab2/ETLModifier.test.tsx frontend/src/mockData.ts \
  docs/superpowers/plans/2026-07-31-etl-modifier.md
git commit -m "feat(modifier): Tab 2 renders real recipes read-only — canvas, metadata, raw JSON"
```

---

### Task 7: Backend write API — PUT, validate, history sidecar, rollback

**Files:**
- Modify: `backend/src/main/java/io/pure360/etl360/api/RecipeController.java`
- Modify: `backend/src/main/java/io/pure360/etl360/service/RecipeService.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/support/HistorySidecar.java`, `StaleRecipeException.java`
- Create: `backend/src/main/java/io/pure360/etl360/api/dto/RecipeSaveRequestDto.java`, `RecipeValidationDto.java`, `RecipeHistoryEntryDto.java`
- Modify: `backend/src/main/java/io/pure360/etl360/service/CorpusService.java` (shared `_history/` exclusion in `dirNode`, `allXmlPaths`, `collect`)
- Modify: `backend/src/main/java/io/pure360/etl360/api/ApiExceptionHandler.java` (`StaleRecipeException` → 409)
- Test: `backend/src/test/java/io/pure360/etl360/api/RecipeWriteControllerTest.java`

**Interfaces** (Tasks 8/10/12 call these; frontend regenerates `types.gen.ts` in Task 8):

```java
// URL shapes — RULED DEVIATION from spec §7's sketch: Spring's {*path} must be the LAST
// pattern segment (same constraint already recorded for /api/mappings/dom|model in
// docs/architecture.md "Deviation from spec §4 table"). Version rides as a query param.
@PutMapping("/{*path}")                      RecipeDto save(@PathVariable String path, @RequestBody RecipeSaveRequestDto body)
@PostMapping("/validate")                    RecipeValidationDto validate(@RequestBody JsonNode recipe)
@GetMapping("/history/{*path}")              // no ?version -> List<RecipeHistoryEntryDto>; ?version=v -> RecipeDto of that archive
@PostMapping("/rollback/{*path}")            RecipeDto rollback(@PathVariable String path, @RequestParam String version)

public record RecipeSaveRequestDto(String baseModified, JsonNode content) {}
public record RecipeValidationDto(boolean valid, List<RecipeValidationErrorDto> errors) {}
public record RecipeValidationErrorDto(String path, String message) {}
public record RecipeHistoryEntryDto(String version, String timestamp, long sizeBytes) {}
// HistorySidecar: public static final String DIR = "_history";
//   static boolean isHistoryPath(Path root, Path p)  // any relative segment equals _history
//   static String newVersion()  // DateTimeFormatter "yyyyMMdd-HHmmss-SSS", UTC
```

Service rules: writable iff path ends `.json` AND basename starts `_ETL_` AND `PathResolver.insideCorpus` passes AND no `_history` segment — else `InvalidCorpusPathException` (→ existing 400). `save`: current `modifiedAt` string ≠ `baseModified` ⇒ `StaleRecipeException` (409); archive current file to `<dir>/_history/<base>.<version>.json` (create dir), write body atomically (`Files.write` to `<dir>/.<name>.tmp` + `Files.move(…, ATOMIC_MOVE, REPLACE_EXISTING)`), return fresh `recipe(path)`. `rollback`: archive current, copy archived version over, return fresh DTO. `validate` (no file IO, tolerates `fields`/`weststone`): errors for — unparsable/`steps` missing or empty; step target missing `name`; step target `type` missing/blank (**RULED DEVIATION:** spec's "every step type known" is implemented as *non-blank*, NOT membership of the canonical set — the anonymizer also corrupted type VALUES corpus-wide (`BERYLFALLS`×86, `EARLYGLADE`×49, `ASHPATH2`×10, `CEDARWICK2`×1) and spec §9 requires all 74 corpus recipes to validate green; §3 limits repair to the `weststone` key); field missing `name`; dot-ref `T.F` where `T` (case-insensitive) ∉ {all `sources[]` names ∪ step target names ∪ `table.sourceTableNames`} — corpus-audited: zero violations under exactly this rule. Exclusion filter: `CorpusService.dirNode` skips child dirs named `_history`; `allXmlPaths`/`collect` filter `HistorySidecar.isHistoryPath` — one shared predicate, contract-tested.

- [x] **Step 1: Failing MockMvc test** — isolated temp corpus so tests never write the real one:

```java
@SpringBootTest @AutoConfigureMockMvc
class RecipeWriteControllerTest {
    static Path corpus;
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) throws IOException {
        corpus = Files.createTempDirectory("write-corpus");
        Path dir = Files.createDirectories(corpus.resolve("CDM/m_FIX"));
        Files.writeString(dir.resolve("_ETL_m_FIX.json"),
            "{\"steps\":[{\"target\":{\"name\":\"T\",\"type\":\"table\",\"fields\":[{\"name\":\"A\",\"dataType\":\"String\",\"transformation\":{\"source\":\"S.A\"}}]},\"sources\":[{\"name\":\"S\",\"type\":\"table\"}]}],\"table\":{\"targetTableNames\":[\"T\"],\"sourceTableNames\":[\"S\"]}}");
        Files.writeString(dir.resolve("BIZ.json"), "[]");
        r.add("etl360.corpus-root", () -> corpus.toString());
    }
    @Autowired MockMvc mvc; @Autowired com.fasterxml.jackson.databind.ObjectMapper om;

    @Test void putArchivesThenWritesAtomicallyAndReturnsFreshDto() throws Exception {
        String base = om.readTree(mvc.perform(get("/api/recipes/CDM/m_FIX/_ETL_m_FIX.json"))
            .andReturn().getResponse().getContentAsString()).get("modifiedAt").asText();
        String body = "{\"baseModified\":\"" + base + "\",\"content\":{\"steps\":[],\"table\":{\"targetTableNames\":[],\"sourceTableNames\":[]}}}";
        mvc.perform(put("/api/recipes/CDM/m_FIX/_ETL_m_FIX.json").contentType("application/json").content(body))
           .andExpect(status().isOk()).andExpect(jsonPath("$.fileName").value("_ETL_m_FIX.json"));
        try (var s = Files.list(corpus.resolve("CDM/m_FIX/_history"))) {
            var names = s.map(p -> p.getFileName().toString()).toList();
            assertThat(names).hasSize(1);
            assertThat(names.get(0)).matches("_ETL_m_FIX\\.\\d{8}-\\d{6}-\\d{3}\\.json");  // yyyyMMdd-HHmmss-SSS
        }
        mvc.perform(put("/api/recipes/CDM/m_FIX/_ETL_m_FIX.json").contentType("application/json").content(body))
           .andExpect(status().isConflict());                                            // stale baseModified -> 409
    }
    @Test void historyListsViewsAndRollsBackByteIdentical() throws Exception { /* PUT once (fresh base), GET /api/recipes/history/CDM/m_FIX/_ETL_m_FIX.json -> $[0].version exists; ?version=<v> -> $.content.steps present; POST /api/recipes/rollback/...?version=<v> -> 200; then GET recipe content equals the ORIGINAL string via om.readTree equality */ }
    @Test void sandboxEscapeAndNonRecipeAre400() throws Exception {
        mvc.perform(put("/api/recipes/CDM/../../escape.json").contentType("application/json")
            .content("{\"baseModified\":\"x\",\"content\":{}}")).andExpect(status().isBadRequest());
        mvc.perform(put("/api/recipes/CDM/m_FIX/BIZ.json").contentType("application/json")
            .content("{\"baseModified\":\"x\",\"content\":{}}")).andExpect(status().isBadRequest());
    }
    @Test void validateChecksRefsAndShape() throws Exception {
        mvc.perform(post("/api/recipes/validate").contentType("application/json")
            .content(Files.readString(corpus.resolve("CDM/m_FIX/_ETL_m_FIX.json"))))
           .andExpect(jsonPath("$.valid").value(true));
        mvc.perform(post("/api/recipes/validate").contentType("application/json")
            .content("{\"steps\":[{\"target\":{\"name\":\"T\",\"type\":\"table\",\"weststone\":[{\"name\":\"A\",\"transformation\":{\"source\":\"GHOST.A\"}}]},\"sources\":[]}],\"table\":{\"targetTableNames\":[\"T\"],\"sourceTableNames\":[]}}"))
           .andExpect(jsonPath("$.valid").value(false))
           .andExpect(jsonPath("$.errors[0].message", containsString("GHOST")));
    }
    @Test void historySidecarExcludedFromTreeAndRecipeWalks() throws Exception { /* after a PUT: GET /api/tree body does NOT contain "_history"; @Autowired CorpusService.allRecipePaths() has size 1 */ }
}
```

- [x] **Step 2: RED** (`mvn -q -am -pl backend test` — 404/405s) **→ Step 3: implement** per interfaces **→ Step 4: GREEN** (full backend suite — existing contract tests prove the exclusion filter changed nothing for the real corpus).
- [x] **Step 5: Commit**

```bash
git add backend/src/main/java/io/pure360/etl360/api/RecipeController.java \
  backend/src/main/java/io/pure360/etl360/service/RecipeService.java \
  backend/src/main/java/io/pure360/etl360/service/CorpusService.java \
  backend/src/main/java/io/pure360/etl360/service/support/HistorySidecar.java \
  backend/src/main/java/io/pure360/etl360/service/support/StaleRecipeException.java \
  backend/src/main/java/io/pure360/etl360/api/ApiExceptionHandler.java \
  backend/src/main/java/io/pure360/etl360/api/dto/RecipeSaveRequestDto.java \
  backend/src/main/java/io/pure360/etl360/api/dto/RecipeValidationDto.java \
  backend/src/main/java/io/pure360/etl360/api/dto/RecipeValidationErrorDto.java \
  backend/src/main/java/io/pure360/etl360/api/dto/RecipeHistoryEntryDto.java \
  backend/src/test/java/io/pure360/etl360/api/RecipeWriteControllerTest.java \
  docs/superpowers/plans/2026-07-31-etl-modifier.md
git commit -m "feat(api): recipe write endpoints — PUT + validate + history sidecar + rollback"
```

---

### Task 8: Editing state — recipeEdits mutations, SaveBar validate+PUT, edit panel

**Files:**
- Create: `frontend/src/api/recipeEdits.ts` + `frontend/src/api/recipeEdits.test.ts`
- Modify: `frontend/src/api/client.ts` (add `apiSend`), `frontend/src/api/types.gen.ts` (regenerate)
- Modify: `frontend/src/components/tab2/ETLModifier.tsx` (+ extend `ETLModifier.test.tsx`)

**Interfaces** (Tasks 9/10/11 compose blind against these):

```ts
// client.ts
export async function apiSend<T>(method: 'PUT' | 'POST', path: string, body: unknown): Promise<T>
// same problem+json -> ApiError handling as apiGet, Content-Type: application/json

// recipeEdits.ts — pure, structuredClone in, new draft out, dot-refs verbatim; import type only
export function setFieldTransformation(d: RecipeJson, stepName: string, fieldName: string, t: RecipeTransformationJson): RecipeJson
//   creates the field ({name, dataType: 'String'}) when absent; writes to whichever of fields/weststone the target carries
export function renameNode(d: RecipeJson, oldName: string, newName: string): RecipeJson
//   renames step target/source/table-lists entries AND rewrites every dot-ref "OLD.F" -> "NEW.F" (exact-table-token match)
export function editFieldDataType(d: RecipeJson, stepName: string, fieldName: string, dataType: string): RecipeJson
export function addStep(d: RecipeJson, type: string): RecipeJson        // {name: `NEW_${TYPE}_${n}`, type, fields: []}; type 'table' also appends name to targetTableNames
export function addSourceTable(d: RecipeJson, stepName?: string): RecipeJson  // {name, type:'table'} into named/first step's sources[] + sourceTableNames; creates a stub step if none
export function deleteNode(d: RecipeJson, name: string): RecipeJson     // removes step/source entries + table-list mentions; CLEARS every transformation whose refs point at name (collect count first)
export function refsInto(d: RecipeJson, name: string): number           // for the delete confirm hint
export function deleteEdge(d: RecipeJson, toStep: string, toField: string): RecipeJson  // clears that field's transformation
export function parseFormulaText(text: string): RecipeTransformationJson
//   lenient: `NAME(a, b)` -> {name, parameters:[…]} recursive, depth-0 comma split; bare `T.F` -> {source}; else {value}
```

- [x] **Step 1: Failing unit tests** (`recipeEdits.test.ts`, on the Task-4 fixtures + minimal literals): each helper returns a NEW object (`expect(out).not.toBe(d)`, input JSON unchanged); `setFieldTransformation` on a weststone-keyed clone writes into `weststone`; `renameNode('SQ_ff_BIZLINK','SQ_X')` rewrites all 60 `SQ_ff_BIZLINK.*` refs and no others; `deleteNode` clears `refsInto` count transformations; `parseFormulaText("EXP_TO_CHAR(A.B, 'X')")` round-trips through `renderFormula` to itself; `parseFormulaText('T.F')` → `{source:'T.F'}`; `parseFormulaText('hello')` → `{value:'hello'}`.
- [x] **Step 2: RED → implement → GREEN.**
- [x] **Step 3: Regenerate API types** (Task 7 DTOs): boot backend (`mvn -q -am -pl backend install -DskipTests && (cd backend && mvn -q spring-boot:run &)`, poll `/api/health`), `cd frontend && pnpm generate:api`, kill backend + verify port 8080 free.
- [x] **Step 4: Wire ETLModifier** — failing MSW test first (extend `ETLModifier.test.tsx`): handlers add `http.post('/api/recipes/validate', …valid:true)` and `http.put('/api/recipes/CDM/m_FIX/_ETL_m_FIX.json', capture body → fresh RecipeDto)`. Flow: load recipe → select target node → edit panel (existing `EditableField` card idiom on the selected node: name, per-field name/dataType, formula textarea seeded with `renderFormula`, parsed back via `parseFormulaText` on blur) → SaveBar shows `1 unsaved change` → Save → captured PUT body has `baseModified === '2026-07-31T00:00:00Z'` and the dot-ref string verbatim → SaveBar clears. Discard → draft re-clones from `rec.data.content`. Implementation: `draft` state (deep clone on `rec.data` change via `useEffect` keyed on `recipePath`+`modifiedAt`), `dirtyOps` counter incremented per helper call, `useMemo(() => recipeToCanvas(draft, path), [draft])`, Save = `apiSend('POST','/recipes/validate', draft)` → errors render in the `--red` idiom list; else `apiSend('PUT', `/recipes/${path}`, { baseModified, content: draft })` → `queryClient.invalidateQueries({queryKey:['recipe', path]})`, reset `dirtyOps`.
- [x] **Step 5: GREEN + tsc → Step 6: Commit**

```bash
git add frontend/src/api/recipeEdits.ts frontend/src/api/recipeEdits.test.ts frontend/src/api/client.ts \
  frontend/src/api/types.gen.ts frontend/src/components/tab2/ETLModifier.tsx \
  frontend/src/components/tab2/ETLModifier.test.tsx docs/superpowers/plans/2026-07-31-etl-modifier.md
git commit -m "feat(modifier): draft editing state — recipeEdits mutations, SaveBar validate+PUT"
```

---

### Task 9: Palette + click-wire + delete UI

**Files:**
- Create: `frontend/src/components/tab2/Palette.tsx`
- Modify: `frontend/src/components/shared/EtlCanvas.tsx` + `frontend/src/components/tab1/NodeBox.tsx` (optional `onPortClick` — behavior-only, zero visual change)
- Modify: `frontend/src/components/tab2/ETLModifier.tsx` (+ extend `ETLModifier.test.tsx`)

**Interfaces:**

```ts
// EtlCanvas + NodeBox gain (optional; Tab 1 passes nothing — untouched behavior):
onPortClick?: (nodeId: string, port: Port) => void   // fires from the port-row group's onClick
// Palette.tsx
export const PALETTE: { type: string; label: string; color: string }[]  // 12 entries:
// source table, sourceQualifier, filter, joiner, aggregator, router, union, normalizer,
// java, storedProcedure, target table, expression step — colors from NODE_STYLES/TYPE_COLORS tokens
export function Palette(props: { onAdd: (type: string) => void }): JSX.Element
// right-side vertical strip: width 132, var(--surface), 1px var(--border) left border;
// each entry a draggable button (draggable + onDragStart setData('text/etl-type', type)) with kind dot + mono 10 label
```

Behavior: `onAdd`/canvas `onDrop` (container div gains `onDragOver` preventDefault + `onDrop` reading `text/etl-type`) call `addStep(draft, type)` or `addSourceTable(draft)`; position emerges from auto-layout (v1: no persisted x/y). Click-wire: `onPortClick` with `direction !== 'IN'` sets `wireFrom = {nodeId, portName}` (indicator chip in the SaveBar row area, existing token style, `wire: FROM.FIELD → click an IN port`); a subsequent click on an `IN`/`IN/OUT` port of another node calls `setFieldTransformation(draft, toNodeStep, toField ?? fromPort, { source: \`${fromNode}.${fromPort}\` })` (field auto-created named after the source field when absent — spec §6) and clears `wireFrom`. Delete: with a node selected, a Delete button (existing `--red` bordered idiom) shows confirm hint `Removes <name> and clears <refsInto(draft,name)> incoming reference(s)` → confirm calls `deleteNode`; with a selected edge (clicking a connection path sets `selectedEdge`) → `deleteEdge`.

- [x] **Step 1: Failing RTL tests** (extend `ETLModifier.test.tsx`): (a) palette click `target table` ⇒ canvas gains a node named `NEW_TABLE_1` and SaveBar counts; (b) wire flow: click OUT port `A` on `S`, indicator appears, click IN port on `T` ⇒ draft (asserted via raw-JSON toggle text) contains `"source": "S.A"` verbatim; (c) delete node `S` ⇒ confirm hint mentions the ref count, canvas loses the node.
- [x] **Step 2: RED → Step 3: implement → Step 4: GREEN + tsc** (Tab 1 tests untouched — proves `onPortClick` optionality). **Step 5: Commit**

```bash
git add frontend/src/components/tab2/Palette.tsx frontend/src/components/shared/EtlCanvas.tsx \
  frontend/src/components/tab1/NodeBox.tsx frontend/src/components/tab2/ETLModifier.tsx \
  frontend/src/components/tab2/ETLModifier.test.tsx docs/superpowers/plans/2026-07-31-etl-modifier.md
git commit -m "feat(modifier): designer palette, click-wire, delete"
```

---

### Task 10: History drawer + rollback UI

**Files:**
- Create: `frontend/src/components/tab2/HistoryDrawer.tsx`
- Modify: `frontend/src/components/tab2/ETLModifier.tsx` (+ extend `ETLModifier.test.tsx`)

**Interfaces** (consumes Task 7's ruled URL shapes):

```ts
export function HistoryDrawer(props: {
  recipePath: string
  onView: (version: string) => void      // parent loads apiGet(`/recipes/history/${recipePath}?version=${v}`) read-only into the canvas
  onRestored: () => void                  // parent invalidates ['recipe', recipePath] and clears view-mode
})
// internally: useQuery ['recipeHistory', recipePath] -> apiGet<RecipeHistoryEntry[]>(`/recipes/history/${recipePath}`)
// Restore: apiSend('POST', `/recipes/rollback/${recipePath}?version=${v}`, {})
```

Drawer = right-side panel in the existing card idiom (list rows: mono timestamp + sizeBytes + View button). View mode renders a banner (`--yellow` tokens): `Viewing archived version <v> — read-only` + `Restore this version` button; canvas + panels derive from the archived content; all editing affordances disabled while viewing.

- [x] **Step 1: Failing MSW test:** handlers `GET /api/recipes/history/CDM/m_FIX/_ETL_m_FIX.json` (no version → `[{version:'20260731-120000-000', timestamp:'2026-07-31T12:00:00Z', sizeBytes: 100}]`; with `?version=` → RecipeDto-shaped archived payload whose target is named `T_OLD`), `POST /api/recipes/rollback/...?version=...` → fresh DTO. Flow: open History → row listed → View → banner + `T_OLD` on canvas → Restore → rollback request captured + banner gone.
- [x] **Step 2: RED → Step 3: implement → Step 4: GREEN + tsc → Step 5: Commit**

```bash
git add frontend/src/components/tab2/HistoryDrawer.tsx frontend/src/components/tab2/ETLModifier.tsx \
  frontend/src/components/tab2/ETLModifier.test.tsx docs/superpowers/plans/2026-07-31-etl-modifier.md
git commit -m "feat(modifier): history drawer — view + rollback"
```

---

### Task 11: Expression registry — merged XML + recipe origins

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/service/support/FormulaRenderer.java`
- Modify: `backend/src/main/java/io/pure360/etl360/service/ExpressionService.java` (recipe walk appended in `all()`, `ExpressionService.java:32-46`)
- Test: extend `backend/src/test/java/io/pure360/etl360/service/ExpressionServiceTest.java`
- Modify: `frontend/src/components/tab2/ETLModifier.tsx` (registry view replaces the interim collector; + extend `ETLModifier.test.tsx`)

**Interfaces:**

```java
// FormulaRenderer — EXACT mirror of frontend renderFormula (deterministic, SYN-fixture-tested):
public static String render(JsonNode transformation)
// {name, parameters[]} -> NAME(p1, p2, …) recursively; a parameter carrying "transformation"
// (lookup Field shape) renders its transformation; {source} -> verbatim; {value} -> verbatim; else ""
// ExpressionService.all() additions — REUSES ExpressionEntryDto (no frontend type change):
// for each CorpusService.allRecipePaths() (already _history-excluded, Task 7): read JSON; for each
// step, each fieldsOf(target) whose transformation has "name" ->
// new ExpressionEntryDto(recipePath, layerOf(recipePath), stepName, fieldName, render(t), "recipe")
```

- [x] **Step 1: Failing backend test:** `all()` contains an entry with `origin() == "recipe"`, `mappingPath() == "ODS/m_SYN_ODS_ORDERS/_ETL_m_SYN_ODS_ORDERS.json"`, `transformation() == "ODS_SYN_ORDERS"`, `port() == "AMOUNT"`, `formula() == "Undefined(EXP_ARITHMETIC(STG_L_SYN_ORDERS.AMOUNT, *, LKP_SYN_CURRENCY(STG_L_SYN_ORDERS.CURRENCY_CODE)), 2)"` (byte-equal to the frontend Task-5 assertion, corrected during Task 5 — the fixture's outer "Undefined" node genuinely has a second `{value:"2"}` parameter, rendered per the no-exceptions rule; see task-5-report.md — the cross-language determinism contract); xml-origin entries still present; total ≥ previous count.
- [x] **Step 2: RED → implement → backend GREEN.**
- [x] **Step 3: Frontend registry view** — failing MSW test: handler `GET /api/expressions` → two entries (one `origin:'xml'`, one `origin:'recipe'`); the "All Expressions" section (now fed by `useExpressions`, `queries.ts:29-30`) renders both with origin badges (existing chip idiom, `xml` `--cyan`-family / `recipe` `#34d399`-family tokens), a filter input narrows by substring, CopyButton per row, and — when a formula textarea has focus context (state: `focusedFormula: {stepName, fieldName} | null`, set onFocus in the edit panel) — an `Insert` button calls `setFieldTransformation(draft, …, parseFormulaText(entry.formula))`. Test: focus formula textarea → Insert → textarea value equals the inserted formula, SaveBar counts.
- [x] **Step 4: GREEN both sides + tsc → Step 5: Commit**

```bash
git add backend/src/main/java/io/pure360/etl360/service/support/FormulaRenderer.java \
  backend/src/main/java/io/pure360/etl360/service/ExpressionService.java \
  backend/src/test/java/io/pure360/etl360/service/ExpressionServiceTest.java \
  frontend/src/components/tab2/ETLModifier.tsx frontend/src/components/tab2/ETLModifier.test.tsx \
  docs/superpowers/plans/2026-07-31-etl-modifier.md
git commit -m "feat(registry): merged XML+recipe expression registry — backend walk + GUI insert"
```

---

### Task 12: recipe_sweep 74/74 gate in validate-loop

**Files:**
- Create: `scripts/recipe_sweep.mts`
- Modify: `scripts/validate_loop.sh` (after the viewer sweep step, before frontend tests)

```ts
// scripts/recipe_sweep.mts — run: node --experimental-strip-types scripts/recipe_sweep.mts
// node >= 22.6 required (same as viewer_sweep). Hardening copied from viewer_sweep.mts
// FROM DAY ONE: response.ok guard + duplicate-node-id check.
import { recipeToCanvas } from '../frontend/src/api/recipeAdapter.ts'

const BASE = process.env.ETL360_API ?? 'http://localhost:8080'
type Tree = { kind?: string; name?: string; path?: string; children?: Tree[] }
const paths: string[] = []
const walk = (n: Tree) => {
  if (n.kind === 'json' && n.name?.startsWith('_ETL_') && n.path) paths.push(n.path)
  ;(n.children ?? []).forEach(walk)
}
walk(await (await fetch(`${BASE}/api/tree`)).json() as Tree)
if (paths.length < 74) { console.error(`recipe_sweep: only ${paths.length} recipes in tree (expected >= 74)`); process.exit(1) }
let failed = 0
for (const p of paths.sort()) {
  try {
    const res = await fetch(`${BASE}/api/recipes/${p}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const dto = await res.json() as { content: unknown }
    const g = recipeToCanvas(dto.content as never, p)
    if (!g.nodes.length) throw new Error('empty canvas')
    const ids = new Set(g.nodes.map(n => n.id))
    if (ids.size !== g.nodes.length) throw new Error('duplicate node ids')
    for (const c of g.connections) if (!ids.has(c.fromNode) || !ids.has(c.toNode)) throw new Error(`dangling edge ${c.fromNode}->${c.toNode}`)
    for (const n of g.nodes) if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) throw new Error(`no layout for ${n.name}`)
    const vRes = await fetch(`${BASE}/api/recipes/validate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dto.content),
    })
    if (!vRes.ok) throw new Error(`validate HTTP ${vRes.status}`)
    const v = await vRes.json() as { valid: boolean; errors: { path: string; message: string }[] }
    if (!v.valid) throw new Error(`invalid: ${v.errors.map(e => `${e.path}: ${e.message}`).join('; ')}`)
  } catch (e) { failed++; console.error(`recipe_sweep FAIL ${p}: ${(e as Error).message}`) }
}
console.log(`recipe_sweep: ${paths.length - failed}/${paths.length} recipes render+validate`)
process.exit(failed ? 1 : 0)
```

validate_loop.sh addition (directly after the `viewer sweep` block):

```bash
echo "[validate-loop] recipe sweep…"
node --experimental-strip-types scripts/recipe_sweep.mts || fail "recipe sweep"
```

- [ ] **Step 1: Write script + wire → Step 2: run `make validate-loop` end-to-end** — expect `viewer_sweep: 69/69` AND `recipe_sweep: 74/74 recipes render+validate`. Any FAIL line names the recipe: fix the ADAPTER or the validate rule, never skip a recipe.
- [ ] **Step 3: Commit**

```bash
git add scripts/recipe_sweep.mts scripts/validate_loop.sh docs/superpowers/plans/2026-07-31-etl-modifier.md
git commit -m "feat(modifier): 74/74 recipe_sweep gate in validate-loop"
```

---

### Task 13: Docs + acceptance sweep (spec §10)

**Files:**
- Modify: `docs/superpowers/specs/2026-07-31-etl-modifier-design.md` — one "Implementation deviations" footnote block: (1) history/rollback URL shapes (`/history/{*path}` + `?version=` — Spring `{*var}`-must-be-last, precedent architecture.md); (2) validate's "type known" = non-blank (anonymizer-corrupted type VALUES: `BERYLFALLS`×86 etc.; §9 all-74-green requires it); (3) dot-ref from-node resolution is exact-then-case-insensitive, unresolvable refs dropped (10 tokens / 8 recipes referencing non-table `sources[]` constructs); (4) collapsible Explorer applies to the two tabs that render the shared Sidebar (Tab 4 has its own `DagExplorer`; Tab 3 none).
- Modify: root `CLAUDE.md` (frontend line: Tabs 1+2 real; write API exists), `docs/architecture.md` (endpoint table: retitle "(v1, read-only)" → "(v1)"; add PUT/validate/history/rollback rows + `_history/` sidecar note + `origin:"recipe"` merge on `/api/expressions`), `frontend/AGENTS.md` (mockData ledger: Tab 2 retired, `ETL_RECIPES`/`DDL_SCHEMAS` gone; queries note `enabled` guards)
- Create: `docs/adr/0007-recipes-as-source-of-truth.md` from `docs/adr/0000-template.md` (≤30 lines: GUI-saved recipes fork from XML at first edit; write API + `_history/` sidecar versioning; `make regen-corpus` overwrite risk documented, not code-guarded in v1; alternatives: regen-lock file, XML round-trip editing — both rejected one-line)
- Modify: `.claude/skills` regen skill / `README.md` regen section — one warning line about overwriting GUI-edited recipes (per spec §7).

- [ ] **Step 1: Walk spec §10's eight criteria**, recording PASS/FAIL with evidence in the commit body:
  1. Tree click renders any `_ETL_*.json` — manual boot; spot-check `CDM/m_DM_INFOHUB_BIZLINK` + `ODS/m_SYN_ODS_ORDERS` (fixture tests are the RTL evidence).
  2. `recipe_sweep` 74/74 inside `make validate-loop`.
  3. Palette all 12 primitives + click-wire dot-ref verbatim (Task 9 tests).
  4. Save archives + History lists + Rollback byte-identical + 409 (Task 7/10 tests).
  5. Registry both origins + Insert (Task 11 tests).
  6. Explorer collapse (Task 3 test); Tab 1 byte-identical — `git diff main...HEAD --stat -- frontend/src/components/tab1` shows only the sanctioned Canvas-removal/import edits + `NodeBox` `onPortClick`; visual side-by-side deferred to human sign-off (standing ruling).
  7. `pnpm test`, `npx tsc --noEmit`, `make test`, `make check`, `make validate-loop` all green (run all five).
  8. Docs updated (this task's own edits verified by reading them back).
- [ ] **Step 2: Fix small reds, re-run, commit**

```bash
git add docs/superpowers/specs/2026-07-31-etl-modifier-design.md CLAUDE.md docs/architecture.md \
  frontend/AGENTS.md docs/adr/0007-recipes-as-source-of-truth.md README.md \
  docs/superpowers/plans/2026-07-31-etl-modifier.md
git commit -m "chore: ETL Modifier acceptance sweep — spec criteria verified"
```

---

### Critical Files for Implementation

- /Users/serna/IdeaProjects/pure-scala-ipc-360/frontend/src/api/recipeAdapter.ts (new — the recipe→canvas heart; Tasks 4-6, 12 depend on it)
- /Users/serna/IdeaProjects/pure-scala-ipc-360/frontend/src/components/tab2/ETLModifier.tsx (rewired in Tasks 6, 8-11)
- /Users/serna/IdeaProjects/pure-scala-ipc-360/backend/src/main/java/io/pure360/etl360/service/RecipeService.java (write/validate/history/rollback, Task 7)
- /Users/serna/IdeaProjects/pure-scala-ipc-360/frontend/src/api/mappingAdapter.ts (layout donor for canvasLayout.ts, Task 2)
- /Users/serna/IdeaProjects/pure-scala-ipc-360/frontend/src/components/tab1/ETLViewer.tsx (Canvas donor for EtlCanvas.tsx, Tasks 2-3)