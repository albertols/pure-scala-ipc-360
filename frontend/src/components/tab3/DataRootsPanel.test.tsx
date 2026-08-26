import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { DataRootsPanel, DataRootsChip } from './DataRootsPanel'
import type { Diagnostics } from '../../api/queries'

afterEach(cleanup)

const HEALTHY: Diagnostics = {
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
      expectedLayerDirs: ['STG', 'ODS'], presentDirs: ['ODS', 'STG'], unexpectedDirs: [],
      filesRead: 2, anchorHits: 33, rowsParsed: 33, rowsSkipped: 0,
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

/** The anchor-mismatch case: paths all fine, the scan reaches the files, nothing matches. */
const ANCHOR_MISMATCH: Diagnostics = {
  ...HEALTHY,
  status: 'ko',
  dwhControl: {
    ...HEALTHY.dwhControl!,
    resolvedReal: '/corp/exports/DWH_CONTROL', realExists: true, realUsable: true,
    tier: 'real', status: 'ko',
    hint: 'Read 2 statements.sql but no statement matched the configured anchor. '
      + 'The files INSERT INTO: CTL.CORP_L2L_CONFIG (×412) — set layerToLayerTable in config.json to the one your control schema uses.',
    scan: {
      ...HEALTHY.dwhControl!.scan!,
      filesRead: 2, anchorHits: 0, rowsParsed: 0, rowsSkipped: 0,
      insertTargetsFound: [{ table: 'CTL.CORP_L2L_CONFIG', count: 412 }],
    },
  },
}

const controlRow = () => within(screen.getByTestId('data-root-dwhControl'))

describe('DataRootsPanel', () => {
  it('shows the resolved absolute path of every data root', () => {
    render(<DataRootsPanel diagnostics={HEALTHY} />)
    expect(screen.getByText('/repo/parser/src/main/resources/xmltobq')).toBeTruthy()
    expect(screen.getByText('/repo/parser/src/main/resources/composer')).toBeTruthy()
  })

  /** Echoing back the configured value teaches nothing — the question is which tier served. */
  it('shows the path of the tier that actually won, not the configured one', () => {
    render(<DataRootsPanel diagnostics={HEALTHY} />)
    expect(controlRow().getByText('/repo/backend/src/main/resources/mock/DWH_CONTROL')).toBeTruthy()
    expect(controlRow().queryByText('/repo/parser/src/main/resources/DWH_CONTROL')).toBeNull()
    expect(controlRow().getByText(/tier: mock/)).toBeTruthy()

    cleanup()
    render(<DataRootsPanel diagnostics={ANCHOR_MISMATCH} />)
    expect(controlRow().getByText('/corp/exports/DWH_CONTROL')).toBeTruthy()
    expect(controlRow().getByText(/tier: real/)).toBeTruthy()
  })

  it('marks each root OK or KO', () => {
    render(<DataRootsPanel diagnostics={HEALTHY} />)
    expect(screen.getAllByText('OK').length).toBe(3)
    expect(screen.queryByText('KO')).toBeNull()
  })

  it('renders the actionable hint for a KO root', () => {
    render(<DataRootsPanel diagnostics={ANCHOR_MISMATCH} />)
    expect(controlRow().getByText('KO')).toBeTruthy()
    expect(controlRow().getByText(/set layerToLayerTable in config\.json/)).toBeTruthy()
  })

  it('shows the staged scan counts so the step that dropped to zero is visible', () => {
    render(<DataRootsPanel diagnostics={ANCHOR_MISMATCH} />)
    expect(controlRow().getByText('files read: 2')).toBeTruthy()
    expect(controlRow().getByText('anchor hits: 0')).toBeTruthy()
    expect(controlRow().getByText('rows parsed: 0')).toBeTruthy()
    expect(controlRow().getByText('rows skipped: 0')).toBeTruthy()
  })

  it('names the INSERT target actually found, with its count', () => {
    render(<DataRootsPanel diagnostics={ANCHOR_MISMATCH} />)
    expect(controlRow().getByText('found: CTL.CORP_L2L_CONFIG (×412)')).toBeTruthy()
  })

  it('shows the vocabulary it scanned WITH, not only what it found', () => {
    render(<DataRootsPanel diagnostics={ANCHOR_MISMATCH} />)
    expect(controlRow().getByText('anchor table: CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG')).toBeTruthy()
    expect(controlRow().getByText('layer dirs: STG, ODS')).toBeTruthy()
  })

  it('names a present-but-unconfigured layer directory', () => {
    const withUnexpected: Diagnostics = {
      ...HEALTHY,
      dwhControl: {
        ...HEALTHY.dwhControl!,
        scan: { ...HEALTHY.dwhControl!.scan!, unexpectedDirs: ['ARCHIVE', 'RAW'] },
      },
    }
    render(<DataRootsPanel diagnostics={withUnexpected} />)
    expect(controlRow().getByText(/unexpected dirs: ARCHIVE, RAW/)).toBeTruthy()
  })

  it('renders nothing rather than a broken table when the report has not arrived', () => {
    const { container } = render(<DataRootsPanel diagnostics={undefined} />)
    expect(container.textContent).toBe('')
  })
})

describe('DataRootsChip', () => {
  it('names the tier serving the control schema', () => {
    render(<DataRootsChip diagnostics={HEALTHY} />)
    expect(screen.getByText('data: mock')).toBeTruthy()
  })

  it('flags a KO report so an empty canvas is never mistaken for an empty corpus', () => {
    render(<DataRootsChip diagnostics={ANCHOR_MISMATCH} />)
    expect(screen.getByText('data: real')).toBeTruthy()
    expect(screen.getByTitle(/set layerToLayerTable in config\.json/)).toBeTruthy()
  })

  it('renders nothing before the report arrives', () => {
    const { container } = render(<DataRootsChip diagnostics={undefined} />)
    expect(container.textContent).toBe('')
  })
})
