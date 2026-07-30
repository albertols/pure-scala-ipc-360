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
          sourceFields: [
            { name: 'ID', dataType: 'string', precision: '10', scale: '0' },
          ],
        },
      ],
      targets: [
        {
          name: 'TGT_FIX',
          targetFields: [
            { name: 'ID', dataType: 'string', precision: '10', scale: '0' },
          ],
        },
      ],
      transformations: [
        {
          name: 'EXP_FIX',
          typ: 'Expression',
          transformFields: [
            { name: 'ID', dataType: 'string', portType: 'INPUT/OUTPUT' },
          ],
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
              ],
            },
            {
              name: 'TARGET',
              attributes: { NAME: 'TGT_FIX', DATABASETYPE: 'Oracle' },
              children: [
                { name: 'TARGETFIELD', attributes: { NAME: 'ID' }, children: [] },
              ],
            },
            {
              name: 'TRANSFORMATION',
              attributes: { NAME: 'EXP_FIX', TYPE: 'Expression' },
              children: [
                { name: 'TRANSFORMFIELD', attributes: { NAME: 'ID' }, children: [] },
              ],
            },
            {
              name: 'MAPPING',
              attributes: { NAME: 'm_FIX' },
              children: [
                { name: 'INSTANCE', attributes: { NAME: 'SRC_FIX', TRANSFORMATION_NAME: 'SRC_FIX', TYPE: 'SOURCE' }, children: [] },
                { name: 'INSTANCE', attributes: { NAME: 'EXP_FIX', TRANSFORMATION_NAME: 'EXP_FIX', TYPE: 'TRANSFORMATION' }, children: [] },
                { name: 'INSTANCE', attributes: { NAME: 'TGT_FIX', TRANSFORMATION_NAME: 'TGT_FIX', TYPE: 'TARGET' }, children: [] },
              ],
            },
          ],
        },
      ],
    },
  ],
}

const TREE = {
  name: 'xmltobq', path: '', kind: 'dir', layer: 'root',
  children: [
    {
      name: 'CDM', path: 'CDM', kind: 'dir', layer: 'CDM',
      children: [
        { name: 'm_FIX.xml', path: 'xmltobq/CDM/m_FIX.xml', kind: 'xml', mappingPath: 'CDM/m_FIX' },
      ],
    },
  ],
}

const server = setupServer(
  http.get('/api/tree', () => HttpResponse.json(TREE)),
  http.get('/api/mappings/model/CDM/m_FIX', () => HttpResponse.json(MODEL)),
  http.get('/api/mappings/dom/CDM/m_FIX', () => HttpResponse.json(DOM)),
)
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderViewer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ETLViewer searchQuery="" />
    </QueryClientProvider>,
  )
}

describe('ETLViewer — real canvas', () => {
  it('shows the empty hint, then renders the real mapping canvas after selecting an xml file', async () => {
    renderViewer()

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
    expect(screen.getByText('Fields (2)')).toBeInTheDocument()
  })
})
