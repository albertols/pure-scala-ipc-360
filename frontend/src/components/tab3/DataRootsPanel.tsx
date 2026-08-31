import type { Diagnostics } from '../../api/queries'
import type { ApiError } from '../../api/client'

/**
 * The data-root report Tab 3 shows instead of leaving an empty canvas unexplained.
 *
 * Every way of mis-pointing a data root fails silently and lands on the same blank canvas, so the
 * panel's job is to make the failures distinguishable: which path was actually used (the tier that
 * WON, never the configured string echoed back), how far the control-schema scan got, and the one
 * sentence saying what to change. Styling stays inside the existing token/mono vocabulary — this
 * is a new surface, not a new look (ADR-0005).
 */

const OK_GREEN = '#34d399'
const KO_RED = '#f87171'
const DIM = '#4a5570'
const TEXT = '#c8d3e8'

type ControlSchema = NonNullable<Diagnostics['dwhControl']>
type RootStatus = NonNullable<Diagnostics['corpus']>

const isKo = (status: string | undefined) => status === 'ko'

/** The first KO section's hint — what the operator should read first. */
function firstProblem(d: Diagnostics): string {
  const hints = [d.corpus, d.dwhControl, d.composer]
    .filter(section => section && isKo(section.status))
    .map(section => section?.hint)
    .filter((hint): hint is string => !!hint && hint.length > 0)
  return hints[0] ?? ''
}

function StatusBadge({ status }: { status: string | undefined }) {
  const ko = isKo(status)
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        fontFamily: 'JetBrains Mono, monospace',
        color: ko ? KO_RED : OK_GREEN,
        border: `1px solid ${ko ? KO_RED : OK_GREEN}33`,
        background: `${ko ? KO_RED : OK_GREEN}14`,
        borderRadius: 4,
        padding: '1px 5px',
      }}
    >
      {ko ? 'KO' : 'OK'}
    </span>
  )
}

function Path({ children }: { children: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
        color: TEXT,
        wordBreak: 'break-all',
        marginTop: 3,
      }}
    >
      {children}
    </div>
  )
}

function Facts({ items }: { items: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 12px', marginTop: 4 }}>
      {items.map(item => (
        <span
          key={item}
          style={{ fontSize: 10, color: DIM, fontFamily: 'JetBrains Mono, monospace' }}
        >
          {item}
        </span>
      ))}
    </div>
  )
}

function Hint({ text }: { text: string }) {
  if (!text) return null
  return (
    <div style={{ fontSize: 11, color: '#e9b872', marginTop: 5, lineHeight: 1.45 }}>{text}</div>
  )
}

function Row({
  id,
  label,
  status,
  path,
  facts,
  hint,
}: {
  id: string
  label: string
  status: string | undefined
  path: string
  facts: string[]
  hint: string
}) {
  return (
    <div
      data-testid={`data-root-${id}`}
      style={{
        padding: '9px 11px',
        borderTop: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f8', minWidth: 92 }}>
          {label}
        </span>
        <StatusBadge status={status} />
      </div>
      <Path>{path}</Path>
      <Facts items={facts} />
      <Hint text={hint} />
    </div>
  )
}

/** The path actually read: for a mock-served root the configured one is not it. */
function servingPath(control: ControlSchema): string {
  return control.tier === 'mock' ? (control.mockPath ?? '') : (control.resolvedReal ?? '')
}

function controlFacts(control: ControlSchema): string[] {
  const scan = control.scan
  const facts = [`tier: ${control.tier ?? 'absent'}`, `requires: ${control.requiredChild ?? ''}/`]
  if (!scan) return facts
  facts.push(
    `anchor table: ${scan.anchorTable ?? ''}`,
    `layer dirs: ${(scan.expectedLayerDirs ?? []).join(', ')}`,
    `dirs present: ${(scan.presentDirs ?? []).join(', ') || '—'}`,
  )
  if ((scan.unexpectedDirs ?? []).length > 0) {
    facts.push(`unexpected dirs: ${(scan.unexpectedDirs ?? []).join(', ')}`)
  }
  // Staged on purpose: the first of these four that reads zero is the failing step.
  facts.push(
    `files read: ${scan.filesRead ?? 0}`,
    `anchor hits: ${scan.anchorHits ?? 0}`,
    `rows parsed: ${scan.rowsParsed ?? 0}`,
    `rows skipped: ${scan.rowsSkipped ?? 0}`,
  )
  for (const target of scan.insertTargetsFound ?? []) {
    facts.push(`found: ${target.table} (×${target.count})`)
  }
  return facts
}

function rootFacts(root: RootStatus): string[] {
  const facts = [`tier: ${root.tier ?? 'absent'}`]
  if (root.requiredChild) facts.push(`requires: ${root.requiredChild}/`)
  for (const [key, value] of Object.entries(root.counts ?? {})) facts.push(`${key}: ${value}`)
  return facts
}

/** Panel/chip chrome shared by the resolved report and its two unresolved states. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 12,
        maxWidth: 720,
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
      {children}
    </div>
  )
}

/**
 * @param isLoading the report is still in flight. Distinct from a failure: "we do not know yet"
 *        and "we asked and were refused" are different facts and must not share a rendering.
 * @param error the report itself failed. Rendering `null` here — which is what this component
 *        used to do for BOTH cases — reduces the empty state to a bare "No b15 history" with no
 *        sign that an explanation was even attempted, i.e. exactly the unexplained empty Tab 3
 *        ADR-0013 exists to abolish, reintroduced through the explainer.
 */
export function DataRootsPanel({
  diagnostics,
  isLoading,
  error,
}: {
  diagnostics: Diagnostics | undefined
  isLoading?: boolean
  error?: ApiError | null
}) {
  if (!diagnostics) {
    if (isLoading) {
      return (
        <Frame>
          <div
            data-testid="data-roots-loading"
            style={{ padding: '9px 11px', fontSize: 11, color: DIM }}
          >
            Checking data roots…
          </div>
        </Frame>
      )
    }
    return (
      <Frame>
        <div data-testid="data-roots-unavailable" style={{ padding: '9px 11px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: KO_RED }}>
            {`Data-root report unavailable${error ? `: ${error.title}` : ''}`}
          </div>
          {error?.detail && (
            <div style={{ fontSize: 11, color: TEXT, marginTop: 3 }}>{error.detail}</div>
          )}
          <Hint
            text={
              'GET /api/diagnostics did not answer, so the cause of an empty view cannot be ' +
              'named here. Check that the backend is running and reachable, then reload.'
            }
          />
        </div>
      </Frame>
    )
  }
  const { corpus, dwhControl, composer } = diagnostics
  return (
    <Frame>
      {corpus && (
        <Row
          id="corpus"
          label="corpus"
          status={corpus.status}
          path={corpus.resolved ?? ''}
          facts={rootFacts(corpus)}
          hint={corpus.hint ?? ''}
        />
      )}
      {dwhControl && (
        <Row
          id="dwhControl"
          label="DWH_CONTROL"
          status={dwhControl.status}
          path={servingPath(dwhControl)}
          facts={controlFacts(dwhControl)}
          hint={dwhControl.hint ?? ''}
        />
      )}
      {composer && (
        <Row
          id="composer"
          label="composer"
          status={composer.status}
          path={composer.resolved ?? ''}
          facts={rootFacts(composer)}
          hint={composer.hint ?? ''}
        />
      )}
    </Frame>
  )
}

/**
 * Always-on tier marker for the Tab 3 toolbar. A canvas full of `SYN`-marked mock rows looks
 * exactly like a canvas full of real ones, so the tier belongs on screen even when nothing is
 * wrong; the ⚠ appears only when a section reports KO.
 */
export function DataRootsChip({
  diagnostics,
  isLoading,
  error,
}: {
  diagnostics: Diagnostics | undefined
  isLoading?: boolean
  error?: ApiError | null
}) {
  // In flight is the one state worth staying quiet for: it resolves on its own in a moment, and
  // a flash of "unknown" would be a wrong answer rather than a missing one.
  if (!diagnostics && isLoading) return null

  const failed = !diagnostics
  const tier = failed ? 'unknown' : (diagnostics.dwhControl?.tier ?? 'absent')
  const ko = failed || isKo(diagnostics.status)
  const title = failed
    ? `Data-root report unavailable${error ? `: ${error.title}` : ''} — the tier serving this view could not be determined.`
    : ko
      ? firstProblem(diagnostics)
      : 'All data roots resolved.'
  return (
    <div
      data-testid="data-roots-chip"
      title={title}
      style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: ko ? 'help' : 'default' }}
    >
      <div
        style={{ width: 7, height: 7, borderRadius: '50%', background: ko ? KO_RED : OK_GREEN }}
      />
      <span style={{ fontSize: 11, color: TEXT, fontFamily: 'JetBrains Mono, monospace' }}>
        {`data: ${tier}`}
      </span>
      {ko && <span style={{ fontSize: 11, color: KO_RED }}>⚠</span>}
    </div>
  )
}
