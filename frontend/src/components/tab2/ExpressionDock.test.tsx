import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useState } from 'react'
import { ExpressionDock } from './ExpressionDock'
import type { ExpressionEntry } from '../../api/queries'

afterEach(() => cleanup())

const ENTRIES: ExpressionEntry[] = [
  {
    mappingPath: 'CDM/m_DM_INFOHUB_BIZLINK', layer: 'CDM',
    transformation: 'EXP_FIX', port: 'COL_A_OUT', formula: 'LTRIM(COL_A)', origin: 'xml',
  },
  {
    mappingPath: 'ODS/m_SYN_ODS_ORDERS/_ETL_m_SYN_ODS_ORDERS.json', layer: 'ODS',
    transformation: 'ODS_SYN_ORDERS', port: 'AMOUNT',
    formula: 'ROUND(STG_L_SYN_ORDERS.AMOUNT, 2)', origin: 'recipe',
  },
]

function renderDock(overrides: Partial<React.ComponentProps<typeof ExpressionDock>> = {}) {
  return render(
    <ExpressionDock
      entries={ENTRIES}
      isLoading={false}
      error={null}
      filter=""
      onFilterChange={() => {}}
      canInsert={false}
      onInsert={() => {}}
      {...overrides}
    />,
  )
}

describe('ExpressionDock (Task 14)', () => {
  it('renders only origin: recipe entries when both origins are supplied', () => {
    renderDock()

    expect(screen.queryByText('LTRIM(COL_A)')).not.toBeInTheDocument()
    expect(screen.getByText('ROUND(STG_L_SYN_ORDERS.AMOUNT, 2)')).toBeInTheDocument()
    // No origin badge left to discriminate — 'xml'/'recipe' origin labels don't render.
    expect(screen.queryByText('xml')).not.toBeInTheDocument()
    expect(screen.queryByText('recipe')).not.toBeInTheDocument()
    // The layer chip stays.
    expect(screen.getByText('ODS')).toBeInTheDocument()
  })

  it('a row is draggable and its dragstart sets the text/etl-formula payload', () => {
    renderDock()

    const row = screen.getByText('ROUND(STG_L_SYN_ORDERS.AMOUNT, 2)').closest('[draggable="true"]')!
    expect(row).toBeInTheDocument()

    const setData = vi.fn()
    fireEvent.dragStart(row, { dataTransfer: { setData } })
    expect(setData).toHaveBeenCalledWith('text/etl-formula', 'ROUND(STG_L_SYN_ORDERS.AMOUNT, 2)')
  })

  it('the filter box narrows the list', () => {
    const recipeOnly: ExpressionEntry[] = [
      ENTRIES[1],
      {
        mappingPath: 'CDM/m_FIX/_ETL_m_FIX.json', layer: 'CDM',
        transformation: 'FIX_STEP', port: 'B', formula: 'UPPER(S.B)', origin: 'recipe',
      },
    ]
    function Host() {
      const [filter, setFilter] = useState('')
      return (
        <ExpressionDock
          entries={recipeOnly}
          isLoading={false}
          error={null}
          filter={filter}
          onFilterChange={setFilter}
          canInsert={false}
          onInsert={() => {}}
        />
      )
    }
    render(<Host />)

    expect(screen.getByText('ROUND(STG_L_SYN_ORDERS.AMOUNT, 2)')).toBeInTheDocument()
    expect(screen.getByText('UPPER(S.B)')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Filter expressions…'), { target: { value: 'UPPER' } })

    expect(screen.queryByText('ROUND(STG_L_SYN_ORDERS.AMOUNT, 2)')).not.toBeInTheDocument()
    expect(screen.getByText('UPPER(S.B)')).toBeInTheDocument()
  })

  it('Insert fires onInsert only when a formula field has focus (canInsert)', () => {
    const onInsert = vi.fn()
    const { rerender } = renderDock({ onInsert })

    expect(screen.queryByText('Insert')).not.toBeInTheDocument()

    rerender(
      <ExpressionDock
        entries={ENTRIES}
        isLoading={false}
        error={null}
        filter=""
        onFilterChange={() => {}}
        canInsert
        onInsert={onInsert}
      />,
    )

    const insertButton = screen.getByText('Insert')
    fireEvent.click(insertButton)
    expect(onInsert).toHaveBeenCalledWith('ROUND(STG_L_SYN_ORDERS.AMOUNT, 2)')
  })
})
