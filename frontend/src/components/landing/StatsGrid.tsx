import type { ReadinessT } from '../../api/readinessQueries'

/**
 * The "prelude of what's coming" — corpus, operational and DAG scale, all in one payload
 * (`useReadiness()`, fetched once by the caller — this component is presentational, no
 * query of its own; see `frontend/src/components/landing/MascotScene.tsx` for the sibling
 * idiom this reuses: inline styles pulling `var(--token)` only, no new colour).
 *
 * Every `ReadinessT` field is optional (generated DTO — springdoc/openapi-typescript emits
 * every field as `?:`), so every value is formatted defensively rather than asserted with `!`.
 */

const NUMBER_FORMAT = new Intl.NumberFormat('en-US')

function formatCount(value: number | undefined): string {
  return value === undefined ? '—' : NUMBER_FORMAT.format(value)
}

interface StatTileProps {
  label: string
  value: number | undefined
}

function StatTile({ label, value }: StatTileProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '14px 16px',
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--surface)',
      }}
    >
      <span
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 26,
          fontWeight: 700,
          color: 'var(--text)',
          lineHeight: 1.1,
        }}
      >
        {formatCount(value)}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}

export interface StatsGridProps {
  readiness: ReadinessT
}

export function StatsGrid({ readiness }: StatsGridProps) {
  const corpus = readiness.corpus
  const operational = readiness.operational
  const dags = readiness.dags

  return (
    <div data-testid="stats-grid">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>corpus</span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: 10,
        }}
      >
        <StatTile label="XMLs" value={corpus?.xml} />
        <StatTile label="recipes" value={corpus?.recipes} />
        <StatTile label="DDLs" value={corpus?.ddl} />
        <StatTile label="layers" value={corpus?.layers?.length} />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          margin: '18px 0 10px',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>operational</span>
        <span
          data-testid="operational-mode-chip"
          style={{
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '1px 5px',
          }}
        >
          {`data: ${operational?.mode ?? 'absent'}`}
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: 10,
        }}
      >
        <StatTile label="clusters" value={operational?.clusters} />
        <StatTile label="recipes" value={operational?.recipes} />
        <StatTile label="days" value={operational?.days} />
        <StatTile label="b15 rows" value={operational?.rows} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: 10,
          marginTop: 18,
        }}
      >
        <StatTile label="DAGs" value={dags?.workflows} />
      </div>
    </div>
  )
}
