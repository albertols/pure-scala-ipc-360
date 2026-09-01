import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { NodeDetails } from './NodeDetails'
import type { OperationalCard as CardData } from '../../types'

afterEach(cleanup)

const CARD: CardData = {
  id: 'table:ODS.MIDDLE',
  kind: 'table',
  name: 'ODS.MIDDLE',
  layer: 'ODS',
  status: 'OK',
  lastRun: '2026-08-30T04:00:00Z',
  history: [],
  stats: { avg_time_s: 0, p50: 0, p95: 0, p99: 0, avg_count: 0 },
  relations: [],
}

const NOOP = () => {}
const TARGET = { recipePath: 'DWH/m_X/_ETL_m_X.json', mappingPath: 'DWH/m_X' }

describe('NodeDetails', () => {
  it('offers Preview and all three GCP links', () => {
    render(<NodeDetails card={CARD} previewTarget={TARGET} onPreview={NOOP} onClose={NOOP} />)
    expect(screen.getByText('Open preview')).toBeEnabled()
    expect(screen.getByText('Open in BigQuery')).toBeInTheDocument()
    expect(screen.getByText('Monitoring Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Cloud Logging')).toBeInTheDocument()
  })

  it('disables Preview when no recipe path resolves', () => {
    render(
      <NodeDetails
        card={CARD}
        previewTarget={{ recipePath: null, mappingPath: null }}
        onPreview={NOOP}
        onClose={NOOP}
      />,
    )
    expect(screen.getByText('Open preview').closest('button')).toBeDisabled()
  })

  it('shows the hop line and the centre control only when the host asks for them', () => {
    const onCentre = vi.fn()
    const { rerender } = render(
      <NodeDetails card={CARD} previewTarget={TARGET} onPreview={NOOP} onClose={NOOP} />,
    )
    expect(screen.queryByLabelText('Center lineage here')).toBeNull()

    rerender(
      <NodeDetails
        card={CARD}
        previewTarget={TARGET}
        onPreview={NOOP}
        onClose={NOOP}
        hopLabel="hop -1 upstream"
        onCenterLineage={onCentre}
      />,
    )
    fireEvent.click(screen.getByLabelText('Center lineage here'))
    expect(onCentre).toHaveBeenCalled()
    expect(screen.getByText('hop -1 upstream')).toBeInTheDocument()
  })

  it('renders the host-supplied related block, and nothing when there is none', () => {
    const { rerender } = render(
      <NodeDetails card={CARD} previewTarget={TARGET} onPreview={NOOP} onClose={NOOP} />,
    )
    expect(screen.queryByTestId('related-block')).toBeNull()
    rerender(
      <NodeDetails
        card={CARD}
        previewTarget={TARGET}
        onPreview={NOOP}
        onClose={NOOP}
        related={<div data-testid="related-block">4 relations</div>}
      />,
    )
    expect(screen.getByTestId('related-block')).toBeInTheDocument()
  })

  it('lists the clusters it is given', () => {
    render(
      <NodeDetails
        card={CARD}
        previewTarget={TARGET}
        onPreview={NOOP}
        onClose={NOOP}
        clusters={['cluster-a', 'cluster-b']}
      />,
    )
    expect(screen.getByText('cluster-a')).toBeInTheDocument()
    expect(screen.getByText('cluster-b')).toBeInTheDocument()
  })

  it('closes', () => {
    const onClose = vi.fn()
    render(<NodeDetails card={CARD} previewTarget={TARGET} onPreview={NOOP} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close details'))
    expect(onClose).toHaveBeenCalled()
  })
})
