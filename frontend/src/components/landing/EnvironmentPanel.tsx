import type { ReadinessT } from '../../api/readinessQueries'

/**
 * "A way to show the current config.json used" — the landing page's answer to "is this
 * pointed at MY data". Reuses `Tab3`'s `DataRootsPanel` language and concepts (ADR-0013):
 * the path actually resolved (never the configured string echoed back), the tier that won,
 * and — for anything not healthy — the one-sentence hint naming the `config.json` key to
 * change. This is the one landing-page panel where the "name your own cause" rule applies;
 * contrast `ProgressStrip`, which correctly renders nothing when its own data is missing
 * because it reports the repo's plan ledger, not the user's data.
 *
 * Presentational only — no query of its own. `roots` is `ReadinessT['roots']`, a plain
 * `Root[] | undefined`; every field on `Root` is optional (generated DTO), so every value
 * is formatted defensively rather than asserted with `!`.
 *
 * `gcpProjectId`/`region` (spec §6.4: "the GCP project and region from `/api/config`") are
 * plain optional strings, fetched by the caller (`Landing.tsx`'s own `useAppConfig()`, not a
 * second copy of that hook here) and rendered honestly when absent — "not configured", never a
 * fabricated placeholder that could be mistaken for a real project id.
 */

const TEXT = '#c8d3e8'
const HINT = '#e9b872'
const DIM = 'var(--text-muted)'

type RootT = NonNullable<ReadinessT['roots']>[number]

function TierChip({ tier }: { tier: string | undefined }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        fontFamily: 'JetBrains Mono, monospace',
        color: TEXT,
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '1px 5px',
      }}
    >
      {tier ?? 'absent'}
    </span>
  )
}

function Row({ name, resolved, tier, status, hint }: RootT) {
  return (
    <div
      data-testid={`env-root-${name ?? ''}`}
      style={{ padding: '9px 11px', borderTop: '1px solid var(--border)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', minWidth: 92 }}>
          {name ?? '—'}
        </span>
        <TierChip tier={tier} />
      </div>
      <div
        style={{
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
          color: TEXT,
          wordBreak: 'break-word',
          marginTop: 3,
        }}
      >
        {resolved ?? ''}
      </div>
      {status !== 'ok' && hint && (
        <div style={{ fontSize: 11, color: HINT, marginTop: 5, lineHeight: 1.45 }}>{hint}</div>
      )}
    </div>
  )
}

export interface EnvironmentPanelProps {
  roots: ReadinessT['roots']
  gcpProjectId?: string
  region?: string
}

export function EnvironmentPanel({ roots, gcpProjectId, region }: EnvironmentPanelProps) {
  if (!roots || roots.length === 0) return null

  return (
    <div
      data-testid="environment-panel"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '7px 11px',
          fontSize: 10,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: DIM,
          background: 'var(--surface-2)',
        }}
      >
        Data roots
      </div>
      <div
        data-testid="environment-gcp"
        style={{
          padding: '9px 11px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', minWidth: 92 }}>
          GCP
        </span>
        <span
          style={{
            fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
            color: TEXT,
            wordBreak: 'break-word',
          }}
        >
          {gcpProjectId ?? 'not configured'}
          {region ? ` · ${region}` : ''}
        </span>
      </div>
      {roots.map((root, i) => (
        <Row key={root.name ?? `root-${i}`} {...root} />
      ))}
    </div>
  )
}
