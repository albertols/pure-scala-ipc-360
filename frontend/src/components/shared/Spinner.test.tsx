import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LoadingState, TopProgressBar } from './Spinner'

afterEach(() => cleanup())

describe('LoadingState', () => {
  it('renders its label and an SVG with role="status"', () => {
    render(<LoadingState label="Loading corpus…" />)

    expect(screen.getByText('Loading corpus…')).toBeInTheDocument()
    const status = screen.getByRole('status')
    expect(status.tagName.toLowerCase()).toBe('svg')
  })
})

function renderBar(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <TopProgressBar />
    </QueryClientProvider>,
  )
}

describe('TopProgressBar', () => {
  it('renders nothing when useIsFetching() is 0', () => {
    renderBar(new QueryClient())

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('renders a bar when useIsFetching() is > 0', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.fetchQuery({
      queryKey: ['slow'],
      queryFn: () => new Promise(resolve => setTimeout(() => resolve('ok'), 400)),
    })
    renderBar(client)

    expect(await screen.findByRole('progressbar')).toBeInTheDocument()
  })

  it('does not flicker for a fetch that resolves well before the show-delay window elapses', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.fetchQuery({
      queryKey: ['fast'],
      queryFn: () => new Promise(resolve => setTimeout(() => resolve('ok'), 20)),
    })
    renderBar(client)

    // Wait comfortably past the show-delay window — the fetch settled long
    // before it, so the bar must never have appeared.
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('hides once the in-flight query settles, even after it fails', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const query = client.fetchQuery({
      queryKey: ['boom'],
      queryFn: () => new Promise((_, reject) => setTimeout(() => reject(new Error('boom')), 400)),
    })
    renderBar(client)

    expect(await screen.findByRole('progressbar')).toBeInTheDocument()

    await query.catch(() => {})
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument())
  })
})
