import type { ReadinessT } from '../../api/readinessQueries'

/**
 * The repo's own plan-checkbox ledger, not a claim about the product. `progress` is omitted
 * from the JSON entirely (not `null`) whenever the app runs outside the repo or a doc file
 * vanishes mid-scan — that must render as silence, never as a fabricated "0 of 0 tasks" or a
 * manufactured percentage. See `frontend/src/components/landing/MascotScene.tsx` for the sibling
 * idiom this reuses: inline styles pulling `var(--token)` only, no new colour.
 */

export interface ProgressStripProps {
  progress: ReadinessT['progress']
}

export function ProgressStrip({ progress }: ProgressStripProps) {
  if (!progress) return null

  const { tasksDone, tasksTotal, adrs } = progress
  const ratio =
    tasksDone !== undefined && tasksTotal ? Math.min(1, Math.max(0, tasksDone / tasksTotal)) : 0

  return (
    <div data-testid="progress-strip" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          fontSize: 12,
          color: 'var(--text-muted)',
        }}
      >
        <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)' }}>
          {`${tasksDone ?? '—'} / ${tasksTotal ?? '—'} plan checkboxes`}
        </span>
        <span>{`${adrs ?? '—'} ADRs`}</span>
      </div>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: 'var(--surface-2)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${ratio * 100}%`,
            background: 'var(--teal)',
            borderRadius: 2,
          }}
        />
      </div>
    </div>
  )
}
