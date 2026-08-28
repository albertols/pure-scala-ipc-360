import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { OperationalCard } from './OperationalCard'
import type { OperationalCard as CardData } from '../../types'
import type { RunT } from '../../api/clusterQueries'
import type { AppConfig } from '../../api/queries'
import { DEFAULT_LOGGING_URL } from '../../api/gcpLinks'

afterEach(cleanup)

const CARD: CardData = {
  id: 'recipe:_ETL_m_CAS_ODS_EVENTS.json', kind: 'recipe', name: '_ETL_m_CAS_ODS_EVENTS.json',
  layer: 'ODS', status: 'OK', lastRun: '2026-07-29T04:52:00.000Z',
  history: ['OK', 'OK', 'KO', 'OK'],
  stats: { avg_time_s: 90, p50: 80, p95: 120, p99: 120, avg_count: 0 },
  jobId: 'application_1_0001', relations: [],
}

const CONFIG: AppConfig = {
  gcpProjectId: 'example-project', region: 'europe-southwest1',
  dataprocJobUrl: 'https://console.cloud.google.com/dataproc/jobs/{jobId}?project={project}&region={region}',
  dataprocClusterUrl: 'https://console.cloud.google.com/dataproc/clusters/{clusterName}?project={project}&region={region}',
  loggingUrl: DEFAULT_LOGGING_URL, loggingDuration: 'P31D',
  dwhControlMode: 'mock', composerMode: 'mock', corpusRoot: '/mock',
}

const RUNS: RunT[] = ['2026-07-29', '2026-07-28', '2026-07-27'].map(date => ({
  date, clusterName: 'cluster-wf-cas-load-4001', jobId: `application_1_${date.slice(-2)}`,
  appStartIso: `${date}T04:52:00.000Z`, durationMin: 1.5, status: 'SUCCESS', message: '',
}))

describe('OperationalCard — link row', () => {
  // The core defect: app_id and job_id always carried the same value, and app_id's href
  // was a query-string shape with no query= expression, which the console rejects.
  it('has no app_id affordance at all', () => {
    render(<OperationalCard card={CARD} config={CONFIG} />)
    expect(screen.queryByText(/app_id/)).not.toBeInTheDocument()
  })

  it('offers job_id and Logging, both built from the served templates', () => {
    render(<OperationalCard card={CARD} config={CONFIG} runs={RUNS} selectedRunDate="2026-07-28" />)

    const job = screen.getByRole('link', { name: /job_id/ })
    expect(job).toHaveAttribute('href', expect.stringContaining('project=example-project'))
    expect(job).toHaveAttribute('href', expect.stringContaining('region=europe-southwest1'))

    const logging = screen.getByRole('link', { name: /Logging/ })
    expect(logging.getAttribute('href')).toContain('query=resource.labels.job_id')
  })

  it('anchors the Logging link at the SELECTED run, not the newest', () => {
    render(<OperationalCard card={CARD} config={CONFIG} runs={RUNS} selectedRunDate="2026-07-27" />)

    const href = screen.getByRole('link', { name: /Logging/ }).getAttribute('href')!
    expect(href).toContain('application_1_27')
    expect(href).toContain(';cursorTimestamp=2026-07-27T04:52:00.000Z')
    expect(href).not.toContain('%3A00%3A00')       // colons survive in the matrix segment
  })

  it('still produces a working Logging link when no runs are available', () => {
    render(<OperationalCard card={CARD} config={CONFIG} />)

    const href = screen.getByRole('link', { name: /Logging/ }).getAttribute('href')!
    expect(href).toContain('application_1_0001')   // falls back to card.jobId
    expect(href).not.toContain('cursorTimestamp')
  })
})

describe('OperationalCard — density', () => {
  it('detailed shows stats and the run history', () => {
    render(<OperationalCard card={CARD} density="detailed" runs={RUNS} selectedRunDate="2026-07-29" config={CONFIG} />)
    expect(screen.getByText('p95')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Run 2026-07-/ })).toHaveLength(3)
  })

  it('compact keeps identity and status but drops stats and history', () => {
    render(<OperationalCard card={CARD} density="compact" runs={RUNS} selectedRunDate="2026-07-29" config={CONFIG} />)
    expect(screen.getByText('_ETL_m_CAS_ODS_EVENTS.json')).toBeInTheDocument()
    expect(screen.getByText('ODS')).toBeInTheDocument()
    expect(screen.queryByText('p95')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: /^Run 2026-07-/ })).toHaveLength(0)
  })

  it('minimal is a single line of layer, name and status', () => {
    render(<OperationalCard card={CARD} density="minimal" config={CONFIG} />)
    expect(screen.getByText(/ODS/)).toBeInTheDocument()
    expect(screen.getByText('OK')).toBeInTheDocument()
    expect(screen.queryByText(/Last run/)).not.toBeInTheDocument()
  })

  it('defaults to detailed', () => {
    render(<OperationalCard card={CARD} config={CONFIG} />)
    expect(screen.getByText('p95')).toBeInTheDocument()
  })
})

describe('OperationalCard — contrast', () => {
  // #4a5570 measures 2.2:1 on --surface-2 and 2.4:1 on --surface; --text-muted is 4.6:1 / 5.1:1.
  it('uses no hardcoded #4a5570 for label text', () => {
    const { container } = render(<OperationalCard card={CARD} config={CONFIG} />)
    expect(container.innerHTML).not.toContain('#4a5570')
  })
})

describe('OperationalCard — RunPicker click isolation (Task 9 review, Ruling 18a)', () => {
  it('does not fire the card onClick when a run bar or dropdown item is clicked', () => {
    const onClick = vi.fn()
    const onSelectRun = vi.fn()
    render(
      <OperationalCard
        card={CARD} config={CONFIG} runs={RUNS} selectedRunDate="2026-07-29"
        onClick={onClick} onSelectRun={onSelectRun}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Run 2026-07-28' }))
    expect(onClick).not.toHaveBeenCalled()
    expect(onSelectRun).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /Choose run/ }))
    expect(onClick).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByRole('menuitem')[0]!)
    expect(onClick).not.toHaveBeenCalled()
    expect(onSelectRun).toHaveBeenCalledTimes(2)
  })
})

// Item 6: the history tooltip said "Click a bar to point the links at that execution" in BOTH
// paths, including the `card.history` fallback where the bars are inert divs — an instruction
// that cannot be followed, on the card whose run detail is the thing that is missing.
describe('OperationalCard — history tooltip tells the truth about the bars', () => {
  const hover = (container: HTMLElement) => {
    const tip = container.querySelector('svg circle[r="5"]')!.closest('span')!
    fireEvent.mouseEnter(tip)
  }

  it('offers the click instruction only when the bars are the clickable RunPicker', () => {
    const { container } = render(<OperationalCard card={CARD} config={CONFIG} runs={RUNS} />)
    hover(container)
    expect(screen.getByText(/Click a bar/)).toBeInTheDocument()
  })

  it('does not instruct a click on the inert summary-derived strip', () => {
    const { container } = render(<OperationalCard card={CARD} config={CONFIG} />)
    hover(container)
    expect(screen.queryByText(/Click a bar/)).not.toBeInTheDocument()
    expect(screen.getByText(/Each bar is one run/)).toBeInTheDocument()
  })
})
