# IPC ETL Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tab 1 renders any of the corpus's 69 mappings as a real canvas (semantic model → existing Figma card components), with a lossless-DOM detail panel, search highlight, zoom-collapse pills, and a 69/69 sweep gate — per spec `docs/superpowers/specs/2026-07-30-ipc-etl-viewer-design.md`.

**Architecture:** A pure adapter `toCanvas(model, mappingPath)` maps `MappingModelDto` onto the EXISTING canvas types (`ETLNode`/`Port`/`Connection` in `frontend/src/types.ts`) including x/y layout — so `Canvas`/`NodeBox`/`DetailPanel` render real data with almost no component changes. The detail panel upgrades to lossless-DOM properties. A node script re-uses the same adapter to sweep all 69 mappings inside `make validate-loop`.

**Tech Stack:** React 19 + existing SVG canvas, TanStack hooks (`useMappingModel`, `useMappingDom` — already exist), vitest 4 + RTL + MSW, Node 22 `--experimental-strip-types` for the sweep script.

## Global Constraints

- **Figma visual contract.** Sanctioned changes ONLY: (1) tab label `'ETL Viewer'` → `'IPC ETL Viewer'` (`App.tsx:20`); (2) loading/error/empty states reusing existing tokens (Task-12 idiom); (3) SVG pill rendering in `NodeBox` below zoom 0.65, mirroring the Operational pill's visual values; (4) ONE chip-text fallback line in `NodeBox` so unknown IPC types show their real abbreviation (`node.label`) instead of a wrong `SRC`; (5) status-bar text additions (existing text elements only). NOTHING else changes visually.
- **Adapter purity:** `frontend/src/api/mappingAdapter.ts` uses `import type` ONLY (no runtime imports, no React, no vite aliases) so `node --experimental-strip-types` can import it directly. Layout constants are local to the adapter (values documented against NodeBox's).
- **The canvas target types are the EXISTING ones** — `ETLNode`, `Port`, `Connection`, `NodeType` from `frontend/src/types.ts` (verbatim today at types.ts:3-38). Do not invent parallel types.
- Tabs 2–4 stay mock-fed and untouched. Backend untouched.
- **Commit protocol:** tick this plan's checkboxes and include this file in each task's commit; stage explicit paths — NEVER `git add -A` (`scripts/dev.sh` carries an uncommitted USER edit; `first_prompt.md` untracked; both stay out).
- **Branch:** `feat/etl360-ipc-viewer`.
- Frontend verification per task: `cd frontend && pnpm test && npx tsc --noEmit` — both clean before every commit.

## Progress & resume protocol

Tick checkboxes per task, commit this file with each task. Resume = `git log --oneline` + first unticked checkbox.

---

### Task 1: Model fixtures + adapter core (nodes, kinds, ports, ƒ)

**Files:**
- Create: `frontend/src/api/__fixtures__/model_m_SYN_DWH_ORDERS_FACT.json`, `model_m_SYN_ODS_ORDERS.json`, `model_m_SYN_ETL_ORDERS_BRIDGE.json`, `model_m_DM_INFOHUB_BIZLINK.json` (captured from the live backend)
- Create: `frontend/src/api/mappingAdapter.ts`
- Test: `frontend/src/api/mappingAdapter.test.ts`

**Interfaces:**
- Consumes: `MappingModelDto` shape from `types.gen.ts` (NOTE the quirks: transformation type field is **`typ`** not `type`; instance type is **`transformationType`**/`tType`; `SourceFieldDto` keys are mostly lowercase; every field optional).
- Produces (Task 2/3/7 rely on these EXACT signatures):

```ts
export interface CanvasGraph { nodes: ETLNode[]; connections: Connection[]; mappingNames: string[]; renderedMapping: string }
export function toCanvas(model: MappingModel, mappingPath: string): CanvasGraph
// MappingModel = components['schemas']['MappingModelDto'] — import type { components } from './types.gen'
// ETLNode/Connection/Port/NodeType — import type from '../types'
```

- [x] **Step 1: Capture fixtures.** Boot the backend (install-then-run pattern), then:

```bash
for m in "DWH/m_SYN_DWH_ORDERS_FACT" "ODS/m_SYN_ODS_ORDERS" "ETL/m_SYN_ETL_ORDERS_BRIDGE" "CDM/m_DM_INFOHUB_BIZLINK"; do
  base=$(basename "$m")
  curl -sf "localhost:8080/api/mappings/model/$m" | python3 -m json.tool > "frontend/src/api/__fixtures__/model_${base}.json"
done
```
Kill the backend (verify dead). Fixtures are anonymized/SYN already — committable.

- [x] **Step 2: Write the failing test** (`mappingAdapter.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { toCanvas } from './mappingAdapter'
import diamond from './__fixtures__/model_m_SYN_DWH_ORDERS_FACT.json'
import lookup from './__fixtures__/model_m_SYN_ODS_ORDERS.json'
import bridge from './__fixtures__/model_m_SYN_ETL_ORDERS_BRIDGE.json'
import type { MappingModel } from './queries'

describe('toCanvas — nodes, kinds, ports', () => {
  it('maps instances to typed nodes with source/target/transformation kinds', () => {
    const g = toCanvas(diamond as MappingModel, 'DWH/m_SYN_DWH_ORDERS_FACT')
    const kinds = new Map(g.nodes.map(n => [n.name, n.type]))
    expect(kinds.get('ODS_SYN_ORDERS')).toBe('source')
    expect(kinds.get('ODS_SYN_CUSTOMERS')).toBe('source')
    expect(kinds.get('DWH_SYN_ORDERS_FACT')).toBe('target')
    expect(g.nodes.some(n => n.type === 'expression')).toBe(true)
    expect(g.renderedMapping).toBe('m_SYN_DWH_ORDERS_FACT')
  })

  it('maps Lookup Procedure to lookup kind and ports carry direction from portType', () => {
    const g = toCanvas(lookup as MappingModel, 'ODS/m_SYN_ODS_ORDERS')
    const lkp = g.nodes.find(n => n.type === 'lookup')
    expect(lkp).toBeDefined()
    const exp = g.nodes.find(n => n.type === 'expression')!
    const dirs = new Set(exp.ports.map(p => p.direction))
    expect([...dirs].every(d => ['IN', 'OUT', 'IN/OUT'].includes(d))).toBe(true)
  })

  it('ƒ rule: expression set only when non-blank and differs from port name', () => {
    const g = toCanvas(lookup as MappingModel, 'ODS/m_SYN_ODS_ORDERS')
    const withExpr = g.nodes.flatMap(n => n.ports).filter(p => p.expression)
    expect(withExpr.length).toBeGreaterThan(0)
    for (const p of withExpr) expect(p.expression).not.toBe(p.name)
  })

  it('connectors become connections keyed by instance names; linked flags set', () => {
    const g = toCanvas(diamond as MappingModel, 'DWH/m_SYN_DWH_ORDERS_FACT')
    expect(g.connections.length).toBeGreaterThan(0)
    const ids = new Set(g.nodes.map(n => n.id))
    for (const c of g.connections) { expect(ids).toContain(c.fromNode); expect(ids).toContain(c.toNode) }
    const linked = g.nodes.flatMap(n => n.ports).filter(p => p.linked)
    expect(linked.length).toBeGreaterThan(0)
  })

  it('unknown transformation types fall back to a 3-letter label, never throw', () => {
    const weird = structuredClone(diamond) as MappingModel
    const t = weird.repository!.folder!.mappings![0].transformations![0]
    t.typ = 'Update Strategy'
    const g = toCanvas(weird, 'DWH/m_SYN_DWH_ORDERS_FACT')
    const n = g.nodes.find(x => x.name === t.name)!
    expect(n.label).toBe('UPD')
  })

  it('dual-target mapping renders both targets', () => {
    const g = toCanvas(bridge as MappingModel, 'ETL/m_SYN_ETL_ORDERS_BRIDGE')
    expect(g.nodes.filter(n => n.type === 'target').map(n => n.name).sort())
      .toEqual(['ETL_SYN_ORDERS_AUDIT', 'ETL_SYN_ORDERS_BRIDGE'])
  })
})
```

- [x] **Step 3: Run to verify failure** — `cd frontend && pnpm test` — FAIL, module missing.

- [x] **Step 4: Implement `mappingAdapter.ts`.** Rules (all reads null-safe — every DTO field is optional):

```ts
import type { components } from './types.gen'
import type { Connection, ETLNode, NodeType, Port } from '../types'
export type MappingModelT = components['schemas']['MappingModelDto']
```

1. **Mapping selection:** `folder.mappings ?? []`; `renderedMapping` = the one whose `name` equals the mappingPath basename, else `mappings[0]`; `mappingNames` = all names. Empty mappings array ⇒ return `{nodes: [], connections: [], mappingNames: [], renderedMapping: ''}`.
2. **Type mapping** `KIND: Record<string, NodeType>` = `'Source Definition'→'source'`, `'Target Definition'→'target'`, `'Source Qualifier'→'sq'`, `'Expression'→'expression'`, `'Lookup Procedure'→'lookup'`, `'Joiner'→'joiner'`, `'Aggregator'→'aggregator'`, `'Router'→'router'`, `'Filter'→'filter'`. **Unknown types (binding decision):** `type: 'expression'` (geometry/colors only — the union stays untouched) with `label` set to the derived abbreviation `typ.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()` (e.g. `'Update Strategy'` → `UPD`); Task 3's one-line NodeBox change renders chip text from `node.label` when it differs from the style abbr. Known kinds set `label` to the canonical abbr (`SRC`, `SQ`, `EXP`, `LKP`, `JNR`, `AGG`, `RTR`, `FLT`, `TGT`).
3. **Nodes** — one per `mapping.instances[]` entry:
   - `id` = instance `name` (connector endpoints reference instance names).
   - Source Definition: fields from `folder.sources[]` matched by `transformationName` (fallback: by instance `name`); ports = `sourceFields` → `{name, dataType: dataType + (precision ? \`(${precision}${scale && scale !== '0' ? ','+scale : ''})\` : ''), direction: 'OUT'}`.
   - Target Definition: fields from `folder.targets[]` by `transformationName`; ports direction `'IN'`.
   - Transformation instances: find the `TransformationDto` by `transformationName` first in `mapping.transformations ?? []`, then `folder.transformations ?? []` (nested wins — SP4 Task 1 finding). Ports from `transformFields`: direction from `portType` (`'INPUT'→'IN'`, `'OUTPUT'→'OUT'`, `'INPUT/OUTPUT'→'IN/OUT'`, else `'IN/OUT'`); `expression` = `expression` attr when non-blank AND ≠ field `name`.
   - `properties`: flat `Record<string,string>` of the instance's + transformation's scalar DTO fields that are non-blank (description, typ, reusable, versionNumber, databasetype/dbdname/ownername for sources, etc.) — the DETAILED panel is DOM-fed (Task 4); these are the quick properties.
   - `file` = mappingPath basename + `.xml`.
   - `linked`: after edges are built, set `port.linked = true` where a connection references (node, port) on the matching side.
   - Instance with NO resolvable transformation/source/target: still emit a node (`ports: []`, label per rule 2) — never throw.
4. **Connections** — `mapping.connectors ?? []` → `{fromNode: fromInstance, fromPort: fromField, toNode: toInstance, toPort: toField}`, dropping (with a dev-console-free silent skip) any connector whose endpoints reference instances that don't exist.
5. x/y: Task 2 (this task sets `x: 0, y: 0`).

- [x] **Step 5: PASS + tsc** — `pnpm test && npx tsc --noEmit`.
- [x] **Step 6: Commit**

```bash
git add frontend/src/api/__fixtures__ frontend/src/api/mappingAdapter.ts frontend/src/api/mappingAdapter.test.ts docs/superpowers/plans/2026-07-30-ipc-etl-viewer.md
git commit -m "feat(viewer): model->canvas adapter core — kinds, ports, f-rule, dual-target"
```

---

### Task 2: Adapter layout — layered left→right with real geometry

**Files:**
- Modify: `frontend/src/api/mappingAdapter.ts`
- Test: `frontend/src/api/mappingAdapter.test.ts` (add cases)

**Interfaces:** `toCanvas` now returns nodes with final `x`/`y`. Layout constants (adapter-local, values mirror NodeBox: header 44, port row 22, +10 pad; column pitch mirrors the mock's 230):

```ts
const X0 = 40, Y0 = 160, COL_PITCH = 230, V_GAP = 40
const HEADER_H = 44, PORT_H = 22, PAD = 10
const nodeHeight = (n: { ports: unknown[] }) => HEADER_H + n.ports.length * PORT_H + PAD
```

- [x] **Step 1: Failing tests:**

```ts
describe('toCanvas — layout', () => {
  it('layers left-to-right: sources col 0, targets last, x = X0 + layer*230', () => {
    const g = toCanvas(diamond as MappingModel, 'DWH/m_SYN_DWH_ORDERS_FACT')
    const byName = new Map(g.nodes.map(n => [n.name, n]))
    expect(byName.get('ODS_SYN_ORDERS')!.x).toBe(40)
    expect(byName.get('ODS_SYN_CUSTOMERS')!.x).toBe(40)
    const tgt = byName.get('DWH_SYN_ORDERS_FACT')!
    expect(tgt.x).toBeGreaterThan(40)
    expect((tgt.x - 40) % 230).toBe(0)
    for (const n of g.nodes) expect(Math.max(...g.nodes.map(m => m.x))).toBeGreaterThanOrEqual(n.x)
  })

  it('two nodes in one column stack with V_GAP, no overlap', () => {
    const g = toCanvas(diamond as MappingModel, 'DWH/m_SYN_DWH_ORDERS_FACT')
    const cols = new Map<number, { y: number; h: number }[]>()
    for (const n of g.nodes) {
      const arr = cols.get(n.x) ?? []
      arr.push({ y: n.y, h: 44 + n.ports.length * 22 + 10 })
      cols.set(n.x, arr)
    }
    for (const arr of cols.values()) {
      arr.sort((a, b) => a.y - b.y)
      for (let i = 1; i < arr.length; i++) expect(arr[i].y).toBeGreaterThanOrEqual(arr[i-1].y + arr[i-1].h + 40)
    }
  })

  it('cycle-safe: connector loop does not hang', () => {
    const cyclic = structuredClone(diamond) as MappingModel
    const m = cyclic.repository!.folder!.mappings![0]
    const [a, b] = m.instances!.map(i => i.name!)
    m.connectors!.push({ fromInstance: b, fromField: 'X', toInstance: a, toField: 'X' })
    const g = toCanvas(cyclic, 'DWH/m_SYN_DWH_ORDERS_FACT')
    expect(g.nodes.length).toBeGreaterThan(0)
  })
})
```

- [x] **Step 2: red → Step 3: implement.** Longest-path layering over the connection graph (adjacency by node id, unique edges): `layer(n) = 0` for nodes with no incoming connections OR kind `source`; else `1 + max(layer(pred))`, memoized DFS with an in-progress set (cycle ⇒ treat back-edge as absent). Targets clamp to `maxLayer` (all targets share the final column). `x = X0 + layer*COL_PITCH`. Within a column, order nodes by (average predecessor y, then name) and stack: first at `Y0`, next at `prevY + nodeHeight(prev) + V_GAP`.
- [x] **Step 4: green + tsc → Step 5: Commit** — `git commit -m "feat(viewer): layered auto-layout — longest-path columns, stacked rows, cycle-safe"` (same explicit paths + plan).

---

### Task 3: Viewer rewiring — real canvas, rename, retire mock MAPPINGS

**Files:**
- Modify: `frontend/src/components/tab1/ETLViewer.tsx` (mock import → hooks+adapter; Active Mapping; loading/error/empty)
- Modify: `frontend/src/components/tab1/NodeBox.tsx` (ONE chip-text line)
- Modify: `frontend/src/App.tsx:20` (label `'ETL Viewer'` → `'IPC ETL Viewer'`)
- Modify: `frontend/src/mockData.ts:1-2` (header ledger line)
- Test: `frontend/src/components/tab1/ETLViewer.test.tsx` (new, RTL+MSW)

**Interfaces:**
- Consumes: `useFilesystem` (existing), `useMappingModel(path)` (existing, string param), `toCanvas(model, path)` (Tasks 1–2).
- Produces: `ETLViewer` renders real mappings; `selectedMappingPath: string | null` state drives everything downstream (Task 4 panel reuses it).

Behavior spec (exact):
1. Replace `import { MAPPINGS }` usage: state becomes `const [mappingPath, setMappingPath] = useState<string | null>(null)`. `handleSelectFile`: `if (f.type === 'xml' && f.mapping) { setMappingPath(f.mapping); setSelectedNodeId(null) }` (FSFile.mapping already carries the real mappingPath from Foundation's adapter).
2. `const model = useMappingModel(mappingPath ?? '')` — gate with `enabled`: change the call site to pass-through only when non-null; since the hook lacks `enabled`, call it unconditionally with `mappingPath ?? ''` and skip rendering while `!mappingPath` (the 404 for '' never fires because fetch is guarded: wrap — simplest CORRECT form: add `enabled: !!path` to `useMappingModel` in `queries.ts`, mirroring `useOperational`; that is a data-layer change, sanctioned).
3. `const graph = useMemo(() => model.data ? toCanvas(model.data, mappingPath!) : null, [model.data, mappingPath])`.
4. Canvas area: `!mappingPath` → existing empty-hint styling ("Select an .xml mapping to view"); `model.isLoading` → dim-text "Loading mapping…"; `model.error` → `--red` title/detail (ApiError fields), Task-12 idiom; else `<Canvas nodes={graph.nodes} connections={graph.connections} ...>`.
5. "Active Mapping" panel in `sidebarExtra`: replace `Object.keys(MAPPINGS)` list with the single active `mappingPath` basename (highlighted) — the file tree IS the mapping list now. Keep the panel frame/styles.
6. Status bar right text: `{graph.nodes.length} nodes · {graph.connections.length} connections · Informatica PowerCenter` (unchanged form); when `graph.mappingNames.length > 1` append ` · mapping 1 of ${mappingNames.length}: ${renderedMapping}`.
7. `NodeBox.tsx` chip text (the ONE sanctioned line): where the abbr text renders (NodeBox.tsx:63-66), use `{node.label && node.label !== style.abbr ? node.label : style.abbr}`.
8. `mockData.ts` header comment: update the second line to `// The filesystem tree AND the Tab-1 Viewer canvas are REAL now; remaining tabs below still consume mocks until their sub-project lands.` `MAPPINGS` export itself STAYS (other tabs may still import? verify: only ETLViewer imported it — if nothing else imports `MAPPINGS`, delete the export and its 360 lines; check with grep and do whichever is true, stating it in the report).

RTL+MSW test (`ETLViewer.test.tsx`): MSW handlers for `/api/tree` (mini tree with one xml file, mappingPath `CDM/m_FIX`) and `/api/mappings/model/CDM/m_FIX` (inline mini model JSON: 1 source + 1 expression + 1 target + 2 connectors — reuse the fixture-shape from Task 1's SYN files, trimmed). Test: render `<ETLViewer searchQuery="" />` in a QueryClientProvider, click the tree file, `await findByText` of the source card name (SVG text), assert the empty-hint disappears.

- [x] **Step 1: failing RTL test → Step 2: red → Step 3: implement per behavior spec → Step 4: `pnpm test && npx tsc --noEmit` green → Step 5: Commit** — `git commit -m "feat(viewer): real mapping canvas from semantic model — IPC ETL Viewer"` (stage the five files + plan).

---

### Task 4: DOM-fed full-fidelity detail panel

**Files:**
- Create: `frontend/src/api/domSlice.ts` (pure locator)
- Modify: `frontend/src/components/tab1/DetailPanel.tsx` (Properties section: DOM attributes; keep everything else)
- Modify: `frontend/src/components/tab1/ETLViewer.tsx` (fetch dom, pass slice)
- Test: `frontend/src/api/domSlice.test.ts` + extend `ETLViewer.test.tsx` panel assertions

**Interfaces:**
- Produces: `findElementForNode(dom: XmlNode, nodeName: string, nodeType: NodeType): XmlNode | null` — searches the folder subtree for SOURCE/TARGET/TRANSFORMATION (kind-appropriate tag set: source→`SOURCE`, target→`TARGET`, else `TRANSFORMATION`; match on `attributes.NAME === nodeName`; INSTANCE fallback: if no direct match, find `INSTANCE` with `NAME===nodeName`, read its `TRANSFORMATION_NAME`, retry). Pure, `import type` only.
- DetailPanel gains optional prop `domElement?: XmlNode | null`; when present, the Properties section renders EVERY `attributes` entry of the element (all keys, all values, CopyButton each — the existing property-row markup), plus a `Fields (n)` count line sourced from `children` length. When absent (loading), the existing `node.properties` rendering stays as fallback.

domSlice test: build a small XmlNode literal (folder with SOURCE/TRANSFORMATION/INSTANCE) inline; assert direct match, instance-indirection match, and null for unknown names.

ETLViewer wiring: `const dom = useMappingDom(mappingPath ?? '')` (add `enabled: !!path` to `useMappingDom` too — same sanctioned data-layer tweak); `const domElement = useMemo(() => selectedNode && dom.data ? findElementForNode(dom.data, selectedNode.name, selectedNode.type) : null, [selectedNode, dom.data])`; pass `domElement` to DetailPanel.

- [x] **Step 1: failing domSlice test → Step 2: red → Step 3: implement locator + panel prop + wiring → Step 4: green + tsc → Step 5: Commit** — `git commit -m "feat(viewer): lossless DOM detail panel — every IPC attribute, copy-everywhere"` (explicit paths + plan).

**Amendment (post-review, human-approved deviation from the interfaces above):** `Fields (n)` counts only `SOURCEFIELD`/`TARGETFIELD`/`TRANSFORMFIELD` children, not raw `children.length` (corpus has `TABLEATTRIBUTE`/`FIELDDEPENDENCY`/`METADATAEXTENSION`/etc. siblings that inflated the count); `findElementForNode` gained a `mappingName: string` 4th parameter so the INSTANCE fallback is scoped to the rendered `<MAPPING>` subtree (folder-wide fallback if that mapping isn't found), preventing a same-named INSTANCE in a sibling mapping from resolving to the wrong element.

---

### Task 5: Search highlight + jump (global search reuse — spec §3.4 deviation)

The spec assumed a canvas toolbar slot; Tab 1 has none (verified). Ruled deviation: reuse the ALREADY-THREADED global `searchQuery` prop (`App.tsx` TopBar → `ETLViewer.searchQuery`) — zero new chrome. Footnoted in the spec by Task 8.

**Files:**
- Modify: `frontend/src/components/tab1/ETLViewer.tsx` (pass `searchQuery` to Canvas; auto-pan effect)
- Modify: the `Canvas` component inside `ETLViewer.tsx` (highlight prop)
- Test: extend `ETLViewer.test.tsx`

Behavior: `matchIds = graph.nodes.filter(n => q && (n.name.toLowerCase().includes(q) || n.ports.some(p => p.name.toLowerCase().includes(q)))).map(n => n.id)` (q = trimmed lowercase searchQuery), computed in ETLViewer. Canvas gains ONE new prop `highlightIds: string[]`: matching nodes render with the EXISTING selected-style treatment (pass `isSelected={selectedNode === n.id || highlightIds.includes(n.id)}` to NodeBox — no new styling), and inside Canvas a `useEffect` keyed on `highlightIds.join(',')` pans to the first highlighted node when non-empty: `const f = nodes.find(n => n.id === highlightIds[0]); if (f) setPan({ x: 30 - f.x * zoom + 100, y: 30 - f.y * zoom + 100 })`. Pan/zoom state already lives in Canvas — no lifting.

Test: MSW-rendered viewer (Task 3 fixture), set searchQuery prop to a port substring, assert the matching card gains the selected stroke (query the SVG rect attrs), and the empty query removes it.

- [x] **Step 1: failing test → Step 2: red → Step 3: implement → Step 4: green + tsc → Step 5: Commit** — `git commit -m "feat(viewer): global search highlights and pans to matching nodes"` (explicit paths + plan).

---

### Task 6: Zoom-collapse pills below 0.65

**Files:**
- Modify: `frontend/src/components/tab1/NodeBox.tsx` (compact branch)
- Modify: `Canvas` in `frontend/src/components/tab1/ETLViewer.tsx` (pass `compact={zoom < 0.65}`)
- Test: extend `ETLViewer.test.tsx`

Pill spec (SVG mirror of `OperationalCard.tsx:54-77`'s values — same visual language, existing tokens): when `compact`, `NodeBox` renders ONLY: rounded rect `rx=16`, height 26, width = `24 + name.length * 6` clamped to [90, 200], fill `style.bg`, stroke `style.border`; a 6×6 kind dot (`style.color`) at x+10; the node name (mono 10, `#c8d3e8`, tail-truncated at 22 chars) at x+22. Ports/connector circles/ƒ badges are not rendered; edges fall back to node-center anchors (the existing `:101/:103` fallback already handles missing port rows — verify, don't reimplement). Node height for canvas extents while compact = 26 (`getNodeHeight` gains the `compact` param with default false — callers updated).

Test: render viewer, zoom out via the existing `−` button clicks (0.2 step from 1.0 → below 0.65 needs 2 clicks to 0.6), assert port texts disappear and the pill rect (rx=16) exists; zoom back in restores ports.

- [ ] **Step 1: failing test → Step 2: red → Step 3: implement → Step 4: green + tsc → Step 5: Commit** — `git commit -m "feat(viewer): zoom-collapse pills below 65% — Operational idiom on the SVG canvas"` (explicit paths + plan).

---

### Task 7: viewer_sweep 69/69 gate in validate-loop

**Files:**
- Create: `scripts/viewer_sweep.mts`
- Modify: `scripts/validate_loop.sh` (add the sweep step after the endpoint checks, before frontend tests)
- Modify: `Makefile` only if a standalone target is added (optional: `viewer-sweep`; the loop step is the requirement)

**Interfaces:** consumes the running backend + `toCanvas` imported from `frontend/src/api/mappingAdapter.ts` (pure, type-only imports — Node 22 strip-types loads it).

```ts
// scripts/viewer_sweep.mts — run: node --experimental-strip-types scripts/viewer_sweep.mts
import { toCanvas } from '../frontend/src/api/mappingAdapter.ts'

const BASE = process.env.ETL360_API ?? 'http://localhost:8080'
type Tree = { kind?: string; mappingPath?: string; children?: Tree[] }
const paths: string[] = []
const walk = (n: Tree) => { if (n.kind === 'xml' && n.mappingPath) paths.push(n.mappingPath); (n.children ?? []).forEach(walk) }
walk(await (await fetch(`${BASE}/api/tree`)).json() as Tree)
if (paths.length < 69) { console.error(`viewer_sweep: only ${paths.length} mappings in tree (expected >= 69)`); process.exit(1) }
let failed = 0
for (const p of paths.sort()) {
  try {
    const model = await (await fetch(`${BASE}/api/mappings/model/${p}`)).json()
    const g = toCanvas(model, p)
    if (!g.nodes.length) throw new Error('empty canvas')
    const ids = new Set(g.nodes.map(n => n.id))
    for (const c of g.connections) if (!ids.has(c.fromNode) || !ids.has(c.toNode)) throw new Error(`dangling edge ${c.fromNode}->${c.toNode}`)
    for (const n of g.nodes) if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) throw new Error(`no layout for ${n.name}`)
  } catch (e) { failed++; console.error(`viewer_sweep FAIL ${p}: ${(e as Error).message}`) }
}
console.log(`viewer_sweep: ${paths.length - failed}/${paths.length} mappings render`)
process.exit(failed ? 1 : 0)
```

validate_loop.sh addition (after the operational 404 check, before `pnpm test`; node comes from the same PATH the frontend tests need — the script documents that node ≥22.6 is required):

```bash
echo "[validate-loop] viewer sweep…"
node --experimental-strip-types scripts/viewer_sweep.mts || fail "viewer sweep"
```

- [ ] **Step 1: write script + wire → Step 2: run `make validate-loop` end-to-end — expect `viewer_sweep: 69/69 mappings render` (any FAIL line names the mapping: fix the ADAPTER, never skip a mapping) → Step 3: Commit** — `git commit -m "feat(viewer): 69/69 viewer_sweep gate in validate-loop"` (stage `scripts/viewer_sweep.mts scripts/validate_loop.sh` by exact path + Makefile if touched + plan).

---

### Task 8: Docs + acceptance sweep (spec §7)

**Files:**
- Modify: `docs/superpowers/specs/2026-07-30-ipc-etl-viewer-design.md` (one "Implementation deviations" footnote: §3.4 search input → global TopBar search reuse, no toolbar exists on Tab 1)
- Modify: root `CLAUDE.md` (frontend line: Tab 1 real), `docs/architecture.md` (one line: Viewer consumes model+dom), `frontend/AGENTS.md` (mockData ledger: Tab 1 retired)
- Verification + fixes only otherwise.

- [ ] **Step 1: Walk spec §7's seven criteria**, recording PASS/FAIL each with evidence (boot backend once for the manual criterion-1 curls/checks; the visual half of criterion 6 is deferred to human sign-off per the standing Task-12 ruling — record it as such):
1. ≥5 hand-picked mappings render (incl. `QDM/m_SYN_QDM_ORDERS_QUALITY` [.XML], a huge CDM one, a multi-mapping file if one exists in the corpus — find via the sweep output, else record "none in corpus").
2. Panel spot-check vs raw XML attributes; copy buttons work (RTL-level evidence).
3. Search highlight/jump test green; pills below 0.65 test green.
4. `make validate-loop` incl. 69/69 sweep.
5. `pnpm test`, `tsc`, `make test`, `make check` all green.
6. Tab label "IPC ETL Viewer"; Tabs 2–4 untouched (`git diff --stat` proof); visual side-by-side deferred to human.
7. Docs updated (this task's own edits verified).
- [ ] **Step 2: Fix small reds, re-run, commit** — `git commit -m "chore: IPC ETL Viewer acceptance sweep — spec criteria verified"` (message carries the record; `--allow-empty` if clean; tick final checkboxes; explicit staging).
