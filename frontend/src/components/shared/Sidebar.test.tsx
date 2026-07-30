import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useState } from 'react'
import type { FSDir } from '../../types'
import { Sidebar } from './Sidebar'

afterEach(() => cleanup())
const FS: FSDir = { name: 'xmltobq', layer: 'root', children: [
  { name: 'CDM', layer: 'CDM', children: [{ name: '_ETL_m_FIX.json', path: 'CDM/m_FIX/_ETL_m_FIX.json', type: 'json' }] },
] }
function Host() {
  const [collapsed, setCollapsed] = useState(false)
  return <Sidebar searchQuery="" selectedPath={null} onSelectFile={() => {}} filesystem={FS}
    collapsed={collapsed} onToggleCollapse={() => setCollapsed(c => !c)} />
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
