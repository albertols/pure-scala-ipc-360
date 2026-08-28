import React, { useState } from 'react'
import type { TabId } from './types'
import { ETLViewer } from './components/tab1/ETLViewer'
import { ETLModifier } from './components/tab2/ETLModifier'
import { ETLOperational } from './components/tab3/ETLOperational'
import { ETLDag } from './components/tab4/ETLDag'
import { InfoTooltip } from './components/shared/InfoTooltip'
import { TopProgressBar } from './components/shared/Spinner'

// ─── Tab Config ───────────────────────────────────────────────────────────────

const TABS: {
  id: TabId
  label: string
  icon: React.ReactElement
  accent: string
  description: string
}[] = [
  {
    id: 'viewer',
    label: 'IPC ETL Viewer',
    accent: '#34d399',
    description: 'Visualize Informatica PowerCenter XML mappings with an interactive node canvas. Click nodes to inspect ports, expressions, and properties.',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="1" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <rect x="8" y="1" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <rect x="1" y="8" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <rect x="8" y="8" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    id: 'modifier',
    label: 'ETL Modifier',
    accent: '#818cf8',
    description: 'Edit _ETL_*.json recipe files — sources, transformations, expressions, and BigQuery DDL. All changes tracked with a save bar.',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M2 10.5V12h1.5l6-6L8 4.5l-6 6zM11.7 3.3a1 1 0 000-1.4l-.6-.6a1 1 0 00-1.4 0l-1 1L10.7 4.3l1-1z" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'operational',
    label: 'ETL Operational',
    accent: '#fb923c',
    description: 'Live relationship graph of tables and ETL recipes with BigQuery operational state — OK/KO, run history, p95 stats, and GCP deep links.',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="3" cy="7" r="1.8" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="11" cy="3" r="1.8" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="11" cy="11" r="1.8" stroke="currentColor" strokeWidth="1.3" />
        <line x1="4.8" y1="6.3" x2="9.2" y2="3.7" stroke="currentColor" strokeWidth="1.2" />
        <line x1="4.8" y1="7.7" x2="9.2" y2="10.3" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    id: 'dag',
    label: 'ETL DAG',
    accent: '#4f9cf9',
    description: 'Airflow DAG explorer with task dependency canvas, execution history, and one-click replay via GCP Pub/Sub.',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M1 7h3M10 7h3M4 7l2-3 2 3-2 3L4 7z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="7" r="1.3" fill="currentColor" />
        <circle cx="2" cy="7" r="1.3" fill="currentColor" />
      </svg>
    ),
  },
]

const FUTURE_TABS = [
  { label: 'ETL Tuner', desc: 'Spark engine performance tuner — coming soon' },
  { label: 'ETL Agents', desc: 'L2/L3 agent interaction history — coming soon' },
]

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
    <div style={{
      flexShrink: 0,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
    }}>
      {/* top row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        padding: '0 16px',
        height: 48,
      }}>
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
            <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f8', letterSpacing: '-0.02em', lineHeight: 1 }}>
              ETL <span style={{ color: active.accent }}>360</span>
            </div>
            <div style={{ fontSize: 9, color: '#3a4560', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>xmltobq · GCP Suite</div>
          </div>
        </div>

        {/* search */}
        <div style={{ position: 'relative', marginRight: 20 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
            style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="5.5" cy="5.5" r="4" stroke="#4a5570" strokeWidth="1.4" />
            <line x1="8.5" y1="8.5" x2="11.5" y2="11.5" stroke="#4a5570" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search files, mappings…"
            style={{
              width: 260, background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 6, color: '#c8d3e8', fontSize: 12,
              padding: '6px 10px 6px 28px', outline: 'none', fontFamily: 'Inter, sans-serif',
            }}
            onFocus={e => { (e.target as HTMLInputElement).style.borderColor = active.accent }}
            onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--border)' }}
          />
        </div>

        <div style={{ flex: 1 }} />

        {/* future tabs */}
        <div style={{ display: 'flex', gap: 6, marginRight: 12 }}>
          {FUTURE_TABS.map(ft => (
            <div key={ft.label} title={ft.desc} style={{
              padding: '3px 10px', borderRadius: 4,
              border: '1px solid var(--border-subtle)',
              color: '#2a3050', fontSize: 11, cursor: 'not-allowed',
              fontFamily: 'JetBrains Mono, monospace',
            }}>{ft.label}</div>
          ))}
        </div>

        {/* suite info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#4a5570' }}>
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
                display: 'flex', alignItems: 'center', gap: 7,
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
              <span style={{ color: isActive ? tab.accent : '#4a5570', display: 'flex' }}>{tab.icon}</span>
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

export default function App() {
  const [focusRecipe] = useState<string | null>(readFocusRecipe)
  const [activeTab, setActiveTab] = useState<TabId>('viewer')
  const [searchQuery, setSearchQuery] = useState('')
  // Task 12: visited tabs stay mounted (display:none) once shown, so React Query's
  // cached data and operationalView's cached view state don't have to fight DOM
  // state (scroll offsets, canvas layout work) that neither of them restores.
  const [visited, setVisited] = useState<Set<TabId>>(() => new Set<TabId>(['viewer']))

  const showTab = (tab: TabId) => {
    setActiveTab(tab)
    setSearchQuery('')
    setVisited(prev => prev.has(tab) ? prev : new Set(prev).add(tab))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
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
                <ETLOperational />
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
