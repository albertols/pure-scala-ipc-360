import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TabPreview } from './TabPreview'
import { TABS, FUTURE_TABS } from '../../tabs'

afterEach(cleanup)

describe('TabPreview', () => {
  it('renders one card per live tab, from the shared tab metadata', () => {
    render(<TabPreview onEnter={() => {}} />)
    for (const t of TABS) expect(screen.getByText(t.label)).toBeInTheDocument()
  })

  it('renders the not-yet-built tabs as unavailable', () => {
    render(<TabPreview onEnter={() => {}} />)
    for (const t of FUTURE_TABS) expect(screen.getByText(t.label)).toBeInTheDocument()
    expect(screen.getAllByText(/coming soon/i).length).toBe(FUTURE_TABS.length)
  })

  it('enters the app on the clicked tab', () => {
    const onEnter = vi.fn()
    render(<TabPreview onEnter={onEnter} />)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(TABS[2].label) }))

    expect(onEnter).toHaveBeenCalledWith(TABS[2].id)
  })

  it('does not offer entry into a tab that does not exist yet', () => {
    const onEnter = vi.fn()
    render(<TabPreview onEnter={onEnter} />)

    const future = screen.getByText(FUTURE_TABS[0].label).closest('button')
    expect(future).toBeNull()
    expect(onEnter).not.toHaveBeenCalled()
  })
})
