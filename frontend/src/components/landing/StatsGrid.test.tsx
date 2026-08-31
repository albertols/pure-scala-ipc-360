import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { StatsGrid } from './StatsGrid'
import type { ReadinessT } from '../../api/readinessQueries'

afterEach(cleanup)

const READY = {
  status: 'ok',
  corpus: { xml: 81, recipes: 86, ddl: 212, dirs: 119, layers: ['CDM', 'DWH', 'ODS'] },
  operational: { clusters: 1284, recipes: 7012, days: 365, rows: 1842000, mode: 'real' },
  dags: { workflows: 23 },
  roots: [],
  progress: { tasksDone: 596, tasksTotal: 601, adrs: 16 },
} as unknown as ReadinessT

describe('StatsGrid', () => {
  it('shows the corpus, operational and DAG counts', () => {
    render(<StatsGrid readiness={READY} />)

    expect(screen.getByText('81')).toBeInTheDocument()
    expect(screen.getByText('86')).toBeInTheDocument()
    expect(screen.getByText('212')).toBeInTheDocument()
    expect(screen.getByText('23')).toBeInTheDocument()
  })

  // At the real scale this app targets, unseparated digits are unreadable.
  it('formats large numbers with thousands separators', () => {
    render(<StatsGrid readiness={READY} />)

    expect(screen.getByText('1,284')).toBeInTheDocument()
    expect(screen.getByText('7,012')).toBeInTheDocument()
    expect(screen.getByText('1,842,000')).toBeInTheDocument()
  })

  it('names the operational data mode', () => {
    render(<StatsGrid readiness={READY} />)
    expect(screen.getByText(/real/)).toBeInTheDocument()
  })
})
