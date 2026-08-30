import { describe, expect, it, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { act, render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { delay, http, HttpResponse } from 'msw'
import { ETLOperational } from './ETLOperational'
import { resetOperationalView, setOperationalView, readOperationalView } from '../../state/operationalView'
// Module namespace import (alongside the named one above) so `vi.spyOn` can watch
// `setOperationalView` calls made from INSIDE ETLOperational.tsx itself — Vitest's ESM transform
// routes every consumer's call through this same exports object, so the spy sees them too.
import * as operationalViewStore from '../../state/operationalView'
import type { RelationshipGraph } from '../../api/queries'
import { DENSITY_FOOTPRINT } from '../../api/relationshipsAdapter'
import { layerColor, kindPalette } from '../../theme/semanticColors'
import type { components } from '../../api/types.gen'

type OperationalSummaryDto = components['schemas']['OperationalSummaryDto']
type OperationalDatesDto = components['schemas']['OperationalDatesDto']
type AppConfigDto = components['schemas']['AppConfigDto']

// Mini graph: 1 STG source table -> 1 STG recipe -> 1 STG target table.
// Single shared layer keeps the layer-chip step of the flow compatible with
// the search-narrowed selection (see flow comment below).
const GRAPH: RelationshipGraph = {
  nodes: [
    { id: 't_src', kind: 'table', name: 'stg_dwhes.CAS_T_SRC', layer: 'STG' },
    // mappingPath (Task 9): the recipe's directory — combined with `name`,
    // resolves to the MSW-served path 'ODS/m_CAS_T/_ETL_m_CAS_T.json' below.
    { id: 'r', kind: 'recipe', name: '_ETL_m_CAS_T.json', layer: 'STG', mappingPath: 'ODS/m_CAS_T' },
    { id: 't_tgt', kind: 'table', name: 'stg_dwhes.CAS_T_TGT', layer: 'STG' },
  ],
  edges: [
    { from: 't_src', to: 'r', kind: 'source' },
    { from: 'r', to: 't_tgt', kind: 'writes' },
  ],
  meta: { entryCount: 2, skippedRows: 0, layers: ['STG'] },
}

// Task 14: the whole-history index the tab loads FIRST and, with nothing selected, ONLY.
const CLUSTER_INDEX = {
  mode: 'mock',
  dates: ['2026-07-28', '2026-07-29'],
  totals: { clusters: 2, recipes: 2, dates: 2, rows: 4 },
  clusters: [
    { name: 'cl-a', recipeCount: 1, dateIdx: [0, 1], rows: 2, ok: 2, ko: 0,
      lastDate: '2026-07-29', lastStatus: 'SUCCESS' },
    { name: 'cl-b', recipeCount: 1, dateIdx: [1], rows: 2, ok: 1, ko: 1,
      lastDate: '2026-07-29', lastStatus: 'FAILED' },
  ],
}

// The SCOPED graph: GRAPH's core plus one 1-hop neighbour recipe dragged in from a cluster the
// user did not select. Two things here are the backend's real behaviour, not fixture convenience:
//   - the neighbour is a RECIPE (RelationshipService flags no table as a neighbour), and
//   - `meta.layers` is derived from CORE entries only, so the neighbour's DWH layer is ABSENT
//     from it — the case the adapter has to union client-side or the card renders bandless with
//     no reachable Layer chip.
const NEIGHBOUR_ID = 'recipe:_ETL_neighbour.json'
const GRAPH_SCOPED: RelationshipGraph = {
  nodes: [
    ...(GRAPH.nodes ?? []),
    { id: NEIGHBOUR_ID, kind: 'recipe', name: '_ETL_neighbour.json', layer: 'DWH', neighbor: true },
  ],
  edges: [
    ...(GRAPH.edges ?? []),
    { from: 't_tgt', to: NEIGHBOUR_ID, kind: 'source' },
  ],
  meta: { entryCount: 2, skippedRows: 0, layers: ['STG'], scopedClusters: ['cl-a'], neighborCount: 1 },
}

// Recipe OK on the LATEST date (2026-07-29, the default selectedDate =
// dates.at(-1)), KO on the earlier date — proves the adapter wiring picks
// the latest date, not just "some" status.
const SUMMARY: OperationalSummaryDto = {
  dates: ['2026-07-28', '2026-07-29'],
  recipes: [
    {
      recipeFilename: '_ETL_m_CAS_T.json',
      layer: 'STG',
      latestDate: '2026-07-29',
      latestStatus: 'SUCCESS',
      okCount: 1,
      koCount: 1,
      history: [
        { date: '2026-07-28', status: 'FAILED', durationMin: 1.5 },
        { date: '2026-07-29', status: 'SUCCESS', durationMin: 1.2 },
      ],
      avgDurationMin: 1.35,
      p50DurationMin: 1.2,
      p95DurationMin: 1.5,
      lastJobId: 'application_cas_t_0029',
      lastClusterName: 'cluster-cas-t',
    },
  ],
}

const DATES: OperationalDatesDto = { dates: ['2026-07-28', '2026-07-29'], mode: 'mock' }

// 14 consecutive dates + a matching 14-entry recipe history, for the
// full-history-strip assertion (`HistoryBar` renders one cell per entry).
const DATES_14 = Array.from({ length: 14 }, (_, i) => `2026-07-${String(16 + i).padStart(2, '0')}`)

const SUMMARY_14: OperationalSummaryDto = {
  dates: DATES_14,
  recipes: [
    {
      recipeFilename: '_ETL_m_CAS_T.json',
      layer: 'STG',
      latestDate: DATES_14.at(-1),
      latestStatus: 'SUCCESS',
      okCount: 13,
      koCount: 1,
      history: DATES_14.map((date, i) => ({ date, status: i === 0 ? 'FAILED' : 'SUCCESS', durationMin: 1.2 })),
      avgDurationMin: 1.3,
      p50DurationMin: 1.2,
      p95DurationMin: 1.5,
      lastJobId: 'application_cas_t_0029',
      lastClusterName: 'cluster-cas-t',
    },
  ],
}

const CONFIG: AppConfigDto = {
  gcpProjectId: 'db-dev-example-project',
  region: 'europe-southwest1',
  dataprocJobUrl: 'https://console.cloud.google.com/dataproc/jobs/{jobId}?project={project}&region={region}',
  dataprocClusterUrl: 'https://console.cloud.google.com/dataproc/clusters/{clusterName}?project={project}&region={region}',
  loggingUrl: 'https://console.cloud.google.com/logs/query;query=resource.labels.job_id%3D%22{jobId}%22?project={project}',
  dwhControlMode: 'mock',
  composerMode: 'mock',
  corpusRoot: '/mock',
}

// Task 9 preview overlay: minimal recipe literal, Stream A's fixture shape
// (steps + table — the ETLModifier.test.tsx MINI idiom).
const PREVIEW_RECIPE = {
  steps: [
    {
      target: {
        name: 'CAS_ODS_TGT_STEP', type: 'table',
        fields: [{ name: 'EVENT_ID', dataType: 'String', transformation: { source: 'CAS_STG_SRC_STEP.EVENT_ID' } }],
      },
      sources: [{ name: 'CAS_STG_SRC_STEP', type: 'table' }],
    },
  ],
  table: { targetTableNames: ['CAS_ODS_TGT_STEP'], sourceTableNames: ['CAS_STG_SRC_STEP'] },
}

// Task 16: b15 rows for the two GRAPH/DATES fixture dates — the floating
// chip's "N b15 rows · M recipes · K tables · OK/KO" source data.
const ROWS_29 = [{
  clusterName: 'cluster-cas-t', recipeFilename: '_ETL_m_CAS_T.json', jobId: 'app-29',
  appStartIso: '2026-07-29T04:00:00.000Z', avgJobDurationInMinsSec: '1m 12sec',
  status: 'SUCCESS', message: '',
}]
const ROWS_28 = [{
  clusterName: 'cluster-cas-t', recipeFilename: '_ETL_m_CAS_T.json', jobId: 'app-28',
  appStartIso: '2026-07-28T04:00:00.000Z', avgJobDurationInMinsSec: '1m 30sec',
  status: 'FAILED', message: 'Stage failure (synthetic)',
}]

// Task 19: PreviewOverlay threads GET /api/ipc/rules' typeAliases into recipeToCanvas
// the same way ETLModifier does — a default handler here keeps every "Open preview"
// test (which conditionally mounts PreviewOverlay, and so only now fires this request)
// deterministic, mirroring the ETLModifier.test.tsx idiom. Real alias entries, not an
// empty stub, since one test below (`typeAliases still loading…`) exercises them.
const IPC_RULES = {
  rules: [],
  typeAliases: { BERYLFALLS: 'sourceQualifier', EARLYGLADE: 'unionInput', ASHPATH2: 'joinerInput', CEDARWICK2: 'storedProcedure' },
  keyAliases: {},
  keySchema: {},
}

// Healthy report: everything resolved, control schema served by the mock tier.
const DIAGNOSTICS = {
  status: 'ok',
  corpus: {
    name: 'corpus', configured: 'parser/src/main/resources/xmltobq',
    resolved: '/repo/parser/src/main/resources/xmltobq', exists: true,
    tier: 'real', status: 'ok', hint: '', counts: { xml: 81, recipes: 86 },
  },
  dwhControl: {
    configured: 'parser/src/main/resources/DWH_CONTROL',
    resolvedReal: '/repo/parser/src/main/resources/DWH_CONTROL', realExists: false,
    requiredChild: 'LAYER_TO_LAYER', realUsable: false,
    mockPath: '/repo/backend/src/main/resources/mock/DWH_CONTROL', mockUsable: true,
    tier: 'mock', status: 'ok', hint: '',
    scan: {
      anchorTable: 'CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG',
      anchor: 'INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES',
      expectedLayerDirs: ['STG'], presentDirs: ['STG'], unexpectedDirs: [],
      filesRead: 1, anchorHits: 33, rowsParsed: 33, rowsSkipped: 0,
      files: [], insertTargetsFound: [],
    },
  },
  composer: {
    name: 'composer', configured: 'parser/src/main/resources/composer',
    resolved: '/repo/parser/src/main/resources/composer', exists: false,
    requiredChild: 'dwh/config/cluster_tuning/inputs',
    tier: 'mock', status: 'ok', hint: '', counts: { dates: 14 },
  },
}

const server = setupServer(
  http.get('/api/relationships', () => HttpResponse.json(GRAPH_SCOPED)),
  http.get('/api/operational/clusters', () => HttpResponse.json(CLUSTER_INDEX)),
  // Default: no runs. Cards then fall back to the summary-derived history strip, which is what
  // every pre-Task-14 assertion in this file counts.
  http.get('/api/operational/runs', () => HttpResponse.json({ limit: 10, byRecipe: {} })),
  http.get('/api/diagnostics', () => HttpResponse.json(DIAGNOSTICS)),
  http.get('/api/operational/summary', () => HttpResponse.json(SUMMARY)),
  http.get('/api/operational/dates', () => HttpResponse.json(DATES)),
  http.get('/api/operational/2026-07-29', () => HttpResponse.json({ date: '2026-07-29', rows: ROWS_29 })),
  http.get('/api/operational/2026-07-28', () => HttpResponse.json({ date: '2026-07-28', rows: ROWS_28 })),
  http.get('/api/config', () => HttpResponse.json(CONFIG)),
  http.get('/api/recipes/ODS/m_CAS_T/_ETL_m_CAS_T.json', () => HttpResponse.json({
    path: 'ODS/m_CAS_T/_ETL_m_CAS_T.json',
    fileName: '_ETL_m_CAS_T.json',
    sizeBytes: 210,
    modifiedAt: '2026-07-31T00:00:00Z',
    content: PREVIEW_RECIPE,
  })),
  http.get('/api/ipc/rules', () => HttpResponse.json(IPC_RULES)),
  http.get('/api/operational/lineage', ({ request }) => {
    const seed = new URL(request.url).searchParams.get('node') ?? ''
    // Mirrors the mini graph above: source table -> recipe -> target table.
    const nodes = [
      { id: 't_src', kind: 'table', name: 'stg_dwhes.CAS_T_SRC', layer: 'STG', hop: -2, clusters: [] },
      { id: 'r', kind: 'recipe', name: '_ETL_m_CAS_T.json', layer: 'STG', hop: -1, clusters: ['cl-a'] },
      { id: 't_tgt', kind: 'table', name: 'stg_dwhes.CAS_T_TGT', layer: 'STG', hop: 0, clusters: [] },
    ]
    return HttpResponse.json({
      seed, nodes: nodes.map(n => ({ ...n, hop: n.id === seed ? 0 : n.hop })),
      edges: [
        { from: 't_src', to: 'r', kind: 'source' },
        { from: 'r', to: 't_tgt', kind: 'writes' },
      ],
      truncated: false, totalReachable: 3,
    })
  }),
  http.get('/api/operational/search', ({ request }) => {
    const q = (new URL(request.url).searchParams.get('q') ?? '').toLowerCase()
    const all = [
      { kind: 'recipe', name: '_ETL_m_CAS_T.json', layer: 'ODS', clusters: ['cl-a'] },
      { kind: 'table', name: 'stg_dwhes.CAS_T_TGT', layer: 'STG', clusters: ['cl-a'] },
      { kind: 'table', name: 'DWH.ORPHAN_NO_RUNS', layer: 'DWH', clusters: [] },
    ]
    return HttpResponse.json({
      hits: all.filter(h => h.name.toLowerCase().includes(q)), truncated: false,
    })
  }),
)
beforeAll(() => server.listen())
afterEach(() => {
  server.resetHandlers()
  server.events.removeAllListeners()
  cleanup()
})
afterAll(() => server.close())

// The operational view is a module-level store (Task 12), so it outlives a test unless reset.
let queryClient: QueryClient
beforeEach(() => {
  localStorage.clear()
  resetOperationalView()
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

/**
 * Task 14: the tab no longer renders a graph until a cluster is selected, so every case that
 * asserts on the canvas selects one first. `renderTab([])` is the empty-selection entry point.
 */
function renderTab(clusters: string[] = ['cl-a']) {
  setOperationalView({ selectedClusters: clusters })
  return render(<ETLOperational />, { wrapper })
}

// This end-to-end walk (full graph + search + filter + selection + detail
// panel) sits right at vitest's 5000ms default when the suite's workers
// contend on a loaded box — the same implicit-budget problem
// ExpressionDock.test.tsx and ETLModifier.test.tsx already make explicit for
// their own heavyweights. It asserts DOM structure, never render speed, so
// the budget is the wrong contract to leave implicit.
const HEAVY_WALK_TIMEOUT = 20_000

describe('ETLOperational — real graph, cards, filters, search, selection', () => {
  it('renders the real relationships graph and drives search, layer filter, selection, and clearing', async () => {
    const { container } = renderTab()

    // Real data reaches the canvas (not the OPERATIONAL_CARDS mock).
    const nameEl = await screen.findByText('_ETL_m_CAS_T.json')

    // Status badge for the selected (latest) date: OK.
    expect(screen.getAllByText('OK').length).toBeGreaterThan(0)

    // TimePicker date input is real state, initialized from
    // useClusterIndex()'s date axis to the latest snapshot ("Now").
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    expect(dateInput.value).toBe('2026-07-29')

    // An off-fixture pick snaps client-side to the NEAREST served date
    // (mirrors the backend's nearest-available rule): 2026-07-30 is 1 day
    // from 2026-07-29 and 2 from 2026-07-28, so it snaps to 07-29 — this is
    // the only assertion that forces `nearestAvailableDate`'s comparison
    // loop to actually replace its initial guess (an exact-fixture pick
    // never does, since day-0 can't be beaten).
    fireEvent.change(dateInput, { target: { value: '2026-07-30' } })
    expect(dateInput.value).toBe('2026-07-29')

    // History strip on the recipe's canvas card: 2 real cells (fixture
    // history length). Scoped via the existing `data-card` wrapper so the
    // count isn't inflated by other cards' own history bars.
    const cardEl = nameEl.closest('[data-card]') as HTMLElement
    expect(cardEl.querySelectorAll('div[title^="Run "]')).toHaveLength(2)

    // Changing the date to the earlier snapshot flips the recipe (and its
    // written table) to KO — proves selectedDate drives the adapter.
    fireEvent.change(dateInput, { target: { value: '2026-07-28' } })
    expect((await screen.findAllByText('KO')).length).toBeGreaterThan(0)

    // Search narrows to the one card whose name contains the query — only
    // the recipe's filename carries a ".json" extension.
    const search = screen.getByPlaceholderText('Filter this canvas…')
    fireEvent.change(search, { target: { value: '.json' } })
    expect(screen.getByText('_ETL_m_CAS_T.json')).toBeInTheDocument()
    expect(screen.queryByText('stg_dwhes.CAS_T_SRC')).not.toBeInTheDocument()
    expect(screen.queryByText('stg_dwhes.CAS_T_TGT')).not.toBeInTheDocument()

    // Layer chip is data-driven from view.layers (STG only, from meta.layers)
    // and — combined with the still-active search — the recipe stays visible.
    fireEvent.click(screen.getByRole('button', { name: 'STG' }))
    expect(screen.getByText('_ETL_m_CAS_T.json')).toBeInTheDocument()

    // Select the card -> detail panel shows both relations (source + target).
    fireEvent.click(screen.getByText('_ETL_m_CAS_T.json'))
    expect(await screen.findByText('Related (2)')).toBeInTheDocument()

    // GCP quick links are templated from the served config + fixture jobId.
    const loggingLink = screen.getByText(/Cloud Logging/).closest('a') as HTMLAnchorElement
    expect(loggingLink.href).toContain('application_cas_t_0029')
    expect(loggingLink.href).toContain('db-dev-example-project')

    // Clear selection closes the detail panel. Scoped by label because SelectionStrip renders a
    // neighbouring "Clear clusters" control for the other scope.
    fireEvent.click(screen.getByLabelText('Clear node selection'))
    expect(screen.queryByText('Related (2)')).not.toBeInTheDocument()
  }, HEAVY_WALK_TIMEOUT)

  it('renders a 14-cell history strip for a recipe with a full 14-day history', async () => {
    server.use(
      http.get('/api/operational/summary', () => HttpResponse.json(SUMMARY_14)),
      http.get('/api/operational/dates', () => HttpResponse.json({ dates: DATES_14, mode: 'mock' })),
    )
    renderTab()

    const nameEl = await screen.findByText('_ETL_m_CAS_T.json')
    const cardEl = nameEl.closest('[data-card]') as HTMLElement
    expect(cardEl.querySelectorAll('div[title^="Run "]')).toHaveLength(14)
  })

  // Task 15: density is now an EXPLICIT control (`useOperationalView().density`), not something
  // zoom implies — replaces the old "zoom past 0.65 collapses cards" test, whose premise (an
  // implicit `compact = zoom < 0.65`) Task 15 deletes outright. See the two `density` tests in
  // the "cluster-scoped loading" describe block below for the control's actual coverage.
  it('cycles density and re-lays out', async () => {
    render(<ETLOperational />, { wrapper })
    await screen.findByText(/Select a cluster/)
    act(() => setOperationalView({ selectedClusters: ['cl-a'] }))
    await screen.findByText(/_ETL_m_CAS_T\.json/)

    fireEvent.click(screen.getByRole('button', { name: /Density: detailed/ }))
    expect(await screen.findByRole('button', { name: /Density: compact/ })).toBeInTheDocument()
    // Ruling 33: a compact card still renders the real recipe filename from the fetched MSW
    // fixture, not a placeholder — the one assertion group Task 15's replacement tests dropped.
    expect(screen.getByText('_ETL_m_CAS_T.json')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Density: compact/ }))
    expect(await screen.findByRole('button', { name: /Density: minimal/ })).toBeInTheDocument()
  })

  // Task 17 fix-round 1 (review): the drag-pan re-render fix moved the store write off the
  // mousemove hot path entirely (a ref-painted `style.transform` in between). This is the guard
  // against that regressing back to a per-mousemove write — the next "simplification" of the drag
  // handler that reintroduces it would fail this test, not just "make the app slow" months later
  // with nothing pointing at why.
  it('coalesces a mouse drag into a single store write on release, not one per mousemove', async () => {
    renderTab()
    await screen.findByText('_ETL_m_CAS_T.json')

    const canvas = screen.getByTestId('operational-canvas')
    const spy = vi.spyOn(operationalViewStore, 'setOperationalView')

    fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 })
    for (let i = 0; i < 10; i++) {
      fireEvent.mouseMove(canvas, { clientX: 100 + i * 5, clientY: 100 + i * 5 })
    }
    expect(spy).not.toHaveBeenCalled()

    fireEvent.mouseUp(canvas)
    // Default pan is { x: 40, y: 40 } (operationalView.ts DEFAULTS); mousedown at (100,100)
    // anchors dragStart at (60,60), and the last of the ten mousemoves lands at (145,145) —
    // so the single committed pan is (145,145) - (60,60) = (85,85).
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ pan: { x: 85, y: 85 } })

    spy.mockRestore()
  })

  // Item 3: the drag used React synthetic handlers with no unmount cleanup, relying on
  // `onMouseLeave` to end a gesture. With Task 12 keeping tabs mounted, a drag interrupted by a
  // tab switch never fires `mouseleave` — so `commitDrag` never ran, and the store kept the
  // pre-drag pan while the DOM showed the dragged one. `ClusterPane.tsx` already defends against
  // this with window listeners plus an unmount detach; this mirrors it.
  it('commits a drag whose mouseup lands outside the canvas', async () => {
    renderTab()
    await screen.findByText('_ETL_m_CAS_T.json')

    const canvas = screen.getByTestId('operational-canvas')
    const spy = vi.spyOn(operationalViewStore, 'setOperationalView')

    fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 })
    fireEvent.mouseMove(window, { clientX: 150, clientY: 150 })
    fireEvent.mouseUp(window)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ pan: { x: 90, y: 90 } })
    spy.mockRestore()
  })

  it('detaches its drag listeners on unmount, so an interrupted gesture leaks nothing', async () => {
    renderTab()
    await screen.findByText('_ETL_m_CAS_T.json')

    const removed: string[] = []
    const realRemove = window.removeEventListener.bind(window)
    const spy = vi.spyOn(window, 'removeEventListener').mockImplementation((type, listener, opts) => {
      removed.push(String(type))
      return realRemove(type, listener as EventListener, opts)
    })

    fireEvent.mouseDown(screen.getByTestId('operational-canvas'), { clientX: 100, clientY: 100 })
    cleanup()

    expect(removed).toContain('mousemove')
    expect(removed).toContain('mouseup')
    spy.mockRestore()
  })

  it('has no implicit zoom-driven density any more', async () => {
    render(<ETLOperational />, { wrapper })
    await screen.findByText(/Select a cluster/)
    act(() => setOperationalView({ selectedClusters: ['cl-a'], zoom: 0.4, density: 'detailed' }))

    // At 0.4 the old code force-collapsed the cards; density is explicit now.
    expect(await screen.findByText('p95')).toBeInTheDocument()
  })

  it('opens the full-window preview overlay from a recipe card and closes on Escape; a table card resolves its writer recipe', async () => {
    renderTab()

    // Select the recipe card, then open its preview.
    fireEvent.click(await screen.findByText('_ETL_m_CAS_T.json'))
    fireEvent.click(await screen.findByText('Open preview'))

    // The overlay hosts the shared EtlCanvas rendering recipeToCanvas(recipe) —
    // the recipe's target node is visible on the canvas...
    expect(await screen.findByText('CAS_ODS_TGT_STEP', { selector: 'text' })).toBeInTheDocument()
    // ...and the raw JSON pane shows the recipe content verbatim.
    expect(await screen.findByText(/targetTableNames/)).toBeInTheDocument()

    // Esc closes the overlay — fully unmounted (no leaked state).
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByText(/targetTableNames/)).not.toBeInTheDocument()
    })
    expect(screen.queryByText('CAS_ODS_TGT_STEP', { selector: 'text' })).not.toBeInTheDocument()

    // Selecting the TABLE card resolves the writer recipe (the `writes` edge
    // 'r' -> 't_tgt') — same MSW handler, same recipe canvas. The name also
    // appears in the (still-open) detail panel's Related list, so scope the
    // click to the canvas card via the `data-card` wrapper (existing idiom).
    const tgtOnCanvas = screen.getAllByText('stg_dwhes.CAS_T_TGT').find(el => el.closest('[data-card]'))!
    fireEvent.click(tgtOnCanvas)
    fireEvent.click(await screen.findByText('Open preview'))
    expect(await screen.findByText('CAS_ODS_TGT_STEP', { selector: 'text' })).toBeInTheDocument()
  })

  // Task 19 follow-up: PreviewOverlay is the OTHER place in the app that turns a
  // recipe into a canvas (ETLModifier is the other), so it must resolve the same
  // alias table — and must not blank out or throw while GET /api/ipc/rules is still
  // in flight (it resolves asynchronously; recipeToCanvas's own `typeAliases = {}`
  // default is what covers the gap).
  it('preview overlay does not blank while typeAliases is still loading, then upgrades a fallback label to its canonical kind once it resolves', async () => {
    // A non-table step with an aliased type, feeding the table target — exercises
    // exactly the kindAndLabel path Task 19 fixed, on the SAME overlay this app's
    // other recipe canvas (ETLModifier) already covers.
    const ALIASED_RECIPE = {
      steps: [
        { target: { name: 'SQ_ALIASED', type: 'BERYLFALLS', fields: [{ name: 'A', dataType: 'String', transformation: { value: '1' } }] }, sources: [] },
        { target: { name: 'T', type: 'table', fields: [{ name: 'A', dataType: 'String', transformation: { source: 'SQ_ALIASED.A' } }] }, sources: [{ name: 'SQ_ALIASED', type: 'table' }] },
      ],
      table: { targetTableNames: ['T'], sourceTableNames: [] },
    }
    server.use(
      http.get('/api/recipes/ODS/m_CAS_T/_ETL_m_CAS_T.json', () => HttpResponse.json({
        path: 'ODS/m_CAS_T/_ETL_m_CAS_T.json', fileName: '_ETL_m_CAS_T.json',
        sizeBytes: 1, modifiedAt: '2026-07-31T00:00:00Z', content: ALIASED_RECIPE,
      })),
      // Deliberately delayed — the assertion right after opening the overlay runs
      // WHILE this is still pending, proving the overlay renders (not blank, not
      // thrown) before useIpcRules() has anything to give it.
      http.get('/api/ipc/rules', async () => {
        await delay(60)
        return HttpResponse.json(IPC_RULES)
      }),
    )

    renderTab()
    fireEvent.click(await screen.findByText('_ETL_m_CAS_T.json'))
    fireEvent.click(await screen.findByText('Open preview'))

    // Before /api/ipc/rules resolves: the node is there (not blank), showing the
    // fallback label — recipeToCanvas's `typeAliases = {}` default in action.
    expect(await screen.findByText('SQ_ALIASED', { selector: 'text' })).toBeInTheDocument()
    expect(await screen.findByText('BER', { selector: 'text' })).toBeInTheDocument()

    // Once it resolves: same node, canonical label — no remount, no blank frame.
    await waitFor(() => {
      expect(screen.queryByText('BER', { selector: 'text' })).not.toBeInTheDocument()
    })
    expect(screen.getByText('SQ', { selector: 'text' })).toBeInTheDocument()
    expect(screen.getByText('SQ_ALIASED', { selector: 'text' })).toBeInTheDocument()
  })

  // Task 16: view-aware corpus summary — floating bottom-left chip, counts
  // follow the selected date (the user's ask, spec §7.1's Tab 3 row).
  it('the floating chip shows b15 row/recipe/table counts and the OK/KO split for the selected date, following date changes', async () => {
    const { container } = renderTab()

    await screen.findByText('_ETL_m_CAS_T.json')

    // Latest date (2026-07-29, the default "Now"): 1 row, 1 recipe, 1 written
    // table (r -> t_tgt), SUCCESS.
    expect(await screen.findByText('1 b15 rows')).toBeInTheDocument()
    expect(screen.getByText('1 recipes')).toBeInTheDocument()
    expect(screen.getByText('1 tables')).toBeInTheDocument()
    expect(screen.getByText('1 OK')).toBeInTheDocument()
    expect(screen.getByText('0 KO')).toBeInTheDocument()

    // Switching to the earlier snapshot flips OK/KO — proves the chip follows
    // selectedDate, not a static all-time count.
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-07-28' } })

    expect(await screen.findByText('0 OK')).toBeInTheDocument()
    expect(screen.getByText('1 KO')).toBeInTheDocument()
  })
})

/**
 * The empty canvas is the symptom this whole surface exists for: with a correctly-configured
 * root and a control schema the scan cannot read, Tab 3 used to say "No relationship entries"
 * and stop — indistinguishable from a genuinely empty corpus.
 */
describe('ETLOperational — data-root diagnostics', () => {
  it('explains an empty graph with the resolved paths and the actionable hint', async () => {
    server.use(
      // Task 14: the empty state is reached from the INDEX (zero b15 rows), not from an empty
      // graph payload — the graph is never requested when there is nothing to scope.
      http.get('/api/operational/clusters', () => HttpResponse.json({
        mode: 'absent', dates: [], totals: { clusters: 0, recipes: 0, dates: 0, rows: 0 }, clusters: [],
      })),
      http.get('/api/diagnostics', () => HttpResponse.json({
        ...DIAGNOSTICS,
        status: 'ko',
        dwhControl: {
          ...DIAGNOSTICS.dwhControl,
          resolvedReal: '/corp/exports/DWH_CONTROL', realExists: true, realUsable: true,
          tier: 'real', status: 'ko',
          hint: 'The files INSERT INTO: CTL.CORP_L2L_CONFIG (×412) — set layerToLayerTable in config.json.',
          scan: { ...DIAGNOSTICS.dwhControl.scan, filesRead: 8, anchorHits: 0, rowsParsed: 0 },
        },
      })),
    )
    renderTab([])

    expect(await screen.findByText('No b15 history')).toBeTruthy()
    // The path actually read, so a wrong dwhControlRoot is visible without leaving the GUI.
    expect(await screen.findByText('/corp/exports/DWH_CONTROL')).toBeTruthy()
    expect(screen.getByText(/set layerToLayerTable in config\.json/)).toBeTruthy()
    // ...and the step that produced the zero.
    expect(screen.getByText('files read: 8')).toBeTruthy()
    expect(screen.getByText('anchor hits: 0')).toBeTruthy()
  })

  it('shows the serving tier in the toolbar even when the graph renders fine', async () => {
    renderTab()
    await screen.findByText('_ETL_m_CAS_T.json')
    expect(screen.getByText('data: mock')).toBeTruthy()
  })
})

/**
 * Task 14 — the point of the sub-project: at real scale (~7 000 recipes, ~5 000 tables) an
 * unconditional `/api/relationships` + `/api/operational/summary` is the payload that makes this
 * tab unusable. Nothing selected must cost exactly one lightweight index request.
 */
describe('ETLOperational — cluster-scoped loading', () => {
  it('fetches only the cluster index when nothing is selected', async () => {
    const paths: string[] = []
    server.events.on('request:start', ({ request }) => paths.push(new URL(request.url).pathname))

    renderTab([])
    await screen.findByText(/Select a cluster/)
    // Settle: diagnostics is the last unconditional query, so its arrival means the render pass
    // that would have fired a graph/summary request has already happened.
    await waitFor(() => expect(paths).toContain('/api/diagnostics'))

    expect(paths).toContain('/api/operational/clusters')
    expect(paths).not.toContain('/api/relationships')
    // `/api/operational/summary` is the ~7 000-recipe aggregate — precisely the payload this
    // sub-project exists to avoid — so criterion 1's "only the cluster index" is asserted over
    // the WHOLE operational family, not just the graph.
    expect(paths).not.toContain('/api/operational/summary')
    expect(paths.filter(p => p.startsWith('/api/operational/'))).toEqual(['/api/operational/clusters'])
  })

  it('prompts for a cluster and states the corpus scale', async () => {
    renderTab([])

    expect(await screen.findByText(/Select a cluster/)).toBeInTheDocument()
    // Scoped to the prompt: ClusterPane's own header line states the scale too, so an unscoped
    // /clusters/ query legitimately matches two elements.
    expect(within(screen.getByTestId('cluster-prompt')).getByText(/clusters/)).toBeInTheDocument()
  })

  it('loads the scoped graph once a cluster is selected', async () => {
    const queries: string[] = []
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url)
      if (url.pathname === '/api/relationships') queries.push(url.search)
    })

    renderTab([])
    await screen.findByText(/Select a cluster/)

    act(() => setOperationalView({ selectedClusters: ['cl-a'] }))

    await waitFor(() => expect(queries).toHaveLength(1))
    expect(queries[0]).toContain('clusters=cl-a')
  })

  // Blocker 3: `/api/operational/summary` was the LAST unbounded payload on the selected path.
  // `useOperationalSummary(hasSelection)` gated on whether a selection existed, never on which,
  // so the first cluster click aggregated every recipe x every date — measured at 38 904 B on the
  // 30-recipe mock against the entire unscoped graph's 20 984 B.
  it('scopes the summary to the selected clusters, not just to "a selection exists"', async () => {
    const queries: string[] = []
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url)
      if (url.pathname === '/api/operational/summary') queries.push(url.search)
    })

    renderTab([])
    await screen.findByText(/Select a cluster/)

    act(() => setOperationalView({ selectedClusters: ['cl-b', 'cl-a'] }))

    await waitFor(() => expect(queries).toHaveLength(1))
    expect(queries[0]).toBe('?clusters=cl-a&clusters=cl-b')
  })

  // Blocker 2: `deselectedRecipes` and `selectedDates` were written by ClusterPane and read
  // NOWHERE but their own `checked` attribute — the checkboxes moved but nothing filtered.
  // Spec §7.1 says the chevron reveals recipe and date checkboxes "both of which further filter
  // the canvas", so these two assert the EFFECT, not the store write.
  it('removes a card from the canvas when its recipe is unchecked in the pane', async () => {
    renderTab(['cl-a'])
    await screen.findByText('_ETL_m_CAS_T.json')

    act(() => setOperationalView({ deselectedRecipes: ['_ETL_m_CAS_T.json'] }))

    await waitFor(() => expect(screen.queryByTestId('node-r')).not.toBeInTheDocument())
    // The tables it joined stay — only the recipe card and the edges touching it go.
    expect(screen.getByTestId('node-t_src')).toBeInTheDocument()
  })

  it('restricts the status resolution to the checked dates', async () => {
    renderTab(['cl-a'])
    // Default selectedDate is the latest (2026-07-29), where the fixture recipe is SUCCESS.
    // Scoped to the recipe's own card: the toolbar renders an "OK" Status filter chip too.
    await screen.findByText('_ETL_m_CAS_T.json')
    expect(within(screen.getByTestId('node-r')).getByText('OK')).toBeInTheDocument()

    // Check only the earlier date, on which the same recipe FAILED. The selected date snaps
    // into the filter, so the canvas re-resolves against 07-28 rather than blanking.
    act(() => setOperationalView({ selectedDates: ['2026-07-28'] }))

    await waitFor(() =>
      expect(within(screen.getByTestId('node-r')).getByText('KO')).toBeInTheDocument())
    expect(within(screen.getByTestId('node-r')).queryByText('OK')).not.toBeInTheDocument()
  })

  it('leaves every card status unresolved-but-honest when no run falls on a checked date', async () => {
    renderTab(['cl-a'])
    await screen.findByText('_ETL_m_CAS_T.json')

    // A date the fixture history has no entry for: PENDING, not a carried-forward OK.
    act(() => setOperationalView({ selectedDates: ['2026-07-27'] }))

    await waitFor(() =>
      expect(within(screen.getByTestId('node-r')).getByText('PENDING')).toBeInTheDocument())
  })

  // The pane's filters live in a collapsible drawer inside the pane, so an active one must not
  // hide cards silently once the operator has moved on to a different cluster.
  it('names the active pane filters on the toolbar and clears them on click', async () => {
    renderTab(['cl-a'])
    await screen.findByText('_ETL_m_CAS_T.json')
    expect(screen.queryByLabelText('Clear pane filters')).not.toBeInTheDocument()

    act(() => setOperationalView({ deselectedRecipes: ['_ETL_m_CAS_T.json'], selectedDates: ['2026-07-28'] }))

    const chip = await screen.findByLabelText('Clear pane filters')
    expect(chip.textContent).toContain('1 recipes hidden')
    expect(chip.textContent).toContain('1 of 2 days')

    fireEvent.click(chip)
    expect(await screen.findByTestId('node-r')).toBeInTheDocument()
    expect(screen.queryByLabelText('Clear pane filters')).not.toBeInTheDocument()
  })

  it('returns to the prompt when the last cluster is deselected, without refetching the index', async () => {
    let indexCalls = 0
    server.use(http.get('*/api/operational/clusters', () => {
      indexCalls++
      return HttpResponse.json(CLUSTER_INDEX)
    }))

    renderTab([])
    await screen.findByText(/Select a cluster/)
    act(() => setOperationalView({ selectedClusters: ['cl-a'] }))
    await screen.findByText(/_ETL_m_CAS_T\.json/)

    act(() => setOperationalView({ selectedClusters: [] }))

    expect(await screen.findByText(/Select a cluster/)).toBeInTheDocument()
    expect(indexCalls).toBe(1)
  })

  it('dims nodes that came from a neighbouring cluster', async () => {
    renderTab([])
    await screen.findByText(/Select a cluster/)
    act(() => setOperationalView({ selectedClusters: ['cl-a'] }))

    const neighbour = await screen.findByTestId('node-recipe:_ETL_neighbour.json')
    expect(Number(neighbour.style.opacity)).toBeLessThan(1)
    // ...and a core node is not dimmed, so the assertion above is about the flag, not a blanket
    // opacity on every card.
    expect(Number(screen.getByTestId('node-r').style.opacity)).toBe(1)

    // Criterion 2: the node count and the neighbour count are STATED, not merely rendered.
    // Recipes counts core cards only (the neighbour is context, not scope); OK/KO and the date
    // span come from the index's b15 aggregate for cl-a.
    expect(screen.getByText('1 clusters · 1 recipes · 2 dates · 2 OK · 0 KO · 4 nodes · 1 from neighbours'))
      .toBeInTheDocument()
  })

  // `meta.layers` is CORE-only (RelationshipService.java:135). Without a client-side union a
  // neighbour outside the selected layers renders with no chip that can reach it — verified live
  // on cluster-wf-cas-load-4001, whose layers are ["ODS","STG"] while its neighbours are DWH/RDM.
  it('offers a Layer chip for a neighbour whose layer meta.layers omits', async () => {
    renderTab()

    await screen.findByText('_ETL_neighbour.json')
    expect(screen.getByRole('button', { name: 'STG' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'DWH' })).toBeInTheDocument()

    // The chip actually filters to the neighbour, i.e. it is wired, not decorative.
    fireEvent.click(screen.getByRole('button', { name: 'DWH' }))
    expect(screen.getByText('_ETL_neighbour.json')).toBeInTheDocument()
    expect(screen.queryByText('_ETL_m_CAS_T.json')).not.toBeInTheDocument()
  })

  // The spec's explicit non-goal: no percentage, no "N of M days".
  it('reports loading as named stages with resolved totals, not a percentage', async () => {
    server.use(http.get('*/api/operational/clusters', async () => {
      await delay(60)
      return HttpResponse.json(CLUSTER_INDEX)
    }))

    renderTab([])

    expect(await screen.findByText(/Indexing b15 history/)).toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  // Asserted INSIDE the panel, and while it is actually on screen. Once the index resolves with
  // nothing selected the panel unmounts and the prompt renders the same totals string — so an
  // unscoped assertion proves nothing about this component at all.
  it('states resolved totals and per-stage markers inside the progress panel while the graph builds', async () => {
    server.use(http.get('*/api/relationships', async () => {
      await delay(120)
      return HttpResponse.json(GRAPH_SCOPED)
    }))

    renderTab()   // cl-a selected: the index lands, the graph does not, so the panel stays mounted

    // The panel is mounted from the very first frame (index still loading), so wait for stage 1
    // to actually RESOLVE before grabbing it — otherwise this captures the wrong pass.
    await screen.findByTestId('stage-marker-done')
    const panel = screen.getByTestId('operational-progress')

    // Stage 1 has resolved: a ✓ and REAL numbers read off the index that landed.
    expect(within(panel).getByTestId('stage-marker-done')).toBeInTheDocument()
    expect(within(panel).getByText('2 days · 2 clusters · 4 rows')).toBeInTheDocument()

    // Stage 2 is the one in flight: a spinner, and no total yet because none is resolved.
    expect(within(panel).getByText(/Building graph for 1 cluster/)).toBeInTheDocument()
    expect(within(panel).getByTestId('stage-marker-active')).toBeInTheDocument()

    // Stage 3 has not started: a dim dot, and it states no number rather than a placeholder zero.
    expect(within(panel).getByTestId('stage-marker-idle')).toBeInTheDocument()
    expect(within(panel).queryByText(/runs each/)).not.toBeInTheDocument()
    expect(within(panel).queryByText(/%/)).not.toBeInTheDocument()

    // ...and the panel gives way to the graph once it lands.
    expect(await screen.findByText('_ETL_m_CAS_T.json')).toBeInTheDocument()
    expect(screen.queryByTestId('operational-progress')).not.toBeInTheDocument()
  })

  it('still explains an empty graph with the data-root report', async () => {
    server.use(http.get('*/api/operational/clusters', () => HttpResponse.json({
      mode: 'absent', dates: [], totals: { clusters: 0, recipes: 0, dates: 0, rows: 0 }, clusters: [],
    })))

    renderTab([])

    expect(await screen.findByText(/No relationship entries|No b15 history/)).toBeInTheDocument()
    expect(screen.getByText(/Data roots/i)).toBeInTheDocument()
  })

  // ADR-0013, the case the index-rows guard alone does NOT cover. `/api/operational/clusters`
  // reads the b15 export under the composer root; `/api/relationships` is built from the control
  // schema under the dwhControl root. A healthy b15 history whose control-schema anchor table does
  // not match gives rows > 0 AND zero cards — a normal-looking toolbar over a blank canvas, with
  // nothing saying which of three causes it is.
  it('explains a scoped graph that resolves to nothing with the data-root report', async () => {
    server.use(
      http.get('*/api/relationships', () => HttpResponse.json({
        nodes: [], edges: [],
        meta: { entryCount: 0, skippedRows: 0, layers: [], scopedClusters: ['cl-a'], neighborCount: 0 },
      })),
      http.get('/api/diagnostics', () => HttpResponse.json({
        ...DIAGNOSTICS,
        status: 'ko',
        dwhControl: {
          ...DIAGNOSTICS.dwhControl,
          resolvedReal: '/corp/exports/DWH_CONTROL', realExists: true, realUsable: true,
          tier: 'real', status: 'ko',
          hint: 'The files INSERT INTO: CTL.CORP_L2L_CONFIG (×412) — set layerToLayerTable in config.json.',
          scan: { ...DIAGNOSTICS.dwhControl.scan, filesRead: 8, anchorHits: 0, rowsParsed: 0 },
        },
      })),
    )

    renderTab()   // healthy index (4 rows), cl-a selected — so this is NOT the zero-rows path

    expect(await screen.findByText('No relationship entries')).toBeInTheDocument()
    expect(screen.getByText(/Data roots/i)).toBeInTheDocument()
    expect(screen.getByText('/corp/exports/DWH_CONTROL')).toBeInTheDocument()
    expect(screen.getByText(/set layerToLayerTable in config\.json/)).toBeInTheDocument()
    // The pane stays: the way out is changing the selection, not reloading the page.
    expect(screen.getByTestId('cluster-pane')).toBeInTheDocument()
  })

  // The failure is caused by a user action (selecting a cluster), and `selectedClusters` is
  // session-lived — without the pane there is no in-session way to undo it.
  it('keeps the cluster pane mounted when the scoped graph fetch fails', async () => {
    server.use(http.get('*/api/relationships', () => HttpResponse.json(
      { title: 'Scope too large', detail: 'Try fewer clusters.' }, { status: 500 })))

    renderTab()

    expect(await screen.findByText('Scope too large')).toBeInTheDocument()
    expect(screen.getByText('Try fewer clusters.')).toBeInTheDocument()
    expect(screen.getByTestId('cluster-pane')).toBeInTheDocument()
  })

  it('feeds each card the run history and points the detail-panel links at the selected run', async () => {
    server.use(http.get('*/api/operational/runs', () => HttpResponse.json({
      limit: 10,
      byRecipe: {
        '_ETL_m_CAS_T.json': [
          { date: '2026-07-29', clusterName: 'cluster-cas-t', jobId: 'app-run-29',
            appStartIso: '2026-07-29T04:12:00Z', durationMin: 1.2, status: 'SUCCESS' },
          { date: '2026-07-28', clusterName: 'cluster-cas-t', jobId: 'app-run-28',
            appStartIso: '2026-07-28T04:09:00Z', durationMin: 1.5, status: 'FAILED' },
        ],
      },
    })))

    renderTab()

    // The picker replaces the read-only strip once real runs arrive.
    const older = await screen.findByLabelText('Run 2026-07-28')
    fireEvent.click(older)

    fireEvent.click(screen.getByText('_ETL_m_CAS_T.json'))
    const logging = (await screen.findByText(/Cloud Logging/)).closest('a') as HTMLAnchorElement
    expect(logging.href).toContain('app-run-28')
    expect(logging.href).not.toContain('application_cas_t_0029')
  })

  // A failed chunk's recipes vanish from `byRecipe` and are indistinguishable from "never ran",
  // so the failure has to be said out loud rather than rendered as an empty history.
  it('says the run history is unavailable rather than showing it as empty', async () => {
    server.use(http.get('*/api/operational/runs', () =>
      HttpResponse.json({ title: 'Boom' }, { status: 500 })))

    renderTab()

    expect(await screen.findByText(/Run history unavailable/)).toBeInTheDocument()
  })
})

// ─── card footprint (sub-project 12, defect 1) ──────────────────────────────

describe('canvas card footprint', () => {
  it.each(['detailed', 'compact', 'minimal'] as const)(
    'positions every card at its declared footprint width at %s density', async density => {
      // `width: 'auto'` let a compact/minimal card grow to its longest name — past the very
      // column pitch computed for its declared width — which is what made real-corpus names
      // overlap horizontally. The wrapper must state the width the layout assumed.
      setOperationalView({ density })
      const { container } = renderTab()
      await waitFor(() =>
        expect(container.querySelectorAll('[data-card="1"]').length).toBeGreaterThan(0))

      const wrappers = container.querySelectorAll<HTMLElement>('[data-card="1"]')
      expect(wrappers.length).toBeGreaterThan(0)
      for (const el of wrappers) {
        expect(el.style.width).toBe(`${DENSITY_FOOTPRINT[density].width}px`)
      }
    })

  it('sizes the canvas from the footprint, not from a hardcoded detailed-only constant', async () => {
    setOperationalView({ density: 'minimal' })
    const { container } = renderTab()
    await waitFor(() =>
      expect(container.querySelectorAll('[data-card="1"]').length).toBeGreaterThan(0))

    // The edges layer is sized from CANVAS_W/CANVAS_H, which used to add a hardcoded +280/+220
    // — the detailed footprint — regardless of the density actually rendering.
    // Anchored on the arrow marker so this cannot accidentally select the toolbar's 13px
    // search-icon svg, which is also an `svg[width]`.
    const edges = container.querySelector('marker#oa')!.closest('svg')!
    const rightmost = Math.max(
      ...[...container.querySelectorAll<HTMLElement>('[data-card="1"]')]
        .map(el => parseFloat(el.style.left) + DENSITY_FOOTPRINT.minimal.width))
    expect(Number(edges.getAttribute('width'))).toBeGreaterThanOrEqual(rightmost)
  })
})

// ─── toolbar as legend (sub-project 12, defect 4) ───────────────────────────

describe('toolbar filter chips are the palette legend', () => {
  it('tints Layer chips with their tier colour even while unselected', async () => {
    // The toolbar teaches the palette: the control you filter a dimension with carries that
    // dimension's colour, so there is no separate legend that can drift from the cards.
    renderTab()
    await screen.findByText('_ETL_m_CAS_T.json')
    expect(screen.getByRole('button', { name: 'STG' })).toHaveStyle({ color: layerColor('STG') })
  })

  it('tints Kind chips with the GCP product accents', async () => {
    renderTab()
    await screen.findByText('_ETL_m_CAS_T.json')
    expect(screen.getByRole('button', { name: 'recipe' }))
      .toHaveStyle({ color: kindPalette('recipe').accent })
    expect(screen.getByRole('button', { name: 'table' }))
      .toHaveStyle({ color: kindPalette('table').accent })
  })

  it('still marks the ACTIVE chip distinctly from the merely-tinted ones', async () => {
    // Colouring every chip must not cost the "which filter is on?" signal.
    renderTab()
    await screen.findByText('_ETL_m_CAS_T.json')
    const active = screen.getAllByRole('button', { name: 'ALL' })[0]!
    const inactive = screen.getByRole('button', { name: 'recipe' })
    expect(active.style.background).not.toBe(inactive.style.background)
  })
})

// ─── pane-aware snapshot chip (sub-project 12, defect 2) ────────────────────

describe('floating snapshot chip', () => {
  it('hides while the cluster pane is collapsed and returns when it reopens', async () => {
    // Collapsing the pane is the "give me maximum canvas" gesture. The chip floats over the
    // bottom-left of that canvas, so it has to honour the same gesture instead of sitting on
    // top of the cards the operator just made room for.
    renderTab()
    expect(await screen.findByTestId('snapshot-chip')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Collapse cluster pane'))
    await waitFor(() => expect(screen.queryByTestId('snapshot-chip')).not.toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Expand cluster pane'))
    expect(await screen.findByTestId('snapshot-chip')).toBeInTheDocument()
  })
})

// ─── collapsible TIME VIEW (sub-project 12, defect 3) ───────────────────────

describe('TIME VIEW collapse', () => {
  it('frees the whole bar when hidden, and names the active snapshot in a toolbar chip', async () => {
    renderTab()
    expect(await screen.findByTestId('time-view-bar')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Hide time view'))
    await waitFor(() => expect(screen.queryByTestId('time-view-bar')).not.toBeInTheDocument())

    // The active snapshot must never become invisible just because the bar is closed.
    const chip = screen.getByTestId('time-view-chip')
    expect(chip).toHaveTextContent(/\d{4}-\d{2}-\d{2}/)

    fireEvent.click(chip)
    expect(await screen.findByTestId('time-view-bar')).toBeInTheDocument()
    expect(screen.queryByTestId('time-view-chip')).not.toBeInTheDocument()
  })

  it('takes the date picker and the calendar with it', async () => {
    const { container } = renderTab()
    await screen.findByTestId('time-view-bar')
    expect(container.querySelector('input[type="date"]')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Hide time view'))
    await waitFor(() => expect(container.querySelector('input[type="date"]')).toBeNull())
  })
})

// ─── related navigation history (sub-project 12, defect 6) ──────────────────

describe('Related back/forward', () => {
  it('starts with both controls inert and walks back through the hops it recorded', async () => {
    renderTab()
    fireEvent.click(await screen.findByText('_ETL_m_CAS_T.json'))

    // First selection: nowhere to go in either direction.
    expect(screen.getByLabelText('Back to previous node')).toBeDisabled()
    expect(screen.getByLabelText('Forward to next node')).toBeDisabled()

    const related = await screen.findAllByTestId('related-card')
    expect(related.length).toBeGreaterThan(0)
    fireEvent.click(related[0]!)

    const back = screen.getByLabelText('Back to previous node')
    expect(back).toBeEnabled()
    fireEvent.click(back)

    // Back at the start: back inert again, forward now live.
    await waitFor(() => expect(screen.getByLabelText('Back to previous node')).toBeDisabled())
    expect(screen.getByLabelText('Forward to next node')).toBeEnabled()
  })

  it('a Related hop no longer discards where you came from', async () => {
    renderTab()
    fireEvent.click(await screen.findByText('_ETL_m_CAS_T.json'))
    // Scoped to the details panel: `operational-card` also matches every card on the canvas.
    const shown = () => within(screen.getByTestId('details-panel'))
      .getAllByTestId('operational-card')[0]!.textContent
    const firstTitle = shown()

    fireEvent.click((await screen.findAllByTestId('related-card'))[0]!)
    await waitFor(() => expect(shown()).not.toBe(firstTitle))

    fireEvent.click(screen.getByLabelText('Back to previous node'))
    await waitFor(() => expect(shown()).toBe(firstTitle))
  })
})

// ─── Show All Related (sub-project 12, defect 6) ────────────────────────────

describe('Show all related', () => {
  const openLink = async () => {
    renderTab()
    fireEvent.click(await screen.findByText('_ETL_m_CAS_T.json'))
    return screen.getByRole('link', { name: /show all related/i })
  }

  it('is a real link, so the browser can open it in a new tab unaided', async () => {
    // No window.open and no synthetic mouse-button handling: an <a href> gets ⌘-click,
    // middle-click and "Open link in new tab" from the platform, all three correct for free.
    const link = await openLink()
    expect(link.getAttribute('href')).toMatch(/^\?related=.+&clusters=/)
  })

  it('opens the in-app overlay on a plain left click', async () => {
    const link = await openLink()
    fireEvent.click(link)
    expect(await screen.findByTestId('related-overlay')).toBeInTheDocument()
  })

  it('leaves a modified click entirely to the browser', async () => {
    const link = await openLink()
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true })
    link.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
    expect(screen.queryByTestId('related-overlay')).not.toBeInTheDocument()
  })

  it('closes on its ✕', async () => {
    const link = await openLink()
    fireEvent.click(link)
    fireEvent.click(await screen.findByLabelText('Close related overlay'))
    await waitFor(() => expect(screen.queryByTestId('related-overlay')).not.toBeInTheDocument())
  })

  it('keeps the canvas selection in sync with the overlay focus', async () => {
    // Closing must leave the operator where they navigated, not snap back to where they started.
    const link = await openLink()
    const before = within(screen.getByTestId('details-panel'))
      .getAllByTestId('operational-card')[0]!.textContent
    fireEvent.click(link)

    // The overlay body is a lineage flow now, not a neighbour list.
    const others = await screen.findAllByTestId('lineage-node')
    expect(others.length).toBeGreaterThan(0)
    fireEvent.click(others[0]!)
    fireEvent.click(screen.getByLabelText('Close related overlay'))

    await waitFor(() => expect(within(screen.getByTestId('details-panel'))
      .getAllByTestId('operational-card')[0]!.textContent).not.toBe(before))
    // And that hop is on the same trail as a canvas click.
    expect(screen.getByLabelText('Back to previous node')).toBeEnabled()
  })
})

// ─── global search reaches Tab 3 (sub-project 12, defect 8) ─────────────────

describe('global search', () => {
  const renderWithQuery = (q: string, clusters: string[] = ['cl-a']) => {
    setOperationalView({ selectedClusters: clusters })
    return render(<ETLOperational searchQuery={q} />, { wrapper })
  }

  it('renders nothing for an empty query', async () => {
    renderWithQuery('')
    await screen.findByText('_ETL_m_CAS_T.json')
    expect(screen.queryByTestId('operational-search')).not.toBeInTheDocument()
  })

  it('shows results over the no-cluster state — the state you are in when you need it', async () => {
    // Tab 3's own toolbar input can only filter cards already loaded, and loading them requires
    // already knowing which cluster to pick. This is the escape from that circle.
    renderWithQuery('CAS', [])
    expect(await screen.findByTestId('operational-search')).toBeInTheDocument()
    expect(screen.getByTestId('cluster-prompt')).toBeInTheDocument()
  })

  it('finds TABLES, which the b15 index alone cannot see', async () => {
    renderWithQuery('CAS_T_TGT', [])
    expect(await screen.findByTestId('search-hit-table')).toHaveTextContent('stg_dwhes.CAS_T_TGT')
  })

  it('picking a hit selects its clusters and then the node itself', async () => {
    renderWithQuery('CAS_T_TGT', [])
    fireEvent.click(await screen.findByTestId('search-hit-table'))

    await waitFor(() => expect(readOperationalView().selectedClusters).toEqual(['cl-a']))
    // The node cannot be selected until the scoped graph carrying it resolves; it must not be
    // dropped in the meantime.
    await waitFor(() => expect(readOperationalView().selectedNode).toBe('t_tgt'))
  })

  it('says so when a hit has no runs, rather than offering a dead click', async () => {
    renderWithQuery('ORPHAN', [])
    expect(await screen.findByTestId('search-hit-table')).toHaveTextContent('no runs')
    fireEvent.click(screen.getByTestId('search-hit-table'))
    expect(readOperationalView().selectedClusters).toEqual([])
  })
})

// ─── multi-select filters (sub-project 12, defect 10) ───────────────────────

describe('multi-select Layer and Status filters', () => {
  // jsdom does not implement innerText, so count the cards rather than reading their names.
  const names = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLElement>('[data-card="1"]')]

  it('holds more than one Layer at once', async () => {
    // Single-select forced all-or-nothing on exactly the dimension an operator narrows by.
    const { container } = renderTab()
    await screen.findByText('_ETL_m_CAS_T.json')
    const all = names(container).length

    fireEvent.click(screen.getByRole('button', { name: 'STG' }))
    const stgOnly = names(container).length
    expect(stgOnly).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'DWH' }))
    const both = names(container).length
    expect(both).toBeGreaterThanOrEqual(stgOnly)
    expect(both).toBeLessThanOrEqual(all)
  })

  it('deselects a chip on a second click', async () => {
    const { container } = renderTab()
    await screen.findByText('_ETL_m_CAS_T.json')
    const before = names(container).length

    fireEvent.click(screen.getByRole('button', { name: 'STG' }))
    expect(names(container).length).toBeLessThanOrEqual(before)
    fireEvent.click(screen.getByRole('button', { name: 'STG' }))
    expect(names(container).length).toBe(before)     // empty set filters nothing
  })

  it('ALL clears the whole set rather than being a value in it', async () => {
    const { container } = renderTab()
    await screen.findByText('_ETL_m_CAS_T.json')
    const before = names(container).length

    fireEvent.click(screen.getByRole('button', { name: 'STG' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'ALL' })[0]!)
    expect(names(container).length).toBe(before)
  })

  it('holds more than one Status at once', async () => {
    const { container } = renderTab()
    await screen.findByText('_ETL_m_CAS_T.json')

    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    const okOnly = names(container).length
    fireEvent.click(screen.getByRole('button', { name: 'PENDING' }))
    expect(names(container).length).toBeGreaterThanOrEqual(okOnly)
  })

  it('marks every selected chip as selected, not just the last one', async () => {
    renderTab()
    await screen.findByText('_ETL_m_CAS_T.json')
    const stg = screen.getByRole('button', { name: 'STG' })
    const dwh = screen.getByRole('button', { name: 'DWH' })
    fireEvent.click(stg)
    fireEvent.click(dwh)
    expect(stg).toHaveAttribute('aria-pressed', 'true')
    expect(dwh).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders ALL first, as the clear control rather than a value', async () => {
    renderTab()
    await screen.findByText('_ETL_m_CAS_T.json')
    const labels = [...document.querySelectorAll('[data-testid="layer-filter"] button')]
      .map(b => b.textContent)
    expect(labels[0]).toBe('ALL')
    // Chip ORDER is asserted in relationshipsAdapter.test.ts, against a multi-layer fixture —
    // this tab's graph has a single layer, which made an order assertion here vacuous.
  })
})
