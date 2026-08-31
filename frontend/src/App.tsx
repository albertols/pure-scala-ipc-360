import { useEffect, useRef, useState } from 'react'
import type { TabId } from './types'
import { ETLViewer } from './components/tab1/ETLViewer'
import { ETLModifier } from './components/tab2/ETLModifier'
import { ETLOperational } from './components/tab3/ETLOperational'
import { ETLDag } from './components/tab4/ETLDag'
import { InfoTooltip } from './components/shared/InfoTooltip'
import { TopProgressBar } from './components/shared/Spinner'
import { Landing } from './components/landing/Landing'
import { RelatedOverlay, readRelatedParam } from './components/tab3/RelatedOverlay'
import { TABS, FUTURE_TABS } from './tabs'

// ─── Top Bar ─────────────────────────────────────────────────────────────────

function TopBar({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
}: {
  activeTab: TabId
  onTabChange: (t: TabId) => void
  searchQuery: string
  onSearchChange: (q: string) => void
}) {
  const active = TABS.find(t => t.id === activeTab)!

  return (
    <div
      style={{
        flexShrink: 0,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* top row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          padding: '0 16px',
          height: 48,
        }}
      >
        {/* logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginRight: 24 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="2" width="8" height="8" rx="2.5" fill="#34d399" opacity="0.9" />
            <rect x="14" y="2" width="8" height="8" rx="2.5" fill="#4f9cf9" opacity="0.9" />
            <rect x="2" y="14" width="8" height="8" rx="2.5" fill="#818cf8" opacity="0.9" />
            <rect x="14" y="14" width="8" height="8" rx="2.5" fill="#f87171" opacity="0.9" />
            <path d="M10 6h4M12 10v4M14 18h-4" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
          </svg>
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: '#e2e8f8',
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}
            >
              ETL <span style={{ color: active.accent }}>360</span>
            </div>
            <div
              style={{
                fontSize: 9,
                color: '#3a4560',
                fontFamily: 'JetBrains Mono, monospace',
                lineHeight: 1,
              }}
            >
              xmltobq · GCP Suite
            </div>
          </div>
        </div>

        {/* search */}
        <div style={{ position: 'relative', marginRight: 20 }}>
          <svg
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
            style={{
              position: 'absolute',
              left: 9,
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          >
            <circle cx="5.5" cy="5.5" r="4" stroke="#4a5570" strokeWidth="1.4" />
            <line
              x1="8.5"
              y1="8.5"
              x2="11.5"
              y2="11.5"
              stroke="#4a5570"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
          <input
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search files, mappings…"
            style={{
              width: 260,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: '#c8d3e8',
              fontSize: 12,
              padding: '6px 10px 6px 28px',
              outline: 'none',
              fontFamily: 'Inter, sans-serif',
            }}
            onFocus={e => {
              ;(e.target as HTMLInputElement).style.borderColor = active.accent
            }}
            onBlur={e => {
              ;(e.target as HTMLInputElement).style.borderColor = 'var(--border)'
            }}
          />
        </div>

        <div style={{ flex: 1 }} />

        {/* future tabs */}
        <div style={{ display: 'flex', gap: 6, marginRight: 12 }}>
          {FUTURE_TABS.map(ft => (
            <div
              key={ft.label}
              title={ft.desc}
              style={{
                padding: '3px 10px',
                borderRadius: 4,
                border: '1px solid var(--border-subtle)',
                color: '#2a3050',
                fontSize: 11,
                cursor: 'not-allowed',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {ft.label}
            </div>
          ))}
        </div>

        {/* suite info */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#4a5570' }}
        >
          <InfoTooltip
            text={TABS.map(t => `${t.label}: ${t.description}`).join('\n\n')}
            placement="bottom"
          />
          <span>About</span>
        </div>
      </div>

      {/* tab bar */}
      <div style={{ display: 'flex', alignItems: 'flex-end', padding: '0 16px' }}>
        {TABS.map(tab => {
          const isActive = tab.id === activeTab
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '9px 16px',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${isActive ? tab.accent : 'transparent'}`,
                color: isActive ? '#e2e8f8' : '#4a5570',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                fontFamily: 'Inter, sans-serif',
                transition: 'color 0.15s, border-color 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ color: isActive ? tab.accent : '#4a5570', display: 'flex' }}>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────

// Focus mode (Task 15): `?focus=<recipePath>` renders a single recipe's
// editor full-viewport — no TopBar, no tab strip, no Explorer — so a second
// browser tab can sit side by side with the first. Deliberately NOT a router:
// this is a single query parameter read once at mount, not a routing system
// (frontend/package.json's dependencies stay exactly @tanstack/react-query,
// react, react-dom — see the ⤢ button in ETLModifier's recipe header, which
// opens this same URL shape via `window.open`).
function readFocusRecipe(): string | null {
  return new URLSearchParams(window.location.search).get('focus')
}

// Sub-project 11 Task 10: the landing page is the app's initial view (spec §8) — a `view`
// state, not a route. `'leaving'` is the ~400ms window in which `.landing-exit` (index.css)
// plays before the tab shell actually mounts; `?focus=` bypasses this entirely, exactly as it
// already bypasses the tab shell below (never sees `'landing'`/`'leaving'` at all).
type ViewState = 'landing' | 'leaving' | 'tabs'
const LANDING_TRANSITION_MS = 400

// Spec §8: the transition "is skipped entirely under prefers-reduced-motion" — the CSS
// keyframes already no-op under that media query (index.css), but the JS delay that used to
// gate the actual view swap did NOT: a reduced-motion user would click Enter, see nothing
// animate (correctly), then sit on an apparently-frozen screen for 400ms before it snapped to
// the shell. This reads as an unresponsive app, which is worse than no transition at all — so
// the swap itself must be synchronous whenever the OS setting is on.
//
// jsdom does not implement `window.matchMedia` at all in this project's test environment
// (confirmed: `typeof window.matchMedia` is `'undefined'` under the default test setup), so
// this guards defensively rather than assuming a browser-shaped `window` — a crash here on
// entry would take down the whole app, which is worse than just not skipping the delay.
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export default function App() {
  const [focusRecipe] = useState<string | null>(readFocusRecipe)
  // `?related=` is the second URL mode, read exactly like `?focus=` above: no router, no new
  // dependency, and it renders the SAME RelatedOverlay the in-app window does, so a link opened
  // in a new tab and the hovering window cannot drift.
  const [related] = useState(readRelatedParam)
  const [view, setView] = useState<ViewState>('landing')
  const [activeTab, setActiveTab] = useState<TabId>('viewer')
  const [searchQuery, setSearchQuery] = useState('')
  // Task 12: visited tabs stay mounted (display:none) once shown, so React Query's
  // cached data and operationalView's cached view state don't have to fight DOM
  // state (scroll offsets, canvas layout work) that neither of them restores.
  const [visited, setVisited] = useState<Set<TabId>>(() => new Set<TabId>(['viewer']))
  const transitionTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current)
    },
    [],
  )

  const showTab = (tab: TabId) => {
    setActiveTab(tab)
    setSearchQuery('')
    setVisited(prev => (prev.has(tab) ? prev : new Set(prev).add(tab)))
  }

  // Entry via the primary button, `Esc`, a tab-preview card or an architecture-diagram region
  // (the last two call this with the tab they depict; the first two call it with none). Nothing
  // here is persisted — no "skip intro" flag, so there is no stored value that can wedge the
  // first screen (the hazard sub-project 10 met once already with a corrupt `density`).
  const enterApp = (tab?: TabId) => {
    if (tab) showTab(tab)

    // Clear any previously scheduled swap before doing anything else: the landing page (and
    // its Enter button) stays mounted through the whole 400ms `'leaving'` window, so a second
    // activation within that window — Enter clicked twice, or Enter then a tab card — must not
    // leave the first timer running underneath the second.
    if (transitionTimer.current !== null) {
      window.clearTimeout(transitionTimer.current)
      transitionTimer.current = null
    }

    if (prefersReducedMotion()) {
      setView('tabs')
      return
    }

    setView('leaving')
    transitionTimer.current = window.setTimeout(() => setView('tabs'), LANDING_TRANSITION_MS)
  }

  if (related) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          background: 'var(--bg)',
          overflow: 'hidden',
        }}
      >
        <TopProgressBar />
        <RelatedOverlay nodeId={related.nodeId} clusters={related.clusters} standalone />
      </div>
    )
  }

  if (!focusRecipe && view !== 'tabs') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          background: 'var(--bg)',
          overflow: 'hidden',
        }}
      >
        <TopProgressBar />
        <div
          className={view === 'leaving' ? 'landing-exit' : undefined}
          style={{ flex: 1, overflow: 'hidden' }}
        >
          <Landing onEnter={enterApp} />
        </div>
      </div>
    )
  }

  return (
    <div
      className={!focusRecipe ? 'shell-enter' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--bg)',
        overflow: 'hidden',
      }}
    >
      {/* Task 17: fetch-driven progress bar — mounted once here, above the
          tab shell (and focus mode), so every corner of the app gets the
          same top-of-viewport signal without per-tab wiring. */}
      <TopProgressBar />
      {!focusRecipe && (
        <TopBar
          activeTab={activeTab}
          onTabChange={showTab}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {focusRecipe ? (
          <ETLModifier searchQuery="" focusRecipe={focusRecipe} />
        ) : (
          <>
            {/* Tabs mount on first visit and then STAY mounted, hidden. React Query caches the
                data and operationalView caches the logical view; this is what preserves the DOM
                state neither can — scroll offsets, and the canvas's own layout work. */}
            {visited.has('viewer') && (
              <div style={{ display: activeTab === 'viewer' ? 'contents' : 'none' }}>
                <ETLViewer searchQuery={activeTab === 'viewer' ? searchQuery : ''} />
              </div>
            )}
            {visited.has('modifier') && (
              <div style={{ display: activeTab === 'modifier' ? 'contents' : 'none' }}>
                <ETLModifier searchQuery={activeTab === 'modifier' ? searchQuery : ''} />
              </div>
            )}
            {visited.has('operational') && (
              <div style={{ display: activeTab === 'operational' ? 'contents' : 'none' }}>
                <ETLOperational searchQuery={activeTab === 'operational' ? searchQuery : ''} />
              </div>
            )}
            {visited.has('dag') && (
              <div style={{ display: activeTab === 'dag' ? 'contents' : 'none' }}>
                <ETLDag />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
