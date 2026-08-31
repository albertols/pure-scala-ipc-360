import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { ETLViewer } from './ETLViewer'

// Mini model shape trimmed from Task 1's SYN fixtures: 1 source + 1 expression
// + 1 target + 2 connectors.
const MODEL = {
  creationDate: '01/07/2026 00:00:00',
  repositoryVersion: '188.97',
  repository: {
    name: 'REP_FIX',
    version: '188',
    codepage: 'MS1252',
    databaseType: 'Oracle',
    folder: {
      name: 'CDM',
      sources: [
        {
          name: 'SRC_FIX',
          sourceFields: [{ name: 'ID', dataType: 'string', precision: '10', scale: '0' }],
        },
      ],
      targets: [
        {
          name: 'TGT_FIX',
          targetFields: [{ name: 'ID', dataType: 'string', precision: '10', scale: '0' }],
        },
      ],
      transformations: [
        {
          name: 'EXP_FIX',
          typ: 'Expression',
          transformFields: [{ name: 'ID', dataType: 'string', portType: 'INPUT/OUTPUT' }],
        },
      ],
      mappings: [
        {
          name: 'm_FIX',
          instances: [
            { name: 'SRC_FIX', transformationType: 'Source Definition' },
            { name: 'EXP_FIX', transformationType: 'Expression', transformationName: 'EXP_FIX' },
            { name: 'TGT_FIX', transformationType: 'Target Definition' },
          ],
          connectors: [
            { fromInstance: 'SRC_FIX', fromField: 'ID', toInstance: 'EXP_FIX', toField: 'ID' },
            { fromInstance: 'EXP_FIX', fromField: 'ID', toInstance: 'TGT_FIX', toField: 'ID' },
          ],
        },
      ],
    },
  },
}

// Lossless DOM counterpart of MODEL's folder subtree — same three instances,
// enough attributes/children to prove the panel is DOM-fed (not the
// adapter's quick `properties`).
const DOM = {
  name: 'POWERMART',
  attributes: { CREATION_DATE: '01/07/2026 00:00:00' },
  children: [
    {
      name: 'REPOSITORY',
      attributes: { NAME: 'REP_FIX' },
      children: [
        {
          name: 'FOLDER',
          attributes: { NAME: 'CDM' },
          children: [
            {
              name: 'SOURCE',
              attributes: { NAME: 'SRC_FIX', DBDNAME: 'FIXDB', DATABASETYPE: 'Oracle' },
              children: [
                { name: 'SOURCEFIELD', attributes: { NAME: 'ID' }, children: [] },
                { name: 'SOURCEFIELD', attributes: { NAME: 'EXTRA' }, children: [] },
                // Non-field sibling — proves Fields(n) counts only *FIELD tags,
                // not every child (corpus-verified: TABLEATTRIBUTE/METADATAEXTENSION
                // routinely sit alongside SOURCEFIELD/TARGETFIELD/TRANSFORMFIELD).
                {
                  name: 'TABLEATTRIBUTE',
                  attributes: { NAME: 'Owner Name', VALUE: 'FIX' },
                  children: [],
                },
              ],
            },
            {
              name: 'TARGET',
              attributes: { NAME: 'TGT_FIX', DATABASETYPE: 'Oracle' },
              children: [{ name: 'TARGETFIELD', attributes: { NAME: 'ID' }, children: [] }],
            },
            {
              name: 'TRANSFORMATION',
              attributes: { NAME: 'EXP_FIX', TYPE: 'Expression' },
              children: [{ name: 'TRANSFORMFIELD', attributes: { NAME: 'ID' }, children: [] }],
            },
            {
              name: 'MAPPING',
              attributes: { NAME: 'm_FIX' },
              children: [
                {
                  name: 'INSTANCE',
                  attributes: { NAME: 'SRC_FIX', TRANSFORMATION_NAME: 'SRC_FIX', TYPE: 'SOURCE' },
                  children: [],
                },
                {
                  name: 'INSTANCE',
                  attributes: {
                    NAME: 'EXP_FIX',
                    TRANSFORMATION_NAME: 'EXP_FIX',
                    TYPE: 'TRANSFORMATION',
                  },
                  children: [],
                },
                {
                  name: 'INSTANCE',
                  attributes: { NAME: 'TGT_FIX', TRANSFORMATION_NAME: 'TGT_FIX', TYPE: 'TARGET' },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

const TREE = {
  name: 'xmltobq',
  path: '',
  kind: 'dir',
  layer: 'root',
  children: [
    {
      name: 'CDM',
      path: 'CDM',
      kind: 'dir',
      layer: 'CDM',
      children: [
        { name: 'm_FIX.xml', path: 'xmltobq/CDM/m_FIX.xml', kind: 'xml', mappingPath: 'CDM/m_FIX' },
      ],
    },
  ],
}

// Task 16: static corpus counts for the Explorer footer's corpus summary.
const SUMMARY = {
  xmlCount: 81,
  recipeCount: 86,
  ddlCount: 212,
  dirCount: 119,
  layers: ['CDM', 'DWH'],
}

const server = setupServer(
  http.get('/api/tree', () => HttpResponse.json(TREE)),
  http.get('/api/mappings/model/CDM/m_FIX', () => HttpResponse.json(MODEL)),
  http.get('/api/mappings/dom/CDM/m_FIX', () => HttpResponse.json(DOM)),
  http.get('/api/summary', () => HttpResponse.json(SUMMARY)),
)
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderViewer(searchQuery = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={client}>
      <ETLViewer searchQuery={searchQuery} />
    </QueryClientProvider>,
  )
  return { ...utils, client }
}

describe('ETLViewer — real canvas', () => {
  it('shows the empty hint, then renders the real mapping canvas after selecting an xml file', async () => {
    const { rerender, container, client } = renderViewer()

    expect(await screen.findByText('Select an .xml mapping to view')).toBeInTheDocument()

    const file = await screen.findByText('m_FIX.xml')
    fireEvent.click(file)

    // { selector: 'text' } excludes NodeBox's nested <title> (a11y tooltip) element,
    // which independently matches the same string under RTL's own-text-node rule.
    const sourceName = await screen.findByText('SRC_FIX', { selector: 'text' })
    expect(sourceName).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.queryByText('Select an .xml mapping to view')).not.toBeInTheDocument()
    })

    // Select the source node: opens the detail panel, DOM-fed once /mappings/dom
    // resolves — Properties shows every DOM attribute (including ones absent
    // from the adapter's quick `properties` bag) plus the Fields(n) count line.
    fireEvent.click(sourceName)

    expect(await screen.findByText('DBDNAME')).toBeInTheDocument()
    expect(screen.getByText('FIXDB')).toBeInTheDocument()
    expect(screen.getByText('DATABASETYPE')).toBeInTheDocument()
    // SOURCE has 3 children (2 SOURCEFIELD + 1 non-field TABLEATTRIBUTE) —
    // Fields(n) must count only the SOURCEFIELD ones.
    expect(screen.getByText('Fields (2)')).toBeInTheDocument()

    // Deselect (toggle) so the search-highlight assertions below aren't
    // conflated with click-selection sharing the same stroke treatment.
    fireEvent.click(sourceName)
    await waitFor(() => {
      expect(screen.queryByText('DBDNAME')).not.toBeInTheDocument()
    })

    // No query: no node carries the selected-stroke treatment (isSelected false everywhere).
    expect(container.querySelectorAll('rect[stroke-width="2"]')).toHaveLength(0)

    // Global search reuse (Task 5): every port in this fixture is named "ID",
    // so a padded/mixed-case port substring — trimmed + lowercased per spec —
    // matches all three nodes (name OR port match) and reuses the EXISTING
    // isSelected stroke treatment, no new styling.
    rerender(
      <QueryClientProvider client={client}>
        <ETLViewer searchQuery="  ID  " />
      </QueryClientProvider>,
    )
    await waitFor(() => {
      expect(container.querySelectorAll('rect[stroke-width="2"]')).toHaveLength(3)
    })

    // Clearing the query removes the highlight.
    rerender(
      <QueryClientProvider client={client}>
        <ETLViewer searchQuery="" />
      </QueryClientProvider>,
    )
    await waitFor(() => {
      expect(container.querySelectorAll('rect[stroke-width="2"]')).toHaveLength(0)
    })

    // Task 6: zoom below 0.65 collapses full-detail nodes into compact pills.
    // The "−" button steps 0.2 per click: 1.0 → 0.8 → 0.6, crossing the 0.65
    // threshold on the second click.
    const zoomOut = screen.getByText('−')
    fireEvent.click(zoomOut)
    fireEvent.click(zoomOut)

    await waitFor(() => {
      // Port rows (each node has one field named "ID") are not rendered compact.
      expect(screen.queryByText('ID', { selector: 'text' })).not.toBeInTheDocument()
    })
    // One pill per node (source, expression, target) — rx=16 per the spec.
    expect(container.querySelectorAll('rect[rx="16"]')).toHaveLength(3)

    // Human-sanctioned 2026-07-30: compact pills adopt the selected/highlight
    // stroke too, so search highlight stays visible below the 0.65 zoom
    // threshold. Reuse the same "ID" query (matches every port in this
    // fixture) while nodes render as pills.
    rerender(
      <QueryClientProvider client={client}>
        <ETLViewer searchQuery="  ID  " />
      </QueryClientProvider>,
    )
    await waitFor(() => {
      expect(container.querySelectorAll('rect[rx="16"][stroke-width="2"]')).toHaveLength(3)
    })

    // Clearing the query drops the pills back to the default stroke-width.
    rerender(
      <QueryClientProvider client={client}>
        <ETLViewer searchQuery="" />
      </QueryClientProvider>,
    )
    await waitFor(() => {
      expect(container.querySelectorAll('rect[rx="16"][stroke-width="2"]')).toHaveLength(0)
    })

    // Zoom back in past the threshold: full-detail rendering (and its ports) return.
    const zoomIn = screen.getByText('+')
    fireEvent.click(zoomIn)
    fireEvent.click(zoomIn)

    await waitFor(() => {
      expect(screen.getAllByText('ID', { selector: 'text' })).toHaveLength(3)
    })
    expect(container.querySelectorAll('rect[rx="16"]')).toHaveLength(0)
  })

  // Task 16: view-aware corpus summary — Explorer footer, real /api/summary counts.
  it('renders the corpus summary in the Explorer footer', async () => {
    renderViewer()
    expect(await screen.findByText('81 xml')).toBeInTheDocument()
    expect(screen.getByText('86 recipes')).toBeInTheDocument()
    expect(screen.getByText('212 ddl')).toBeInTheDocument()
    expect(screen.getByText('119 dirs')).toBeInTheDocument()
  })
})
