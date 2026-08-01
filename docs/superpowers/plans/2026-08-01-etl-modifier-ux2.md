# ETL Modifier UX Round 2 — Implementation Plan (sub-project 9)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tab 2 a usable editor (legible expression dock, fixed-height layout with a docked Inspector, resizable regions, undo/redo) and a safe authoring surface (union/joiner nodes, an IPC adjacency matrix, a pre-add configuration dialog that cannot produce orphans, and recipes authored from scratch).

**Architecture:** Part 1 restructures Tab 2's body from a scrolling document into a fixed-height editor — a `useResizableLayout` hook owns region sizes, an `EditorLayout` shell composes toolbar / canvas / docked Inspector / collapsible drawer with draggable splitters, and `ETLModifier` becomes state + composition on top of it. Part 2 adds semantics: `recipeToCanvas` synthesizes nodes for `union`/`joiner` sources, a new authored `connections` matrix in `ipc-rules.json` (corpus-validated, never corpus-derived) drives a `NodeConfigDialog` that gates insertion behind validation, and a registry endpoint plus a `POST` create endpoint enable authoring a recipe on a blank canvas.

**Tech Stack:** React 19 / TypeScript / Vite, Vitest + React Testing Library + MSW, Java 17 / Spring Boot 3.3, JUnit 5 + AssertJ + MockMvc, Node ≥22.6 `--experimental-strip-types` for sweeps.

**Spec:** `docs/superpowers/specs/2026-08-01-etl-modifier-ux2-design.md` — section references below (`spec §6.2`) point there.

## Global Constraints

- **No new frontend runtime dependencies.** `frontend/package.json` `dependencies` stays exactly `@tanstack/react-query`, `react`, `react-dom`. No canvas library, no virtualization library, no drag library, no router.
- **No parser changes.** No file under `parser/src/main/scala` is modified.
- **No corpus byte changes.** No `_ETL_*.json`, `.xml`/`.XML`, or DDL JSON under `parser/src/main/resources/xmltobq` is edited. A recipe authored during manual testing must **not** be committed — it would move the contract-test floors.
- **`EtlCanvas.tsx` and `NodeBox.tsx` are not modified by any task.** Tab 1's canvas stays byte-identical. `ETLViewer.tsx`, `ETLOperational.tsx` and `ETLDag.tsx` are not modified either — only Tab 2 restructures.
- **Figma visual contract (ADR-0005):** new UI composes only existing tokens — `--surface`, `--surface-2`, `--surface-3`, `--border`, `--border-subtle`, `--bg`, `--red`, `--green`, `--cyan`, `--text-dim`, and `NODE_STYLES` kind colors. No new design token. Spec §10's seven sanctioned departures are the whole permitted visual surface.
- **`RecipeValidationDto.valid` stays `errors.isEmpty()`.** Warnings never block a save or an insert.
- **Corpus floors unchanged:** 81 XMLs, 86 recipes, 33 L2L entries.
- **Report backend test counts from `mvn clean test`, never a warm build** — `backend/target/surefire-reports/` accumulates reports from deleted classes. Cross-check `ls backend/target/surefire-reports/*.txt | wc -l` against `find backend/src/test/java -name '*Test.java' | wc -l`; they must match.
- **`types.gen.ts` is generated**, never hand-edited. Refresh with `make generate-api` against a running backend.
- **Staging discipline:** stage explicit paths. **NEVER `git add -A`** — `.claude/settings.json` and `first_prompt.md` are user-local untracked files.
- **Ledger:** tick this plan's checkboxes and stage the plan file in the same commit as the task's changes.
- Dot-refs (`TABLE.FIELD`) are preserved verbatim everywhere.

## Baselines at plan authorship

Backend **164** tests (clean build, 32 classes = 32 reports). Frontend **239** tests. `tsc --noEmit` clean. `make validate-loop` PASS (viewer 81/81, recipe 86/86).

## File Structure

**Frontend — new:**

| File | Responsibility |
|---|---|
| `src/components/tab2/useResizableLayout.ts` | Region sizes + drag math + `localStorage` persistence. No JSX. |
| `src/components/tab2/EditorLayout.tsx` | The shell: toolbar slot, canvas slot, docked inspector slot, collapsible drawer, two splitters, corner grip. Presentational; owns no recipe state. |
| `src/components/tab2/EditorToolbar.tsx` | Compact identity + actions row (filename, layer, conformance chip, undo/redo, Discard/Save, history/raw/focus). |
| `src/components/tab2/useDraftHistory.ts` | Bounded undo/redo stack over `RecipeJson`. |
| `src/components/tab2/NodeConfigDialog.tsx` | Pre-add configuration modal: schema form + connection picker + live preview/validation. |
| `src/components/tab2/RegistrySearch.tsx` | Searchable table/DDL/expression picker used by the dialog and the new-recipe flow. |
| `src/components/tab2/NewRecipeDialog.tsx` | Layer + mapping-name picker that opens a blank canvas. |
| `src/api/registryQueries.ts` | `useRegistry()` over `GET /api/registry`. |

**Backend — new:** `api/RegistryController.java`, `api/dto/RegistryDto.java`, `api/dto/RegistryTableDto.java`, `service/RegistryService.java`, `service/ipc/IpcConnections.java`.

**Modified:** `ExpressionDock.tsx`, `ETLModifier.tsx` (state + composition only), `recipeAdapter.ts`, `recipeEdits.ts`, `queries.ts`, `types.gen.ts`, `IpcCatalog.java`, `IpcController.java`, `RecipeController.java`, `RecipeService.java`, `ipc-rules.json`, `scripts/recipe_sweep.mts`.

---

# Part 1 — Editor usability

### Task 1: Expression dock — clamp, cap, and an honest count

**Files:**
- Modify: `frontend/src/components/tab2/ExpressionDock.tsx`
- Modify: `frontend/src/components/tab2/ExpressionDock.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks — self-contained presentation fix.

**Why:** the dock mounts all 1909 recipe-origin entries unclamped in a 260 px column. Median formula is 79 chars but the max is **53 881** (~1585 wrapped lines), and `wordBreak: 'break-all'` shatters identifiers mid-token. Result is a wall of horizontal lines.

- [x] **Step 1: Write the failing tests**

Append to `ExpressionDock.test.tsx`:

```tsx
const LONG = 'CONCAT(' + 'X'.repeat(4000) + ')'

it('clamps a long formula and expands it on click', () => {
  render(<ExpressionDock entries={[
    { mappingPath: 'CDM/m_A', layer: 'CDM', transformation: 'EXP_A', port: 'P', formula: LONG, origin: 'recipe' },
  ]} isLoading={false} error={null} filter="" onFilterChange={() => {}} canInsert={false} onInsert={() => {}} />)

  const pre = screen.getByText(LONG)
  expect(pre).toHaveStyle({ overflow: 'hidden' })      // clamped
  fireEvent.click(screen.getByRole('button', { name: /expand/i }))
  expect(screen.getByText(LONG)).not.toHaveStyle({ overflow: 'hidden' })
})

it('caps the rendered list and states truthfully how many are shown', () => {
  const many = Array.from({ length: 300 }, (_, i) => ({
    mappingPath: 'CDM/m_A', layer: 'CDM', transformation: `EXP_${i}`, port: 'P',
    formula: `LTRIM(C${i})`, origin: 'recipe' as const,
  }))
  render(<ExpressionDock entries={many} isLoading={false} error={null} filter=""
    onFilterChange={() => {}} canInsert={false} onInsert={() => {}} />)

  expect(screen.getAllByText(/^EXP_\d+\.P$/)).toHaveLength(150)
  expect(screen.getByText(/showing 150 of 300/i)).toBeInTheDocument()
})

it('shows no footer when nothing is hidden', () => {
  render(<ExpressionDock entries={[
    { mappingPath: 'CDM/m_A', layer: 'CDM', transformation: 'EXP_A', port: 'P', formula: 'LTRIM(A)', origin: 'recipe' },
  ]} isLoading={false} error={null} filter="" onFilterChange={() => {}} canInsert={false} onInsert={() => {}} />)

  expect(screen.queryByText(/showing/i)).not.toBeInTheDocument()
})
```

- [x] **Step 2: Run to verify they fail**

Run: `cd frontend && pnpm test src/components/tab2/ExpressionDock.test.tsx`
Expected: FAIL — no expand button, 300 rows rendered, no footer.

- [x] **Step 3: Implement**

Add above the component:

```tsx
/** Rendered-row cap. The archive is 1909 recipe-origin entries corpus-wide; mounting
 * them all is both unreadable and a real DOM cost. The filter above remains the way to
 * reach any entry, so this caps what is PAINTED, never what is reachable.
 * EXPORTED because Task 13's `RegistrySearch` caps its list the same way — one constant,
 * not two that can drift. */
export const RENDER_CAP = 150
/** Clamp height for a collapsed formula: 3 lines at fontSize 10 / lineHeight 1.6. */
const CLAMP_PX = 10 * 1.6 * 3
```

Inside the component, after `filtered`:

```tsx
const shown = filtered.slice(0, RENDER_CAP)
const [expanded, setExpanded] = useState<Set<number>>(new Set())
const toggle = (i: number) => setExpanded(prev => {
  const next = new Set(prev)
  if (!next.delete(i)) next.add(i)
  return next
})
```

Map over `shown` instead of `filtered`. Give each row's header an expand control before the
`CopyButton`:

```tsx
<button
  aria-label={expanded.has(i) ? 'Collapse formula' : 'Expand formula'}
  onClick={() => toggle(i)}
  style={{
    background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
    color: '#4a5570', fontSize: 9, fontFamily: 'JetBrains Mono, monospace',
  }}
>{expanded.has(i) ? '▾' : '▸'}</button>
```

Replace the `<pre>` style with:

```tsx
<pre style={{
  margin: 0, padding: '6px 8px',
  fontSize: 10, color: '#a78bfa',
  fontFamily: 'JetBrains Mono, monospace',
  whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6,
  ...(expanded.has(i)
    ? { maxHeight: 260, overflowY: 'auto' as const }
    : { maxHeight: CLAMP_PX, overflow: 'hidden' as const }),
}}>{e.formula}</pre>
```

After the list, render the footer only when something is hidden:

```tsx
{filtered.length > shown.length && (
  <div style={{ fontSize: 9, color: '#4a5570', padding: '4px 2px', fontFamily: 'JetBrains Mono, monospace' }}>
    {`showing ${shown.length} of ${filtered.length} · refine the filter`}
  </div>
)}
```

Import `useState` from `react`.

- [x] **Step 4: Run to verify they pass**

Run: `cd frontend && pnpm test src/components/tab2/ExpressionDock.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/tab2/ExpressionDock.tsx \
        frontend/src/components/tab2/ExpressionDock.test.tsx \
        docs/superpowers/plans/2026-08-01-etl-modifier-ux2.md
git commit -m "fix(modifier): make the expression dock legible — clamp, cap, break-word

Task 1. 1909 entries mounted unclamped in a 260px column with wordBreak:break-all;
one corpus formula is 53,881 chars (~1585 wrapped lines). Formulas now clamp to 3
lines with expand, the list caps at 150 painted rows with a truthful count, and
identifiers wrap at boundaries instead of shattering."
```

---

### Task 2: `useResizableLayout` — region sizes, drag math, persistence

**Files:**
- Create: `frontend/src/components/tab2/useResizableLayout.ts`
- Create: `frontend/src/components/tab2/useResizableLayout.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
export interface LayoutSizes { canvasH: number; inspectorW: number; drawerH: number }
/** Minimums for the three RESIZABLE dimensions — keyed exactly by `LayoutSizes`, so
 * `setSize` can index it without a cast. */
export const LAYOUT_MIN: Record<keyof LayoutSizes, number> =
  { canvasH: 240, inspectorW: 280, drawerH: 0 }
/** The canvas's minimum WIDTH is not resizable state — the canvas takes whatever the
 * inspector leaves — so it is a plain layout constant consumed by `EditorLayout`'s
 * `min-width`, deliberately kept out of `LayoutSizes`. */
export const CANVAS_MIN_W = 360
export const LAYOUT_DEFAULT: LayoutSizes = { canvasH: 520, inspectorW: 340, drawerH: 0 }
export const LAYOUT_STORAGE_KEY = 'etl360.tab2.layout'
export function useResizableLayout(): {
  sizes: LayoutSizes
  setSize: (key: keyof LayoutSizes, px: number) => void
  resetSizes: () => void
}
```

`setSize` clamps with `Math.max(LAYOUT_MIN[key], px)` and persists to `localStorage` under
`LAYOUT_STORAGE_KEY`.

**Why `localStorage` and not the layout sidecar:** `_layout_*.json` holds *node positions*, which describe the recipe and are worth committing and sharing. Splitter sizes describe one person's screen. Keep that line sharp (spec §5.3).

- [x] **Step 1: Write the failing test**

Create `useResizableLayout.test.ts` using `renderHook` from `@testing-library/react`:

```ts
import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useResizableLayout, LAYOUT_DEFAULT, LAYOUT_MIN, LAYOUT_STORAGE_KEY } from './useResizableLayout'

describe('useResizableLayout', () => {
  beforeEach(() => localStorage.clear())

  it('starts at the defaults when nothing is stored', () => {
    const { result } = renderHook(() => useResizableLayout())
    expect(result.current.sizes).toEqual(LAYOUT_DEFAULT)
  })

  it('clamps below the minimum rather than accepting it', () => {
    const { result } = renderHook(() => useResizableLayout())
    act(() => result.current.setSize('canvasH', 10))
    expect(result.current.sizes.canvasH).toBe(LAYOUT_MIN.canvasH)
  })

  it('persists across a remount', () => {
    const first = renderHook(() => useResizableLayout())
    act(() => first.result.current.setSize('inspectorW', 420))
    first.unmount()
    const second = renderHook(() => useResizableLayout())
    expect(second.result.current.sizes.inspectorW).toBe(420)
  })

  it('survives corrupt stored JSON by falling back to defaults', () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, '{not json')
    const { result } = renderHook(() => useResizableLayout())
    expect(result.current.sizes).toEqual(LAYOUT_DEFAULT)
  })

  it('resetSizes returns to defaults and clears storage', () => {
    const { result } = renderHook(() => useResizableLayout())
    act(() => result.current.setSize('canvasH', 700))
    act(() => result.current.resetSizes())
    expect(result.current.sizes).toEqual(LAYOUT_DEFAULT)
    expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBeNull()
  })
})
```

- [x] **Step 2: Run to verify it fails**

Run: `cd frontend && pnpm test src/components/tab2/useResizableLayout.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement the hook**

Read stored JSON once in a lazy `useState` initializer, merge over `LAYOUT_DEFAULT` (so a
stored object missing a key still yields a complete `LayoutSizes`), and guard the parse in a
`try/catch` returning the defaults. `setSize` clamps with `Math.max(LAYOUT_MIN[key], px)`,
writes the whole object back to `localStorage`, and returns the new state. Wrap every
`localStorage` access in `try/catch` — a browser with storage disabled must degrade to
in-memory sizes rather than throw.

- [x] **Step 4: Run to verify it passes**

Run: `cd frontend && pnpm test src/components/tab2/useResizableLayout.test.ts && npx tsc --noEmit`
Expected: PASS, 5 tests.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/tab2/useResizableLayout.ts \
        frontend/src/components/tab2/useResizableLayout.test.ts \
        docs/superpowers/plans/2026-08-01-etl-modifier-ux2.md
git commit -m "feat(modifier): useResizableLayout — clamped region sizes persisted to localStorage

Task 2. Splitter sizes describe one person's screen, so they live in localStorage —
unlike node positions, which describe the recipe and stay in the committed
_layout_*.json sidecar. Corrupt or unavailable storage degrades to defaults."
```

---

### Task 3: `EditorLayout` shell — regions, splitters, corner grip

**Files:**
- Create: `frontend/src/components/tab2/EditorLayout.tsx`
- Create: `frontend/src/components/tab2/EditorLayout.test.tsx`

**Interfaces:**
- Consumes: `useResizableLayout` (Task 2).
- Produces:

```tsx
export function EditorLayout(props: {
  toolbar: React.ReactNode
  canvas: React.ReactNode
  inspector: React.ReactNode | null   // null → canvas spans full width, no splitter
  drawer: { id: string; label: string; content: React.ReactNode }[]
}): React.ReactElement
```

**Why:** this is spec §5.2's shell. It owns geometry and nothing else — no recipe state, no
mutators — so Task 4 can move `ETLModifier` onto it without the two concerns tangling.

- [x] **Step 1: Write the failing test**

Cover: all four slots render; a `pointerdown` + `pointermove` + `pointerup` on the vertical
splitter calls through to a size change (assert the inspector element's inline `width` changes);
the same for the horizontal splitter and `canvasH`; the corner grip changes both in one drag;
clicking a drawer tab reveals that tab's content and collapses when clicked again; and with
`inspector={null}` no vertical splitter renders. Use `container.querySelector('[data-splitter="vertical"]')`
etc. — give each splitter and the grip a stable `data-splitter` / `data-grip` attribute for this.

Note jsdom does no layout, so assert on the inline styles the hook drives, not on measured
geometry.

- [x] **Step 2: Run to verify it fails**

Run: `cd frontend && pnpm test src/components/tab2/EditorLayout.test.tsx`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

Structure: an outer `display: flex; flex-direction: column; flex: 1; overflow: hidden`. Row 1 is
`toolbar`. Row 2 is `display: flex; flex: 1; min-height: 0` containing the canvas region
(`flex: 1`, `min-width: CANVAS_MIN_W`), a 4 px vertical splitter with
`cursor: col-resize`, and the inspector at `width: sizes.inspectorW`. Row 3 is a 4 px horizontal
splitter with `cursor: row-resize`; row 4 is the drawer at `height: sizes.drawerH` with a tab
strip that is always visible even when collapsed.

The corner grip is a 12×12 element absolutely positioned at the canvas region's bottom-right
with `cursor: nwse-resize`, adjusting `canvasH` and `inspectorW` together (dragging left widens
the inspector, so its delta is negated).

Drag handling mirrors `IpcCanvas`'s existing pointer-drag idiom: `onPointerDown` records the
start client coordinate and the start size, `onPointerMove` on `window` computes the delta and
calls `setSize`, `onPointerUp` detaches. Attach the move/up listeners to `window` so a fast drag
that leaves the 4 px splitter does not strand the gesture.

Styling: splitters are `var(--border)` at rest and `#4f9cf9` while dragging; drawer tabs reuse
the existing small-mono-uppercase label idiom (`#4a5570`, 10 px, letter-spacing `0.08em`), active
tab in `#c8d3e8`.

- [x] **Step 4: Run to verify it passes**

Run: `cd frontend && pnpm test src/components/tab2/EditorLayout.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/tab2/EditorLayout.tsx \
        frontend/src/components/tab2/EditorLayout.test.tsx \
        docs/superpowers/plans/2026-08-01-etl-modifier-ux2.md
git commit -m "feat(modifier): EditorLayout shell — canvas/inspector/drawer with draggable splitters

Task 3. Presentational only: owns geometry, no recipe state. Two splitters plus the
corner grip, drawer tabs always visible even when collapsed, pointer listeners on
window so a fast drag can't strand the gesture."
```

---

### Task 4: Move Tab 2 onto the editor layout

**Files:**
- Create: `frontend/src/components/tab2/EditorToolbar.tsx`
- Modify: `frontend/src/components/tab2/ETLModifier.tsx`
- Modify: `frontend/src/components/tab2/ETLModifier.test.tsx`

**Interfaces:**
- Consumes: `EditorLayout` (Task 3).
- Produces: `EditorToolbar` — identity (filename, layer chip), the conformance chip slot, and the action row. Undo/redo controls are added to it in Task 5.

**Why:** this is the fix for "I click a node and nothing pops up" (spec §1 defect 2). The
Inspector currently renders ~500 px below the fold, past the Target section
(`ETLModifier.tsx:598` scrolling column, `:735` Inspector).

- [x] **Step 1: Write the failing test**

Append to `ETLModifier.test.tsx`:

```tsx
it('renders the Inspector docked beside the canvas, not below the page fold', async () => {
  renderModifier()
  fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
  fireEvent.click(await screen.findByText('T', { selector: 'text' }))

  // The Inspector must be a sibling of the canvas inside the editor row — NOT a later
  // section of a scrolling document. Walk up from the Inspector to the shared flex row
  // and assert the canvas lives in the same row.
  const inspector = await screen.findByTestId('inspector-dock')
  const row = inspector.parentElement!
  expect(row.querySelector('[data-region="canvas"]')).not.toBeNull()
  expect(row.style.display).toBe('flex')
})

it('moves Source, Target and DDL into the drawer rather than the page body', async () => {
  renderModifier()
  fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
  // Drawer tabs are present…
  expect(await screen.findByRole('button', { name: /^Source$/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Target$/ })).toBeInTheDocument()
  // …and their content is not rendered until the tab is opened.
  expect(screen.queryByText('S', { selector: 'span' })).not.toBeInTheDocument()
})
```

- [x] **Step 2: Run to verify it fails**

Run: `cd frontend && pnpm test src/components/tab2/ETLModifier.test.tsx`
Expected: FAIL — no `inspector-dock` testid, no drawer tabs.

- [x] **Step 3: Write `EditorToolbar`**

A single row: filename + layer chip on the left, then a flexible spacer, then the conformance
chip, then the action buttons. Move the existing `{ history }` / `{ raw JSON }` / `⤢` buttons here
verbatim — same styles, same handlers. Add `Discard` and `Save` (reusing `SaveBar`'s existing
button styles via the already-exported `ghostButtonStyle`, and the same blue Save style),
with the dirty count rendered as the existing amber `N unsaved changes` indicator.

The header card's `Path` / `Size bytes` / `Modified` fields move into the `{ raw JSON }` panel —
they are reference metadata, not per-second information, and the canvas needs the vertical space
(spec §5.2).

- [x] **Step 4: Rewire `ETLModifier`**

Replace the `<div style={{ padding: 24, … }}>` document body with `<EditorLayout>`:

- `toolbar` — `<EditorToolbar …>`.
- `canvas` — the existing `<IpcCanvas …>`, wrapped in a `<div data-region="canvas" style={{ display: 'flex', flex: 1, minHeight: 0 }}>`. **Keep `display: flex`** — `IpcCanvas`'s root is `flex: 1` with absolutely-positioned children, and a block parent collapses it to 0 px (this is the bug Task 7 of sub-project 8 fixed; do not reintroduce it).
- `inspector` — `selectedNode && draft && !isViewing ? <div data-testid="inspector-dock"><Inspector …/></div> : null`.
- `drawer` — four entries: `Source`, `Target`, `BigQuery DDL`, `Edge`, each holding the JSX that
  section renders today, moved verbatim.

`SaveBar` is superseded by the toolbar's actions; delete its usage from `ETLModifier` and delete
`SaveBar.tsx` **only if** nothing else imports it (grep first — `ghostButtonStyle` and
`dangerButtonStyle` are exported from it and used by `Inspector`/`ConformanceChip`, so the file
almost certainly must stay; in that case keep the style exports and remove only the `SaveBar`
component itself, updating its tests).

Focus mode (`?focus=`) renders the same layout minus the Explorer — no separate branch.

- [x] **Step 5: Run every frontend gate**

Run: `cd frontend && pnpm test && npx tsc --noEmit`
Expected: PASS. Existing Tab 2 tests that queried sections by their old page position will need
re-targeting at the drawer — that is expected and in scope. **Do not weaken any assertion**; if a
test asserted a value, it must still assert that value from its new location.

- [x] **Step 6: Verify Tabs 1, 3 and 4 are untouched**

Run: `git diff --stat frontend/src/components/tab1/ frontend/src/components/tab3/ frontend/src/components/tab4/ frontend/src/components/shared/EtlCanvas.tsx`
Expected: empty output.

- [x] **Step 7: Commit**

```bash
git add frontend/src/components/tab2/EditorToolbar.tsx \
        frontend/src/components/tab2/ETLModifier.tsx \
        frontend/src/components/tab2/ETLModifier.test.tsx \
        frontend/src/components/tab2/SaveBar.tsx \
        frontend/src/components/tab2/SaveBar.test.tsx \
        docs/superpowers/plans/2026-08-01-etl-modifier-ux2.md
git commit -m "feat(modifier): Tab 2 becomes a fixed-height editor, Inspector docks beside the canvas

Task 4. The body was a scrolling document ordered header/Source/canvas/Target/
Inspector/Edge/DDL, so clicking a node updated a panel ~500px below the fold — the
reported 'nothing pops up'. Canvas is now the dominant region with the Inspector
docked beside it; Source/Target/DDL/Edge move into the collapsible drawer."
```

---

### Task 5: Undo / redo

**Files:**
- Create: `frontend/src/components/tab2/useDraftHistory.ts`
- Create: `frontend/src/components/tab2/useDraftHistory.test.ts`
- Modify: `frontend/src/components/tab2/EditorToolbar.tsx`, `ETLModifier.tsx`, `ETLModifier.test.tsx`

**Interfaces:**
- Consumes: `EditorToolbar` (Task 4).
- Produces:

```ts
export const HISTORY_CAP = 25
export function useDraftHistory(): {
  push: (before: RecipeJson) => void       // called with the PRE-edit draft
  undo: (current: RecipeJson) => RecipeJson | null
  redo: (current: RecipeJson) => RecipeJson | null
  canUndo: boolean
  canRedo: boolean
  reset: () => void                        // on recipe change, discard, and successful save
}
```

**Why capped at 25:** each entry is a `structuredClone` of an entire recipe and the largest
corpus recipe is ~1000 lines. An unbounded stack is a real memory cost.

- [x] **Step 1: Write the failing test**

Cover: push/undo returns the prior draft; five consecutive edits undo in reverse order; redo
returns forward; `canUndo`/`canRedo` are false at their respective ends; pushing after an undo
truncates the redo branch (standard editor semantics — assert it explicitly); the stack caps at
`HISTORY_CAP` with the oldest entry dropped; `reset()` clears both directions.

- [x] **Step 2: Run to verify it fails**

Run: `cd frontend && pnpm test src/components/tab2/useDraftHistory.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

Two arrays (`past`, `future`) in a `useRef` plus a `useState` counter to trigger re-render, or a
single `useState` holding `{past, future}` — either is fine, but `canUndo`/`canRedo` must be
derived state that re-renders the toolbar. `push` appends to `past` (slicing off the head beyond
`HISTORY_CAP`) and clears `future`. `undo(current)` pops `past`, pushes `current` onto `future`,
returns the popped draft, or `null` when empty.

- [x] **Step 4: Wire into `ETLModifier` and the toolbar**

In `applyEdit` (`ETLModifier.tsx:365`), call `history.push(currentDraft)` before applying. Add
`handleUndo`/`handleRedo` that swap the draft and adjust `dirtyOps`. Call `history.reset()` in
the recipe-change effect, in `handleDiscard`, and after a successful save.

**Keep the history effect separate from the draft-reset effect.** Sub-project 8's Task 10 shipped
a data-loss bug by putting an unrelated query's data into the draft-reset effect's dependency
array; do not merge concerns into that effect again.

Toolbar controls: `↶` and `↷` buttons left of Discard, `disabled={!canUndo}` / `!canRedo`,
styled as the existing `ghostButtonStyle` ghost buttons with `opacity: 0.4` when disabled.

Add an `ETLModifier` test: make three edits, undo twice, assert the field value and the dirty
count both step back; redo once, assert forward.

- [x] **Step 5: Run every frontend gate and commit**

Run: `cd frontend && pnpm test && npx tsc --noEmit`
Expected: PASS.

```bash
git add frontend/src/components/tab2/useDraftHistory.ts \
        frontend/src/components/tab2/useDraftHistory.test.ts \
        frontend/src/components/tab2/EditorToolbar.tsx \
        frontend/src/components/tab2/ETLModifier.tsx \
        frontend/src/components/tab2/ETLModifier.test.tsx \
        docs/superpowers/plans/2026-08-01-etl-modifier-ux2.md
git commit -m "feat(modifier): bounded undo/redo in the toolbar

Task 5. 25-entry snapshot stack — each entry is a whole-recipe structuredClone and the
largest corpus recipe is ~1000 lines, so unbounded history is a real memory cost.
Pushing after an undo truncates the redo branch; reset on recipe change, discard and
successful save."
```

---

# Part 2 — Semantic authoring

### Task 6: Union and joiner canvas nodes

**Files:**
- Modify: `frontend/src/api/recipeAdapter.ts` (`recipeToCanvas`, ~`:352`)
- Modify: `frontend/src/api/recipeAdapter.test.ts`
- Modify: `scripts/recipe_sweep.mts`

**Interfaces:**
- Consumes: `recipeToCanvas(recipe, recipePath, typeAliases?)` as it stands.
- Produces: no signature change — only richer output.

**Why:** `recipeAdapter.ts:352` skips every non-`table` source. All other non-table kinds share a
name with a step target so their node exists anyway; `union` (10) and `joiner` (5) do not,
leaving 2197 `unionTables[].fieldMapping` pairs across 7 recipes and 5 joiner configurations
unreachable. Closes sub-project 8's spec §13 deviation 3.

- [x] **Step 1: Write the failing test**

Assert against a real corpus fixture: a recipe with a `union` source produces a node whose id is
the union's `name`, `label === 'UNI'`, with one OUT port per distinct
`unionTables[].fieldMapping[].union` value; a `joiner` source produces a node with
`label === 'JNR'` and `type === 'joiner'`; edges connect each `unionInput` / `joinerInput` step
to it; and no duplicate node id is produced when the same union feeds two steps.

- [x] **Step 2: Run to verify it fails**

Run: `cd frontend && pnpm test src/api/recipeAdapter.test.ts`
Expected: FAIL — union/joiner nodes absent.

- [x] **Step 3: Implement**

Extend the source loop: keep `type === 'table'` producing today's source node, and add branches
for canonical `union` and `joiner` (resolve through `typeAliases` first, as `kindAndLabel`
already does). Reuse `kindAndLabel` for the type/label rather than hardcoding — `union` already
maps to `FIXED_LABEL.union === 'UNI'` and `joiner` to `RECIPE_KIND.joiner === 'joiner'`.

Ports: for a union, the distinct `unionTables[].fieldMapping[].union` names, direction `OUT`; for
a joiner, the `joinerTables` entries, direction `OUT`. Properties: `collectScalarProps` already
handles the scalar keys (`joinerType`, `joinerCondition`); array-valued keys stay on the JSON for
the Inspector to render.

Edges: a step whose target is a `unionInput`/`joinerInput` gets an edge **to** the union/joiner
node it belongs to. For joiners, `joinerInput` names are `<joiner>.<MASTER|DETAIL>`
(`AbstractTargetFactory.scala:88` builds `s"${joiner.name}.$inputType"`), so the owning joiner is
everything before the **LAST** dot — the joiner's own name comes first and the fixed
`MASTER`/`DETAIL` suffix is dot-free. **This plan originally said "first dot", which is wrong**
whenever a joiner's own name contains a dot; corrected in Task 6's fix round after an implementer
wrote the fixture, ran it against the unmodified code, and found it failed. Today's corpus has no
dotted joiner name, so both splits agree and nothing caught it until that fixture existed. For
unions, the owning union is the `sources[]` entry of type `union` in the step that consumes it.

- [x] **Step 4: Extend the sweep and re-verify counts**

In `scripts/recipe_sweep.mts`, assert that any recipe containing a `union` or `joiner` source
produces a node with that source's name. Then run the full gate — node and edge counts change for
12 recipes, so this is where a regression would surface.

Run: `make validate-loop` (boot the backend first: `mvn -am -pl backend install -DskipTests`,
then `mvn -pl backend spring-boot:run`, poll `/api/health`).
Expected: viewer 81/81, recipe 86/86, no dangling edges.

**Measured (not 12):** node/edge counts changed for **8** recipes, not 12 — the 7 recipes
carrying a `union` source ∪ the 2 recipes carrying a `joiner` source, minus their 1-recipe
overlap (`m_DWH_E_F_OVERSIGHT_PLEDGES_MONTHLY` has both). The plan's "12" reads as `7 + 5`
(union-recipe count + joiner-*configuration* count, i.e. counting 4 of the 5 joiner configs
that live in the single recipe `m_DWH_MAPLEGROVE_ACT_CLIENTMGR_PROFILES` as though each were
its own recipe, and not netting out the union/joiner overlap) rather than a distinct-recipe
count. Verified both ways (`recipeToCanvas` run against every corpus recipe via the live
backend, before vs. after this task's `recipeAdapter.ts` diff) — total nodes 388 -> 403 (+15 =
10 union + 5 joiner, exactly the corpus's union/joiner source counts), total edges 8674 -> 9233
(+559); viewer 81/81, recipe 86/86 (73 warning-severity checks, all pre-existing), relationships
sweep PASS, no dangling edges. Full detail in `task-6-report.md`.

- [x] **Step 5: Commit**

```bash
git add frontend/src/api/recipeAdapter.ts frontend/src/api/recipeAdapter.test.ts \
        scripts/recipe_sweep.mts docs/superpowers/plans/2026-08-01-etl-modifier-ux2.md
git commit -m "feat(modifier): union and joiner sources become canvas nodes

Task 6. Closes sub-project 8 spec §13 deviation 3 — 2197 fieldMapping pairs across 7
recipes and 5 joiner configs had no clickable node because recipeToCanvas only noded
type==='table' sources. Node/edge counts change for 12 recipes; sweep re-verified."
```

---

### Task 7: Recalibrate `IPC-REF-003`

**Files:**
- Modify: `backend/src/main/resources/ipc/ipc-rules.json`
- Modify: `docs/ipc/rules.md`
- Modify: `backend/src/test/java/io/pure360/etl360/IpcRulesContractTest.java` (if the severity moves)

**Why:** `IPC-REF-003` currently ships `warning` with evidence "23 violations across 9 recipes,
two distinct sub-patterns: (1) 15 (10 union + 5 joiner) … (2) 8 `type:"table"` sources absent
from `sourceTableNames`". Task 6 makes sub-pattern (1) structurally resolvable. Leaving the rule
at `warning` with stale evidence would be exactly the drift ADR-0010's procedure exists to
prevent.

- [x] **Step 1: Re-derive the true violation set**

Write a temporary audit (deleted before commit) that runs `IpcRuleEngine` over all 86 corpus
recipes and collects `IPC-REF-003` failures into a list — **counting from the list, never from an
assertion printout**, since AssertJ silently truncates at 1000 elements and that produced wrong
evidence once already.

Record the count and the per-sub-pattern breakdown in the task report.

- [x] **Step 2: Apply ADR-0010's procedure**

Categorise the remaining violations structurally. If the residue is zero, restore
`severity: "error"` and delete `corpusEvidence`. If a residue remains, keep `warning` and rewrite
`corpusEvidence` to describe **only what actually remains** — do not leave the union/joiner text
in place if that class is now resolvable.

Do **not** weaken the rule's logic to change the count. Task 6 changed the canvas, not the
recipes; if `IPC-REF-003` still fires on union/joiner names it is because those names genuinely
do not resolve against step targets, which is a fact about the JSON, not about the canvas. Say so
plainly in the evidence if that is the outcome.

- [x] **Step 3: Mirror into the wiki**

Copy the corrected `corpusEvidence` verbatim into `docs/ipc/rules.md`'s `IPC-REF-003` section.
The three-way parity test asserts ids match, not evidence text — so verify this by hand.

- [x] **Step 4: Run the gates**

Run: `mvn -q -am -pl backend clean test`
Expected: PASS, `everyCorpusRecipeIsErrorFree` still green.

- [x] **Step 5: Commit**

```bash
git add backend/src/main/resources/ipc/ipc-rules.json docs/ipc/rules.md \
        backend/src/test/java/io/pure360/etl360/IpcRulesContractTest.java \
        docs/superpowers/plans/2026-08-01-etl-modifier-ux2.md
git commit -m "fix(ipc): recalibrate IPC-REF-003 after union/joiner nodes landed

Task 7. Re-ran ADR-0010's severity procedure against the live rule engine rather than
carrying stale evidence forward. Counts re-derived from a collected list, never an
AssertJ printout (which truncates silently at 1000 and produced wrong evidence once)."
```

---

### Task 8: IPC adjacency matrix

**Files:**
- Modify: `backend/src/main/resources/ipc/ipc-rules.json` (new `connections` section)
- Create: `backend/src/main/java/io/pure360/etl360/service/ipc/IpcConnections.java`
- Modify: `backend/src/main/java/io/pure360/etl360/service/ipc/IpcCatalog.java`
- Create: `backend/src/test/java/io/pure360/etl360/IpcConnectionsContractTest.java`

**Interfaces:**
- Consumes: `IpcVocabulary` (`TARGET_TYPES`, `SOURCE_TYPES`, `canonicalTargetType`, `canonicalSourceType`).
- Produces:

```java
public record IpcConnectionRule(String sourceKind, List<String> mayFeed,
                                Integer exactly, List<String> namedInputs) {}
// IpcCatalog gains:
public Map<String, IpcConnectionRule> connections()
```

**The design rule:** the matrix is **authored** from IPC semantics and the parser's step model,
**not derived** from the corpus. A derived matrix could only permit what these 86 recipes happen
to contain, forbidding legal IPC constructions the sample never used. The corpus is the
*validation* set instead.

- [x] **Step 1: Write the failing contract test**

```java
package io.pure360.etl360;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.pure360.etl360.service.CorpusService;
import io.pure360.etl360.service.ipc.IpcCatalog;
import io.pure360.etl360.service.ipc.IpcVocabulary;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class IpcConnectionsContractTest {
    @Autowired CorpusService corpus;
    @Autowired IpcCatalog catalog;
    private final ObjectMapper mapper = new ObjectMapper();

    /** Spec §6.2: the matrix is authored, the corpus validates it. Every pairing that
     * actually occurs across the 86 recipes must be permitted — an over-strict matrix
     * fails here, and so does an invented one. */
    @Test
    void everyPairingObservedInTheCorpusIsPermitted() throws Exception {
        Set<String> unpermitted = new LinkedHashSet<>();
        for (String rel : corpus.allRecipePaths()) {
            JsonNode d = mapper.readTree(
                Files.readString(Path.of("../parser/src/main/resources/xmltobq").resolve(rel)));
            for (JsonNode step : d.path("steps")) {
                String tgt = IpcVocabulary.canonicalTargetType(step.path("target").path("type").asText(""));
                for (JsonNode src : step.path("sources")) {
                    String s = IpcVocabulary.canonicalSourceType(src.path("type").asText(""));
                    var rule = catalog.connections().get(s);
                    if (rule == null || !rule.mayFeed().contains(tgt)) {
                        unpermitted.add(s + " -> " + tgt + "  (e.g. " + rel + ")");
                    }
                }
            }
        }
        assertThat(unpermitted).as("corpus pairings the authored matrix forbids").isEmpty();
    }

    @Test
    void everySourceKindHasAConnectionRule() {
        assertThat(catalog.connections().keySet()).containsAll(IpcVocabulary.SOURCE_TYPES);
    }

    @Test
    void everyMayFeedTargetIsAKnownTargetKind() {
        catalog.connections().forEach((src, rule) ->
            assertThat(IpcVocabulary.TARGET_TYPES)
                .as("mayFeed targets of " + src).containsAll(rule.mayFeed()));
    }

    @Test
    void joinerInputCarriesItsMasterDetailCardinality() {
        var rule = catalog.connections().get("joinerInput");
        assertThat(rule).isNotNull();
        assertThat(rule.exactly()).isEqualTo(2);
        assertThat(rule.namedInputs()).containsExactlyInAnyOrder("MASTER", "DETAIL");
    }
}
```

Note `joinerInput` is a *target* kind, not a source kind — it appears in `connections` because
its cardinality constraint belongs with the adjacency model. `everySourceKindHasAConnectionRule`
uses `containsAll`, so extra entries like this are permitted.

- [x] **Step 2: Run to verify it fails**

Run: `mvn -am -pl backend test -Dtest=IpcConnectionsContractTest -DfailIfNoTests=false`
Expected: FAIL — `connections()` does not exist.

- [x] **Step 3: Author the matrix**

Add a `connections` object to `ipc-rules.json`. Author each source kind's `mayFeed` from what the
kind *means* in IPC, then check it against spec §4's 30 observed pairings — every one must be
covered, and you may legitimately permit more. Reference points: a `sourceQualifier` reads a
relational source and feeds any downstream transformation or target; `union`/`joiner` outputs
feed downstream transformations and targets; `router` feeds per-group consumers; a `table` source
feeds a `sourceQualifier` (the normal IPC read path) and, in this corpus, `table` and `normalizer`
directly.

Add the `joinerInput` cardinality entry (`exactly: 2`, `namedInputs: ["MASTER","DETAIL"]`).

- [x] **Step 4: Load it in `IpcCatalog`**

Parse `connections` in the existing constructor alongside `rules`/`keySchema`/aliases; expose
`connections()` returning an immutable copy, mirroring the existing accessors exactly.

- [x] **Step 5: Run to verify it passes**

Run: `mvn -am -pl backend clean test`
Expected: PASS. If `everyPairingObservedInTheCorpusIsPermitted` fails, the matrix is too strict —
widen it and record why in the task report; do **not** relax the test.

- [x] **Step 6: Commit**

```bash
git add backend/src/main/resources/ipc/ipc-rules.json \
        backend/src/main/java/io/pure360/etl360/service/ipc/IpcConnections.java \
        backend/src/main/java/io/pure360/etl360/service/ipc/IpcCatalog.java \
        backend/src/test/java/io/pure360/etl360/IpcConnectionsContractTest.java \
        docs/superpowers/plans/2026-08-01-etl-modifier-ux2.md
git commit -m "feat(ipc): authored connection adjacency matrix, validated against the corpus

Task 8. Authored from IPC semantics rather than derived from the corpus — a derived
matrix could only permit what these 86 recipes happen to contain. The corpus is the
validation set: all 30 observed pairings must be permitted."
```

---

### Task 9: Serve `connections` to the frontend

**Files:**
- Modify: `backend/src/main/java/io/pure360/etl360/api/dto/IpcRulesDto.java`, `IpcController.java`
- Create: `backend/src/main/java/io/pure360/etl360/api/dto/IpcConnectionDto.java`
- Modify: `frontend/src/api/types.gen.ts` (regenerated), `frontend/src/api/queries.ts`

**Interfaces:**
- Produces: `IpcRulesDto` gains `Map<String, IpcConnectionDto> connections`; `IpcConnectionDto(String sourceKind, List<String> mayFeed, Integer exactly, List<String> namedInputs)`. Frontend type alias `IpcConnections = IpcRules['connections']`.

- [ ] **Step 1: Extend the DTO and controller, with a MockMvc assertion**

Add a test to the existing IPC controller test asserting `GET /api/ipc/rules` returns a
`connections` object containing `sourceQualifier.mayFeed` as a non-empty array.

- [ ] **Step 2: Run to verify it fails, then implement**

Run: `mvn -am -pl backend test -Dtest=IpcControllerTest -DfailIfNoTests=false` → FAIL, then map
`catalog.connections()` into the DTO and re-run → PASS.

- [ ] **Step 3: Regenerate the frontend types**

`mvn -am -pl backend install -DskipTests`, start `mvn -pl backend spring-boot:run` in the
background, poll `http://localhost:8080/api/health`, run `make generate-api`, stop the server.
Never hand-edit `types.gen.ts`.

- [ ] **Step 4: Run all gates and commit**

Run: `mvn -q -am -pl backend clean test && cd frontend && pnpm test && npx tsc --noEmit`

```bash
git add backend/src/main/java/io/pure360/etl360/api/ \
        frontend/src/api/types.gen.ts frontend/src/api/queries.ts \
        backend/src/test/java/io/pure360/etl360/api/ \
        docs/superpowers/plans/2026-08-01-etl-modifier-ux2.md
git commit -m "feat(ipc): serve the connection matrix through GET /api/ipc/rules

Task 9. Keeps the frontend holding no second copy of the recipe grammar — the same
principle keySchema follows."
```

---

### Task 10: `NodeConfigDialog` — configure before inserting

**Files:**
- Create: `frontend/src/components/tab2/NodeConfigDialog.tsx`, `NodeConfigDialog.test.tsx`
- Modify: `frontend/src/api/recipeEdits.ts`

**Interfaces:**
- Consumes: `InspectorWidgets`' `TextWidget`, `ToggleWidget`, `TextareaWidget`, `StringListWidget`, `RowTableWidget`, `FormulaWidget`; `useIpcRules()`'s `keySchema` + `connections`; `useValidation`.
- Produces:

```tsx
export function NodeConfigDialog(props: {
  kind: string                       // palette `type`, e.g. 'filter' | 'sourceTable'
  draft: RecipeJson
  keySchema: KeySchemaMap
  connections: IpcConnections
  onCancel: () => void
  onInsert: (next: RecipeJson) => void   // called ONLY with a validated draft
}): React.ReactElement
```

Plus in `recipeEdits.ts`:

```ts
export function buildStep(kind: string, name: string, props: Record<string, unknown>,
                          feeds: string[], fedBy: string[]): RecipeStepJson
export function insertConfiguredStep(d: RecipeJson, step: RecipeStepJson): RecipeJson
```

**Why:** `addStep` today emits `{name: "NEW_<TYPE>_<n>", type, fields: []}` with no sources, no
fields and no refs — the orphan `NEW_TABLE_1` in the user's screenshot. Insertion must not be able
to produce that.

- [ ] **Step 1: Write the failing tests**

Cover: the dialog renders one widget per `required` key of the chosen kind, using the schema
(assert a `toggle` for `sourceQualifier.selectDistinct` and a `stringList` for
`aggregator.groupByFields`); an empty name disables Insert; a duplicate name disables Insert with
a visible reason; the connection picker lists only nodes the matrix permits for this kind and
renders forbidden ones disabled with a reason; Insert stays disabled while the previewed draft
has validation errors; `onInsert` fires with a draft containing the fully-formed step; Cancel
calls `onCancel` and never `onInsert`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && pnpm test src/components/tab2/NodeConfigDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildStep` / `insertConfiguredStep`**

`buildStep` assembles `{target: {name, type: kind, ...props, fields: []}, sources: [...]}` from
the `fedBy` node names (each becomes a `sources[]` entry whose `type` is that node's kind).
`insertConfiguredStep` appends the step immutably, adds the name to `table.targetTableNames` when
`kind === 'table'`, and for each `feeds` entry adds this node as a `sources[]` entry of the
consuming step. Both are pure and never mutate their input, matching the file's existing idiom.

- [ ] **Step 4: Implement the dialog**

A centered modal over a `rgba(0,0,0,0.5)` scrim (composition, not a new token), `var(--surface)`
panel with `1px solid var(--border)`. Sections: **Name** (text input + live uniqueness),
**Properties** (schema-driven widgets — dispatch on `spec.widget` exactly as `Inspector` does; no
per-kind branching), **Connections** (two lists, "fed by" and "feeds", each showing candidate
nodes with permitted ones selectable and forbidden ones `disabled` plus a `title` giving the
reason), **Preview** (the JSON fragment, and the validation result of the draft with the fragment
applied), then Cancel / Insert.

Insert is `disabled` unless: name non-empty, name unique, every `required` key present, and the
previewed validation returns zero errors. Warnings do **not** block — `valid` is `errors.isEmpty()`
and that contract is global.

Escape and a scrim click both cancel. Focus the name input on mount.

- [ ] **Step 5: Run every gate and commit**

Run: `cd frontend && pnpm test && npx tsc --noEmit`

```bash
git add frontend/src/components/tab2/NodeConfigDialog.tsx \
        frontend/src/components/tab2/NodeConfigDialog.test.tsx \
        frontend/src/api/recipeEdits.ts frontend/src/api/recipeEdits.test.ts \
        docs/superpowers/plans/2026-08-01-etl-modifier-ux2.md
git commit -m "feat(modifier): NodeConfigDialog — configure and validate before inserting

Task 10. addStep emitted {name:'NEW_TYPE_n', type, fields:[]} with no sources, fields
or refs — the orphan in the user's screenshot was the designed behaviour. Insert is
now gated on a validated preview, so an orphan is unreachable by construction."
```

---

### Task 11: Route every palette add through the dialog

**Files:**
- Modify: `frontend/src/components/tab2/ETLModifier.tsx`, `Palette.tsx`, `ETLModifier.test.tsx`

**Interfaces:**
- Consumes: `NodeConfigDialog` (Task 10).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Clicking a palette entry opens the dialog and inserts **nothing** until Insert is pressed;
dragging a palette entry onto the canvas opens the same dialog rather than inserting directly;
Cancel leaves the draft and the dirty count unchanged.

- [ ] **Step 2: Run to verify it fails, then implement**

Replace `handlePaletteAdd`'s direct `addStep`/`addSourceTable` calls with
`setPendingKind(type)`, render `<NodeConfigDialog>` when `pendingKind !== null`, and have its
`onInsert` route through the existing `applyEdit` so undo/redo, the dirty count and the
conformance chip all follow automatically.

`IpcCanvas`'s `onDropType` handler does the same — it must open the dialog, not insert.

- [ ] **Step 3: Delete the superseded mutators**

`addStep` and `addSourceTable` exist solely to serve the direct-add path this task removes, and
`buildStep`/`insertConfiguredStep` supersede them with a shape that carries sources, properties
and links. **Delete both from `frontend/src/api/recipeEdits.ts` along with their tests in
`recipeEdits.test.ts`** (human ruling, pre-flight scan 2026-08-01) — leaving them exported and
tested with no production caller repeats a defect sub-project 8's final review already named
once, where tested-but-unreachable code reads as coverage without being it.

`addSourceTable` currently calls `addStep` internally; both go together. Update
`Palette.tsx`'s header comment, which references them by name.

Then verify nothing reaches them:

Run: `grep -rn 'addStep\|addSourceTable' frontend/src`
Expected: no hits at all outside this task's own deletions.

- [ ] **Step 4: Run all gates and commit**

```bash
git add frontend/src/components/tab2/ETLModifier.tsx frontend/src/components/tab2/Palette.tsx \
        frontend/src/components/tab2/ETLModifier.test.tsx \
        docs/superpowers/plans/2026-08-01-etl-modifier-ux2.md
git commit -m "feat(modifier): palette click and canvas drop both open the config dialog

Task 11. Direct insertion is removed from the UI path — the only way to add a node is
through a dialog that will not insert an invalid one."
```

---

### Task 12: `GET /api/registry`

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/service/RegistryService.java`, `api/RegistryController.java`, `api/dto/RegistryDto.java`, `api/dto/RegistryTableDto.java`
- Create: `backend/src/test/java/io/pure360/etl360/api/RegistryControllerTest.java`

**Interfaces:**
- Produces: `RegistryDto(List<RegistryTableDto> sourceTables, List<RegistryTableDto> targetTables, List<RegistryTableDto> ddlTables, List<String> layers)`; `RegistryTableDto(String name, List<String> columns, List<String> usedByRecipes)`.

Expected magnitudes from spec §4: 108 source tables, 87 target tables, 212 DDL tables, 8 layers.

- [ ] **Step 1: Write the failing MockMvc test**

Assert 200; `sourceTables` size ≥ 100 and `targetTables` ≥ 80; `layers` contains `CDM` and `DWH`;
a known DDL table carries a non-empty `columns`; and — reusing the exclusion pattern already
proven for `/api/summary` — a `_layout_*.json` and a `_history/` entry seeded into a temp corpus
appear nowhere in the response.

- [ ] **Step 2: Run to verify it fails, then implement**

Walk the corpus once, reusing `CorpusService.allRecipePaths()` and the existing
`HistorySidecar`/`LayoutSidecar` exclusion predicates — do not re-implement either. DDL columns
come from each `<TABLE>.json`'s field list, the same files `RecipeService.ddls` reads.

- [ ] **Step 3: Run backend gates and commit**

Run: `mvn -q -am -pl backend clean test`

```bash
git add backend/src/main/java/io/pure360/etl360/service/RegistryService.java \
        backend/src/main/java/io/pure360/etl360/api/RegistryController.java \
        backend/src/main/java/io/pure360/etl360/api/dto/ \
        backend/src/test/java/io/pure360/etl360/api/RegistryControllerTest.java \
        docs/superpowers/plans/2026-08-01-etl-modifier-ux2.md
git commit -m "feat(registry): GET /api/registry — searchable authoring inventory

Task 12. Source/target/DDL tables with columns and referencing recipes, plus layers.
Reuses the HistorySidecar/LayoutSidecar exclusion predicates rather than duplicating
them; exclusions asserted, not assumed."
```

---

### Task 13: Registry search UI

**Files:**
- Create: `frontend/src/api/registryQueries.ts`, `frontend/src/components/tab2/RegistrySearch.tsx`, `RegistrySearch.test.tsx`
- Modify: `frontend/src/api/types.gen.ts` (regenerated), `NodeConfigDialog.tsx`

**Interfaces:**
- Produces: `useRegistry()` (TanStack, `staleTime: Infinity`); `RegistrySearch({ kind, onPick })` where `kind` is `'source' | 'target' | 'ddl'`.

- [ ] **Step 1: Regenerate types, write the failing test**

Cover: typing filters the list across name and column names; picking calls `onPick` with the
table; an empty result renders an explicit empty state, not a blank panel; the list is capped the
same way the expression dock is (reuse the same cap constant idiom rather than inventing a
second) with a truthful count.

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && pnpm test src/components/tab2/RegistrySearch.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement, then re-run**

`useRegistry()` mirrors `useIpcRules()` exactly (`staleTime: Infinity`, same `apiGet` call shape)
— the registry is static per backend build. `RegistrySearch` is a filter input over a capped
list, importing Task 1's exported `RENDER_CAP` from `./ExpressionDock` rather than declaring a second cap. Filter across
both the table name and its column names, so searching a column finds its table.

Run: `cd frontend && pnpm test src/components/tab2/RegistrySearch.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Use it in the dialog**

When the chosen kind is a source or target table, the Name field gains a "pick from registry"
affordance that opens `RegistrySearch` and fills the name — free text stays allowed for new
tables, since authoring a target that does not exist yet is the point.

- [ ] **Step 5: Run all gates and commit**

Run: `cd frontend && pnpm test && npx tsc --noEmit`

```bash
git add frontend/src/api/registryQueries.ts frontend/src/api/types.gen.ts \
        frontend/src/components/tab2/RegistrySearch.tsx \
        frontend/src/components/tab2/RegistrySearch.test.tsx \
        frontend/src/components/tab2/NodeConfigDialog.tsx \
        docs/superpowers/plans/2026-08-01-etl-modifier-ux2.md
git commit -m "feat(modifier): registry search for tables and DDL schemas

Task 13. Backs the config dialog's name field; free text still allowed so a target
that does not exist yet can be authored."
```

---

### Task 14: `POST /api/recipes/{*path}` — create

**Files:**
- Modify: `backend/src/main/java/io/pure360/etl360/api/RecipeController.java`, `service/RecipeService.java`
- Modify: `backend/src/test/java/io/pure360/etl360/api/RecipeWriteControllerTest.java`

**Interfaces:**
- Produces: `RecipeService.create(String relJsonPath, JsonNode content) -> RecipeDto`.

**The safety requirement, stated plainly:** sub-project 8's final review caught `LayoutService`
creating corpus directories as an accidental side effect. This endpoint does it **deliberately**,
so the guards are the whole point:

- **409** if the file already exists.
- **400** unless the path is exactly `<layer>/<mapping>/_ETL_<mapping>.json`, where `<layer>` is
  an existing top-level directory of the corpus root — **enumerated at request time, never
  hardcoded**, so adding a layer to the corpus does not require a code change.
- **400** if the body does not validate with zero errors, checked *before* anything is written.
- Creates the `<mapping>` directory only. **Never creates a layer.**
- Writes atomically (temp + `ATOMIC_MOVE`), like `RecipeService.writeAtomic`.

- [ ] **Step 1: Write the failing tests**

One test per guard, against a `@DynamicPropertySource` temp corpus: create succeeds and the file
lands at the right path; a second create returns 409; a path outside a layer returns 400 and
creates nothing; a malformed path shape returns 400; an invalid body returns 400 and creates
nothing; and after each failure case, assert the temp corpus tree is byte-unchanged.

- [ ] **Step 2: Run to verify they fail, then implement**

Run: `mvn -am -pl backend test -Dtest=RecipeWriteControllerTest -DfailIfNoTests=false`
Expected: FAIL — no `POST` mapping, the create attempts 404/405.

Implement `RecipeService.create` next to `save`, reusing `writeAtomic` verbatim. Enumerate the
layers with a single `Files.list(paths.corpusRoot())` filtered to directories — never a hardcoded
list. Validate with the injected `IpcRuleEngine` before touching the filesystem.

Re-run the same command; expected PASS.

- [ ] **Step 3: Confirm no corpus pollution from your own testing**

Run: `git status --porcelain -- parser/`
Expected: empty. Delete any stray directory your testing created before committing.

- [ ] **Step 4: Run backend gates and commit**

```bash
git add backend/src/main/java/io/pure360/etl360/api/RecipeController.java \
        backend/src/main/java/io/pure360/etl360/service/RecipeService.java \
        backend/src/test/java/io/pure360/etl360/api/RecipeWriteControllerTest.java \
        docs/superpowers/plans/2026-08-01-etl-modifier-ux2.md
git commit -m "feat(recipes): POST create — 409 on existing, layer-scoped, validation-gated

Task 14. Deliberately creates a mapping directory inside the corpus, which is exactly
why every guard is explicit: existing-layer check enumerated at request time, path
shape enforced, body validated before any write, never creates a layer."
```

---

### Task 15: New recipe from scratch

**Files:**
- Create: `frontend/src/components/tab2/NewRecipeDialog.tsx`, `NewRecipeDialog.test.tsx`
- Modify: `frontend/src/components/tab2/ETLModifier.tsx`, `ETLModifier.test.tsx`, `frontend/src/api/queries.ts`

**Interfaces:**
- Consumes: `useRegistry()` (Task 13), `POST /api/recipes/{*path}` (Task 14), `NodeConfigDialog` (Task 10).
- Produces: nothing consumed later.

- [ ] **Step 1: Write the failing test**

A "New recipe" control opens a dialog listing the registry's layers; entering a mapping name
shows the exact path that will be created; Create opens the editor with an **empty** draft and no
recipe fetch; building a node through the config dialog and saving issues a `POST` to that path;
a name colliding with an existing recipe surfaces the 409 as a visible error rather than a
silent failure.

- [ ] **Step 2: Run to verify it fails, then implement**

`ETLModifier` gains an `authoring` mode: `draft` starts as `{steps: [], table: {targetTableNames: [], sourceTableNames: []}}`,
`recipePath` is the target path, and the save path uses `POST` instead of `PUT` until the first
successful create — after which it behaves exactly like any other open recipe.

- [ ] **Step 3: Run all gates and commit**

Run: `cd frontend && pnpm test && npx tsc --noEmit`

```bash
git add frontend/src/components/tab2/NewRecipeDialog.tsx \
        frontend/src/components/tab2/NewRecipeDialog.test.tsx \
        frontend/src/components/tab2/ETLModifier.tsx \
        frontend/src/components/tab2/ETLModifier.test.tsx \
        frontend/src/api/queries.ts \
        docs/superpowers/plans/2026-08-01-etl-modifier-ux2.md
git commit -m "feat(modifier): author a recipe from scratch on a blank canvas

Task 15. Layer + mapping picker, empty draft, POST on first save then PUT thereafter.
409 on a colliding name surfaces as a visible error."
```

---

### Task 16: Target DDL columns as authored fields

**Files:**
- Modify: `frontend/src/components/tab2/NodeConfigDialog.tsx`, `NodeConfigDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

When the configured kind is a target `table` and the entered name matches a registry DDL table,
the dialog offers that table's columns as fields, and accepting them produces a step whose
`fields[]` carry those names with their DDL types mapped to `ScalaType` values. Declining leaves
`fields: []`. A name matching no DDL offers nothing and shows no error.

- [ ] **Step 2: Run to verify it fails, then implement**

Run: `cd frontend && pnpm test src/components/tab2/NodeConfigDialog.test.tsx`
Expected: FAIL — no DDL column offer.

Map BigQuery DDL types to `ScalaType` values (`STRING`→`String`, `NUMERIC`/`BIGNUMERIC`→`BigDecimal`,
`INT64`→`Long`, `TIMESTAMP`→`Timestamp`, `DATETIME`→`LocalDateTime`, `DATE`→`LocalDate`,
`BOOL`→`Boolean`); anything unrecognized becomes `Unknown`, which is a legal `ScalaType`
(`ScalaType.scala:7`) and passes `IPC-STR-008`.

Re-run the same command; expected PASS.

- [ ] **Step 3: Run gates and commit**

Run: `cd frontend && pnpm test && npx tsc --noEmit`

```bash
git add frontend/src/components/tab2/NodeConfigDialog.tsx \
        frontend/src/components/tab2/NodeConfigDialog.test.tsx \
        docs/superpowers/plans/2026-08-01-etl-modifier-ux2.md
git commit -m "feat(modifier): offer matching DDL columns as a new target's fields

Task 16. Unrecognized BigQuery types map to ScalaType 'Unknown', which is legal and
passes IPC-STR-008 rather than producing an invalid recipe."
```

---

### Task 17: Sweep, docs, ADR-0012, acceptance walk

**Files:**
- Modify: `scripts/recipe_sweep.mts`, `CLAUDE.md`, `docs/architecture.md`, `frontend/AGENTS.md`
- Create: `docs/adr/0012-ipc-connection-matrix.md`
- Modify: `docs/superpowers/specs/2026-08-01-etl-modifier-ux2-design.md` (§12)

- [ ] **Step 1: Extend the sweep**

Assert every recipe with a `union`/`joiner` source yields a node of that name, and that
`GET /api/ipc/rules` serves a `connections` entry for every source kind. Wire nothing new
alongside `validate-loop` — extend what it already runs.

- [ ] **Step 2: Run the full gate**

`make dev` in one terminal, `make validate-loop` in another. Expected: all sweeps green.

- [ ] **Step 3: Write ADR-0012**

Follow `docs/adr/0000-template.md`, ≤ 30 lines per that template's own convention (ADRs 0010 and
0011 overran it; do not repeat that). Record: why the matrix is authored rather than derived; the
corpus as validation set; where it lives and how it is served; and why gating Insert behind
validation beats permitting orphans and flagging them afterwards.

- [ ] **Step 4: Update the docs**

`CLAUDE.md` (Tab 2's description, the new endpoints, a pointer to ADR-0012), `docs/architecture.md`
(`GET /api/registry`, `POST /api/recipes/{*path}`, `connections` on `GET /api/ipc/rules`),
`frontend/AGENTS.md` (the new Tab 2 components and hooks).

**Do not claim a capability the acceptance walk marks FAIL.** Sub-project 8 shipped a `CLAUDE.md`
line contradicting its own acceptance finding, and `CLAUDE.md` is primed into every future
session.

- [ ] **Step 5: Acceptance walk**

Work spec §9's 12 criteria in order. For each record exactly one of **PASS** (with the command and
its output), **PASS (mechanical)** (behaviour proven by test or script, visual result not
observed — say precisely what was and was not proven), **NEEDS HUMAN VISUAL SIGN-OFF** (say what
to look at), or **FAIL** (with evidence).

**Do not write PASS for anything you did not observe.** An honest set of NEEDS-HUMAN entries is a
good outcome; invented PASSes destroy the exercise. Record the results in spec §9 as a committed
table, not only in the task report — the report is git-ignored.

- [ ] **Step 6: Commit**

```bash
git add scripts/recipe_sweep.mts CLAUDE.md docs/architecture.md frontend/AGENTS.md \
        docs/adr/0012-ipc-connection-matrix.md \
        docs/superpowers/specs/2026-08-01-etl-modifier-ux2-design.md \
        docs/superpowers/plans/2026-08-01-etl-modifier-ux2.md
git commit -m "chore: UX round 2 acceptance walk — sweep, ADR-0012, docs

Task 17. Spec §9's criteria verified with evidence and recorded in the spec itself;
deviations in §12."
```

---

## Critical Files for Implementation

| File | Why it matters |
|---|---|
| `frontend/src/components/tab2/ETLModifier.tsx` | The scrolling-document body (`:598`) and the fixed 420 px canvas host (`:700`) are what Task 4 replaces. Its `applyEdit` (`:365`) is the single funnel every mutation passes through — undo/redo and the dialog both hook there. |
| `frontend/src/components/tab2/InspectorWidgets.tsx` | Seven widget primitives the config dialog reuses. Building a second widget system would be the main way this plan goes wrong. |
| `frontend/src/api/recipeAdapter.ts:352` | The `source.type !== 'table'` skip that hides union and joiner sources. |
| `frontend/src/api/recipeEdits.ts` | `addStep`'s orphan-producing shape, and the immutable-mutator idiom every new mutator must follow. |
| `backend/.../service/ipc/IpcCatalog.java` | Loads `ipc-rules.json`; `connections` joins `rules`/`keySchema`/aliases there. |
| `backend/.../service/RecipeService.java` | `writeAtomic` and `writableRecipeFile` are the idioms `create` mirrors — including the existence check `LayoutService` originally failed to mirror. |
| `docs/adr/0010-ipc-conformance-ruleset.md` | The severity procedure Task 7 re-runs. |
| `docs/superpowers/specs/2026-08-01-etl-modifier-ux2-design.md` | The spec. Section references throughout point here. |
