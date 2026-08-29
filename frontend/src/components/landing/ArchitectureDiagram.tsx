import { useState } from 'react'
import type { ReactNode } from 'react'
import type { TabId } from '../../types'
import { TABS } from '../../tabs'

/**
 * The clickable illustrated overview: IPC Powermart XML → `parser/` (Scala) → `_ETL_*.json`
 * recipes + BigQuery DDL → `backend/` (Spring Boot, parser in-JVM) → `frontend/`'s four tabs,
 * with the data roots (`DWH_CONTROL`, `composer`, `xmltobq`) and the GCP/Airflow/Spark context
 * around it. Hand-authored inline SVG — no diagram/mermaid/chart library is a dependency of this
 * repo (`frontend/package.json` stays `@tanstack/react-query` + `react` + `react-dom`), so this
 * is drawn by hand the same way `../../tabs.tsx`'s tab icons are.
 *
 * `docs/architecture.md`'s mermaid diagrams stay as-is — they are the precise reference; this is
 * the illustrated overview, and the identical artwork (literal hex colours, no button/role
 * wrappers — a static file has nowhere to navigate) is committed as `docs/img/etl360-architecture.svg`
 * and referenced from `README.md`, which GitHub renders natively.
 *
 * Presentational only — no query of its own; `onEnter` is the same `(tab: TabId) => void`
 * signature `TabPreview` uses, so Task 10 wires one handler to both.
 *
 * Every region that maps to a tab uses that tab's OWN `accent` from `TABS` — never a re-decided
 * colour — and is a real `<g role="button" tabIndex={0}>` with a keyboard handler (Enter/Space),
 * not a mouse-only `onClick`. Decorative glyphs and connectors are `aria-hidden`; the diagram as
 * a whole carries a `<title>` as its text alternative — via `role="group"` + `aria-labelledby`
 * pointing at that `<title>`'s id, NOT `role="img"`. ARIA's "children presentational" rule
 * includes `img`: putting it on the outer `<svg>` would make a real screen reader announce this
 * as one flat image and swallow every `role="button"` region inside it — reachable by Tab, but
 * silently unnamed. `role="group"` conveys "a labelled collection of controls" without hiding
 * its children's own roles.
 */

export interface ArchitectureDiagramProps {
  onEnter: (tab: TabId) => void
}

const BORDER = 'var(--border)'
const TEXT = 'var(--text)'
const TEXT_MUTED = 'var(--text-muted)'
const SURFACE = 'var(--surface)'
const FONT = 'Inter, sans-serif'

function tabAccent(id: TabId): string {
  return TABS.find(t => t.id === id)?.accent ?? TEXT
}

function tabLabel(id: TabId): string {
  return TABS.find(t => t.id === id)?.label ?? id
}

// ─── Text ──────────────────────────────────────────────────────────────────────

interface LabelProps {
  x: number
  y: number
  lines: string[]
  size?: number
  weight?: number
  color?: string
}

function Label({ x, y, lines, size = 12, weight = 700, color = TEXT }: LabelProps) {
  // A single line renders as a plain text node — no nested <tspan> duplicating the exact same
  // string, which is what `screen.getByText(/.../)` (a substring match) would otherwise find
  // twice (once on the <text>, once on its lone <tspan> child) and reject as ambiguous.
  if (lines.length === 1) {
    return (
      <text x={x} y={y} fontSize={size} fontWeight={weight} fill={color} fontFamily={FONT}>
        {lines[0]}
      </text>
    )
  }
  return (
    <text x={x} y={y} fontSize={size} fontWeight={weight} fill={color} fontFamily={FONT}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : size + 3}>
          {line}
        </tspan>
      ))}
    </text>
  )
}

// ─── Decorative glyphs (aria-hidden; every one sits beside a real text label) ──

function Glyph({ x, y, color, children }: { x: number; y: number; color: string; children: ReactNode }) {
  return (
    <g transform={`translate(${x},${y})`} aria-hidden="true" style={{ color }}>
      {children}
    </g>
  )
}

function IconIpc() {
  return (
    <>
      <rect x="2" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <line x1="4" y1="4" x2="4" y2="1" stroke="currentColor" strokeWidth="1.2" />
      <line x1="6" y1="4" x2="6" y2="1" stroke="currentColor" strokeWidth="1.2" />
      <line x1="8" y1="6.5" x2="12" y2="6.5" stroke="currentColor" strokeWidth="1.2" />
    </>
  )
}

function IconXml() {
  return (
    <path
      d="M4 3L1 7l3 4M10 3l3 4-3 4"
      stroke="currentColor"
      strokeWidth="1.3"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

function IconJava() {
  return (
    <>
      <path
        d="M2 6h8v3a4 4 0 01-4 4 4 4 0 01-4-4V6z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeLinejoin="round"
      />
      <path d="M10 7h1a2 2 0 010 4h-1" stroke="currentColor" strokeWidth="1.1" fill="none" />
      <path
        d="M4.5 4c0-1 1-1 1-2M7.5 4c0-1 1-1 1-2"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />
    </>
  )
}

function IconJson() {
  return (
    <>
      <path
        d="M5 2.2c-1.1 0-1.7.6-1.7 1.7v1.6c0 .9-.3 1.2-1.1 1.2.8 0 1.1.3 1.1 1.2v1.6c0 1.1.6 1.7 1.7 1.7"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 2.2c1.1 0 1.7.6 1.7 1.7v1.6c0 .9.3 1.2 1.1 1.2-.8 0-1.1.3-1.1 1.2v1.6c0 1.1-.6 1.7-1.7 1.7"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  )
}

function IconSpring() {
  return (
    <>
      <path
        d="M2.5 11.5c0-5.5 3-8.5 9-8.5-1 5.5-3.5 8.5-9 8.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeLinejoin="round"
      />
      <path d="M2.5 11.5c2.2-2.3 4.4-4.5 8.5-8.3" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" />
    </>
  )
}

function IconAirflow() {
  return (
    <>
      <circle cx="7" cy="7" r="1.2" fill="currentColor" />
      <path d="M7 7C6.6 4.3 5 2.3 2.8 2c.3 2.6 1.9 4.4 4.2 5z" fill="currentColor" opacity="0.85" />
      <path d="M7 7c2.6.2 4.7-1.1 5.4-3.5-2.6-.2-4.7 1.1-5.4 3.5z" fill="currentColor" opacity="0.7" />
      <path d="M7 7c-1 2.5-.6 5 1.4 6.6.9-2.4.5-5-1.4-6.6z" fill="currentColor" opacity="0.55" />
    </>
  )
}

function IconSpark() {
  return <path d="M8 1L3 8h3l-1 5 6-7H8l1-5z" fill="currentColor" />
}

function IconGcp() {
  return (
    <path
      d="M4.2 10.2a2.4 2.4 0 01-.4-4.77A3 3 0 019.9 4.3a2.4 2.4 0 01.5 4.9H4.2z"
      stroke="currentColor"
      strokeWidth="1.1"
      fill="none"
      strokeLinejoin="round"
    />
  )
}

function IconRows() {
  return (
    <>
      <line x1="2" y1="4" x2="12" y2="4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="2" y1="10" x2="9" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </>
  )
}

// ─── Nodes ─────────────────────────────────────────────────────────────────────

interface TabRegionProps {
  x: number
  y: number
  w: number
  h: number
  tab: TabId
  ariaLabel: string
  onActivate: () => void
  children: ReactNode
}

/** A clickable region that enters the tab it depicts — a real button, not a mouse-only div. */
function TabRegion({ x, y, w, h, tab, ariaLabel, onActivate, children }: TabRegionProps) {
  const [focused, setFocused] = useState(false)
  const accent = tabAccent(tab)
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={onActivate}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onActivate()
        }
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{ cursor: 'pointer' }}
    >
      <rect x={x} y={y} width={w} height={h} rx={10} fill={SURFACE} stroke={accent} strokeWidth={focused ? 2.4 : 1.4} />
      {children}
    </g>
  )
}

function StaticNode({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children: ReactNode }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill={SURFACE} stroke={BORDER} strokeWidth={1.2} />
      {children}
    </g>
  )
}

function Connector({ d }: { d: string }) {
  return <path d={d} stroke={BORDER} strokeWidth={1.4} fill="none" markerEnd="url(#arch-diagram-arrow)" aria-hidden="true" />
}

// ─── Layout ────────────────────────────────────────────────────────────────────

const ROW_A_Y = 20
const ROW_A_H = 80
const ROW_B_Y = 134
const ROW_B_H = 80
const BACKEND_Y = 248
const BACKEND_H = 72
const FRONTEND_Y = 354
const FRONTEND_H = 104
const GCP_Y = 492
const GCP_H = 60

const TITLE_ID = 'arch-diagram-title'

export function ArchitectureDiagram({ onEnter }: ArchitectureDiagramProps) {
  return (
    <svg
      viewBox="0 0 800 580"
      role="group"
      aria-labelledby={TITLE_ID}
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      {/* Worded to avoid repeating "Powermart XML"/"parser"/"backend"/"frontend" verbatim — those
          exact substrings are each asserted unique elsewhere on the visible labels below, and a
          text-alternative title containing the same substring would make that lookup ambiguous. */}
      <title id={TITLE_ID}>
        ETL 360 architecture: an IPC/XML export becomes JSON recipes and BigQuery DDL through the
        Scala translation layer, which a Spring-based API serves to the React application's four
        tabs — Viewer, Modifier, Operational, DAG — with links out to BigQuery, Dataproc and Cloud
        Logging on GCP. Click a highlighted region to open the tab it depicts.
      </title>

      <defs>
        <marker id="arch-diagram-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={BORDER} />
        </marker>
      </defs>

      {/* connectors, drawn first so nodes sit above them */}
      <Connector d="M250,60 L280,60" />
      <Connector d="M470,60 L500,60" />
      <Connector d="M630,100 L630,220 L480,220 L480,248" />
      <Connector d="M135,214 L135,232 L340,232 L340,248" />
      <Connector d="M395,214 L410,248" />
      <Connector d="M655,214 L655,232 L480,232 L480,248" />
      <Connector d="M410,320 L390,354" />
      <Connector d="M390,458 L390,492" />

      {/* row A: IPC Powermart XML → parser → recipes/DDL */}
      <TabRegion x={20} y={ROW_A_Y} w={230} h={ROW_A_H} tab="viewer" ariaLabel="IPC Powermart XML and the xmltobq corpus — open the IPC ETL Viewer tab" onActivate={() => onEnter('viewer')}>
        <Glyph x={34} y={ROW_A_Y + 12} color={tabAccent('viewer')}>
          <IconIpc />
        </Glyph>
        <Glyph x={56} y={ROW_A_Y + 12} color={tabAccent('viewer')}>
          <IconXml />
        </Glyph>
        <Label x={34} y={ROW_A_Y + 44} lines={['IPC Powermart XML']} color={tabAccent('viewer')} />
        <Label x={34} y={ROW_A_Y + 62} lines={['xmltobq corpus → Viewer']} size={10} weight={500} color={TEXT_MUTED} />
      </TabRegion>

      <StaticNode x={280} y={ROW_A_Y} w={190} h={ROW_A_H}>
        <Glyph x={294} y={ROW_A_Y + 12} color={TEXT_MUTED}>
          <IconJava />
        </Glyph>
        <Label x={294} y={ROW_A_Y + 44} lines={['parser/ (Scala 2.12)']} size={11.5} />
        <Label x={294} y={ROW_A_Y + 62} lines={['XML → JSON + DDL']} size={10} weight={500} color={TEXT_MUTED} />
      </StaticNode>

      <TabRegion x={500} y={ROW_A_Y} w={260} h={ROW_A_H} tab="modifier" ariaLabel="_ETL_*.json recipes and BigQuery DDL — open the ETL Modifier tab" onActivate={() => onEnter('modifier')}>
        <Glyph x={514} y={ROW_A_Y + 12} color={tabAccent('modifier')}>
          <IconJson />
        </Glyph>
        <Label x={514} y={ROW_A_Y + 44} lines={['_ETL_*.json recipes + DDL']} color={tabAccent('modifier')} />
        <Label x={514} y={ROW_A_Y + 62} lines={['BigQuery DDL → Modifier']} size={10} weight={500} color={TEXT_MUTED} />
      </TabRegion>

      {/* row B: the three data roots that feed the backend */}
      <TabRegion x={20} y={ROW_B_Y} w={230} h={ROW_B_H} tab="dag" ariaLabel="DWH_CONTROL control schema and workflows — open the ETL DAG tab" onActivate={() => onEnter('dag')}>
        <Glyph x={34} y={ROW_B_Y + 12} color={tabAccent('dag')}>
          <IconAirflow />
        </Glyph>
        <Label x={34} y={ROW_B_Y + 44} lines={['DWH_CONTROL']} color={tabAccent('dag')} />
        <Label x={34} y={ROW_B_Y + 62} lines={['control schema, workflows → DAG']} size={10} weight={500} color={TEXT_MUTED} />
      </TabRegion>

      <TabRegion x={280} y={ROW_B_Y} w={230} h={ROW_B_H} tab="operational" ariaLabel="composer b15 job history — open the ETL Operational tab" onActivate={() => onEnter('operational')}>
        <Glyph x={294} y={ROW_B_Y + 12} color={tabAccent('operational')}>
          <IconRows />
        </Glyph>
        <Label x={294} y={ROW_B_Y + 44} lines={['composer (b15 CSVs)']} color={tabAccent('operational')} />
        <Label x={294} y={ROW_B_Y + 62} lines={['job history → Operational']} size={10} weight={500} color={TEXT_MUTED} />
      </TabRegion>

      <TabRegion x={540} y={ROW_B_Y} w={230} h={ROW_B_H} tab="viewer" ariaLabel="xmltobq corpus — open the IPC ETL Viewer tab" onActivate={() => onEnter('viewer')}>
        <Glyph x={554} y={ROW_B_Y + 12} color={tabAccent('viewer')}>
          <IconXml />
        </Glyph>
        <Label x={554} y={ROW_B_Y + 44} lines={['xmltobq (corpus)']} color={tabAccent('viewer')} />
        <Label x={554} y={ROW_B_Y + 62} lines={['IPC exports → Viewer']} size={10} weight={500} color={TEXT_MUTED} />
      </TabRegion>

      {/* backend */}
      <StaticNode x={270} y={BACKEND_Y} w={280} h={BACKEND_H}>
        <Glyph x={286} y={BACKEND_Y + 12} color={TEXT_MUTED}>
          <IconSpring />
        </Glyph>
        <Label x={286} y={BACKEND_Y + 42} lines={['backend/ (Spring Boot 3.3)']} size={11.5} />
        <Label x={286} y={BACKEND_Y + 60} lines={['calls Scala in-JVM (ADR-0001)']} size={10} weight={500} color={TEXT_MUTED} />
      </StaticNode>

      {/* frontend, one chip per TABS entry, sharing that tab's own accent + icon */}
      <StaticNode x={180} y={FRONTEND_Y} w={420} h={FRONTEND_H}>
        <Label x={196} y={FRONTEND_Y + 24} lines={['frontend/ (React 19 + Vite)']} size={11.5} />
        {TABS.map((tab, i) => {
          const chipX = 196 + i * 100
          const chipY = FRONTEND_Y + 44
          return (
            <g key={tab.id}>
              <rect x={chipX} y={chipY} width={92} height={44} rx={7} fill="none" stroke={tab.accent} strokeWidth={1} />
              <Glyph x={chipX + 8} y={chipY + 8} color={tab.accent}>
                {tab.icon}
              </Glyph>
              <Label x={chipX + 26} y={chipY + 18} lines={[tabLabel(tab.id).replace(/^ETL |^IPC ETL /, '')]} size={9.5} color={tab.accent} />
            </g>
          )
        })}
      </StaticNode>

      {/* GCP surfaces */}
      <StaticNode x={210} y={GCP_Y} w={360} h={GCP_H}>
        <Glyph x={226} y={GCP_Y + 10} color={TEXT_MUTED}>
          <IconGcp />
        </Glyph>
        <Glyph x={244} y={GCP_Y + 10} color={TEXT_MUTED}>
          <IconSpark />
        </Glyph>
        <Label x={262} y={GCP_Y + 22} lines={['GCP: BigQuery · Dataproc · Cloud Logging']} size={10.5} />
      </StaticNode>
    </svg>
  )
}
