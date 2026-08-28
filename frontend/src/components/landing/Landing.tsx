import { useEffect } from 'react'
import type { TabId } from '../../types'
import { useReadiness } from '../../api/readinessQueries'
import { useAppConfig } from '../../api/queries'
import { LoadingState } from '../shared/Spinner'
import { MascotScene } from './MascotScene'
import type { ReadinessStatus, FailingRoot } from './MascotScene'
import { StatsGrid } from './StatsGrid'
import { TabPreview } from './TabPreview'
import { ArchitectureDiagram } from './ArchitectureDiagram'
import { ProgressStrip } from './ProgressStrip'
import { EnvironmentPanel } from './EnvironmentPanel'

/**
 * The app's first screen — "is this pointed at my data, and is it working?", answered before
 * the user ever opens a tab. `useReadiness()` is fetched exactly ONCE, here; every component
 * below is deliberately presentational (spec §6, plan Global Constraint "fetch readiness once").
 *
 * Always shown on load — no "skip intro" flag, no persisted state (spec §8): the codebase has
 * already met the hazard of a persisted value wedging a first screen (sub-project 10's corrupt
 * `density`), and this page does not repeat it.
 *
 * `onEnter` mirrors `App.tsx`'s `enterApp(tab?: TabId)`: called with a tab id when a tab card or
 * an architecture-diagram region is clicked (entering directly on that tab), and with no argument
 * from the primary button or the `Escape` key.
 */

export interface LandingProps {
  onEnter: (tab?: TabId) => void
}

export function Landing({ onEnter }: LandingProps) {
  const { data, isLoading, isError } = useReadiness()
  // Spec §6.4: EnvironmentPanel also carries "the GCP project and region from `/api/config`" —
  // a second, tiny query (`staleTime: Infinity`, same as every other static-per-build catalogue
  // this hook already serves elsewhere in the app), not a second copy of `useReadiness()`.
  const { data: config } = useAppConfig()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onEnter()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onEnter])

  const status: ReadinessStatus = data?.status === 'degraded' ? 'degraded' : 'ok'
  const rootIssue = data?.roots?.find(r => r.status !== 'ok') ?? null
  const failingRoot: FailingRoot | null = rootIssue
    ? { name: rootIssue.name ?? 'root', hint: rootIssue.hint ?? null }
    : null

  return (
    <div
      data-testid="landing-page"
      style={{
        height: '100%',
        overflow: 'auto',
        background: 'var(--bg)',
      }}
    >
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '40px 24px 72px', display: 'flex', flexDirection: 'column', gap: 32 }}>
        <MascotScene status={status} failingRoot={failingRoot} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', margin: 0 }}>
            ETL <span style={{ color: 'var(--green)' }}>360</span>
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 560, lineHeight: 1.6, margin: 0 }}>
            Informatica PowerCenter (IPC) Powermart XML exports, made browsable and
            platform-agnostic — viewer, modifier, operational history and DAGs, over one corpus.
          </p>
          <button
            onClick={() => onEnter()}
            style={{
              marginTop: 4,
              padding: '10px 22px',
              borderRadius: 8,
              border: '1px solid var(--green)',
              background: 'var(--surface)',
              color: 'var(--green)',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'Inter, sans-serif',
              cursor: 'pointer',
            }}
          >
            Enter ETL 360 →
          </button>
        </div>

        {isLoading && <LoadingState label="Reading readiness…" />}
        {isError && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Readiness could not be read — corpus and operational stats are unavailable right now.
          </div>
        )}
        {data && <StatsGrid readiness={data} />}

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', margin: 0 }}>
            Four tabs
          </h2>
          <TabPreview onEnter={onEnter} />
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', margin: 0 }}>
            Architecture
          </h2>
          <ArchitectureDiagram onEnter={onEnter} />
        </section>

        <ProgressStrip progress={data?.progress} />
        <EnvironmentPanel roots={data?.roots} gcpProjectId={config?.gcpProjectId} region={config?.region} />
      </div>
    </div>
  )
}
