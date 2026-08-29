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

  // Fix round 1, Finding 2 (spec §6.4): the panel also carries "the GCP project and region
  // from `/api/config`" — Task 10 wires `Landing`'s own `useAppConfig()` into these two props.
  it('shows the GCP project and region when present', () => {
    render(<EnvironmentPanel roots={ROOTS} gcpProjectId="example-project" region="eu" />)

    expect(screen.getByText(/example-project/)).toBeInTheDocument()
    expect(screen.getByText(/eu/)).toBeInTheDocument()
  })

  // No fabricated placeholder that could be mistaken for a real project id.
  it('names the GCP project as not configured rather than fabricating one', () => {
    render(<EnvironmentPanel roots={ROOTS} />)

    expect(screen.getByText(/not configured/)).toBeInTheDocument()
  })
})
