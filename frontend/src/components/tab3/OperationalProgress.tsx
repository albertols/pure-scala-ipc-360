import { Spinner } from '../shared/Spinner'

// ─── OperationalProgress (Task 14) ──────────────────────────────────────────
//
// Replaces Tab 3's single `LoadingState label="Loading relationships…"`. At real scale the wait
// is long enough that "loading" alone is not an answer: what is loading, and how much of it
// turned out to exist, are the two things an operator actually wants.
//
// Deliberately NOT a percentage and NOT an "N of M days" counter. The backend indexes the whole
// b15 history inside one request and cannot report per-day progress without a streaming
// endpoint; SSE is an explicit non-goal (spec §2, §7.6). A bar that advances on a guess is worse
// than an honest stage name, because it invites the operator to time it.
//
// Every colour/typeface here is already in the vocabulary (ADR-0005) — no new token.

export interface ProgressStage {
  label: string
  /** Resolved totals, e.g. `14 days · 21 clusters · 417 rows`. Omitted entirely when not yet known. */
  detail: string | null
  done: boolean
  active: boolean
}

const DIM = 'var(--text-muted)'

function Marker({ done, active }: { done: boolean; active: boolean }) {
  if (active) {
    return (
      <span data-testid="stage-marker-active" style={{ display: 'flex' }}>
        <Spinner size={12} />
      </span>
    )
  }
  if (done) {
    return (
      <span
        data-testid="stage-marker-done"
        aria-hidden="true"
        style={{
          fontSize: 11,
          color: 'var(--green)',
          lineHeight: '12px',
          width: 12,
          textAlign: 'center',
        }}
      >
        {'✓'}
      </span>
    )
  }
  return (
    <span
      data-testid="stage-marker-idle"
      aria-hidden="true"
      style={{ width: 12, display: 'flex', justifyContent: 'center' }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--border)' }} />
    </span>
  )
}

export function OperationalProgress({ stages }: { stages: ProgressStage[] }) {
  return (
    <div
      data-testid="operational-progress"
      style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}
    >
      {stages.map(stage => (
        <div key={stage.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Marker done={stage.done} active={stage.active} />
          <span style={{ fontSize: 12, color: stage.active || stage.done ? 'var(--text)' : DIM }}>
            {stage.label}
          </span>
          {stage.detail && (
            <span style={{ fontSize: 11, color: DIM, fontFamily: 'JetBrains Mono, monospace' }}>
              {stage.detail}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
