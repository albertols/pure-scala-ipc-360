import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { CorpusSummary } from './CorpusSummary'

afterEach(() => cleanup())

describe('CorpusSummary', () => {
  it('renders each {label, value} pair as "value label" in mono 10px', () => {
    render(
      <CorpusSummary
        items={[
          { label: 'xml', value: 81 },
          { label: 'recipes', value: 86 },
        ]}
      />,
    )

    const xml = screen.getByText('81 xml')
    expect(xml).toBeInTheDocument()
    expect(xml).toHaveStyle({ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px' })

    expect(screen.getByText('86 recipes')).toBeInTheDocument()
  })

  it('renders nothing when items is empty', () => {
    const { container } = render(<CorpusSummary items={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
