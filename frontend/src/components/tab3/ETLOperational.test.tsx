import { describe, expect, it, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import { act, render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { delay, http, HttpResponse } from 'msw'
import { ETLOperational } from './ETLOperational'
import { resetOperationalView, setOperationalView } from '../../state/operationalView'
import type { RelationshipGraph } from '../../api/queries'
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
    // useOperationalDates() to the latest snapshot ("Now").
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
    const search = screen.getByPlaceholderText('Search tables / recipes…')
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

    // Clear selection closes the detail panel. Scoped by label: SelectionStrip (Task 13) renders
    // its own "Clear selection" for the CLUSTER selection, so the plain text is now ambiguous.
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

  it('zooms out past the compact threshold and collapses real cards into pills (and back)', async () => {
    renderTab()

    await screen.findByText('_ETL_m_CAS_T.json')

    // Full-detail rendering: all 4 real cards (2 tables + 2 recipes, one of them the flagged
    // neighbour) render the "Last run:" line — `OperationalCard`'s compact branch omits it
    // entirely, rendering only a status-dot pill with the card's name.
    expect(screen.getAllByText(/Last run:/)).toHaveLength(4)

    // Tab-1 Task-6 idiom, mirrored for Tab 3's own zoom state: the "−" button
    // steps 0.15 per click from the 0.85 default — 0.85 → 0.70 → 0.55,
    // crossing the RelationshipGraph's 0.65 compact threshold on click two.
    const zoomOut = screen.getByText('−')
    fireEvent.click(zoomOut)
    fireEvent.click(zoomOut)

    await waitFor(() => {
      expect(screen.queryAllByText(/Last run:/)).toHaveLength(0)
    })
    // The pill still shows the real recipe's filename — proves compact mode
    // collapses real fixture data, not a placeholder.
    expect(screen.getByText('_ETL_m_CAS_T.json')).toBeInTheDocument()

    // Zoom back in past the threshold: full-detail rendering (and its
    // "Last run:" line, once per card) returns.
    const zoomIn = screen.getByText('+')
    fireEvent.click(zoomIn)
    fireEvent.click(zoomIn)

    await waitFor(() => {
      expect(screen.getAllByText(/Last run:/)).toHaveLength(4)
    })
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

    // Once it resolves the stage carries RESOLVED totals — real numbers, not a fabricated fraction.
    expect(await screen.findByText('2 days · 2 clusters · 4 rows')).toBeInTheDocument()
  })

  it('still explains an empty graph with the data-root report', async () => {
    server.use(http.get('*/api/operational/clusters', () => HttpResponse.json({
      mode: 'absent', dates: [], totals: { clusters: 0, recipes: 0, dates: 0, rows: 0 }, clusters: [],
    })))

    renderTab([])

    expect(await screen.findByText(/No relationship entries|No b15 history/)).toBeInTheDocument()
    expect(screen.getByText(/Data roots/i)).toBeInTheDocument()
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
