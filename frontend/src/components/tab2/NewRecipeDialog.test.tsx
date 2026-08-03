import { describe, expect, it, vi, beforeAll, afterEach, afterAll } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import type { Registry } from '../../api/registryQueries'
import { NewRecipeDialog } from './NewRecipeDialog'

// A layer name found NOWHERE else in this suite's fixtures — proves the
// dialog's list is genuinely sourced from `GET /api/registry`, not some
// other hardcoded/summary layer list that happens to overlap.
const REGISTRY: Registry = {
  sourceTables: [], targetTables: [], ddlTables: [],
  layers: ['CDM', 'ZTESTLAYER'],
}

const server = setupServer(
  http.get('/api/registry', () => HttpResponse.json(REGISTRY)),
)
beforeAll(() => server.listen())
afterEach(() => { server.resetHandlers(); cleanup() })
afterAll(() => server.close())

function renderDialog() {
  const onCancel = vi.fn()
  const onCreate = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={client}>
      <NewRecipeDialog onCancel={onCancel} onCreate={onCreate} />
    </QueryClientProvider>,
  )
  return { ...utils, onCancel, onCreate }
}

describe('NewRecipeDialog', () => {
  it('lists the registry layers, not some other hardcoded list', async () => {
    renderDialog()
    expect(await screen.findByRole('button', { name: 'ZTESTLAYER' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'CDM' })).toBeInTheDocument()
  })

  it('Create stays disabled until both a layer and a mapping name are present', async () => {
    renderDialog()
    const create = screen.getByRole('button', { name: 'Create' })
    expect(create).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/mapping name/i), { target: { value: 'm_NEW' } })
    expect(create).toBeDisabled() // no layer yet

    fireEvent.click(await screen.findByRole('button', { name: 'CDM' }))
    expect(create).not.toBeDisabled()
  })

  it('shows the exact path that will be created as the layer/mapping name are entered', async () => {
    renderDialog()
    expect(screen.getByText('Pick a layer and enter a mapping name…')).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: 'CDM' }))
    fireEvent.change(screen.getByLabelText(/mapping name/i), { target: { value: 'm_NEW_ONE' } })

    expect(screen.getByText('CDM/m_NEW_ONE/_ETL_m_NEW_ONE.json')).toBeInTheDocument()
  })

  it('trims the mapping name before composing the path', async () => {
    renderDialog()
    fireEvent.click(await screen.findByRole('button', { name: 'CDM' }))
    fireEvent.change(screen.getByLabelText(/mapping name/i), { target: { value: '  m_NEW_ONE  ' } })

    expect(screen.getByText('CDM/m_NEW_ONE/_ETL_m_NEW_ONE.json')).toBeInTheDocument()
  })

  it('Create calls onCreate with the resolved path', async () => {
    const { onCreate } = renderDialog()
    fireEvent.click(await screen.findByRole('button', { name: 'CDM' }))
    fireEvent.change(screen.getByLabelText(/mapping name/i), { target: { value: 'm_NEW_ONE' } })

    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate).toHaveBeenCalledWith('CDM/m_NEW_ONE/_ETL_m_NEW_ONE.json')
  })

  it('Cancel and Escape both call onCancel without ever calling onCreate', async () => {
    const { onCancel, onCreate } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)

    const { onCancel: onCancel2 } = renderDialog()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel2).toHaveBeenCalledTimes(1)
    expect(onCreate).not.toHaveBeenCalled()
  })
})
