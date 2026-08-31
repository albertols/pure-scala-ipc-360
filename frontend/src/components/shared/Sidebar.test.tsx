import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useState } from 'react'
import type { FSDir, FSFile } from '../../types'
import { Sidebar } from './Sidebar'

afterEach(() => cleanup())
const FS: FSDir = {
  name: 'xmltobq',
  layer: 'root',
  children: [
    {
      name: 'CDM',
      layer: 'CDM',
      children: [{ name: '_ETL_m_FIX.json', path: 'CDM/m_FIX/_ETL_m_FIX.json', type: 'json' }],
    },
  ],
}
function Host() {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <Sidebar
      searchQuery=""
      selectedPath={null}
      onSelectFile={() => {}}
      filesystem={FS}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed(c => !c)}
    />
  )
}
describe('Sidebar — collapse rail', () => {
  it('collapses to a rail and expands back', () => {
    render(<Host />)
    expect(screen.getByText('_ETL_m_FIX.json')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Collapse explorer'))
    expect(screen.queryByText('_ETL_m_FIX.json')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Expand explorer'))
    expect(screen.getByText('_ETL_m_FIX.json')).toBeInTheDocument()
  })
  it('renders no chevron when uncontrolled (back-compat)', () => {
    render(<Sidebar searchQuery="" selectedPath={null} onSelectFile={() => {}} filesystem={FS} />)
    expect(screen.queryByLabelText('Collapse explorer')).not.toBeInTheDocument()
  })
})

// ─── Task 14: opt-in fileFilter + footer slot ─────────────────────────────────

const etlOnlyFilter = (f: FSFile) => f.name.startsWith('_ETL_') && f.name.endsWith('.json')

const MIXED_FS: FSDir = {
  name: 'xmltobq',
  layer: 'root',
  children: [
    {
      name: 'CDM',
      layer: 'CDM',
      children: [
        { name: '_ETL_m_FIX.json', path: 'CDM/m_FIX/_ETL_m_FIX.json', type: 'json' },
        { name: 'm_FIX.xml', path: 'CDM/m_FIX/m_FIX.xml', type: 'xml' },
      ],
    },
    {
      name: 'ONLY_XML',
      layer: 'ODS',
      children: [{ name: 'm_ONLY_XML.xml', path: 'ODS/m_ONLY_XML/m_ONLY_XML.xml', type: 'xml' }],
    },
  ],
}

describe('Sidebar — opt-in fileFilter (Task 14)', () => {
  it('with a fileFilter keeping only _ETL_*.json, XML entries are absent and an all-XML directory is not rendered', () => {
    render(
      <Sidebar
        searchQuery=""
        selectedPath={null}
        onSelectFile={() => {}}
        filesystem={MIXED_FS}
        fileFilter={etlOnlyFilter}
      />,
    )

    // The matching recipe survives.
    expect(screen.getByText('_ETL_m_FIX.json')).toBeInTheDocument()
    // Its sibling XML does not.
    expect(screen.queryByText('m_FIX.xml')).not.toBeInTheDocument()
    // A directory whose every child was filtered out (ONLY_XML, all-XML)
    // disappears entirely rather than lingering as an empty row.
    expect(screen.queryByText('ONLY_XML')).not.toBeInTheDocument()
    expect(screen.queryByText('m_ONLY_XML.xml')).not.toBeInTheDocument()
    // Its non-empty sibling directory still renders (name + layer badge both say "CDM").
    expect(screen.getAllByText('CDM').length).toBeGreaterThan(0)
  })

  it("with no fileFilter, today's tree renders unchanged", () => {
    render(
      <Sidebar searchQuery="" selectedPath={null} onSelectFile={() => {}} filesystem={MIXED_FS} />,
    )

    expect(screen.getByText('_ETL_m_FIX.json')).toBeInTheDocument()
    expect(screen.getByText('m_FIX.xml')).toBeInTheDocument()
    expect(screen.getByText('ONLY_XML')).toBeInTheDocument()
    expect(screen.getByText('m_ONLY_XML.xml')).toBeInTheDocument()
  })

  it('renders an optional footer after extraContent', () => {
    render(
      <Sidebar
        searchQuery=""
        selectedPath={null}
        onSelectFile={() => {}}
        filesystem={FS}
        extraContent={<div>extra</div>}
        footer={<div>footer content</div>}
      />,
    )
    expect(screen.getByText('extra')).toBeInTheDocument()
    expect(screen.getByText('footer content')).toBeInTheDocument()
  })
})
