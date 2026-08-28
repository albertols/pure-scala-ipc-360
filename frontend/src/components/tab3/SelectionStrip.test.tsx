import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SelectionStrip } from './SelectionStrip'
import { resetOperationalView, setOperationalView } from '../../state/operationalView'

beforeEach(() => { localStorage.clear(); resetOperationalView() })
afterEach(cleanup)

const SUMMARY = { recipes: 187, dates: 14, ok: 1842, ko: 6, nodes: 312, neighbors: 41 }

describe('SelectionStrip', () => {
  it('renders nothing when no cluster is selected', () => {
    const { container } = render(<SelectionStrip summary={SUMMARY} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('names every selected cluster and the aggregate counts', () => {
    setOperationalView({ selectedClusters: ['cl-a', 'cl-b', 'cl-c'] })
    render(<SelectionStrip summary={SUMMARY} />)

    expect(screen.getByText('cl-a')).toBeInTheDocument()
    expect(screen.getByText('cl-c')).toBeInTheDocument()
    expect(screen.getByText(/3 clusters/)).toBeInTheDocument()
    expect(screen.getByText(/187 recipes/)).toBeInTheDocument()
    expect(screen.getByText(/1,842 OK/)).toBeInTheDocument()
    expect(screen.getByText(/6 KO/)).toBeInTheDocument()
  })

  it('states how many nodes came from neighbouring clusters', () => {
    setOperationalView({ selectedClusters: ['cl-a'] })
    render(<SelectionStrip summary={SUMMARY} />)
    expect(screen.getByText(/312 nodes/)).toBeInTheDocument()
    expect(screen.getByText(/41 from neighbours/)).toBeInTheDocument()
  })

  it('a chip removes its cluster from the selection', () => {
    setOperationalView({ selectedClusters: ['cl-a', 'cl-b'] })
    render(<SelectionStrip summary={SUMMARY} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove cl-a' }))

    expect(screen.queryByText('cl-a')).not.toBeInTheDocument()
    expect(screen.getByText('cl-b')).toBeInTheDocument()
  })

  it('clears the whole selection', () => {
    setOperationalView({ selectedClusters: ['cl-a', 'cl-b'] })
    const { container } = render(<SelectionStrip summary={SUMMARY} />)

    fireEvent.click(screen.getByRole('button', { name: /Clear selection/ }))

    expect(container).toBeEmptyDOMElement()
  })
})
