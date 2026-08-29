import React from 'react'
import type { TabId } from './types'

export interface TabMeta {
  id: TabId
  label: string
  icon: React.ReactElement
  accent: string
  description: string
}

// ─── Tab Config ───────────────────────────────────────────────────────────────

export const TABS: TabMeta[] = [
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

export const FUTURE_TABS = [
  { label: 'ETL Tuner', desc: 'Spark engine performance tuner — coming soon' },
  { label: 'ETL Agents', desc: 'L2/L3 agent interaction history — coming soon' },
]
