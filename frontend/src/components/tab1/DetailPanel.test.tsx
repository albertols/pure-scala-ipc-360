import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { ETLNode } from '../../types'
import { DetailPanel } from './DetailPanel'

// No RTL auto-cleanup in this project's setup — explicit cleanup between the
// two renders below since this file renders more than once.
afterEach(() => cleanup())

function makeNode(overrides: Partial<ETLNode> = {}): ETLNode {
  return {
    id: 'n1',
    type: 'expression',
    label: 'EXP',
    name: 'EXP_FIX',
    x: 0,
    y: 0,
    ports: [],
    properties: {},
    file: 'CDM/m_FIX.xml',
    ...overrides,
  }
}

describe('DetailPanel — header chip', () => {
  it('shows node.label in the chip when it differs from the type abbr (unknown/instance-specific label)', () => {
    render(<DetailPanel node={makeNode({ label: 'UPD' })} onClose={() => {}} />)

    // "UPD" here is the sanctioned label override, not the type's own "EXP" abbr.
    expect(screen.getByText('UPD')).toBeInTheDocument()
    expect(screen.queryByText('EXP')).not.toBeInTheDocument()
  })

  it('falls back to the type abbr when node.label matches it', () => {
    render(<DetailPanel node={makeNode({ label: 'EXP' })} onClose={() => {}} />)

    expect(screen.getByText('EXP')).toBeInTheDocument()
  })
})
