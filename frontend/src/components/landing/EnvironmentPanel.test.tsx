import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { EnvironmentPanel } from './EnvironmentPanel'

afterEach(cleanup)

const ROOTS = [
  { name: 'corpus', resolved: '/repo/parser/src/main/resources/xmltobq', tier: 'real', status: 'ok' },
  { name: 'composer', resolved: '/repo/backend/src/main/resources/mock/composer', tier: 'mock', status: 'ok' },
]

describe('EnvironmentPanel', () => {
  it('shows each root with its resolved path and tier', () => {
    render(<EnvironmentPanel roots={ROOTS} />)

    expect(screen.getByText('corpus')).toBeInTheDocument()
    expect(screen.getByText('/repo/parser/src/main/resources/xmltobq')).toBeInTheDocument()
    expect(screen.getByText('mock')).toBeInTheDocument()
  })

  // The panel exists to answer "is this pointed at MY data" — a broken root must say why.
  it('surfaces the hint when a root is unhealthy', () => {
    render(<EnvironmentPanel roots={[
      { name: 'composer', resolved: '/nope', tier: 'absent', status: 'ko',
        hint: 'set composerRoot in config.json' },
    ]} />)

    expect(screen.getByText(/set composerRoot in config.json/)).toBeInTheDocument()
  })

  it('renders nothing rather than an empty frame when roots are missing', () => {
    const { container } = render(<EnvironmentPanel roots={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})
