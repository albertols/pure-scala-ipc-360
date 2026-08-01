import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import type { ETLNode, Connection } from '../../types'
import { bandOf, IpcCanvas } from './IpcCanvas'

afterEach(cleanup)

// Fixture spans all three bands: a source, an expression (falls into
// "transformations" — bandOf never special-cases individual transform
// kinds), and a target — plus one connection wiring source -> expression.
const SOURCE: ETLNode = { id: 'src1', type: 'source', label: 'SRC', name: 'SourceOne', x: 40, y: 40, ports: [], properties: {}, file: 'a.xml' }
const EXPR: ETLNode = { id: 'exp1', type: 'expression', label: 'EXP', name: 'ExprOne', x: 300, y: 40, ports: [], properties: {}, file: 'a.xml' }
const TARGET: ETLNode = { id: 'tgt1', type: 'target', label: 'TGT', name: 'TargetOne', x: 560, y: 40, ports: [], properties: {}, file: 'a.xml' }
const NODES = [SOURCE, EXPR, TARGET]
const CONNECTIONS: Connection[] = [{ fromNode: 'src1', fromPort: '', toNode: 'exp1', toPort: '' }]

function renderCanvas(overrides: Partial<React.ComponentProps<typeof IpcCanvas>> = {}) {
  return render(
    <IpcCanvas
      nodes={NODES}
      connections={CONNECTIONS}
      selectedNode={null}
      onSelectNode={vi.fn()}
      offsets={{}}
      {...overrides}
    />,
  )
}

describe('bandOf', () => {
  it('classifies source/expression/target nodes into sources/transformations/target', () => {
    expect(bandOf(SOURCE)).toBe('sources')
    expect(bandOf(EXPR)).toBe('transformations')
    expect(bandOf(TARGET)).toBe('target')
  })
})

describe('IpcCanvas', () => {
  it('renders the three band labels', () => {
    renderCanvas()
    expect(screen.getByText('Sources')).toBeInTheDocument()
    expect(screen.getByText('Transformations')).toBeInTheDocument()
    expect(screen.getByText('Target')).toBeInTheDocument()
  })

  it('renders a node at x + offsets[id].x, y + offsets[id].y', () => {
    const { container } = renderCanvas({ offsets: { exp1: { x: 50, y: 5 } } })
    // NodeBox renders a drop-shadow rect (x = node.x + 2) THEN the body rect
    // (x = node.x) — both width === NODE_WIDTH === 195; the second is the body.
    const bodyRect = container.querySelectorAll('[data-testid="ipc-node-exp1"] rect[width="195"]')[1]!
    expect(bodyRect).toHaveAttribute('x', String(300 + 50))
    expect(bodyRect).toHaveAttribute('y', String(40 + 5))
  })

  it('pointer-drags a node and reports grid-snapped coordinates via onMoveNode', () => {
    const onMoveNode = vi.fn()
    const { container } = renderCanvas({ onMoveNode })
    const nodeGroup = container.querySelector('[data-testid="ipc-node-exp1"]')!
    const root = screen.getByTestId('ipc-canvas-root')

    fireEvent.pointerDown(nodeGroup, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(root, { clientX: 120, clientY: 140, pointerId: 1 })
    fireEvent.pointerUp(root, { clientX: 120, clientY: 140, pointerId: 1 })

    expect(onMoveNode).toHaveBeenCalledWith('exp1', 20, 40)
  })

  it('clicking the auto-layout button calls onAutoLayout', () => {
    const onAutoLayout = vi.fn()
    renderCanvas({ onAutoLayout })
    fireEvent.click(screen.getByTitle('auto-layout'))
    expect(onAutoLayout).toHaveBeenCalledTimes(1)
  })

  it('renders a visible path plus a transparent 12px hit-area path per connection, and the hit area fires onSelectEdge', () => {
    const onSelectEdge = vi.fn()
    const { container } = renderCanvas({ onSelectEdge })
    const hitAreas = container.querySelectorAll('path[stroke-width="12"]')
    expect(hitAreas).toHaveLength(CONNECTIONS.length)

    fireEvent.click(hitAreas[0])
    expect(onSelectEdge).toHaveBeenCalledWith(CONNECTIONS[0])
  })

  // Task 13: nodeStatus's per-node dot. A node with an entry gets a colored
  // dot in its header; a node absent from the map gets none at all (not an
  // 'ok'-colored dot — the prop's whole point is "no status = no dot").
  it('renders a 6px status dot for nodes present in nodeStatus, colored by severity, and omits it for nodes absent from the map', () => {
    const { container } = renderCanvas({ nodeStatus: { exp1: 'error', src1: 'warn' } })

    const errorDot = container.querySelector('[data-testid="ipc-node-status-exp1"]')
    expect(errorDot).toHaveAttribute('fill', 'var(--red)')
    expect(errorDot).toHaveAttribute('r', '3')

    const warnDot = container.querySelector('[data-testid="ipc-node-status-src1"]')
    expect(warnDot).toHaveAttribute('fill', '#fbbf24')

    expect(container.querySelector('[data-testid="ipc-node-status-tgt1"]')).not.toBeInTheDocument()
  })
})
