import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Connection, Port } from '../../types'
import type { FSFile, FSDir } from '../../types'
import type { ApiError } from '../../api/client'
import { apiGet, apiSend } from '../../api/client'
import { useRecipe, useDdl, useExpressions, useIpcRules, useSummary } from '../../api/queries'
import { useLayout, putLayout } from '../../api/layoutQueries'
import type { NodeOffset } from '../../api/layoutQueries'
import type { RecipeFile, RecipeValidation, RecipeValidationError } from '../../api/queries'
import { recipeToCanvas, fieldsOf } from '../../api/recipeAdapter'
import type { RecipeJson } from '../../api/recipeAdapter'
import {
  addSourceTable,
  addStep,
  deleteEdge,
  deleteNode,
  parseFormulaText,
  setFieldTransformation,
} from '../../api/recipeEdits'
import { useValidation, nodeStatusFrom } from '../../api/ipcRules'
import { Sidebar } from '../shared/Sidebar'
import { useFilesystem } from '../shared/useFilesystem'
import { InfoTooltip } from '../shared/InfoTooltip'
import { IpcCanvas } from './IpcCanvas'
import { CopyButton } from '../shared/CopyButton'
import { GCPIcon } from '../shared/GCPIcon'
import { CorpusSummary, type SummaryItem } from '../shared/CorpusSummary'
import { LoadingState } from '../shared/Spinner'
import { Palette, SOURCE_TABLE_TYPE } from './Palette'
import { HistoryDrawer } from './HistoryDrawer'
import { SaveBar, dangerButtonStyle } from './SaveBar'
import { DDLViewer, type DdlColumnJson } from './DDLViewer'
import { Inspector } from './Inspector'
import { ConformanceChip } from './ConformanceChip'
import { ExpressionDock } from './ExpressionDock'

const EMPTY_FS: FSDir = { name: 'xmltobq', layer: 'root', children: [] }

// ─── Explorer scoping + info copy (Task 14) ────────────────────────────────────
//
// The Modifier's whole premise is the platform-agnostic `_ETL_*.json` model
// XMLParser derives from native IPC `.xml` exports — so Tab 2's Explorer keeps
// only recipes (`fileFilter`, spec §6.8) and explains the omission (both here
// and in the empty state below) rather than silently hiding the XML.
const RECIPE_ONLY_FILTER = (f: FSFile) => f.name.startsWith('_ETL_') && f.name.endsWith('.json')
const EXPLORER_INFO_COPY = 'The Modifier edits the platform-agnostic _ETL_*.json recipes XMLParser produces from native IPC .xml exports. The source XML lives in the IPC ETL Viewer tab.'

// ─── Layout offsets ⇄ wire DTO (Task 10) ───────────────────────────────────────
// Two vocabularies meet at this boundary and nowhere else: IpcCanvas's in-memory
// `offsets` map is keyed `{x, y}` (Task 8's existing shape, unchanged), while the
// `LayoutDto` wire format is keyed `{dx, dy}` (deliberately named that way so
// nobody reads them as absolute canvas coordinates — see NodeOffsetDto's Javadoc).

/** `LayoutDto.nodes` (dx/dy) -> IpcCanvas's `offsets` prop shape (x/y). Missing
 * dx/dy (an empty/partial sidecar) fall back to 0, matching "no offset". */
function toCanvasOffsets(nodes: Record<string, NodeOffset> | undefined): Record<string, { x: number; y: number }> {
  if (!nodes) return {}
  return Object.fromEntries(
    Object.entries(nodes).map(([id, off]) => [id, { x: off.dx ?? 0, y: off.dy ?? 0 }]),
  )
}

/** IpcCanvas's `offsets` prop shape (x/y) -> the `putLayout` wire body (dx/dy). */
function toWireOffsets(offsets: Record<string, { x: number; y: number }>): Record<string, { dx: number; dy: number }> {
  return Object.fromEntries(
    Object.entries(offsets).map(([id, { x, y }]) => [id, { dx: x, dy: y }]),
  )
}

/** Debounce interval (ms) between a node drag settling and the layout PUT firing. */
const LAYOUT_SAVE_DEBOUNCE_MS = 500

// ─── Editable Field ───────────────────────────────────────────────────────────

function EditableField({
  label,
  value,
  onChange,
  mono = false,
  onCommit,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  mono?: boolean
  /** Fired on blur, after the style reset — Task 8's edit panel commits draft
   * mutations here rather than per-keystroke. */
  onCommit?: () => void
}) {
  const sharedStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: '#c8d3e8',
    fontSize: mono ? 11 : 12,
    padding: '5px 8px',
    fontFamily: mono ? 'JetBrains Mono, monospace' : 'Inter, sans-serif',
    outline: 'none',
  }

  return (
    <div>
      <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
        <input value={value} onChange={e => onChange(e.target.value)}
          style={sharedStyle}
          onFocus={e => { e.target.style.borderColor = '#4f9cf9' }}
          onBlur={e => { e.target.style.borderColor = 'var(--border)'; onCommit?.() }}
        />
        <CopyButton value={value} />
      </div>
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ icon, label, color, extra }: { icon: string; label: string; color: string; extra?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 14, color, fontFamily: 'JetBrains Mono, monospace' }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f8' }}>{label}</span>
      {extra}
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

// ─── Table name list (Source / Target cards) ───────────────────────────────────

function TableNameList({ names, emptyLabel }: { names: string[]; emptyLabel: string }) {
  if (names.length === 0) {
    return <div style={{ color: '#4a5570', fontSize: 11 }}>{emptyLabel}</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {names.map(name => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#c8d3e8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </span>
          <CopyButton value={name} size={11} />
        </div>
      ))}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ETLModifier({ searchQuery, focusRecipe }: {
  searchQuery: string
  /** Focus mode (Task 15): when set, this recipe seeds `recipePath` directly
   * (no click-through-the-tree) and the whole Explorer disappears — the
   * component renders as a single isolated editor, matching the `?focus=`
   * deep link `App.tsx` reads once at mount. */
  focusRecipe?: string
}) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [recipePath, setRecipePath] = useState<string | null>(focusRecipe ?? null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<Connection | null>(null)
  const [wireFrom, setWireFrom] = useState<{ nodeId: string; portName: string } | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const { fs, loading, error } = useFilesystem()
  const queryClient = useQueryClient()

  // Expression registry (Task 11): corpus-wide, independent of the currently
  // open recipe. `focusedFormula` tracks which field's formula textarea last
  // gained focus in the Inspector below (`Inspector`'s `onFocusFormula`) — so a
  // registry row can offer "Insert" only while there's somewhere for it to write.
  const expr = useExpressions()
  const [exprFilter, setExprFilter] = useState('')
  const [focusedFormula, setFocusedFormula] = useState<{ stepName: string; fieldName: string } | null>(null)

  // Schema-driven Inspector (Task 12): the per-kind key schema + alias tables the
  // Inspector renders from — fetched once here (staleTime: Infinity, same as the
  // rest of `useIpcRules`'s callers) and threaded down as props so the Inspector
  // itself never touches the network (keeps its tests fast/offline, per its own
  // brief) and holds no second copy of the recipe grammar.
  const ipcRules = useIpcRules()

  // History drawer + view mode (Task 10): `viewingVersion`/`viewedRecipe` are
  // set together (handleViewVersion awaits the archived GET, then sets both in
  // the same render) — `viewingVersion !== null` is the single "isViewing"
  // source of truth used to swap the canvas/panels/header onto the archived
  // recipe and to blanket-disable every editing affordance below. `viewedRecipe`
  // keeps the FULL archived RecipeDto (not just `.content`) so the header card
  // can show the archive's own fileName/sizeBytes/modifiedAt instead of the
  // live recipe's (review finding: showing the read-only banner next to the
  // LIVE modifiedAt was misleading).
  const [historyOpen, setHistoryOpen] = useState(false)
  const [viewingVersion, setViewingVersion] = useState<string | null>(null)
  const [viewedRecipe, setViewedRecipe] = useState<RecipeFile | null>(null)
  const isViewing = viewingVersion !== null

  const rec = useRecipe(recipePath ?? '')
  const recError = rec.error as ApiError | null

  // Draft editing state (Task 8): deep-cloned from the loaded recipe whenever a
  // *different* recipe or a fresh save lands (recipePath + modifiedAt) — not on
  // every rec.data reference change, so in-progress edits survive re-renders.
  const [draft, setDraft] = useState<RecipeJson | null>(null)
  const [dirtyOps, setDirtyOps] = useState(0)
  const [validationErrors, setValidationErrors] = useState<RecipeValidationError[]>([])
  const [saveError, setSaveError] = useState<{ title: string; detail?: string } | null>(null)
  // Task 17: Save-in-flight state — drives the SaveBar's inline spinner and
  // disables the button so a slow validate+PUT round trip can't be
  // double-submitted. `finally` re-enables on both success AND failure.
  const [saving, setSaving] = useState(false)

  // Node drag offsets (Task 8) + the layout sidecar (Task 9/10): per-node pixel
  // deltas from IpcCanvas's default layout position, added at render time
  // (`n.x + offsets[n.id].x`). `layout` fetches the persisted sidecar for the
  // CURRENT recipePath (an unsaved recipe resolves to `{version:1,nodes:{}}`,
  // never a "missing" state — see LayoutService).
  const [offsets, setOffsets] = useState<Record<string, { x: number; y: number }>>({})
  const layout = useLayout(recipePath ?? '')

  useEffect(() => {
    if (rec.data) {
      setDraft(structuredClone(rec.data.content as RecipeJson))
      setDirtyOps(0)
      setValidationErrors([])
      setSaveError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipePath, rec.data?.modifiedAt])

  // Layout offsets (Task 9/10): a SEPARATE effect from the draft reset above —
  // review finding (fix round 1): folding `layout.data` into the draft-reset
  // effect's deps meant ANY layout refetch (window refocus after staleTime, an
  // invalidated `['layout', ...]` query, anything) re-ran that whole effect and
  // silently wiped in-progress recipe edits, since the reset code inside it is
  // unconditional on why the effect fired. Keeping offsets in their own effect
  // means a layout refetch only ever touches `offsets`, never `draft`/`dirtyOps`.
  //
  // This still resets on every recipe change (recipePath) THEN re-fires once
  // `layout.data` lands (its own query, can resolve after rec.data) to re-seed
  // from the fetched sidecar — a fresh recipe never inherits the previous
  // one's positions: the window between the reset and the seed renders with
  // offsets:{}, same as the recipe having no saved layout at all.
  useEffect(() => {
    setOffsets(toCanvasOffsets(layout.data?.nodes))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipePath, layout.data])

  // Debounce cleanup (Task 10): the timer lives in a ref so a drag mid-flight
  // when the user switches recipes doesn't fire its PUT against the path
  // they've navigated away from — this effect's cleanup runs on every
  // recipePath change AND on unmount (React calls a cleanup function on both).
  const layoutSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (layoutSaveTimer.current) {
      clearTimeout(layoutSaveTimer.current)
      layoutSaveTimer.current = null
    }
  }, [recipePath])

  // Best-effort layout persistence (review finding, fix round 1): a failed PUT
  // (network error, 5xx) must not block editing — layout is a nudge, not a
  // recipe edit — but leaving the rejection unhandled would silently swallow
  // it AND produce an unhandled-promise-rejection warning. Log, don't surface
  // into `saveError` — that state is scoped to the recipe validate/save flow
  // (SaveBar's --red banner) and a background layout-save failure isn't that.
  const reportLayoutSaveError = (e: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[ETLModifier] failed to persist canvas layout', e)
  }

  // Drag (Task 10): updates local state immediately (unchanged Task 8
  // behavior — the canvas must track the pointer with no round-trip latency)
  // and debounces a putLayout of the FULL current offsets map, translated to
  // the dx/dy wire shape at this boundary only.
  const handleMoveNode = (id: string, x: number, y: number) => {
    setOffsets(o => {
      const next = { ...o, [id]: { x, y } }
      if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current)
      const path = recipePath
      layoutSaveTimer.current = setTimeout(() => {
        layoutSaveTimer.current = null
        if (path) putLayout(path, toWireOffsets(next)).catch(reportLayoutSaveError)
      }, LAYOUT_SAVE_DEBOUNCE_MS)
      return next
    })
  }

  // Auto-layout (Task 10): clears local state AND the sidecar immediately (not
  // debounced — a discrete action, not a drag in progress) — and cancels any
  // pending drag-save so a stale timer can't resurrect the offsets it just cleared.
  const handleAutoLayout = () => {
    if (layoutSaveTimer.current) {
      clearTimeout(layoutSaveTimer.current)
      layoutSaveTimer.current = null
    }
    setOffsets({})
    if (recipePath) putLayout(recipePath, {}).catch(reportLayoutSaveError)
  }

  // Canvas + panels derive from whichever content is "current" — the live
  // draft normally, or the archived version while viewing (spec §6: "canvas +
  // panels derive from the archived content"). Header metadata follows the
  // same swap (see `headerRecipe` below).
  const content = isViewing ? ((viewedRecipe?.content ?? null) as RecipeJson | null) : draft
  // Header card metadata (fileName/path/sizeBytes/modifiedAt) follows the same
  // swap as `content` — review finding: showing a read-only "viewing archived
  // version" banner next to the LIVE modifiedAt was misleading.
  const headerRecipe = isViewing && viewedRecipe ? viewedRecipe : rec.data
  const graph = useMemo(
    () => (content && recipePath ? recipeToCanvas(content, recipePath) : null),
    [content, recipePath],
  )

  // Task 16: view-aware corpus summary, Explorer footer — static corpus
  // counts, PLUS (once a recipe is open) that recipe's own steps/fields/
  // sources (spec §7.1's Tab 2 row).
  const summary = useSummary()
  const summaryItems: SummaryItem[] = [
    ...(summary.data ? [
      { label: 'recipes', value: summary.data.recipeCount ?? 0 },
      { label: 'layers', value: summary.data.layers?.length ?? 0 },
    ] : []),
    ...(content ? [
      { label: 'steps', value: content.steps?.length ?? 0 },
      { label: 'fields', value: (content.steps ?? []).reduce((n, s) => n + fieldsOf(s.target).length, 0) },
      { label: 'sources', value: content.table?.sourceTableNames?.length ?? 0 },
    ] : []),
  ]

  // Conformance chip (Task 13): validates whichever content is CURRENT — the
  // same swap `content`/`graph` above follow — so a check's `$.steps[i]…`
  // path always indexes the SAME steps array `graph.nodes` was built from
  // (validating the live draft while viewing an archived version would
  // desync the index and mislabel nodes). No local rule mirror — the full
  // 35-rule catalogue runs debounced against POST /api/recipes/validate
  // (spec §6.5 ruling, recorded in ipcRules.ts).
  const { checks, errors: ipcErrors, warnings: ipcWarnings, isValidating } = useValidation(content)
  const nodeStatus = useMemo(() => nodeStatusFrom(checks, graph), [checks, graph])

  const recipeSlash = recipePath ? recipePath.lastIndexOf('/') : -1
  const recipeDir = recipeSlash >= 0 ? recipePath!.slice(0, recipeSlash) : ''
  const ddl = useDdl(recipeDir)
  const ddlEntries = ddl.data ? Object.entries(ddl.data as Record<string, DdlColumnJson[]>) : []

  const selectedNode = graph?.nodes.find(n => n.id === selectedNodeId) ?? null

  const handleSelectFile = (f: FSFile) => {
    setSelectedPath(f.path)
    if (f.recipe) {
      setRecipePath(f.recipe)
      setSelectedNodeId(null)
      setSelectedEdge(null)
      setWireFrom(null)
      setShowRaw(false)
      setHistoryOpen(false)
      setViewingVersion(null)
      setViewedRecipe(null)
      setFocusedFormula(null)
    }
  }

  const applyEdit = (fn: (d: RecipeJson) => RecipeJson) => {
    setDraft(d => (d ? fn(d) : d))
    setDirtyOps(n => n + 1)
  }

  // Inspector commit (Task 12): the Inspector owns picking WHICH mutator to run
  // (rename/setTargetProperty/setSourceProperty/setFieldTransformation/addField/…)
  // for a given widget edit — this just adopts the resulting RecipeJson as the new
  // draft and bumps the dirty count, same as every other `applyEdit` caller. The
  // optional second argument is a rename's new id: renaming is otherwise invisible
  // up here (the Inspector is keyed on the OLD `selectedNodeId`), so without it a
  // rename would silently unmount the Inspector on the very next render (no node
  // in the just-recomputed graph still carries the stale id) — same fix
  // `handleRename` used to apply directly. Also clears an armed wire for the same
  // reason `handleRename` did: its `nodeId`/`portName` refer to the OLD name.
  const handleInspectorChange = (next: RecipeJson, selectId?: string) => {
    applyEdit(() => next)
    if (selectId) {
      setSelectedNodeId(selectId)
      setWireFrom(null)
    }
  }

  const handleFocusFormula = (stepName: string, fieldName: string) => {
    setFocusedFormula({ stepName, fieldName })
  }

  // Registry Insert (Task 11): writes the clicked entry's formula into
  // whichever field last focused a formula textarea, via the same
  // parseFormulaText -> setFieldTransformation path free-text edits use.
  const handleInsertExpression = (formula: string) => {
    if (!focusedFormula) return
    const { stepName, fieldName } = focusedFormula
    applyEdit(d => setFieldTransformation(d, stepName, fieldName, parseFormulaText(formula)))
  }

  const handleSelectNode = (id: string) => {
    setSelectedNodeId(prev => (id === prev ? null : id))
    setSelectedEdge(null)
    setFocusedFormula(null)
  }

  const handleSelectEdge = (conn: Connection) => {
    setSelectedEdge(conn)
    setSelectedNodeId(null)
  }

  // Click-wire (Task 9): a click on an OUT/IN-OUT port arms `wireFrom`; a
  // subsequent click on an IN/IN-OUT port completes it via
  // setFieldTransformation, writing the dot-ref "FROM.FIELD" verbatim into the
  // clicked port's field (`toField ?? fromPort`, per spec §6 — in practice the
  // clicked port always carries its own name, since ports are derived 1:1 from
  // existing recipe fields). Any other OUT/IN-OUT click while armed restarts
  // the wire from the new port instead.
  //
  // Self-wire guard (review finding, Task 9 fix round): every IN/OUT port is
  // BOTH a valid wire-start AND a valid wire-completion target, so an armed
  // wire could otherwise "complete" on a different port of the SAME node it
  // started from, writing a self-referencing dot-ref. A completion click
  // whose nodeId matches wireFrom.nodeId is ignored outright — wire mode
  // stays armed (neither completes nor restarts) so a stray same-node click
  // doesn't silently drop the in-progress wire either.
  const handlePortClick = (nodeId: string, port: Port) => {
    const isInEligible = port.direction === 'IN' || port.direction === 'IN/OUT'
    if (wireFrom && isInEligible) {
      if (nodeId === wireFrom.nodeId) return
      const { nodeId: fromNode, portName: fromPort } = wireFrom
      applyEdit(d => setFieldTransformation(d, nodeId, port.name || fromPort, { source: `${fromNode}.${fromPort}` }))
      setWireFrom(null)
      return
    }
    if (port.direction !== 'IN') {
      setWireFrom({ nodeId, portName: port.name })
    }
  }

  const handlePaletteAdd = (type: string) => {
    applyEdit(d => (type === SOURCE_TABLE_TYPE ? addSourceTable(d) : addStep(d, type)))
  }

  const handleDeleteNode = (name: string) => {
    applyEdit(d => deleteNode(d, name))
    setSelectedNodeId(null)
    // Final-review finding: a stale wireFrom pointing at the just-deleted node
    // would otherwise survive, letting a completion click write a dot-ref onto
    // a node that no longer exists (draft adapter drops it silently, backend
    // validate then rejects the dangling reference).
    setWireFrom(null)
  }

  const handleDeleteEdge = (conn: Connection) => {
    // conn.fromNode identifies which sources[] entry to drop when this is a
    // center-anchor edge (conn.toPort === '') — see recipeEdits.deleteEdge's
    // docstring (review finding, Task 9 fix round).
    applyEdit(d => deleteEdge(d, conn.toNode, conn.toPort, conn.fromNode))
    setSelectedEdge(null)
  }

  // History drawer (Task 10): the drawer owns the version LIST query and the
  // RESTORE (rollback) call; loading an individual archived version's content
  // into the canvas is this component's job (`onView` per the interface docs
  // — HistoryDrawer only hands back the version string).
  const handleViewVersion = async (version: string) => {
    if (!recipePath) return
    try {
      const archived = await apiGet<RecipeFile>(`/recipes/history/${recipePath}?version=${version}`)
      setViewedRecipe(archived)
      setViewingVersion(version)
      setSelectedNodeId(null)
      setSelectedEdge(null)
      setWireFrom(null)
    } catch (e) {
      const err = e as ApiError
      setSaveError({ title: err.title ?? 'Failed to load version', detail: err.detail })
    }
  }

  const handleRestored = () => {
    void queryClient.invalidateQueries({ queryKey: ['recipe', recipePath] })
    setViewingVersion(null)
    setViewedRecipe(null)
  }

  // Closing the drawer is the only escape hatch out of view mode short of
  // Restore (spec §6 documents Restore as the exit; this additionally treats
  // "close the panel" as "go back to the live draft" so viewing a version
  // never strands the canvas read-only with no way back).
  const handleToggleHistory = () => {
    setHistoryOpen(o => {
      const next = !o
      if (!next) {
        setViewingVersion(null)
        setViewedRecipe(null)
      }
      return next
    })
  }

  const handleDiscard = () => {
    if (rec.data) setDraft(structuredClone(rec.data.content as RecipeJson))
    setDirtyOps(0)
    setValidationErrors([])
    setSaveError(null)
  }

  const handleSave = async () => {
    if (!draft || !recipePath || !rec.data) return
    setValidationErrors([])
    setSaveError(null)
    setSaving(true)
    try {
      const result = await apiSend<RecipeValidation>('POST', '/recipes/validate', draft)
      if (!result.valid) {
        setValidationErrors(result.errors ?? [])
        return
      }
      await apiSend('PUT', `/recipes/${recipePath}`, { baseModified: rec.data.modifiedAt, content: draft })
      await queryClient.invalidateQueries({ queryKey: ['recipe', recipePath] })
      setDirtyOps(0)
    } catch (e) {
      const err = e as ApiError
      setSaveError({ title: err.title ?? 'Save failed', detail: err.detail })
    } finally {
      setSaving(false)
    }
  }

  const sidebarExtra = loading ? (
    <div style={{ padding: 12 }}><LoadingState label="Loading corpus…" /></div>
  ) : error ? (
    <div style={{ color: 'var(--red)', fontSize: 12, padding: 12 }}>
      <div>{error.title}</div>
      {error.detail && <div>{error.detail}</div>}
    </div>
  ) : null

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Focus mode (Task 15): no Explorer at all — the recipe is seeded
          directly from the `focusRecipe` prop, so there's nothing to browse
          and no tree to click through. */}
      {!focusRecipe && (
        <div style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
          <Sidebar
            searchQuery={searchQuery}
            selectedPath={selectedPath}
            onSelectFile={handleSelectFile}
            filesystem={fs ?? EMPTY_FS}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(c => !c)}
            extraContent={sidebarExtra}
            fileFilter={RECIPE_ONLY_FILTER}
            footer={<div style={{ borderTop: '1px solid var(--border-subtle)', padding: '8px 12px' }}>
              <CorpusSummary items={summaryItems} />
            </div>}
          />
          {/* Explorer scoping info affordance (Task 14, spec §6.8) — an overlay
              rather than a Sidebar prop, since Sidebar's header markup itself
              stays untouched beyond the opt-in fileFilter/footer additions
              (Tabs 1/4 unaffected). Positioned clear of the collapse chevron
              (which sits flush right in Sidebar's own header). */}
          {!sidebarCollapsed && (
            <div style={{ position: 'absolute', top: 11, right: 34 }}>
              <InfoTooltip text={EXPLORER_INFO_COPY} placement="right" />
            </div>
          )}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {!recipePath ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5570', flexDirection: 'column', gap: 8 }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect x="8" y="4" width="24" height="32" rx="3" stroke="#2a3050" strokeWidth="1.5" fill="none" />
              <line x1="13" y1="12" x2="27" y2="12" stroke="#2a3050" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="13" y1="18" x2="27" y2="18" stroke="#2a3050" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="13" y1="24" x2="20" y2="24" stroke="#2a3050" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 12 }}>Select an _ETL_*.json recipe to edit</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', maxWidth: 340, textAlign: 'center', lineHeight: 1.5 }}>
              {EXPLORER_INFO_COPY}
            </span>
          </div>
        ) : rec.isLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LoadingState label="Loading recipe…" />
          </div>
        ) : recError ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4, color: 'var(--red)', fontSize: 12 }}>
            <div>{recError.title}</div>
            {recError.detail && <div>{recError.detail}</div>}
          </div>
        ) : rec.data && graph ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* recipe header */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 16,
              padding: '16px 20px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, width: '100%' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#e2e8f8' }}>{headerRecipe?.fileName}</h2>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                      background: 'rgba(79,156,249,0.15)',
                      color: '#4f9cf9',
                      border: '1px solid rgba(79,156,249,0.3)',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}>{(headerRecipe?.path ?? '').split('/')[0]}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                    <EditableField label="Path" value={headerRecipe?.path ?? ''} onChange={() => {}} mono />
                    <EditableField label="Size bytes" value={String(headerRecipe?.sizeBytes ?? '')} onChange={() => {}} mono />
                    <EditableField label="Modified" value={headerRecipe?.modifiedAt ?? ''} onChange={() => {}} mono />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <ConformanceChip
                    errors={ipcErrors}
                    warnings={ipcWarnings}
                    checks={checks}
                    rules={ipcRules.data?.rules ?? []}
                    isValidating={isValidating}
                    graph={graph}
                    onSelectNode={handleSelectNode}
                  />
                  <button onClick={handleToggleHistory} style={{
                    padding: '5px 12px', borderRadius: 5,
                    background: historyOpen ? 'var(--surface-3)' : 'transparent', border: '1px solid var(--border)',
                    color: '#7b88aa', fontSize: 11, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
                  }}>{'{ history }'}</button>
                  {/* Focus mode deep link (Task 15) — opens THIS recipe alone,
                      full-viewport, in a new tab (encodeURIComponent: recipe
                      paths carry '/' and are user-visible corpus paths, so an
                      unencoded one would produce a malformed URL). */}
                  <button
                    onClick={() => recipePath && window.open(`?focus=${encodeURIComponent(recipePath)}`, '_blank')}
                    title="Open in a new tab, isolated"
                    style={{
                      padding: '5px 12px', borderRadius: 5,
                      background: 'transparent', border: '1px solid var(--border)',
                      color: '#7b88aa', fontSize: 11, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
                    }}>{'⤢'}</button>
                  <button onClick={() => setShowRaw(r => !r)} style={{
                    padding: '5px 12px', borderRadius: 5,
                    background: showRaw ? 'var(--surface-3)' : 'transparent', border: '1px solid var(--border)',
                    color: '#7b88aa', fontSize: 11, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
                  }}>{'{ raw JSON }'}</button>
                </div>
              </div>

              {showRaw && (
                <div style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 10px', background: 'var(--surface-2)',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <span style={{ fontSize: 10, color: '#4a5570', flex: 1 }}>Raw JSON</span>
                    <CopyButton value={JSON.stringify(content ?? rec.data.content, null, 2)} size={11} />
                  </div>
                  <pre style={{
                    margin: 0, padding: '10px 12px', maxHeight: 400, overflow: 'auto',
                    fontSize: 10, color: '#c8d3e8',
                    fontFamily: 'JetBrains Mono, monospace',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6,
                  }}>{JSON.stringify(content ?? rec.data.content, null, 2)}</pre>
                </div>
              )}
            </div>

            {/* source */}
            <section>
              <SectionHeader icon="→" label="Source" color="#34d399" />
              <div style={{
                padding: '16px', background: 'var(--surface)',
                border: '1px solid rgba(52,211,153,0.2)', borderRadius: 7,
              }}>
                <TableNameList names={content?.table?.sourceTableNames ?? []} emptyLabel="No source tables found in this recipe." />
              </div>
            </section>

            {/* canvas */}
            <section>
              <SectionHeader icon="⇄" label={`Canvas (${graph.nodes.length} nodes)`} color="#818cf8" />
              {/* display:flex is load-bearing: IpcCanvas's root is `flex: 1` with every
                  child absolutely positioned, so a block parent collapses it to 0px and
                  the canvas renders invisibly. */}
              <div style={{ height: 420, display: 'flex', border: '1px solid var(--border)', borderRadius: 8, position: 'relative', overflow: 'hidden' }}>
                <IpcCanvas
                  nodes={graph.nodes}
                  connections={graph.connections}
                  selectedNode={selectedNodeId}
                  onSelectNode={handleSelectNode}
                  offsets={offsets}
                  onMoveNode={handleMoveNode}
                  onAutoLayout={handleAutoLayout}
                  onPortClick={isViewing ? undefined : handlePortClick}
                  onSelectEdge={isViewing ? undefined : handleSelectEdge}
                  selectedEdge={selectedEdge}
                  onDropType={isViewing ? undefined : handlePaletteAdd}
                  onDropFormula={isViewing ? undefined : handleInsertExpression}
                  nodeStatus={nodeStatus}
                />
              </div>
            </section>

            {/* target */}
            <section>
              <SectionHeader icon="⬡" label="Target" color="#f87171" extra={<GCPIcon service="bigquery" size={16} />} />
              <div style={{
                padding: '16px', background: 'var(--surface)',
                border: '1px solid rgba(248,113,113,0.2)', borderRadius: 7,
              }}>
                <TableNameList names={content?.table?.targetTableNames ?? []} emptyLabel="No target tables found in this recipe." />
              </div>
            </section>

            {/* Inspector — schema-driven per-node property editor (Task 12) for
                whichever canvas node is selected; hidden entirely while viewing an
                archived version (Task 10: "all editing affordances disabled while
                viewing"). */}
            {selectedNode && draft && !isViewing && (
              <Inspector
                draft={draft}
                node={selectedNode}
                keySchema={ipcRules.data?.keySchema ?? {}}
                typeAliases={ipcRules.data?.typeAliases ?? {}}
                keyAliases={ipcRules.data?.keyAliases ?? {}}
                onChange={handleInspectorChange}
                onDelete={handleDeleteNode}
                onFocusFormula={handleFocusFormula}
              />
            )}

            {/* selected-edge delete control (Task 9) — also disabled while viewing */}
            {selectedEdge && !isViewing && (
              <section>
                <SectionHeader icon="⌫" label="Edge" color="var(--red)" />
                <div style={{
                  padding: 16, background: 'var(--surface)',
                  border: '1px solid var(--border)', borderRadius: 7,
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#c8d3e8', flex: 1 }}>
                    {`${selectedEdge.fromNode}.${selectedEdge.fromPort || '·'} → ${selectedEdge.toNode}.${selectedEdge.toPort || '·'}`}
                  </span>
                  <button onClick={() => handleDeleteEdge(selectedEdge)} style={dangerButtonStyle}>Delete</button>
                </div>
              </section>
            )}

            {/* DDL — hidden entirely when the map is empty or errored */}
            {!ddl.error && ddlEntries.length > 0 && (
              <section>
                <SectionHeader icon="⬡" label="BigQuery DDL Schema" color="#4f9cf9" extra={<GCPIcon service="bigquery" size={16} />} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {ddlEntries.map(([table, cols]) => (
                    <div key={table}>
                      <div style={{ fontSize: 10, color: '#4a5570', marginBottom: 6, fontFamily: 'JetBrains Mono, monospace' }}>{table}</div>
                      <DDLViewer cols={cols} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div style={{ height: 60 }} />
          </div>
        ) : null}

        {(validationErrors.length > 0 || saveError) && (
          <div style={{
            padding: '10px 16px', background: 'var(--surface)',
            borderTop: '1px solid var(--red)', color: 'var(--red)', fontSize: 11,
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {validationErrors.map((e, i) => (
              <div key={i}>
                {e.path && <div style={{ fontSize: 9, opacity: 0.7 }}>{e.path}</div>}
                <div>{e.message}</div>
              </div>
            ))}
            {saveError && (
              <div>
                <div>{saveError.title}</div>
                {saveError.detail && <div>{saveError.detail}</div>}
              </div>
            )}
          </div>
        )}

        {/* SaveBar is itself an editing affordance (Save/Discard mutate the
            draft) — hidden while viewing an archived version. */}
        {!isViewing && (
          <SaveBar
            changes={dirtyOps}
            wireFrom={wireFrom}
            onCancelWire={() => setWireFrom(null)}
            onSave={handleSave}
            onDiscard={handleDiscard}
            saving={saving}
          />
        )}
      </div>

      {/* Expression dock (Task 11/14): corpus-wide, filtered to recipe-origin
          only. Relocated here (beside the Palette) from its old spot inline
          below the canvas — same gating as Palette (shown once a recipe is
          loaded), Insert stays available while viewing (row Insert buttons
          just hide via `canInsert`, same as before the move). */}
      {draft && (
        <ExpressionDock
          entries={expr.data ?? []}
          isLoading={expr.isLoading}
          error={expr.error as ApiError | null}
          filter={exprFilter}
          onFilterChange={setExprFilter}
          canInsert={focusedFormula !== null && !isViewing}
          onInsert={handleInsertExpression}
        />
      )}
      {draft && !isViewing && <Palette onAdd={handlePaletteAdd} />}
      {recipePath && historyOpen && (
        <HistoryDrawer
          recipePath={recipePath}
          onView={handleViewVersion}
          onRestored={handleRestored}
        />
      )}
    </div>
  )
}
