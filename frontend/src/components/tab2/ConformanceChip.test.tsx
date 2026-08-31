import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { ETLNode } from '../../types'
import { ConformanceChip } from './ConformanceChip'

afterEach(cleanup)

const NODE_A: ETLNode = {
  id: 'A',
  type: 'source',
  label: 'SRC',
  name: 'A',
  x: 0,
  y: 0,
  ports: [],
  properties: {},
  file: 'x.json',
}
const GRAPH = { nodes: [NODE_A], connections: [], mappingNames: ['x'], renderedMapping: 'x' }

describe('ConformanceChip', () => {
  it('renders green with "0 errors" for a clean validate response', () => {
    render(
      <ConformanceChip
        errors={[]}
        warnings={[]}
        checks={[]}
        rules={[]}
        graph={GRAPH}
        onSelectNode={vi.fn()}
      />,
    )

    const chip = screen.getByRole('button', { name: /0 errors/ })
    expect(chip).toHaveStyle({ color: 'var(--green)' })
  })

  it('renders amber when there are warnings but no errors — a distinct, non-alarming state', () => {
    render(
      <ConformanceChip
        errors={[]}
        warnings={[{ path: '$.steps[0]', message: 'warn' }]}
        checks={[
          {
            ruleId: 'IPC-STR-003',
            severity: 'warning',
            status: 'fail',
            path: '$.steps[0]',
            message: 'warn',
          },
        ]}
        rules={[]}
        graph={GRAPH}
        onSelectNode={vi.fn()}
      />,
    )

    const chip = screen.getByRole('button', { name: /0 errors/ })
    expect(chip).toHaveStyle({ color: '#fbbf24' })
  })

  it('renders red with the error count when validate returns errors', () => {
    render(
      <ConformanceChip
        errors={[
          { path: '$.steps[0]', message: 'bad' },
          { path: '$.steps[1]', message: 'bad2' },
        ]}
        warnings={[]}
        checks={[
          {
            ruleId: 'IPC-STR-001',
            severity: 'error',
            status: 'fail',
            path: '$.steps[0]',
            message: 'bad',
          },
          {
            ruleId: 'IPC-STR-002',
            severity: 'error',
            status: 'fail',
            path: '$.steps[1]',
            message: 'bad2',
          },
        ]}
        rules={[]}
        graph={GRAPH}
        onSelectNode={vi.fn()}
      />,
    )

    const chip = screen.getByRole('button', { name: /2 errors/ })
    expect(chip).toHaveStyle({ color: 'var(--red)' })
  })

  it('clicking opens a drawer listing rule id, path and message', () => {
    render(
      <ConformanceChip
        errors={[{ path: '$.steps[0]', message: 'bad thing' }]}
        warnings={[]}
        checks={[
          {
            ruleId: 'IPC-STR-001',
            severity: 'error',
            status: 'fail',
            path: '$.steps[0]',
            message: 'bad thing',
          },
        ]}
        rules={[]}
        graph={GRAPH}
        onSelectNode={vi.fn()}
      />,
    )

    expect(screen.queryByText('bad thing')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /1 error/ }))

    expect(screen.getByText('IPC-STR-001')).toBeInTheDocument()
    expect(screen.getByText('$.steps[0]')).toBeInTheDocument()
    expect(screen.getByText('bad thing')).toBeInTheDocument()
  })

  it('clicking a drawer row calls onSelectNode with the resolved node id', () => {
    const onSelectNode = vi.fn()
    render(
      <ConformanceChip
        errors={[{ path: '$.steps[0].target.fields[0].transformation', message: 'bad thing' }]}
        warnings={[]}
        checks={[
          {
            ruleId: 'IPC-STR-001',
            severity: 'error',
            status: 'fail',
            path: '$.steps[0].target.fields[0].transformation',
            message: 'bad thing',
          },
        ]}
        rules={[]}
        graph={GRAPH}
        onSelectNode={onSelectNode}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /1 error/ }))
    fireEvent.click(screen.getByText('bad thing'))

    expect(onSelectNode).toHaveBeenCalledWith('A')
  })

  it('a drawer row whose path does not resolve to a node degrades gracefully — onSelectNode is never called', () => {
    const onSelectNode = vi.fn()
    render(
      <ConformanceChip
        errors={[{ path: '$.table.targetTableNames', message: 'bad table' }]}
        warnings={[]}
        checks={[
          {
            ruleId: 'IPC-STR-002',
            severity: 'error',
            status: 'fail',
            path: '$.table.targetTableNames',
            message: 'bad table',
          },
        ]}
        rules={[]}
        graph={GRAPH}
        onSelectNode={onSelectNode}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /1 error/ }))
    fireEvent.click(screen.getByText('bad table'))

    expect(onSelectNode).not.toHaveBeenCalled()
  })

  // BLOCKER 2 (final whole-branch review): a failed validate (500/timeout/
  // backend down) must render neither green nor red — we genuinely don't
  // know the recipe's conformance, and green reads as "clean" when it isn't.
  it('renders a neutral "conformance unavailable" chip when validate failed — neither green nor red', () => {
    render(
      <ConformanceChip
        errors={[]}
        warnings={[]}
        checks={[]}
        rules={[]}
        failed
        graph={GRAPH}
        onSelectNode={vi.fn()}
      />,
    )

    const chip = screen.getByRole('button', { name: /conformance unavailable/i })
    expect(chip).not.toHaveStyle({ color: 'var(--green)' })
    expect(chip).not.toHaveStyle({ color: 'var(--red)' })
    expect(chip).toHaveStyle({ color: 'var(--text-dim)' })
  })

  it('a stale error count from before a failed re-validate does not leak into the neutral chip label', () => {
    render(
      <ConformanceChip
        errors={[{ path: '$.steps[0]', message: 'bad' }]}
        warnings={[]}
        checks={[
          {
            ruleId: 'IPC-STR-001',
            severity: 'error',
            status: 'fail',
            path: '$.steps[0]',
            message: 'bad',
          },
        ]}
        rules={[]}
        failed
        graph={GRAPH}
        onSelectNode={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: /error/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /conformance unavailable/i })).toBeInTheDocument()
  })

  it('a drawer row shows the rule statement from useIpcRules metadata when available', () => {
    render(
      <ConformanceChip
        errors={[{ path: '$.steps[0]', message: 'bad thing' }]}
        warnings={[]}
        checks={[
          {
            ruleId: 'IPC-STR-001',
            severity: 'error',
            status: 'fail',
            path: '$.steps[0]',
            message: 'bad thing',
          },
        ]}
        rules={[
          {
            id: 'IPC-STR-001',
            severity: 'error',
            statement: 'Every step target needs a name.',
            parserRef: '',
            ipcRef: '',
            wikiRef: '',
          },
        ]}
        graph={GRAPH}
        onSelectNode={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /1 error/ }))
    expect(screen.getByText('Every step target needs a name.')).toBeInTheDocument()
  })
})
